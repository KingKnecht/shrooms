import { loadDataset, CATEGORIES, GROUP_PALETTE, GROUP_OTHER, AGE_RAMP } from './data.js';
import { createFilterState, FilterEngine } from './filters.js';
import { OccurrenceMap, BASEMAPS } from './map.js';
import { setupSearch } from './search.js';
import { FiltersUI } from './filters-ui.js';
import { SpeciesUI } from './species-ui.js';
import { Legend } from './legend.js';
import { showOccurrencePopup } from './popup.js';
import { setupSheet } from './sheet.js';
import { fmt, esc, debounce } from './util.js';
import { lang, t, LANGUAGES, setLanguage, translateDocument } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

class App {
  constructor(ds) {
    this.ds = ds;
    this.state = createFilterState(ds);
    this.engine = new FilterEngine(ds);
    this.mode = 'points';
    this.colorMode = 'edibility';
    this.colors = new Uint8Array(ds.count * 4);
    this.lastStats = null;
    this.canHover = matchMedia('(hover: hover)').matches;

    this.map = new OccurrenceMap($('#map'), {
      onClick: (info) => this.onPointClick(info),
      getTooltip: (info) => this.tooltip(info),
      onViewChange: () => this.scheduleStats(),
    });

    this.sheet = setupSheet($('#panel'));
    this.legend = new Legend($('#legend'), this);
    this.filtersUI = new FiltersUI(this);
    this.speciesUI = new SpeciesUI(this);
    setupSearch($('#search'), $('#search-results'), this);
    this.setupTabs();
    this.setupTools();

    this.scheduleStats = debounce(() => this.updateStats(), 120);
    this.refreshWeights = debounce(() => {
      if (this.mode === 'heatmap') {
        this.engine.updateWeights(this.state);
        this.rebuildHeat();
        this.render();
      }
    }, 60);

    this.computeColors();
    this.applyFilters();

    const stamp = new Date(ds.meta.generated);
    $('#data-stamp').textContent = t('footer.snapshot', {
      date: stamp.toLocaleDateString(lang, { month: 'short', year: 'numeric' }),
      n: fmt(ds.count),
    });
  }

  // ---- Rendering ----

  rebuildPoints() {
    const ds = this.ds;
    this.pointData = {
      length: ds.count,
      attributes: {
        getPosition: { value: ds.position, size: 2 },
        getFillColor: { value: this.colors, size: 4, normalized: true },
        getFilterValue: { value: this.engine.filterValues, size: 2 },
      },
    };
  }

  rebuildHeat() {
    this.heatData = {
      length: this.ds.count,
      attributes: {
        getPosition: { value: this.ds.position, size: 2 },
        getWeight: { value: this.engine.weights, size: 1 },
      },
    };
  }

  render() {
    this.map.render({
      mode: this.mode,
      pointData: this.pointData,
      heatData: this.heatData,
      dayRange: this.state.dayRange,
      focused: this.state.taxon?.rank === 'species',
    });
  }

  computeColors() {
    const ds = this.ds;
    const out = this.colors;
    const perSpecies = new Uint8Array(ds.nSpecies * 4);
    if (this.colorMode === 'edibility') {
      for (let s = 0; s < ds.nSpecies; s++) {
        const c = CATEGORIES[ds.speciesCategory[s]];
        perSpecies.set([...c.color, c.alpha], s * 4);
      }
    } else if (this.colorMode === 'group') {
      const slot = new Map(ds.ordersByCount.slice(0, GROUP_PALETTE.length).map((o, i) => [o, i]));
      for (let s = 0; s < ds.nSpecies; s++) {
        const i = slot.get(ds.speciesOrder[s]);
        perSpecies.set([...(i === undefined ? GROUP_OTHER : GROUP_PALETTE[i]), 210], s * 4);
      }
    }

    if (this.colorMode === 'year') {
      const span = Math.max(1, ds.maxDay - ds.minDay);
      const steps = AGE_RAMP.length - 1;
      for (let i = 0; i < ds.count; i++) {
        const pos = ((ds.day[i] - ds.minDay) / span) * steps;
        const k = Math.min(steps - 1, Math.floor(pos));
        const f = pos - k;
        const a = AGE_RAMP[k];
        const b = AGE_RAMP[k + 1];
        out[i * 4] = a[0] + (b[0] - a[0]) * f;
        out[i * 4 + 1] = a[1] + (b[1] - a[1]) * f;
        out[i * 4 + 2] = a[2] + (b[2] - a[2]) * f;
        out[i * 4 + 3] = 215;
      }
    } else {
      const sp = ds.species;
      for (let i = 0; i < ds.count; i++) {
        const o = sp[i] * 4;
        out[i * 4] = perSpecies[o];
        out[i * 4 + 1] = perSpecies[o + 1];
        out[i * 4 + 2] = perSpecies[o + 2];
        out[i * 4 + 3] = perSpecies[o + 3];
      }
    }
    // New view so deck.gl notices the change.
    this.colors = new Uint8Array(out.buffer);
  }

