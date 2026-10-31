// Screen-space level of detail for the point layer.
//
// Level z is a Web Mercator grid of 2^(z+8) × 2^(z+8) cells, which is ~2 px per cell at map
// zoom z (MapLibre's world is 512 · 2^zoom px wide). Within each cell only the point with the
// highest priority is drawn, so at zoom Z we draw the points whose level is ≤ Z: the rest
// would sit under another point anyway. A point's level is the coarsest level at which it is
// its cell's representative. Because Z-order (Morton) sorting keeps every cell of every level
// contiguous, each level is a single linear pass over the points.
//
// Shared by scripts/build-data.js (which stores points in Morton order) and the browser.

export const LOD_MAX = 14; // from this zoom on every point is drawn
export const LOD_ALL = LOD_MAX + 1; // level of points that never represent a cell
export const LOD_HIDDEN = 255; // filtered out
const GRID_BITS = LOD_MAX + 8;
const GRID_SIZE = 2 ** GRID_BITS;

// lon/lat → integer cell coordinates on the finest grid.
export function gridXY(lon, lat) {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const x = (lon + 180) / 360;
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  const cell = (v) => Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(v * GRID_SIZE)));
  return [cell(x), cell(y)];
}

// Spread the low 11 bits of n to the even bit positions.
function spread(n) {
  n &= 0x7ff;
  n = (n | (n << 8)) & 0x00ff00ff;
  n = (n | (n << 4)) & 0x0f0f0f0f;
  n = (n | (n << 2)) & 0x33333333;
  n = (n | (n << 1)) & 0x55555555;
  return n;
}

// Morton (Z-order) key of 22-bit cell coordinates, exact as a double (44 bits).
export function mortonKey(x, y) {
  const hi = spread(x >>> 11) | (spread(y >>> 11) << 1);
  const lo = spread(x) | (spread(y) << 1);
  return hi * 2 ** 22 + lo;
}

// Assign levels. `include` lists the indices of the points to consider, in Morton order;
// `out` receives a level per point (untouched for points not in `include`).
export function computeLevels({ include, count, gx, gy, priority, out }) {
  for (let j = 0; j < count; j++) out[include[j]] = LOD_ALL;
  for (let z = 0; z <= LOD_MAX; z++) {
    const shift = LOD_MAX - z;
    let prevX = -1;
    let prevY = -1;
    let best = -1;
    let bestP = -Infinity;
    for (let j = 0; j < count; j++) {
      const i = include[j];
      const cx = gx[i] >>> shift;
      const cy = gy[i] >>> shift;
      if (cx !== prevX || cy !== prevY) {
        if (best >= 0 && out[best] > z) out[best] = z;
        prevX = cx;
        prevY = cy;
        best = i;
        bestP = priority[i];
      } else if (priority[i] > bestP) {
        best = i;
        bestP = priority[i];
      }
    }
    if (best >= 0 && out[best] > z) out[best] = z;
  }
}

// Highest level to draw at a map zoom: cells of the finest drawn level are 1.4–2.8 px.
export const maxLevelForZoom = (zoom) => (zoom >= LOD_MAX ? LOD_ALL : zoom + 0.5);
