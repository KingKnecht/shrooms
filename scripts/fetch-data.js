#!/usr/bin/env node
// Downloads a random, country-balanced sample of macrofungi occurrences from the
// GBIF occurrence search API into data/raw/<COUNTRY>.ndjson (one compact record per line).
//
// GBIF search caps paging depth, and deep offsets combined with `shuffle` get very slow,
// so large countries are sampled with many shuffle seeds at shallow depth and
// de-duplicated afterwards. Re-running resumes: finished countries are skipped.
//
// Usage: node scripts/fetch-data.js [--target 500000] [--concurrency 6] [--from-year 1990]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const API = 'https://api.gbif.org/v1/occurrence/search';
const USER_AGENT = 'shrooms-map/1.0 (one-off dataset build)';

const args = parseArgs(process.argv.slice(2));
const TARGET = Number(args.target ?? 500_000);
const CONCURRENCY = Number(args.concurrency ?? 6);
const FROM_YEAR = Number(args['from-year'] ?? 1990);
const PAGE = 300;
// Deepest offset we request with a shuffle seed; beyond ~6k GBIF responses slow down sharply.
const SEED_DEPTH = 4800;
// Countries this small are downloaded completely without shuffling.
const FULL_FETCH_MAX = 6000;
// Weighting exponent for distributing the target across countries (<1 flattens dominance of SE/GB/NL).
const ALLOC_EXP = 0.6;

// Mushroom-forming fungi: Agaricomycetes, Pezizomycetes, Tremellomycetes, Dacrymycetes.
// Excludes lichens, moulds, yeasts and eDNA soil samples (via basisOfRecord).
const BASE_QUERY = [
  ['taxonKey', 186], ['taxonKey', 316], ['taxonKey', 149], ['taxonKey', 273],
  ['hasCoordinate', 'true'],
  ['hasGeospatialIssue', 'false'],
  ['occurrenceStatus', 'PRESENT'],
  ['basisOfRecord', 'HUMAN_OBSERVATION'],
  ['basisOfRecord', 'OBSERVATION'],
  ['basisOfRecord', 'PRESERVED_SPECIMEN'],
  ['year', `${FROM_YEAR},${new Date().getFullYear()}`],
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

function buildUrl(extra) {
  const params = new URLSearchParams();
  for (const [k, v] of [...BASE_QUERY, ...extra]) params.append(k, String(v));
  return `${API}?${params}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// When GBIF rate-limits us, every worker pauses until this time.
let pauseUntil = 0;

async function getJson(url, attempts = 8) {
  for (let i = 1; i <= attempts; i++) {
    const wait = pauseUntil - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return await res.json();
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 15 * i;
        pauseUntil = Math.max(pauseUntil, Date.now() + retryAfter * 1000);
        throw new Error('HTTP 429 (rate limited)');
      }
      if (res.status < 500) throw new Error(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status} (retryable)`);
    } catch (err) {
      if (i === attempts || /HTTP 4\d\d$/.test(err.message)) throw err;
      await sleep(Math.min(60_000, 1000 * 2 ** i));
    }
  }
}

function compact(r) {
  if (!r.speciesKey || r.decimalLatitude == null || r.decimalLongitude == null || !r.year) return null;
  const img = r.media?.find((m) => m.type === 'StillImage' && m.identifier)?.identifier;
  return {
    k: r.key,
    la: Math.round(r.decimalLatitude * 1e5) / 1e5,
    lo: Math.round(r.decimalLongitude * 1e5) / 1e5,
    s: r.speciesKey, sn: r.species,
    gk: r.genusKey, g: r.genus,
    fk: r.familyKey, f: r.family,
    ok: r.orderKey, o: r.order,
    ck: r.classKey, cl: r.class,
    y: r.year, m: r.month ?? 0, d: r.day ?? 0,
    u: r.coordinateUncertaintyInMeters ?? null,
    c: r.countryCode,
    b: r.basisOfRecord,
    l: r.locality?.slice(0, 140) || undefined,
    r: r.recordedBy?.slice(0, 80) || undefined,
    ds: (r.datasetName || r.institutionCode || undefined)?.slice(0, 80),
    i: img,
  };
}

