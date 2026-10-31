// Filter state and the CPU side of filtering.
//
// Categorical filters (taxon, edibility, type, season, country, accuracy, source)
// are folded into one per-point mask. The GPU gets two DataFilterExtension channels:
//   1. the date, so dragging the year slider only changes a uniform;
//   2. the point's level of detail (see lod.js), or LOD_HIDDEN when it is filtered out,
//      so zooming only changes a uniform too.

import { computeLevels, gridXY, mortonKey, LOD_HIDDEN } from './lod.js';

export const GROUP_SLOTS = 10;


export function createFilterState(ds) {
  return {
    taxon: null, // { rank: 'species'|'genus'|'family'|'order', idx }
    categories: new Array(8).fill(true),
    groups: null, // null = all, otherwise Set of order indices; -1 stands for "other orders"
    months: new Array(13).fill(true), // index 1..12; 0 = unknown month
    dayRange: [ds.minDay, ds.maxDay],
    country: -1,
    maxUncertainty: Infinity,
    includeSpecimens: true,
    sources: [true, true, true], // GBIF, iNaturalist needs ID, iNaturalist casual
  };
}

export class FilterEngine {
  constructor(ds) {
    this.ds = ds;
    const n = ds.count;
    this.mask = new Uint8Array(n);
    // Double-buffered so deck.gl sees a new array reference and re-uploads it.
    this.filterBuffers = [new Float32Array(n * 2), new Float32Array(n * 2)];
    for (const buf of this.filterBuffers) {
      for (let i = 0; i < n; i++) buf[i * 2] = ds.day[i];
    }
    this.front = 0;
    this.filterValues = this.filterBuffers[0];
    this.weights = new Float32Array(n);
    this.topGroups = new Set(ds.ordersByCount.slice(0, GROUP_SLOTS));
    this.prepareLod();
  }

