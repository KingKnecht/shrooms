#!/usr/bin/env node
// Downloads iNaturalist observations that are NOT research grade ("needs ID" and "casual")
// for one place into data/raw-inat/<COUNTRY>.ndjson, in the same compact format as
// fetch-data.js writes for GBIF. (Research-grade iNaturalist records already reach the
// dataset through GBIF.) Only species-level identifications with coordinates and a date
// are kept, and captive/cultivated ones are skipped.
//
// iNaturalist names are matched to the GBIF backbone so both sources share one taxonomy;
// matches are cached in data/cache/gbif-match.json.
//
// The download is resumable: pages are appended to <COUNTRY>.partial.ndjson and a re-run
// continues after the last observation id.
//
// Usage: node scripts/fetch-inat.js [--place 7207] [--country DE] [--from-year 1990]
//   --place is an iNaturalist place id (7207 = Germany); --country is the ISO code the
//   records are filed under.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'raw-inat');
const MATCH_CACHE = path.join(ROOT, 'data', 'cache', 'gbif-match.json');
const USER_AGENT = 'shrooms-map/1.0 (one-off dataset build)';

const args = parseArgs(process.argv.slice(2));
const PLACE = Number(args.place ?? 7207);
const COUNTRY = String(args.country ?? 'DE').toUpperCase();
const FROM_YEAR = Number(args['from-year'] ?? 1990);
const PER_PAGE = 200;
// iNaturalist asks API clients to stay around one request per second.
const MIN_INTERVAL_MS = 1100;

// Same classes as the GBIF download: Agaricomycetes, Pezizomycetes, Tremellomycetes, Dacrymycetes.
const INAT_TAXA = [50814, 152032, 83737, 53277];
const FIELDS = 'id,quality_grade,observed_on,location,public_positional_accuracy,obscured,place_guess,taxon.name,taxon.rank,user.login,photos.url';
const QUALITY = { needs_id: 'needs_id', casual: 'casual' };

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
async function getJson(url, { attempts = 6, throttle = true } = {}) {
  for (let i = 1; i <= attempts; i++) {
    if (throttle) {
      const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequest = Date.now();
    }
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status} (retryable)`);
    } catch (err) {
      if (i === attempts || /HTTP 4\d\d$/.test(err.message)) throw err;
      await sleep(Math.min(60_000, 2000 * 2 ** i));
    }
  }
}

function pageUrl(idAbove) {
  const params = new URLSearchParams({
    place_id: PLACE,
    taxon_id: INAT_TAXA.join(','),
    quality_grade: 'needs_id,casual',
    hrank: 'species',
    lrank: 'form',
    geo: 'true',
    captive: 'false',
    d1: `${FROM_YEAR}-01-01`,
    order_by: 'id',
    order: 'asc',
    id_above: idAbove,
    per_page: PER_PAGE,
    fields: FIELDS,
  });
  return `https://api.inaturalist.org/v2/observations?${params}`;
}

// Raw observation → minimal line kept in the partial file.
function slim(o) {
  const [lat, lon] = (o.location || '').split(',').map(Number);
  const [y, m, d] = (o.observed_on || '').split('-').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !y || !o.taxon?.name || !QUALITY[o.quality_grade]) return null;
  const photo = o.photos?.[0]?.url?.replace('/square.', '/medium.');
  return {
    id: o.id,
    q: o.quality_grade,
    name: o.taxon.name,
    la: Math.round(lat * 1e5) / 1e5,
    lo: Math.round(lon * 1e5) / 1e5,
    y,
    m: m || 0,
    d: d || 0,
    u: o.public_positional_accuracy ?? null,
    l: o.place_guess?.slice(0, 140) || undefined,
    r: o.user?.login,
    i: photo,
  };
}