function allocate(countries) {
  // Water-filling: distribute TARGET proportional to count^ALLOC_EXP, capped at each country's count.
  const alloc = new Map();
  let remaining = TARGET;
  let open = countries.filter((c) => c.count > 0);
  while (remaining > 0 && open.length) {
    const wsum = open.reduce((s, c) => s + c.count ** ALLOC_EXP, 0);
    const next = [];
    let used = 0;
    for (const c of open) {
      const share = Math.floor((remaining * c.count ** ALLOC_EXP) / wsum);
      const have = alloc.get(c.name) ?? 0;
      const give = Math.min(share, c.count - have);
      alloc.set(c.name, have + give);
      used += give;
      if (have + give < c.count) next.push(c);
    }
    remaining -= used;
    if (used === 0) break;
    open = next;
  }
  return alloc;
}

function planPages(country, count, want) {
  const pages = [];
  if (count <= FULL_FETCH_MAX) {
    for (let off = 0; off < count; off += PAGE) pages.push([['country', country], ['limit', PAGE], ['offset', off]]);
    return pages;
  }
  // Over-request ~8% to compensate for duplicates between seeds and records lacking a species.
  const goal = Math.ceil(want * 1.08);
  const seeds = Math.ceil(goal / SEED_DEPTH);
  const perSeed = Math.ceil(goal / seeds);
  for (let s = 0; s < seeds; s++) {
    const seed = 1000 + s * 7919;
    for (let off = 0; off < perSeed; off += PAGE) {
      pages.push([['country', country], ['shuffle', seed], ['limit', Math.min(PAGE, perSeed - off)], ['offset', off]]);
    }
  }
  return pages;
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  console.log(`Target ${TARGET.toLocaleString()} records, years ${FROM_YEAR}+, concurrency ${CONCURRENCY}`);

  const facet = await getJson(buildUrl([['limit', 0], ['facet', 'country'], ['facetLimit', 400]]));
  const countries = facet.facets[0].counts.map((c) => ({ name: c.name, count: c.count }));
  console.log(`GBIF matches ${facet.count.toLocaleString()} records in ${countries.length} countries`);

  const alloc = allocate(countries);
  const jobs = [];
  for (const c of countries) {
    const want = alloc.get(c.name) ?? 0;
    if (!want) continue;
    if (fs.existsSync(path.join(RAW_DIR, `${c.name}.ndjson`))) continue;
    jobs.push({ country: c.name, count: c.count, want, pages: planPages(c.name, c.count, want) });
  }
  const totalPages = jobs.reduce((s, j) => s + j.pages.length, 0);
  console.log(`${jobs.length} countries to fetch, ${totalPages} pages`);
  console.log(jobs.slice(0, 15).map((j) => `${j.country}:${j.want}`).join(' '), jobs.length > 15 ? '…' : '');

  // Flatten into one page queue so small and large countries share the worker pool.
  const queue = jobs.flatMap((job) => {
    job.records = new Map();
    job.left = job.pages.length;
    return job.pages.map((extra) => ({ job, extra }));
  });

  let done = 0;
  let failed = 0;
  const incomplete = [];
  const started = Date.now();

  async function worker() {
    while (queue.length) {
      const { job, extra } = queue.shift();
      try {
        const data = await getJson(buildUrl(extra));
        for (const r of data.results) {
          const c = compact(r);
          if (c) job.records.set(c.k, c);
        }
      } catch (err) {
        failed++;
        job.failed = true;
        console.warn(`\n  page failed (${job.country} ${new URLSearchParams(extra).toString()}): ${err.message}`);
      }
      done++;
      if (--job.left === 0 && job.failed) {
        // Leave no file behind so the next run retries this country.
        incomplete.push(job.country);
        job.records = null;
      } else if (job.left === 0) {
        const lines = [...job.records.values()].slice(0, job.want).map((r) => JSON.stringify(r));
        fs.writeFileSync(path.join(RAW_DIR, `${job.country}.ndjson`), lines.join('\n') + (lines.length ? '\n' : ''));
        job.records = null;
      }
      const elapsed = (Date.now() - started) / 1000;
      const eta = (elapsed / done) * (totalPages - done);
      process.stdout.write(`\r  ${done}/${totalPages} pages, ${failed} failed, ${elapsed.toFixed(0)}s elapsed, ~${eta.toFixed(0)}s left   `);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (incomplete.length) {
    console.log(`\n${incomplete.length} countries had failed pages and were not saved (${incomplete.join(' ')}).`);
    console.log('Run `npm run fetch-data` again to retry them, or continue with: npm run build-data');
  } else {
    console.log(`\nDone. Raw files in ${path.relative(ROOT, RAW_DIR)}/ — now run: npm run build-data`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
