// Loads the columnar point dataset and exposes taxonomy lookups.

export const CATEGORIES = [
  { id: 0, label: 'Unknown', short: 'Unknown', color: [214, 199, 168], alpha: 150 },
  { id: 1, label: 'Choice edible', short: 'Choice', color: [62, 196, 112], alpha: 235 },
  { id: 2, label: 'Edible', short: 'Edible', color: [158, 214, 92], alpha: 235 },
  { id: 3, label: 'Edible with caution', short: 'Caution', color: [240, 192, 58], alpha: 235 },
  { id: 4, label: 'Inedible', short: 'Inedible', color: [150, 140, 170], alpha: 220 },
  { id: 5, label: 'Psychoactive', short: 'Psychoactive', color: [182, 120, 245], alpha: 235 },
  { id: 6, label: 'Poisonous', short: 'Poisonous', color: [255, 128, 48], alpha: 240 },
  { id: 7, label: 'Deadly poisonous', short: 'Deadly', color: [255, 45, 75], alpha: 250 },
];

export const EDIBILITY_FLAGS = [
  [1, 'Edible'],
  [2, 'Choice edible'],
  [4, 'Edible when cooked'],
  [8, 'Caution'],
  [16, 'Inedible'],
  [32, 'Psychoactive'],
  [64, 'Poisonous'],
  [128, 'Deadly'],
  [256, 'Medicinal'],
];

// Friendly names for the fungal orders used in the "Type" filter.
export const ORDER_NAMES = {
  Agaricales: 'Gilled mushrooms',
  Boletales: 'Boletes & allies',
  Russulales: 'Brittlegills & milkcaps',
  Polyporales: 'Polypores',
  Hymenochaetales: 'Bracket & crust fungi',
  Cantharellales: 'Chanterelles & hedgehogs',
  Pezizales: 'Cup fungi, morels & truffles',
  Auriculariales: 'Jelly ears',
  Tremellales: 'Jelly fungi',
  Dacrymycetales: 'Yellow jelly fungi',
  Phallales: 'Stinkhorns',
  Geastrales: 'Earthstars',
  Gomphales: 'Coral & club fungi',
  Thelephorales: 'Earthfans',
  Gloeophyllales: 'Gloeophyllum conks',
  Corticiales: 'Corticioid crusts',
  Hysterangiales: 'False truffles',
  Atheliales: 'Athelioid crusts',
  Trechisporales: 'Trechispora crusts',
  Sebacinales: 'Sebacina jellies',
  Amylocorticiales: 'Amylocorticioid crusts',
  Filobasidiales: 'Filobasidium yeasts',
};

export const GROUP_PALETTE = [
  [230, 120, 60], [90, 170, 230], [240, 200, 70], [120, 200, 120], [200, 110, 220],
  [235, 90, 110], [80, 210, 200], [190, 160, 110], [160, 190, 250], [250, 160, 190],
];
export const GROUP_OTHER = [150, 150, 150];

// Year → colour ramp for "colour by year".
export const AGE_RAMP = [
  [70, 50, 140],
  [60, 110, 180],
  [40, 170, 160],
  [120, 205, 90],
  [250, 225, 60],
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const EPOCH = Date.UTC(1900, 0, 1);
const DAY_MS = 86_400_000;

export const dayToDate = (day) => new Date(EPOCH + day * DAY_MS);
export const dateToDay = (y, m = 1, d = 1) => Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS);

export async function loadDataset(onProgress) {
  const manifest = await fetch('data/manifest.json', { cache: 'no-cache' }).then((r) => r.json());
  const v = encodeURIComponent(manifest.version);
  const [meta, buffer] = await Promise.all([
    fetch(`data/meta.json?v=${v}`).then((r) => r.json()),
    fetchWithProgress(`${manifest.points.url}?v=${v}`, manifest.points.bytes, onProgress),
  ]);
  return new Dataset(meta, buffer, manifest);
}

async function fetchWithProgress(url, total, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  let bytes;
  if (!res.body) {
    bytes = new Uint8Array(await res.arrayBuffer());
  } else {
    const parts = [];
    const reader = res.body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      received += value.length;
      onProgress?.(Math.min(1, received / total));
    }
    bytes = new Uint8Array(received);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
  }
  // Static hosts serve points.bin.gz as plain bytes; decompress it here. (When a server
  // sends it with Content-Encoding instead, the browser has already done so.)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }
  return bytes.buffer;
}

export class Dataset {
  constructor(meta, buffer, manifest) {
    this.meta = meta;
    this.manifest = manifest;
    this.count = meta.count;
    const cols = {};
    for (const c of meta.columns) {
      cols[c.name] = new globalThis[`${c.type}Array`](buffer, c.offset, meta.count * c.size);
    }
    this.position = cols.position;
    this.species = cols.species;
    this.day = cols.day;
    this.uncertainty = cols.uncertainty;
    this.month = cols.month;
    this.country = cols.country;
    this.basis = cols.basis;

    const sp = meta.species;
    this.nSpecies = sp.key.length;
    this.speciesGenus = Int32Array.from(sp.parent);
    this.genusFamily = Int32Array.from(meta.genera.parent);
    this.familyOrder = Int32Array.from(meta.families.parent);
    this.speciesFamily = this.speciesGenus.map((g) => this.genusFamily[g]);
    this.speciesOrder = this.speciesFamily.map((f) => this.familyOrder[f]);
    this.speciesCategory = Uint8Array.from(sp.category);
    this.speciesKeyIndex = new Map(sp.key.map((k, i) => [k, i]));

    this.minDay = meta.minDay;
    this.maxDay = meta.maxDay;
    this.minYear = dayToDate(meta.minDay).getUTCFullYear();
    this.maxYear = dayToDate(meta.maxDay).getUTCFullYear();

    // Orders sorted by record count; the top ones get their own colour and filter chip.
    this.ordersByCount = meta.orders.name.map((_, i) => i).sort((a, b) => meta.orders.count[b] - meta.orders.count[a]);

    let regionNames = null;
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      // Older browsers: fall back to ISO codes.
    }
    this.countryNames = meta.countries.map((code) => {
      try {
        return (code !== 'XX' && regionNames?.of(code)) || code;
      } catch {
        return code;
      }
    });
  }

  speciesName(i) {
    return this.meta.species.name[i];
  }

  commonName(i) {
    return this.meta.species.en[i] || '';
  }

  displayName(i) {
    return this.commonName(i) || this.speciesName(i);
  }

  taxonTable(rank) {
    return { species: this.meta.species, genus: this.meta.genera, family: this.meta.families, order: this.meta.orders }[rank];
  }

  taxonName(rank, idx) {
    return this.taxonTable(rank).name[idx];
  }

  taxonCount(rank, idx) {
    return this.taxonTable(rank).count[idx];
  }

  // Does species `s` belong to the given taxon?
  speciesInTaxon(s, taxon) {
    switch (taxon.rank) {
      case 'species': return s === taxon.idx;
      case 'genus': return this.speciesGenus[s] === taxon.idx;
      case 'family': return this.speciesFamily[s] === taxon.idx;
      case 'order': return this.speciesOrder[s] === taxon.idx;
      default: return true;
    }
  }

  orderLabel(o) {
    const name = this.meta.orders.name[o];
    return ORDER_NAMES[name] || name;
  }
}
