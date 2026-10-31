// Server-side species info: the shared fetcher from public/js/species-info.js plus an
// in-memory and on-disk cache (data/cache/species/<key>.<lang>.json), so each species hits
// the upstream APIs at most once.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSpeciesInfo, setRequestHeaders } from '../public/js/species-info.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache', 'species');
const CACHE_VERSION = 3;

setRequestHeaders({ 'User-Agent': 'shrooms-map/1.0 (mushroom occurrence map)' });

const memory = new Map();
const inflight = new Map();

export async function getSpeciesInfo(species) {
  const id = `${species.key}.${species.lang}`;
  if (memory.has(id)) return memory.get(id);

  const file = path.join(CACHE_DIR, `${id}.json`);
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached.v === CACHE_VERSION) {
      memory.set(id, cached);
      return cached;
    }
  } catch {
    // Not cached yet.
  }

  if (!inflight.has(id)) {
    inflight.set(
      id,
      fetchSpeciesInfo(species)
        .then((result) => {
          const info = { v: CACHE_VERSION, ...result };
          if (info.complete) {
            memory.set(id, info);
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            fs.writeFile(file, JSON.stringify(info), () => {});
          }
          return info;
        })
        .finally(() => inflight.delete(id)),
    );
  }
  return inflight.get(id);
}
