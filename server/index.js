import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { getSpeciesInfo } from './species.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BUILD_DIR = path.join(ROOT, 'data', 'build');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.bin': 'application/octet-stream',
};

// Third-party browser bundles served straight from node_modules.
const VENDOR = {
  'deck.gl.min.js': 'node_modules/deck.gl/dist.min.js',
  'maplibre-gl.js': 'node_modules/maplibre-gl/dist/maplibre-gl.js',
  'maplibre-gl.css': 'node_modules/maplibre-gl/dist/maplibre-gl.css',
};

// Precompressed dataset files produced by scripts/build-data.js.
const DATA_FILES = new Set(['points.bin', 'meta.json']);

if (!fs.existsSync(path.join(BUILD_DIR, 'meta.json'))) {
  console.error('No dataset found in data/build/. Run `npm run fetch-data` and `npm run build-data` first.');
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'meta.json'), 'utf8'));
const speciesByKey = new Map(meta.species.key.map((key, i) => [String(key), i]));
const idxBuf = fs.readFileSync(path.join(BUILD_DIR, 'details.idx'));
const detailOffsets = new Uint32Array(idxBuf.buffer.slice(idxBuf.byteOffset, idxBuf.byteOffset + idxBuf.length));
const detailsFd = fs.openSync(path.join(BUILD_DIR, 'details.ndjson'), 'r');
const dataVersion = String(Date.parse(meta.generated));

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function sendJson(req, res, status, value, cacheSeconds = 0) {
  let body = Buffer.from(JSON.stringify(value));
  const headers = {
    'Content-Type': MIME['.json'],
    'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
    Vary: 'Accept-Encoding',
  };
  if (body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  send(res, status, body, headers);
}

function sendFile(req, res, filePath, { cache = 'no-cache', encodings = false } = {}) {
  const ext = path.extname(filePath);
  let target = filePath;
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache };
  if (encodings) {
    headers.Vary = 'Accept-Encoding';
    const accept = req.headers['accept-encoding'] || '';
    if (/\bbr\b/.test(accept) && fs.existsSync(`${filePath}.br`)) {
      target = `${filePath}.br`;
      headers['Content-Encoding'] = 'br';
    } else if (/\bgzip\b/.test(accept) && fs.existsSync(`${filePath}.gz`)) {
      target = `${filePath}.gz`;
      headers['Content-Encoding'] = 'gzip';
    }
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

function readDetail(index) {
  const start = detailOffsets[index];
  const length = detailOffsets[index + 1] - start;
  const buf = Buffer.alloc(length);
  fs.readSync(detailsFd, buf, 0, length, start);
  return JSON.parse(buf.toString('utf8'));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  if (pathname.startsWith('/data/')) {
    const name = pathname.slice('/data/'.length);
    if (!DATA_FILES.has(name)) return send(res, 404, 'Not found');
    // Clients request ?v=<dataVersion>, so the files can be cached for a long time.
    const cache = url.searchParams.get('v') === dataVersion ? 'public, max-age=31536000, immutable' : 'no-cache';
    return sendFile(req, res, path.join(BUILD_DIR, name), { cache, encodings: true });
  }

  if (pathname === '/api/version') return sendJson(req, res, 200, { version: dataVersion });

  let m;
  if ((m = pathname.match(/^\/api\/occurrence\/(\d+)$/))) {
    const index = Number(m[1]);
    if (index >= meta.count) return sendJson(req, res, 404, { error: 'Unknown occurrence' });
    return sendJson(req, res, 200, readDetail(index), 3600);
  }

  if ((m = pathname.match(/^\/api\/species\/(\d+)$/))) {
    const idx = speciesByKey.get(m[1]);
    if (idx === undefined) return sendJson(req, res, 404, { error: 'Unknown species' });
    const info = await getSpeciesInfo({
      key: meta.species.key[idx],
      name: meta.species.name[idx],
      wiki: meta.species.wiki[idx],
    });
    return sendJson(req, res, 200, info, 86400);
  }

  if (pathname.startsWith('/vendor/')) {
    const file = VENDOR[pathname.slice('/vendor/'.length)];
    if (!file) return send(res, 404, 'Not found');
    return sendFile(req, res, path.join(ROOT, file), { cache: 'public, max-age=86400' });
  }

  // Static frontend.
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  return sendFile(req, res, filePath);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendJson(req, res, 500, { error: 'Internal error' });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Shrooms: ${meta.count.toLocaleString()} occurrences, ${meta.species.key.length.toLocaleString()} species`);
  console.log(`Listening on http://localhost:${PORT}`);
});
