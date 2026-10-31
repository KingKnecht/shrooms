// Gathers species information from GBIF, iNaturalist, Wikipedia and Wikidata.
// Shared by the browser (static hosting) and the Node server (which adds a disk cache).
// All four APIs allow cross-origin requests.

// Wikidata "mycomorphbox" properties: hymenium type, cap shape, hymenium attachment,
// stipe, spore print, ecology, edibility. Results are keyed by property ID; the UI names them.
const TRAITS = ['P783', 'P784', 'P785', 'P786', 'P787', 'P788', 'P789'];

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

async function inaturalist(name, lang) {
  const params = new URLSearchParams({ q: name, rank: 'species,subspecies,variety', per_page: '10', locale: lang });
  const data = await getJson(`https://api.inaturalist.org/v1/taxa?${params}`);
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

async function wikipedia(title, lang = 'en') {
  const data = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (data.type === 'disambiguation' || !data.extract) return null;
  return {
    lang,
    title: data.title,
    extract: data.extract,
    url: data.content_urls?.desktop?.page,
    thumbnail: data.thumbnail?.source,
  };
}

// Traits (labelled in `lang`, falling back to English) and the title of the
// species' Wikipedia article in `lang`, from one Wikidata query.
async function wikidata(key, lang) {
  const query = `
    SELECT ?prop ?valLabel ?article WHERE {
      ?item wdt:P846 "${key}" .
      OPTIONAL {
        VALUES ?prop { ${TRAITS.map((p) => `wdt:${p}`).join(' ')} }
        ?item ?prop ?val .
      }
      OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://${lang}.wikipedia.org/> }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". }
    }`;
  const data = await getJson(`https://query.wikidata.org/sparql?${new URLSearchParams({ query })}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  const traits = {};
  let article = null;
  for (const b of data.results.bindings) {
    if (b.article) article = decodeURIComponent(b.article.value.split('/wiki/')[1]);
    const prop = b.prop?.value.split('/').pop();
    const value = b.valLabel?.value;
    if (!prop || !value || /^Q\d+$/.test(value)) continue;
    // "flat mushroom cap" → "flat", "free hymenium attachment" → "free", …
    const clean = value.replace(/ (mushroom cap|hymenium attachment|stipe|mushroom)$/, '');
    if (!(traits[prop] ||= []).includes(clean)) traits[prop].push(clean);
  }
  return { traits, article };
}

export async function fetchSpeciesInfo({ key, name, wiki, lang = 'en' }) {
  const settled = await Promise.allSettled([gbif(key), inaturalist(name, lang), wikidata(key, lang)]);
  const [g, inat, wd] = settled.map((s) => (s.status === 'fulfilled' ? s.value : null));

  // Wikipedia in the UI language when an article exists, otherwise English.
  let wp = null;
  if (lang !== 'en' && wd?.article) wp = await wikipedia(wd.article, lang).catch(() => null);
  if (!wp) {
    // iNaturalist's link follows the requested locale, so only use it when it is English.
    const inatTitle = /\/\/en\.wikipedia\.org\/wiki\//.test(inat?.wikipediaUrl || '') ? inat.wikipediaUrl.split('/wiki/')[1] : null;
    const enTitle = wiki || inatTitle || name;
    wp = await wikipedia(decodeURIComponent(enTitle)).catch(() => null);
  }

  return {
    key,
    name,
    lang,
    fetched: new Date().toISOString(),
    gbif: g,
    inaturalist: inat,
    wikipedia: wp,
    traits: wd?.traits || {},
    // False when a core source failed, so callers can avoid caching a partial result.
    complete: Boolean(g) && settled[1].status === 'fulfilled',
  };
}