async function download(partialPath) {
  let idAbove = 0;
  let have = 0;
  if (fs.existsSync(partialPath)) {
    const lines = fs.readFileSync(partialPath, 'utf8').trim().split('\n').filter(Boolean);
    have = lines.length;
    if (have) idAbove = JSON.parse(lines[have - 1]).id;
    console.log(`Resuming after observation ${idAbove} (${have.toLocaleString()} already downloaded)`);
  }
  const started = Date.now();
  let fetched = 0;
  for (;;) {
    const data = await getJson(pageUrl(idAbove));
    if (!data.results.length) break;
    const lines = data.results.map(slim).filter(Boolean).map((r) => JSON.stringify(r));
    if (lines.length) fs.appendFileSync(partialPath, lines.join('\n') + '\n');
    idAbove = data.results[data.results.length - 1].id;
    have += lines.length;
    fetched += data.results.length;
    const remaining = Math.max(0, data.total_results - data.results.length);
    const rate = fetched / ((Date.now() - started) / 1000);
    process.stdout.write(`\r  ${have.toLocaleString()} observations, ~${remaining.toLocaleString()} left, ~${Math.round(remaining / rate)}s   `);
    if (data.results.length < PER_PAGE) break;
  }
  process.stdout.write('\n');
}

// Match iNaturalist names to the GBIF backbone (accepted species + higher taxa).
async function matchNames(names) {
  const cache = fs.existsSync(MATCH_CACHE) ? JSON.parse(fs.readFileSync(MATCH_CACHE, 'utf8')) : {};
  const todo = names.filter((n) => !(n in cache));
  let done = 0;
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const name = queue.shift();
      const params = new URLSearchParams({ name, kingdom: 'Fungi' });
      try {
        const m = await getJson(`https://api.gbif.org/v1/species/match?${params}`, { throttle: false });
        const ok = m.speciesKey && m.kingdom === 'Fungi' && m.matchType !== 'NONE' && m.confidence >= 90;
        cache[name] = ok
          ? { s: m.speciesKey, sn: m.species, gk: m.genusKey, g: m.genus, fk: m.familyKey, f: m.family, ok: m.orderKey, o: m.order, ck: m.classKey, cl: m.class }
          : null;
      } catch (err) {
        console.warn(`\n  GBIF match failed for ${name}: ${err.message}`);
      }
      done++;
      process.stdout.write(`\r  Matching names to GBIF: ${done}/${todo.length}   `);
    }
  }
  if (todo.length) {
    await Promise.all(Array.from({ length: 4 }, worker));
    process.stdout.write('\n');
    fs.mkdirSync(path.dirname(MATCH_CACHE), { recursive: true });
    fs.writeFileSync(MATCH_CACHE, JSON.stringify(cache));
  }
  return cache;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const partialPath = path.join(OUT_DIR, `${COUNTRY}.partial.ndjson`);
  const outPath = path.join(OUT_DIR, `${COUNTRY}.ndjson`);
  console.log(`iNaturalist place ${PLACE} → ${COUNTRY}, needs ID + casual, ${FROM_YEAR}+`);

  await download(partialPath);

  const rows = fs.readFileSync(partialPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const matches = await matchNames([...new Set(rows.map((r) => r.name))]);

  let unmatched = 0;
  const out = [];
  for (const r of rows) {
    const tax = matches[r.name];
    if (!tax) {
      unmatched++;
      continue;
    }
    out.push(
      JSON.stringify({
        src: 'inat',
        q: r.q,
        k: r.id,
        la: r.la,
        lo: r.lo,
        ...tax,
        y: r.y,
        m: r.m,
        d: r.d,
        u: r.u,
        c: COUNTRY,
        b: 'HUMAN_OBSERVATION',
        l: r.l,
        r: r.r,
        ds: 'iNaturalist',
        i: r.i,
      }),
    );
  }
  fs.writeFileSync(outPath, out.join('\n') + '\n');
  fs.rmSync(partialPath);
  console.log(`Wrote ${out.length.toLocaleString()} records to ${path.relative(ROOT, outPath)} (${unmatched} without a GBIF species match).`);
  console.log('Now run: npm run build-data');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
