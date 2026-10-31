#!/usr/bin/env node
// Turns data/raw/*.ndjson (from fetch-data.js) into the files the server ships:
//   data/build/points.bin      columnar binary point data (positions, species, date, …)
//   data/build/meta.json       taxonomy tables, column layout, countries, enrichment
//   data/build/details.ndjson  one JSON line per point (locality, recorder, photo, …)
//   data/build/details.idx     Uint32 byte offsets into details.ndjson
// plus .br/.gz precompressed variants of points.bin and meta.json.
//
// Species are enriched from Wikidata (edibility, English/German common names,
// English Wikipedia article); results are cached in data/cache/wikidata.json.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const OUT_DIR = path.join(ROOT, 'data', 'build');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const WIKIDATA_CACHE = path.join(CACHE_DIR, 'wikidata.json');
const USER_AGENT = 'shrooms-map/1.0 (one-off dataset build)';

// Day numbers are counted from this date so they fit a Uint16 (until 2079).
const EPOCH = Date.UTC(1900, 0, 1);
const DAY_MS = 86_400_000;
const UNKNOWN_UNCERTAINTY = 65535;
const BASIS = ['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN', 'OBSERVATION'];

// Wikidata P789 ("edibility") values → bit flags.
const EDIBILITY_FLAGS = {
  Q654236: 1, // edible
  Q19888517: 2, // choice
  Q62102033: 4, // edible when cooked
  Q19888537: 8, // caution
  Q19888579: 8, // allergenic
  Q4317894: 16, // inedible
  Q1169875: 32, // psychoactive
  Q359511: 64, // poisonous
  Q19888591: 128, // deadly
  Q1686195: 256, // medicinal
};

// Collapse flags into one display category, always erring on the side of danger.
// 0 unknown, 1 choice, 2 edible, 3 caution, 4 inedible, 5 psychoactive, 6 poisonous, 7 deadly
function edibilityCategory(f) {
  if (f & 128) return 7;
  if (f & 64) return 6;
  if (f & 32) return 5;
  if (f & 8) return 3;
  if (f & 2) return 1;
  if (f & 1) return 2;
  if (f & 4) return 3;
  if (f & 16) return 4;
  return 0;
}

function dayNumber(y, m, d) {
  // Unknown month/day fall in the middle of the year/month.
  const t = Date.UTC(y, m ? m - 1 : 6, m ? d || 15 : 1);
  return Math.round((t - EPOCH) / DAY_MS);
}

