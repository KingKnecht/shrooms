// UI translations. To add a language, add a dictionary to DICTS and an entry to LANGUAGES;
// missing keys fall back to English.
//
// Values may be strings with {placeholders}, or { one, other } objects for plurals.
// Strings used with data-i18n-html or t(..., html) are trusted markup from this file only.

const en = {
  'doc.title': 'Shrooms · Mushroom occurrence map',
  'brand.sub': 'mushroom occurrence map',
  'search.placeholder': 'Search species, genus, family…',
  'search.label': 'Search taxa',
  'search.none': 'No matching taxa in this dataset',
  'summary.loading': 'Loading…',
  summary: '<strong>{total}</strong> of {all} records match · <strong>{inView}</strong> in view',
  'tab.filters': 'Filters',
  'tab.list': 'In view',
  'tab.details': 'Details',
  'panel.resize': 'Resize panel',

  'filter.edibility': 'Edibility',
  'filter.edibilityNote': 'Based on Wikidata. Most species have no edibility data and show as <em>unknown</em>.',
  'filter.all': 'All',
  'filter.season': 'Season',
  'filter.allYear': 'All year',
  'filter.years': 'Years',
  'filter.yearFrom': 'From year',
  'filter.yearTo': 'To year',
  'filter.type': 'Type',
  'filter.country': 'Country',
  'filter.allCountries': 'All countries',
  'filter.accuracy': 'Location accuracy',
  'filter.accuracyAny': 'Any',
  'filter.accuracyWithin': 'Within {d}',
  'filter.specimens': 'Include herbarium specimens',
  'filter.resetAll': 'Reset all filters',
  'filter.source': 'Source',
  'filter.sourceNote': "iNaturalist observations that aren't research grade: nobody has confirmed the identification yet.",
  'source.0': 'GBIF',
  'source.1': 'iNat: needs ID',
  'source.2': 'iNat: casual',
  'popup.dataset': 'Dataset',
  'popup.inat': 'iNaturalist ↗',
  'popup.unconfirmed': 'Unconfirmed identification: this iNaturalist observation is not research grade.',
  'filter.recordsTitle': { one: '{n} record', other: '{n} records' },
  'preset.now': 'Now ±1 month',
  'preset.spring': 'Spring',
  'preset.summer': 'Summer',
  'preset.autumn': 'Autumn',
  'preset.winter': 'Winter',
  'preset.last3': 'Last 3 years',
  'preset.last10': 'Last 10 years',
  'preset.all': 'All',
  'group.other': 'Other',

  'list.note': 'Species with the most records in the current map view.',
  'list.count': { one: '{n} species in the current view.', other: '{n} species in the current view.' },
  'list.countTop': '{n} species in the current view, top {k} shown.',
  'list.empty': 'No matching records in the current view. Zoom out or relax the filters.',

  'details.empty': 'Search for a species, pick one from <strong>In view</strong>, or tap a point on the map to see details here.',
  'details.also': 'also {flags}',
  'details.zoom': 'Zoom to records',
  'details.only': 'Show only this',
  'details.showAll': 'Show all species',
  'details.season': 'Season',
  'details.seasonInView': 'in current view ({n} records)',
  'details.seasonAll': 'all records',
  'details.peak': 'Most records: <strong>{months}</strong>',
  'details.barTitle': { one: '{month}: {n} record', other: '{month}: {n} records' },
  'details.classification': 'Classification',
  'details.filterBy': 'Filter by {rank}',
  'details.countries': 'Top countries',
  'details.links': 'Links',
  'details.aka': 'Also known as',
  'details.identification': 'Identification',
  'details.about': 'About',
  'details.readMore': 'Read more on Wikipedia ↗',
  'details.failed': 'Additional information could not be loaded.',
  'details.mix': 'Edibility mix',
  'details.mixBy': 'by records',
  'details.species': 'Species',
  'stat.records': 'records',
  'stat.inView': 'in view',
  'stat.countries': 'countries',
  'stat.species': 'species',

  'rank.species': 'species',
  'rank.genus': 'genus',
  'rank.family': 'family',
  'rank.order': 'order',
  'taxon.info': 'Info',
  'taxon.clear': 'Clear taxon filter',

  'lang.en': 'English',
  'lang.de': 'German',

  'cat.0': 'Unknown',
  'cat.1': 'Choice edible',
  'cat.2': 'Edible',
  'cat.3': 'Edible with caution',
  'cat.4': 'Inedible',
  'cat.5': 'Psychoactive',
  'cat.6': 'Poisonous',
  'cat.7': 'Deadly poisonous',
  'catShort.0': 'Unknown',
  'catShort.1': 'Choice',
  'catShort.2': 'Edible',
  'catShort.3': 'Caution',
  'catShort.4': 'Inedible',
  'catShort.5': 'Psychoactive',
  'catShort.6': 'Poisonous',
  'catShort.7': 'Deadly',
  'advice.0': 'No edibility information available. Treat as unknown.',
  'advice.1': 'Considered a choice edible. Several dangerous lookalikes may exist, so be certain of the identification.',
  'advice.2': 'Reported as edible. Confirm the identification with an expert before eating.',
  'advice.3': 'Edible only with care (e.g. after cooking) or known to cause reactions in some people.',
  'advice.4': 'Not considered edible (bitter, tough or too small).',
  'advice.5': 'Contains psychoactive compounds. Possession may be illegal and the species can be toxic.',
  'advice.6': 'Poisonous. Do not eat.',
  'advice.7': 'Deadly poisonous. Even small amounts can be fatal.',
  'flag.1': 'edible',
  'flag.2': 'choice edible',
  'flag.4': 'edible when cooked',
  'flag.8': 'caution',
  'flag.16': 'inedible',
  'flag.32': 'psychoactive',
  'flag.64': 'poisonous',
  'flag.128': 'deadly',
  'flag.256': 'medicinal',

  'trait.P783': 'Hymenium type',
  'trait.P784': 'Cap shape',
  'trait.P785': 'Hymenium attachment',
  'trait.P786': 'Stipe',
  'trait.P787': 'Spore print',
  'trait.P788': 'Ecology',

  'order.Agaricales': 'Gilled mushrooms',
  'order.Boletales': 'Boletes & allies',
  'order.Russulales': 'Brittlegills & milkcaps',
  'order.Polyporales': 'Polypores',
  'order.Hymenochaetales': 'Bracket & crust fungi',
  'order.Cantharellales': 'Chanterelles & hedgehogs',
  'order.Pezizales': 'Cup fungi, morels & truffles',
  'order.Auriculariales': 'Jelly ears',
  'order.Tremellales': 'Jelly fungi',
  'order.Dacrymycetales': 'Yellow jelly fungi',
  'order.Phallales': 'Stinkhorns',
  'order.Geastrales': 'Earthstars',
  'order.Gomphales': 'Coral & club fungi',
  'order.Thelephorales': 'Earthfans',
  'order.Gloeophyllales': 'Gloeophyllum conks',
  'order.Corticiales': 'Corticioid crusts',
  'order.Hysterangiales': 'False truffles',
  'order.Atheliales': 'Athelioid crusts',
  'order.Trechisporales': 'Trechispora crusts',
  'order.Sebacinales': 'Sebacina jellies',
  'order.Amylocorticiales': 'Amylocorticioid crusts',
  'order.Filobasidiales': 'Filobasidium yeasts',

  'mode.label': 'Display mode',
  'mode.points': 'Points',
  'mode.heatmap': 'Heatmap',
  'tools.title': 'Map style and colours',
  'tools.basemap': 'Base map',
  'tools.colorBy': 'Colour points by',
  'tools.language': 'Language',
  'basemap.dark': 'Dark',
  'basemap.light': 'Light',
  'basemap.topo': 'Topographic (forests, terrain)',
  'basemap.satellite': 'Satellite',
  'color.edibility': 'Edibility',
  'color.group': 'Type (order)',
  'color.year': 'Year observed',

  'legend.density': 'Record density',
  'legend.fewer': 'fewer',
  'legend.more': 'more',
  'legend.type': 'Type',
  'legend.expand': 'Expand legend',
  'legend.collapse': 'Collapse legend',

  'popup.date': 'Date',
  'popup.accuracy': 'Accuracy',
  'popup.notStated': 'not stated',
  'popup.position': 'Position',
  'popup.country': 'Country',
  'popup.type': 'Type',
  'popup.locality': 'Locality',
  'popup.recordedBy': 'Recorded by',
  'popup.source': 'Source',
  'popup.observation': 'Observation',
  'popup.specimen': 'Herbarium specimen',
  'popup.speciesInfo': 'Species info',
  'popup.only': 'Only this species',
  'popup.gbif': 'GBIF record ↗',
  'popup.directions': 'Directions ↗',

  'footer.data': 'Data:',
  'footer.snapshot': 'Snapshot {date}, {n} records.',
  'footer.warning': 'Never eat a wild mushroom you have not identified with certainty.',
  'loading.text': 'Loading occurrences…',
  'loading.progress': 'Loading occurrences… {p}%',
  'loading.preparing': 'Preparing {n} points…',
  'loading.error': 'Could not load the data: {message}',
};

