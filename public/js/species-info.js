// Gathers species information from GBIF, iNaturalist, Wikipedia and Wikidata.
// Shared by the browser (static hosting) and the Node server (which adds a disk cache).
// All four APIs allow cross-origin requests.

// Wikidata "mycomorphbox" properties.
const TRAITS = {
  P783: 'Hymenium type',
  P784: 'Cap shape',
  P785: 'Hymenium attachment',
  P786: 'Stipe',
  P787: 'Spore print',
  P788: 'Ecology',
  P789: 'Edibility',
};

// Extra request headers. Node sets a User-Agent; browsers send none, because a custom
// header would trigger CORS preflights that not every API answers.
let extraHeaders = {};
export function setRequestHeaders(headers) {
  extraHeaders = headers;
}

async function getJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...extraHeaders, Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function gbif(key) {
  const [taxon, vernacular] = await Promise.all([
    getJson(`https://api.gbif.org/v1/species/${key}`),
    getJson(`https://api.gbif.org/v1/species/${key}/vernacularNames?limit=300`).catch(() => ({ results: [] })),
  ]);
  const names = {};
  for (const v of vernacular.results || []) {
    const lang = v.language;
    if (!lang || !v.vernacularName) continue;
    (names[lang] ||= new Set()).add(v.vernacularName.trim());
  }
  const pick = (lang) => [...(names[lang] || [])].slice(0, 6);
  return {
    scientificName: taxon.scientificName,
    canonicalName: taxon.canonicalName,
    authorship: taxon.authorship,
    taxonomicStatus: taxon.taxonomicStatus,
    classification: ['kingdom', 'phylum', 'class', 'order', 'family', 'genus']
      .filter((rank) => taxon[rank])
      .map((rank) => ({ rank, name: taxon[rank], key: taxon[`${rank}Key`] })),
    vernacular: { en: pick('eng'), de: pick('deu'), fr: pick('fra') },
  };
}

async function inaturalist(name) {
  const data = await getJson(
    `https://api.inaturalist.org/v1/taxa?${new URLSearchParams({ q: name, rank: 'species,subspecies,variety', per_page: '10' })}`,
  );
  const taxon = (data.results || []).find((t) => t.name?.toLowerCase() === name.toLowerCase());
  if (!taxon) return null;
  const photo = taxon.default_photo;
  return {
    id: taxon.id,
    url: `https://www.inaturalist.org/taxa/${taxon.id}`,
    commonName: taxon.preferred_common_name,
    observations: taxon.observations_count,
    wikipediaUrl: taxon.wikipedia_url,
    photo: photo
      ? { url: photo.medium_url, large: photo.medium_url?.replace('/medium.', '/large.'), attribution: photo.attribution }
      : null,
  };
}

async function wikipedia(title) {
  const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (data.type === 'disambiguation' || !data.extract) return null;
  return {
    title: data.title,
    extract: data.extract,
    url: data.content_urls?.desktop?.page,
    thumbnail: data.thumbnail?.source,
  };
}

async function wikidataTraits(key) {
  const query = `
    SELECT ?prop ?valLabel WHERE {
      ?item wdt:P846 "${key}" .
      VALUES ?prop { ${Object.keys(TRAITS).map((p) => `wdt:${p}`).join(' ')} }
      ?item ?prop ?val .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
  const data = await getJson(`https://query.wikidata.org/sparql?${new URLSearchParams({ query })}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  const traits = {};
  for (const b of data.results.bindings) {
    const label = TRAITS[b.prop.value.split('/').pop()];
    const value = b.valLabel?.value;
    if (!label || !value || /^Q\d+$/.test(value)) continue;
    // "flat mushroom cap" → "flat", "free hymenium attachment" → "free", …
    (traits[label] ||= []).push(value.replace(/ (mushroom cap|hymenium attachment|stipe|mushroom)$/, ''));
  }
  return traits;
}

export async function fetchSpeciesInfo({ key, name, wiki }) {
  const settled = await Promise.allSettled([gbif(key), inaturalist(name), wikidataTraits(key)]);
  const [g, inat, traits] = settled.map((s) => (s.status === 'fulfilled' ? s.value : null));

  const wikiTitle = wiki || inat?.wikipediaUrl?.split('/wiki/')[1] || name;
  const wp = await wikipedia(decodeURIComponent(wikiTitle)).catch(() => null);

  return {
    key,
    name,
    fetched: new Date().toISOString(),
    gbif: g,
    inaturalist: inat,
    wikipedia: wp,
    traits: traits || {},
    // False when a core source failed, so callers can avoid caching a partial result.
    complete: Boolean(g) && settled[1].status === 'fulfilled',
  };
}