function isoDate(y, m, d) {
  if (!m) return String(y);
  return `${y}-${String(m).padStart(2, '0')}${d ? `-${String(d).padStart(2, '0')}` : ''}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (err) {
      if (i === attempts) throw err;
      await sleep(2000 * i);
    }
  }
}

async function enrichFromWikidata(speciesKeys) {
  const cache = fs.existsSync(WIKIDATA_CACHE) ? JSON.parse(fs.readFileSync(WIKIDATA_CACHE, 'utf8')) : {};
  const missing = speciesKeys.filter((k) => !(k in cache));
  const CHUNK = 400;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    process.stdout.write(`\r  Wikidata ${Math.min(i + CHUNK, missing.length)}/${missing.length} species   `);
    const query = `
      SELECT ?gbif (GROUP_CONCAT(DISTINCT STRAFTER(STR(?ed), "entity/"); separator="|") AS ?eds)
             (SAMPLE(?en) AS ?enName) (SAMPLE(?de) AS ?deName) (SAMPLE(?article) AS ?wiki)
      WHERE {
        VALUES ?gbif { ${chunk.map((k) => `"${k}"`).join(' ')} }
        ?item wdt:P846 ?gbif .
        OPTIONAL { ?item wdt:P789 ?ed }
        OPTIONAL { ?item wdt:P1843 ?en FILTER(LANG(?en) = "en") }
        OPTIONAL { ?item wdt:P1843 ?de FILTER(LANG(?de) = "de") }
        OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
      } GROUP BY ?gbif`;
    let rows;
    try {
      rows = await sparql(query);
    } catch (err) {
      console.warn(`\n  Wikidata chunk failed, continuing without it: ${err.message}`);
      continue;
    }
    for (const k of chunk) cache[k] = null;
    for (const b of rows) {
      const flags = (b.eds?.value || '').split('|').reduce((f, q) => f | (EDIBILITY_FLAGS[q] || 0), 0);
      const wiki = b.wiki?.value ? decodeURIComponent(b.wiki.value.split('/wiki/')[1]) : undefined;
      cache[b.gbif.value] = { f: flags, en: b.enName?.value, de: b.deName?.value, w: wiki };
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(WIKIDATA_CACHE, JSON.stringify(cache));
  }
  if (missing.length) process.stdout.write('\n');
  return cache;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

async function main() {
  const files = fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.ndjson')) : [];
  if (!files.length) throw new Error('No raw data found. Run `npm run fetch-data` first.');

  // Load and de-duplicate.
  const byKey = new Map();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(RAW_DIR, f), 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      if (Math.abs(r.la) > 90 || Math.abs(r.lo) > 180 || (r.la === 0 && r.lo === 0)) continue;
      byKey.set(r.k, r);
    }
  }
  const records = [...byKey.values()];
  records.sort((a, b) => dayNumber(a.y, a.m, a.d) - dayNumber(b.y, b.m, b.d));
  console.log(`${records.length.toLocaleString()} unique records from ${files.length} countries`);

  // Taxonomy tables (class → order → family → genus → species).
  const tables = { classes: new Map(), orders: new Map(), families: new Map(), genera: new Map(), species: new Map() };
  const intern = (table, key, name, parent) => {
    const id = key ?? `name:${name}`;
    let entry = table.get(id);
    if (!entry) table.set(id, (entry = { idx: table.size, key: key ?? 0, name: name || 'Unknown', parent, count: 0 }));
    entry.count++;
    return entry.idx;
  };
  const speciesIdx = new Uint32Array(records.length);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const c = intern(tables.classes, r.ck, r.cl, -1);
    const o = intern(tables.orders, r.ok, r.o, c);
    const f = intern(tables.families, r.fk, r.f, o);
    const g = intern(tables.genera, r.gk, r.g, f);
    speciesIdx[i] = intern(tables.species, r.s, r.sn, g);
  }
  const species = [...tables.species.values()];
  console.log(`${species.length.toLocaleString()} species, ${tables.genera.size} genera, ${tables.families.size} families, ${tables.orders.size} orders`);

  const wd = await enrichFromWikidata(species.map((s) => String(s.key)));
  const withEdibility = species.filter((s) => wd[s.key]?.f).length;
  console.log(`Edibility known for ${withEdibility} species`);

  const countries = [...new Set(records.map((r) => r.c || 'XX'))].sort();
  const countryIdx = new Map(countries.map((c, i) => [c, i]));

  // Columnar binary layout; every column starts 4-byte aligned.
  const n = records.length;
  const speciesType = species.length < 65536 ? 'Uint16' : 'Uint32';
  const columns = [
    { name: 'position', type: 'Float32', size: 2 },
    { name: 'species', type: speciesType, size: 1 },
    { name: 'day', type: 'Uint16', size: 1 },
    { name: 'uncertainty', type: 'Uint16', size: 1 },
    { name: 'month', type: 'Uint8', size: 1 },
    { name: 'country', type: countries.length < 256 ? 'Uint8' : 'Uint16', size: 1 },
    { name: 'basis', type: 'Uint8', size: 1 },
  ];
  const BYTES = { Float32: 4, Uint32: 4, Uint16: 2, Uint8: 1 };
  let offset = 0;
  for (const col of columns) {
    col.offset = offset;
    offset += Math.ceil((n * col.size * BYTES[col.type]) / 4) * 4;
  }
  const buffer = new ArrayBuffer(offset);
  const view = Object.fromEntries(
    columns.map((col) => [col.name, new globalThis[`${col.type}Array`](buffer, col.offset, n * col.size)]),
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const detailsPath = path.join(OUT_DIR, 'details.ndjson');
  const detailsFd = fs.openSync(detailsPath, 'w');
  const detailOffsets = new Uint32Array(n + 1);
  let detailBytes = 0;
  let minDay = Infinity;
  let maxDay = -Infinity;
  const chunks = [];

  for (let i = 0; i < n; i++) {
    const r = records[i];
    view.position[i * 2] = r.lo;
    view.position[i * 2 + 1] = r.la;
    view.species[i] = speciesIdx[i];
    const day = dayNumber(r.y, r.m, r.d);
    view.day[i] = day;
    minDay = Math.min(minDay, day);
    maxDay = Math.max(maxDay, day);
    view.uncertainty[i] = r.u == null ? UNKNOWN_UNCERTAINTY : Math.min(Math.round(r.u), UNKNOWN_UNCERTAINTY - 1);
    view.month[i] = r.m || 0;
    view.country[i] = countryIdx.get(r.c || 'XX');
    view.basis[i] = Math.max(0, BASIS.indexOf(r.b));

    const line = Buffer.from(
      JSON.stringify({ k: r.k, d: isoDate(r.y, r.m, r.d), u: r.u ?? null, b: r.b, l: r.l, r: r.r, ds: r.ds, i: r.i }) + '\n',
    );
    detailOffsets[i] = detailBytes;
    detailBytes += line.length;
    chunks.push(line);
    if (chunks.length >= 5000) fs.writeSync(detailsFd, Buffer.concat(chunks.splice(0)));
  }
  if (chunks.length) fs.writeSync(detailsFd, Buffer.concat(chunks));
  fs.closeSync(detailsFd);
  detailOffsets[n] = detailBytes;
  fs.writeFileSync(path.join(OUT_DIR, 'details.idx'), Buffer.from(detailOffsets.buffer));

  const table = (map, extra = () => ({})) => {
    const rows = [...map.values()];
    return { key: rows.map((r) => r.key), name: rows.map((r) => r.name), parent: rows.map((r) => r.parent), count: rows.map((r) => r.count), ...extra(rows) };
  };
  const meta = {
    version: 1,
    generated: new Date().toISOString(),
    source: 'GBIF.org occurrence search API (random sample per country)',
    count: n,
    epoch: '1900-01-01',
    minDay,
    maxDay,
    unknownUncertainty: UNKNOWN_UNCERTAINTY,
    byteLength: offset,
    columns,
    basis: BASIS,
    countries,
    classes: table(tables.classes),
    orders: table(tables.orders),
    families: table(tables.families),
    genera: table(tables.genera),
    species: table(tables.species, (rows) => {
      const info = rows.map((r) => wd[r.key] || {});
      return {
        edibility: info.map((w) => w.f || 0),
        category: info.map((w) => edibilityCategory(w.f || 0)),
        en: info.map((w) => capitalize(w.en) || ''),
        de: info.map((w) => capitalize(w.de) || ''),
        wiki: info.map((w) => w.w || ''),
      };
    }),
  };

  const write = (name, data) => {
    fs.writeFileSync(path.join(OUT_DIR, name), data);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.gz`), zlib.gzipSync(data, { level: 9 }));
    const br = zlib.brotliCompressSync(data, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
    });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.br`), br);
    console.log(`  ${name}: ${(data.length / 1e6).toFixed(1)} MB raw, ${(br.length / 1e6).toFixed(1)} MB brotli`);
  };
  write('points.bin', Buffer.from(buffer));
  write('meta.json', Buffer.from(JSON.stringify(meta)));
  console.log(`  details.ndjson: ${(detailBytes / 1e6).toFixed(1)} MB`);
  console.log('Build complete. Start the app with: npm start');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