const de = {
  'doc.title': 'Shrooms · Karte der Pilzfunde',
  'brand.sub': 'Karte der Pilzfunde',
  'search.placeholder': 'Art, Gattung, Familie suchen…',
  'search.label': 'Taxa suchen',
  'search.none': 'Keine passenden Taxa in diesem Datensatz',
  'summary.loading': 'Lädt…',
  summary: '<strong>{total}</strong> von {all} Funden passen · <strong>{inView}</strong> im Ausschnitt',
  'tab.filters': 'Filter',
  'tab.list': 'Im Ausschnitt',
  'tab.details': 'Details',
  'panel.resize': 'Panelgröße ändern',

  'filter.edibility': 'Essbarkeit',
  'filter.edibilityNote': 'Laut Wikidata. Für die meisten Arten gibt es keine Angabe; sie erscheinen als <em>unbekannt</em>.',
  'filter.all': 'Alle',
  'filter.season': 'Saison',
  'filter.allYear': 'Ganzjährig',
  'filter.years': 'Jahre',
  'filter.yearFrom': 'Ab Jahr',
  'filter.yearTo': 'Bis Jahr',
  'filter.type': 'Typ',
  'filter.country': 'Land',
  'filter.allCountries': 'Alle Länder',
  'filter.accuracy': 'Ortsgenauigkeit',
  'filter.accuracyAny': 'Beliebig',
  'filter.accuracyWithin': 'Bis {d}',
  'filter.specimens': 'Herbarbelege einbeziehen',
  'filter.resetAll': 'Alle Filter zurücksetzen',
  'filter.source': 'Quelle',
  'filter.sourceNote': 'iNaturalist-Beobachtungen ohne Forschungsqualität: Die Bestimmung hat noch niemand bestätigt.',
  'source.0': 'GBIF',
  'source.1': 'iNat: unbestätigt',
  'source.2': 'iNat: Gelegenheitsfund',
  'popup.dataset': 'Datensatz',
  'popup.inat': 'iNaturalist ↗',
  'popup.unconfirmed': 'Bestimmung unbestätigt: Diese iNaturalist-Beobachtung hat keine Forschungsqualität.',
  'filter.recordsTitle': { one: '{n} Fund', other: '{n} Funde' },
  'preset.now': 'Jetzt ±1 Monat',
  'preset.spring': 'Frühling',
  'preset.summer': 'Sommer',
  'preset.autumn': 'Herbst',
  'preset.winter': 'Winter',
  'preset.last3': 'Letzte 3 Jahre',
  'preset.last10': 'Letzte 10 Jahre',
  'preset.all': 'Alle',
  'group.other': 'Sonstige',

  'list.note': 'Arten mit den meisten Funden im aktuellen Kartenausschnitt.',
  'list.count': { one: '{n} Art im aktuellen Ausschnitt.', other: '{n} Arten im aktuellen Ausschnitt.' },
  'list.countTop': '{n} Arten im aktuellen Ausschnitt, die {k} häufigsten werden angezeigt.',
  'list.empty': 'Keine passenden Funde im aktuellen Ausschnitt. Herauszoomen oder Filter lockern.',

  'details.empty': 'Suche nach einer Art, wähle eine unter <strong>Im Ausschnitt</strong> oder tippe auf einen Punkt der Karte, um hier Details zu sehen.',
  'details.also': 'außerdem {flags}',
  'details.zoom': 'Auf Funde zoomen',
  'details.only': 'Nur diese zeigen',
  'details.showAll': 'Alle Arten zeigen',
  'details.season': 'Saison',
  'details.seasonInView': 'im aktuellen Ausschnitt ({n} Funde)',
  'details.seasonAll': 'alle Funde',
  'details.peak': 'Meiste Funde: <strong>{months}</strong>',
  'details.barTitle': { one: '{month}: {n} Fund', other: '{month}: {n} Funde' },
  'details.classification': 'Systematik',
  'details.filterBy': 'Nach {rank} filtern',
  'details.countries': 'Häufigste Länder',
  'details.links': 'Links',
  'details.aka': 'Weitere Namen',
  'details.identification': 'Merkmale',
  'details.about': 'Über die Art',
  'details.readMore': 'Mehr auf Wikipedia ↗',
  'details.failed': 'Weitere Informationen konnten nicht geladen werden.',
  'details.mix': 'Essbarkeit',
  'details.mixBy': 'nach Funden',
  'details.species': 'Arten',
  'stat.records': 'Funde',
  'stat.inView': 'im Ausschnitt',
  'stat.countries': 'Länder',
  'stat.species': 'Arten',

  'rank.species': 'Art',
  'rank.genus': 'Gattung',
  'rank.family': 'Familie',
  'rank.order': 'Ordnung',
  'taxon.info': 'Info',
  'taxon.clear': 'Taxonfilter entfernen',

  'lang.en': 'Englisch',
  'lang.de': 'Deutsch',

  'cat.0': 'Unbekannt',
  'cat.1': 'Sehr guter Speisepilz',
  'cat.2': 'Essbar',
  'cat.3': 'Bedingt essbar',
  'cat.4': 'Ungenießbar',
  'cat.5': 'Psychoaktiv',
  'cat.6': 'Giftig',
  'cat.7': 'Tödlich giftig',
  'catShort.0': 'Unbekannt',
  'catShort.1': 'Vorzüglich',
  'catShort.2': 'Essbar',
  'catShort.3': 'Bedingt',
  'catShort.4': 'Ungenießbar',
  'catShort.5': 'Psychoaktiv',
  'catShort.6': 'Giftig',
  'catShort.7': 'Tödlich',
  'advice.0': 'Keine Angaben zur Essbarkeit. Als unbekannt behandeln.',
  'advice.1': 'Gilt als sehr guter Speisepilz. Es kann gefährliche Doppelgänger geben, die Bestimmung muss also sicher sein.',
  'advice.2': 'Gilt als essbar. Vor dem Verzehr die Bestimmung von einer Fachperson bestätigen lassen.',
  'advice.3': 'Nur mit Vorsicht essbar (z. B. nur gekocht) oder bei manchen Menschen unverträglich.',
  'advice.4': 'Gilt nicht als essbar (bitter, zäh oder zu klein).',
  'advice.5': 'Enthält psychoaktive Stoffe. Der Besitz kann verboten sein, und die Art kann giftig sein.',
  'advice.6': 'Giftig. Nicht essen.',
  'advice.7': 'Tödlich giftig. Schon kleine Mengen können tödlich sein.',
  'flag.1': 'essbar',
  'flag.2': 'sehr guter Speisepilz',
  'flag.4': 'gekocht essbar',
  'flag.8': 'Vorsicht',
  'flag.16': 'ungenießbar',
  'flag.32': 'psychoaktiv',
  'flag.64': 'giftig',
  'flag.128': 'tödlich',
  'flag.256': 'Heilpilz',

  'trait.P783': 'Fruchtschicht',
  'trait.P784': 'Hutform',
  'trait.P785': 'Ansatz der Fruchtschicht',
  'trait.P786': 'Stiel',
  'trait.P787': 'Sporenpulver',
  'trait.P788': 'Lebensweise',

  'order.Agaricales': 'Lamellenpilze',
  'order.Boletales': 'Röhrlinge & Verwandte',
  'order.Russulales': 'Täublinge & Milchlinge',
  'order.Polyporales': 'Porlinge',
  'order.Hymenochaetales': 'Feuerschwämme & Verwandte',
  'order.Cantharellales': 'Pfifferlinge & Stoppelpilze',
  'order.Pezizales': 'Becherlinge, Morcheln & Trüffel',
  'order.Auriculariales': 'Ohrlappenpilze',
  'order.Tremellales': 'Zitterlinge',
  'order.Dacrymycetales': 'Gallerttränen',
  'order.Phallales': 'Stinkmorcheln',
  'order.Geastrales': 'Erdsterne',
  'order.Gomphales': 'Korallen & Keulen',
  'order.Thelephorales': 'Warzenpilze',
  'order.Gloeophyllales': 'Blättlinge',
  'order.Corticiales': 'Rindenpilze (Corticiales)',
  'order.Hysterangiales': 'Schwanztrüffel',
  'order.Atheliales': 'Rindenpilze (Atheliales)',
  'order.Trechisporales': 'Rindenpilze (Trechisporales)',
  'order.Sebacinales': 'Wachskrusten',
  'order.Amylocorticiales': 'Rindenpilze (Amylocorticiales)',
  'order.Filobasidiales': 'Filobasidium-Hefen',

  'mode.label': 'Darstellung',
  'mode.points': 'Punkte',
  'mode.heatmap': 'Heatmap',
  'tools.title': 'Kartenstil und Farben',
  'tools.basemap': 'Grundkarte',
  'tools.colorBy': 'Punkte färben nach',
  'tools.language': 'Sprache',
  'basemap.dark': 'Dunkel',
  'basemap.light': 'Hell',
  'basemap.topo': 'Topografisch (Wald, Gelände)',
  'basemap.satellite': 'Satellit',
  'color.edibility': 'Essbarkeit',
  'color.group': 'Typ (Ordnung)',
  'color.year': 'Fundjahr',

  'legend.density': 'Funddichte',
  'legend.fewer': 'weniger',
  'legend.more': 'mehr',
  'legend.type': 'Typ',
  'legend.expand': 'Legende ausklappen',
  'legend.collapse': 'Legende einklappen',

  'popup.date': 'Datum',
  'popup.accuracy': 'Genauigkeit',
  'popup.notStated': 'keine Angabe',
  'popup.position': 'Position',
  'popup.country': 'Land',
  'popup.type': 'Fundart',
  'popup.locality': 'Fundort',
  'popup.recordedBy': 'Gefunden von',
  'popup.source': 'Quelle',
  'popup.observation': 'Beobachtung',
  'popup.specimen': 'Herbarbeleg',
  'popup.speciesInfo': 'Arteninfo',
  'popup.only': 'Nur diese Art',
  'popup.gbif': 'GBIF-Eintrag ↗',
  'popup.directions': 'Route ↗',

  'footer.data': 'Daten:',
  'footer.snapshot': 'Stand {date}, {n} Funde.',
  'footer.warning': 'Iss niemals einen Wildpilz, den du nicht sicher bestimmt hast.',
  'loading.text': 'Funde werden geladen…',
  'loading.progress': 'Funde werden geladen… {p} %',
  'loading.preparing': '{n} Punkte werden vorbereitet…',
  'loading.error': 'Die Daten konnten nicht geladen werden: {message}',
};