  // ---- State changes ----

  applyFilters() {
    this.engine.update(this.state);
    if (this.mode === 'heatmap') {
      this.engine.updateWeights(this.state);
      this.rebuildHeat();
    }
    this.rebuildPoints();
    this.render();
    this.filtersUI.sync();
    this.legend.render();
    this.renderActiveTaxon();
    this.scheduleStats();
  }

  applyDateRange() {
    this.render();
    this.filtersUI.sync();
    this.refreshWeights();
    this.scheduleStats();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'heatmap') {
      this.engine.updateWeights(this.state);
      this.rebuildHeat();
    }
    document.querySelectorAll('#mode-toggle button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    this.map.popup?.remove();
    this.render();
    this.legend.render();
  }

  setColorMode(mode) {
    this.colorMode = mode;
    this.computeColors();
    this.rebuildPoints();
    this.render();
    this.legend.render();
    this.renderToolOptions();
    this.speciesUI.renderList(this.lastStats);
  }

  selectTaxon(taxon, { fly = false, showDetails = true } = {}) {
    this.state.taxon = taxon;
    this.writeTaxonToUrl();
    this.applyFilters();
    if (taxon) {
      if (showDetails) {
        this.speciesUI.showTaxon(taxon);
        this.showTab('species');
      }
      if (fly) {
        const profile = this.engine.taxonProfile(taxon, this.map.bounds());
        if (profile.bbox && profile.inView === 0) this.fitBbox(profile.bbox);
      }
    } else {
      this.speciesUI.clear();
    }
  }

  // The URL hash carries the selected taxon next to MapLibre's own `map=` parameter.
  writeTaxonToUrl() {
    const params = new URLSearchParams(location.hash.slice(1));
    const taxon = this.state.taxon;
    if (taxon) params.set('taxon', `${taxon.rank}:${this.ds.taxonTable(taxon.rank).key[taxon.idx]}`);
    else params.delete('taxon');
    history.replaceState(history.state, '', `#${params.toString().replaceAll('%2F', '/').replaceAll('%3A', ':')}`);
  }

  readTaxonFromUrl() {
    const value = new URLSearchParams(location.hash.slice(1)).get('taxon');
    const [rank, key] = (value || '').split(':');
    const table = ['species', 'genus', 'family', 'order'].includes(rank) && this.ds.taxonTable(rank);
    const idx = table ? table.key.indexOf(Number(key)) : -1;
    if (idx >= 0) this.selectTaxon({ rank, idx }, { fly: !new URLSearchParams(location.hash.slice(1)).has('map') });
  }

