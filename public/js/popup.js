import { CATEGORIES } from './data.js';
import { esc, rgb, safeUrl } from './util.js';

const BASIS_LABELS = {
  HUMAN_OBSERVATION: 'Observation',
  OBSERVATION: 'Observation',
  PRESERVED_SPECIMEN: 'Herbarium specimen',
};

// Per-point extras come in chunk files of meta.detailsChunk points each:
// [gbifKey, locality, recordedBy, dataset, photoUrl] per point.
const chunks = new Map();

function loadDetails(ds, index) {
  const n = Math.floor(index / ds.meta.detailsChunk);
  if (!chunks.has(n)) {
    const url = `data/details/${n}.json?v=${encodeURIComponent(ds.manifest.version)}`;
    const promise = fetch(url).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
    promise.catch(() => chunks.delete(n));
    chunks.set(n, promise);
  }
  return chunks.get(n).then((rows) => rows[index % ds.meta.detailsChunk]);
}

export async function showOccurrencePopup(app, index) {
  const ds = app.ds;
  const s = ds.species[index];
  const lon = ds.position[index * 2];
  const lat = ds.position[index * 2 + 1];
  const common = ds.commonName(s);
  const cat = CATEGORIES[ds.speciesCategory[s]];
  const unc = ds.uncertainty[index];

  const root = document.createElement('div');
  root.className = 'occ';
  root.innerHTML = `
    <img class="occ-photo" alt="" hidden referrerpolicy="no-referrer">
    <div class="occ-body">
      <p class="occ-title">${common ? esc(common) : `<i>${esc(ds.speciesName(s))}</i>`}</p>
      ${common ? `<div class="occ-sci">${esc(ds.speciesName(s))}</div>` : ''}
      <div class="occ-badge"><span class="dot" style="background:${rgb(cat.color)}"></span>${esc(cat.label)}</div>
      <dl class="occ-meta">
        <dt>Date</dt><dd>${app.formatDay(ds.day[index], ds.month[index])}</dd>
        <dt>Accuracy</dt><dd>${unc === ds.meta.unknownUncertainty ? 'not stated' : `± ${unc.toLocaleString('en')} m`}</dd>
        <dt>Position</dt><dd>${lat.toFixed(5)}, ${lon.toFixed(5)}</dd>
        <dt>Country</dt><dd>${esc(ds.countryNames[ds.country[index]])}</dd>
        <dt>Type</dt><dd>${BASIS_LABELS[ds.meta.basis[ds.basis[index]]] || 'Observation'}</dd>
      </dl>
      <dl class="occ-meta" data-extra></dl>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="details">Species info</button>
        <button class="btn" data-act="only">Only this species</button>
        <a class="btn" data-gbif target="_blank" rel="noopener" hidden>GBIF record ↗</a>
        <a class="btn" target="_blank" rel="noopener"
           href="https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}">Directions ↗</a>
      </div>
    </div>`;

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'details') {
      app.speciesUI.showTaxon({ rank: 'species', idx: s });
      app.showTab('species');
      if (app.sheet.state() === 'peek') app.sheet.set('half');
    } else if (act === 'only') {
      app.map.popup?.remove();
      app.selectTaxon({ rank: 'species', idx: s });
    }
  });

  app.map.popup?.remove();
  app.map.popup = new maplibregl.Popup({ maxWidth: '300px', offset: 8, focusAfterOpen: false })
    .setLngLat([lon, lat])
    .setDOMContent(root)
    .addTo(app.map.map);

  try {
    const [key, locality, recordedBy, dataset, image] = await loadDetails(ds, index);
    const rows = [
      ['Locality', locality],
      ['Recorded by', recordedBy],
      ['Source', dataset],
    ].filter(([, v]) => v);
    root.querySelector('[data-extra]').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const gbif = root.querySelector('[data-gbif]');
    gbif.href = `https://www.gbif.org/occurrence/${encodeURIComponent(key)}`;
    gbif.hidden = false;
    // iNaturalist links point at multi-megabyte originals; the medium size is plenty here.
    const photo = safeUrl(image)?.replace(/\/original\.(jpe?g|png)$/i, '/medium.$1');
    if (photo) {
      const img = root.querySelector('.occ-photo');
      img.addEventListener('load', () => (img.hidden = false));
      img.addEventListener('error', () => img.remove());
      img.src = photo;
    }
  } catch {
    // Details are optional; the popup already shows the essentials.
  }
}