const DICTS = { en, de };

// Each language is listed under its own name.
export const LANGUAGES = [
  ['en', 'English'],
  ['de', 'Deutsch'],
];

const STORAGE_KEY = 'shrooms.lang';

function detect() {
  const param = new URLSearchParams(location.search).get('lang');
  if (param && DICTS[param]) return param;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  for (const l of navigator.languages || [navigator.language]) {
    const base = (l || '').toLowerCase().split('-')[0];
    if (DICTS[base]) return base;
  }
  return 'en';
}

export const lang = detect();
const plural = new Intl.PluralRules(lang);

export function has(key) {
  return key in DICTS[lang] || key in en;
}

export function t(key, params = {}) {
  let value = DICTS[lang][key] ?? en[key] ?? key;
  if (typeof value === 'object') value = value[plural.select(params.n ?? 0)] ?? value.other;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m));
}

// Switching reloads the page: the UI is built once at startup, and the data comes from the HTTP cache.
export function setLanguage(next) {
  if (next === lang || !DICTS[next]) return;
  const url = new URL(location.href);
  try {
    localStorage.setItem(STORAGE_KEY, next);
    url.searchParams.delete('lang');
  } catch {
    // Storage blocked: carry the choice in the URL instead.
    url.searchParams.set('lang', next);
  }
  // Navigating to the same URL with a #hash would only scroll, not reload.
  if (url.href === location.href) location.reload();
  else location.replace(url);
}

// Localized short and one-letter month names (index 0 = January).
const monthFormat = (style) =>
  Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' }).format(Date.UTC(2001, m, 15)));
export const MONTHS = monthFormat('short');
export const MONTH_INITIALS = monthFormat('narrow');

// Apply translations to static markup: data-i18n (text), data-i18n-html, and
// data-i18n-placeholder / -aria-label / -title for attributes.
export function translateDocument(root = document) {
  document.documentElement.lang = lang;
  document.title = t('doc.title');
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    const dataKey = `i18n${attr.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`;
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.dataset[dataKey]));
  }
}
