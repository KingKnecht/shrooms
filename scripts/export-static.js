#!/usr/bin/env node
// Exports the site as plain static files into dist/, for GitHub Pages or any static host.
// It needs no Node server: species info is fetched from the upstream APIs by the browser,
// and points.bin ships gzipped and is decompressed client-side.
//
// Usage: node scripts/export-static.js   (after `npm run build-data`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR } from '../server/vendor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, 'data', 'build');
const DIST = path.join(ROOT, 'dist');

const metaPath = path.join(BUILD_DIR, 'meta.json');
if (!fs.existsSync(metaPath) || !fs.existsSync(path.join(BUILD_DIR, 'details'))) {
  console.error('No dataset found in data/build/. Run `npm run fetch-data` and `npm run build-data` first.');
  process.exit(1);
}
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });

fs.mkdirSync(path.join(DIST, 'vendor'));
for (const [name, file] of Object.entries(VENDOR)) fs.copyFileSync(path.join(ROOT, file), path.join(DIST, 'vendor', name));

const dataDir = path.join(DIST, 'data');
fs.mkdirSync(dataDir);
fs.copyFileSync(metaPath, path.join(dataDir, 'meta.json'));
fs.copyFileSync(path.join(BUILD_DIR, 'points.bin.gz'), path.join(dataDir, 'points.bin.gz'));
fs.cpSync(path.join(BUILD_DIR, 'details'), path.join(dataDir, 'details'), { recursive: true });

const manifest = {
  version: String(Date.parse(meta.generated)),
  points: { url: 'data/points.bin.gz', bytes: fs.statSync(path.join(dataDir, 'points.bin.gz')).size },
  speciesApi: false,
};
fs.writeFileSync(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest));

// Stop GitHub Pages from running the output through Jekyll.
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else {
      files++;
      bytes += fs.statSync(p).size;
    }
  }
};
walk(DIST);
console.log(`Exported ${files} files (${(bytes / 1e6).toFixed(1)} MB) to dist/`);