  prepareLod() {
    const ds = this.ds;
    const n = ds.count;
    this.gx = new Uint32Array(n);
    this.gy = new Uint32Array(n);
    this.priority = new Float32Array(n);
    this.levels = new Uint8Array(n);
    this.include = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = gridXY(ds.position[i * 2], ds.position[i * 2 + 1]);
      this.gx[i] = x;
      this.gy[i] = y;
      // Stable pseudo-random pick per cell, so colours at low zoom keep the real mix.
      // (Preferring e.g. poisonous species would paint whole regions red.)
      this.priority[i] = (Math.imul(i + 1, 2654435761) >>> 0) / 2 ** 32;
    }
    // Builds from build-data.js are already in Morton order; older ones get sorted here.
    if (ds.meta.spatialOrder === 'morton') {
      this.order = null;
    } else {
      const keys = new Float64Array(n);
      for (let i = 0; i < n; i++) keys[i] = mortonKey(this.gx[i], this.gy[i]);
      this.order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => keys[a] - keys[b]);
    }
  }

  speciesAllowed(state) {
    const ds = this.ds;
    const ok = new Uint8Array(ds.nSpecies);
    for (let s = 0; s < ds.nSpecies; s++) {
      if (state.taxon && !ds.speciesInTaxon(s, state.taxon)) continue;
      if (!state.categories[ds.speciesCategory[s]]) continue;
      if (state.groups) {
        const o = ds.speciesOrder[s];
        if (!state.groups.has(this.topGroups.has(o) ? o : -1)) continue;
      }
      ok[s] = 1;
    }
    return ok;
  }

  // Recompute the categorical mask and the levels of detail.
  update(state) {
    const ds = this.ds;
    const n = ds.count;
    const speciesOk = this.speciesAllowed(state);
    const allMonths = state.months.slice(1).every(Boolean);
    const monthOk = new Uint8Array(13);
    for (let m = 0; m <= 12; m++) monthOk[m] = allMonths || (m > 0 && state.months[m]) ? 1 : 0;
    const country = state.country;
    const maxU = state.maxUncertainty;
    const limitU = Number.isFinite(maxU);
    const skipSpecimens = !state.includeSpecimens;
    const sourceOk = Uint8Array.from(state.sources, Number);

    const mask = this.mask;
    const { species, month, uncertainty, basis, source } = ds;
    const countries = ds.country;
    for (let i = 0; i < n; i++) {
      let ok = speciesOk[species[i]] & monthOk[month[i]];
      if (ok && country >= 0 && countries[i] !== country) ok = 0;
      if (ok && limitU && uncertainty[i] > maxU) ok = 0;
      if (ok && skipSpecimens && basis[i] === 1) ok = 0;
      if (ok && !sourceOk[source[i]]) ok = 0;
      mask[i] = ok;
    }
    this.updateLod(state);
  }

  // Levels only consider points that pass all filters, including the date range, so a
  // filtered-out point never leaves its cell empty. Call again after the date range changes.
  updateLod(state) {
    const { mask, include, levels, order } = this;
    const day = this.ds.day;
    const n = mask.length;
    const [d0, d1] = state.dayRange;
    let count = 0;
    for (let j = 0; j < n; j++) {
      const i = order ? order[j] : j;
      if (mask[i] && day[i] >= d0 && day[i] <= d1) include[count++] = i;
    }
    levels.fill(LOD_HIDDEN);
    computeLevels({ include, count, gx: this.gx, gy: this.gy, priority: this.priority, out: levels });

    this.front ^= 1;
    const values = this.filterBuffers[this.front];
    for (let i = 0; i < n; i++) values[i * 2 + 1] = levels[i];
    this.filterValues = values;
    return values;
  }

  // Heatmap weights combine the mask and the date range (HeatmapLayer has no GPU filter).
  updateWeights(state) {
    const [d0, d1] = state.dayRange;
    const { mask, weights } = this;
    const day = this.ds.day;
    for (let i = 0; i < mask.length; i++) weights[i] = mask[i] && day[i] >= d0 && day[i] <= d1 ? 1 : 0;
    this.weights = new Float32Array(weights.buffer); // new view → deck.gl re-uploads
    return this.weights;
  }

  // Counts over currently visible points, optionally restricted to a lon/lat bbox.
  stats(state, bounds) {
    const ds = this.ds;
    const { mask } = this;
    const { day, species, position } = ds;
    const [d0, d1] = state.dayRange;
    const counts = new Uint32Array(ds.nSpecies);
    let total = 0;
    let inView = 0;
    const hasBounds = Boolean(bounds);
    const [w, s, e, nn] = bounds || [];
    const wraps = hasBounds && w > e;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const d = day[i];
      if (d < d0 || d > d1) continue;
      total++;
      if (hasBounds) {
        const lon = position[i * 2];
        const lat = position[i * 2 + 1];
        if (lat < s || lat > nn) continue;
        if (wraps ? lon < w && lon > e : lon < w || lon > e) continue;
      }
      inView++;
      counts[species[i]]++;
    }
    return { total, inView, counts };
  }

  // Month histogram and country counts for one taxon (ignores other filters).
  taxonProfile(taxon, bounds) {
    const ds = this.ds;
    const sel = new Uint8Array(ds.nSpecies);
    for (let s = 0; s < ds.nSpecies; s++) sel[s] = ds.speciesInTaxon(s, taxon) ? 1 : 0;
    const months = new Uint32Array(13);
    const monthsInView = new Uint32Array(13);
    const countries = new Map();
    const speciesCounts = new Map();
    let total = 0;
    let inView = 0;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    const [w, s, e, n] = bounds || [];
    const wraps = bounds && w > e;
    const { species, month, country, position } = ds;
    for (let i = 0; i < ds.count; i++) {
      const sp = species[i];
      if (!sel[sp]) continue;
      total++;
      months[month[i]]++;
      countries.set(country[i], (countries.get(country[i]) || 0) + 1);
      speciesCounts.set(sp, (speciesCounts.get(sp) || 0) + 1);
      const lon = position[i * 2];
      const lat = position[i * 2 + 1];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (bounds && lat >= s && lat <= n && (wraps ? lon >= w || lon <= e : lon >= w && lon <= e)) {
        inView++;
        monthsInView[month[i]]++;
      }
    }
    return {
      total,
      inView,
      months,
      monthsInView,
      bbox: total ? [minLon, minLat, maxLon, maxLat] : null,
      countries: [...countries].sort((a, b) => b[1] - a[1]),
      species: [...speciesCounts].sort((a, b) => b[1] - a[1]),
    };
  }
}