  fitBbox([w, s, e, n]) {
    const pad = Math.min(80, Math.round(window.innerWidth * 0.08));
    const desktop = window.innerWidth > 760;
    this.map.map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: { top: pad + 40, bottom: desktop ? pad : Math.round(window.innerHeight * 0.5), left: desktop ? 410 : pad, right: pad },
        maxZoom: 11,
        duration: 900,
      },
    );
  }

  // ---- Stats ----

  updateStats() {
    const stats = this.engine.stats(this.state, this.map.bounds());
    this.lastStats = stats;
    $('#summary').innerHTML = t('summary', { total: fmt(stats.total), all: fmt(this.ds.count), inView: fmt(stats.inView) });
    this.speciesUI.renderList(stats);
    this.speciesUI.refreshInView();
  }

  // ---- Picking ----

  onPointClick(info) {
    if (info.layer?.id !== 'points' || info.index < 0) {
      this.map.popup?.remove();
      return;
    }
    showOccurrencePopup(this, info.index);
  }

  tooltip(info) {
    if (!this.canHover || info.layer?.id !== 'points' || info.index < 0) return null;
    const ds = this.ds;
    const i = info.index;
    const s = ds.species[i];
    const date = this.formatDay(ds.day[i], ds.month[i]);
    const common = ds.commonName(s);
    return {
      html: common
        ? `<b>${esc(common)}</b><br><i>${esc(ds.speciesName(s))}</i><br><span class="muted">${date}</span>`
        : `<b><i>${esc(ds.speciesName(s))}</i></b><br><span class="muted">${date}</span>`,
      className: 'deck-tooltip',
    };
  }

  formatDay(day, month) {
    const d = new Date(Date.UTC(1900, 0, 1) + day * 86_400_000);
    if (!month) return String(d.getUTCFullYear());
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // ---- Chrome ----

  renderActiveTaxon() {
    const el = $('#active-taxon');
    const taxon = this.state.taxon;
    if (!taxon) {
      el.hidden = true;
      return;
    }
    const ds = this.ds;
    const { rank, idx } = taxon;
    const label =
      rank === 'species'
        ? ds.commonName(idx)
          ? `${esc(ds.commonName(idx))} <i class="muted">${esc(ds.speciesName(idx))}</i>`
          : `<i>${esc(ds.speciesName(idx))}</i>`
        : esc(ds.taxonName(rank, idx));
    el.innerHTML = `<span class="t-label"><span class="t-rank">${esc(t(`rank.${rank}`))}</span>${label}</span>
      <button type="button" data-act="info">${esc(t('taxon.info'))}</button>
      <button type="button" data-act="clear" aria-label="${esc(t('taxon.clear'))}">✕</button>`;
    el.hidden = false;
    el.onclick = (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'clear') this.selectTaxon(null);
      if (act === 'info') {
        this.speciesUI.showTaxon(taxon);
        this.showTab('species');
      }
    };
  }

  setupTabs() {
    document.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
    });
  }

  showTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.tab-page').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
    $('.panel-body').scrollTop = 0;
    if (this.sheet.state() === 'peek') this.sheet.set('half');
  }

  setupTools() {
    document.querySelectorAll('#mode-toggle button').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    const btn = $('#layers-btn');
    const pop = $('#layers-popover');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      btn.setAttribute('aria-expanded', String(!pop.hidden));
    });
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !pop.contains(e.target)) {
        pop.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    this.renderToolOptions();
  }

  renderToolOptions() {
    $('#basemap-options').innerHTML = BASEMAPS.map(
      (b) => `<button role="radio" data-basemap="${b.id}" aria-checked="${b.id === this.map.basemap}">${esc(t(`basemap.${b.id}`))}</button>`,
    ).join('');
    $('#basemap-options').onclick = (e) => {
      const id = e.target.closest('button')?.dataset.basemap;
      if (id) {
        this.map.setBasemap(id);
        this.renderToolOptions();
      }
    };
    $('#color-options').innerHTML = ['edibility', 'group', 'year']
      .map((id) => `<button role="radio" data-color="${id}" aria-checked="${id === this.colorMode}">${esc(t(`color.${id}`))}</button>`)
      .join('');
    $('#color-options').onclick = (e) => {
      const id = e.target.closest('button')?.dataset.color;
      if (id && id !== this.colorMode) this.setColorMode(id);
    };
    $('#language-options').innerHTML = LANGUAGES.map(
      ([id, name]) => `<button role="radio" data-lang="${id}" lang="${id}" aria-checked="${id === lang}">${esc(name)}</button>`,
    ).join('');
    $('#language-options').onclick = (e) => {
      const id = e.target.closest('button')?.dataset.lang;
      if (id) setLanguage(id);
    };
  }
}

async function main() {
  translateDocument();
  const bar = $('#loading-bar');
  const text = $('#loading-text');
  try {
    const ds = await loadDataset((p) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      text.textContent = t('loading.progress', { p: Math.round(p * 100) });
    });
    text.textContent = t('loading.preparing', { n: fmt(ds.count) });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
    window.app = new App(ds);
    window.app.readTaxonFromUrl();
    $('#loading').classList.add('done');
  } catch (err) {
    console.error(err);
    text.textContent = t('loading.error', { message: err.message });
  }
}

main();
