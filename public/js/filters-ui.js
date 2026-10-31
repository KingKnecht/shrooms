import { CATEGORIES, GROUP_PALETTE, GROUP_OTHER, MONTHS, dateToDay } from './data.js';
import { GROUP_SLOTS } from './filters.js';
import { esc, fmt, rgb } from './util.js';

const $ = (sel) => document.querySelector(sel);

const SEASONS = [
  ['Spring', [3, 4, 5]],
  ['Summer', [6, 7, 8]],
  ['Autumn', [9, 10, 11]],
  ['Winter', [12, 1, 2]],
];

// Toggle helper for multi-select chips: the first click on a fully-selected set
// isolates the clicked item, and deselecting the last item selects everything again.
function toggleInSet(all, selected, item) {
  if (selected.size === all.length) return new Set([item]);
  const next = new Set(selected);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next.size === 0 || next.size === all.length ? new Set(all) : next;
}

export class FiltersUI {
  constructor(app) {
    this.app = app;
    this.ds = app.ds;
    this.groupIds = [...this.ds.ordersByCount.slice(0, GROUP_SLOTS), -1];
    this.buildCategories();
    this.buildMonths();
    this.buildYears();
    this.buildGroups();
    this.buildSelects();

    document.querySelectorAll('[data-reset]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const s = this.app.state;
        if (btn.dataset.reset === 'categories') s.categories.fill(true);
        if (btn.dataset.reset === 'months') s.months.fill(true);
        if (btn.dataset.reset === 'groups') s.groups = null;
        this.app.applyFilters();
      }),
    );
    $('#reset-all').addEventListener('click', () => this.resetAll());
  }

  resetAll() {
    const s = this.app.state;
    s.categories.fill(true);
    s.months.fill(true);
    s.groups = null;
    s.country = -1;
    s.maxUncertainty = Infinity;
    s.includeSpecimens = true;
    s.dayRange = [this.ds.minDay, this.ds.maxDay];
    this.syncYears();
    this.app.selectTaxon(null);
    this.app.applyDateRange();
  }

  // ---- Edibility ----

  buildCategories() {
    const ds = this.ds;
    const counts = new Array(8).fill(0);
    const spCount = ds.meta.species.count;
    for (let s = 0; s < ds.nSpecies; s++) counts[ds.speciesCategory[s]] += spCount[s];
    // Most useful order for foragers: edibles first, unknown last.
    const order = [1, 2, 3, 4, 5, 6, 7, 0];
    const el = $('#filter-categories');
    el.innerHTML = order
      .map((id) => {
        const c = CATEGORIES[id];
        return `<button class="chip" data-cat="${id}" aria-pressed="true" title="${fmt(counts[id])} records">
          <span class="dot" style="background:${rgb(c.color)}"></span>${c.short}</button>`;
      })
      .join('');
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (btn) this.toggleCategory(Number(btn.dataset.cat));
    });
  }

  toggleCategory(id) {
    const s = this.app.state;
    const all = [0, 1, 2, 3, 4, 5, 6, 7];
    const selected = new Set(all.filter((c) => s.categories[c]));
    const next = toggleInSet(all, selected, id);
    all.forEach((c) => (s.categories[c] = next.has(c)));
    this.app.applyFilters();
  }

  // ---- Season ----

  buildMonths() {
    const el = $('#filter-months');
    el.innerHTML = MONTHS.map((m, i) => `<button data-month="${i + 1}" aria-pressed="true">${m}</button>`).join('');
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-month]');
      if (!btn) return;
      const s = this.app.state;
      const all = Array.from({ length: 12 }, (_, i) => i + 1);
      const selected = new Set(all.filter((m) => s.months[m]));
      const next = toggleInSet(all, selected, Number(btn.dataset.month));
      all.forEach((m) => (s.months[m] = next.has(m)));
      this.app.applyFilters();
    });

    const now = new Date().getMonth() + 1;
    const around = [((now + 10) % 12) + 1, now, (now % 12) + 1];
    const presets = [['Now ±1 month', around], ...SEASONS];
    const pe = $('#month-presets');
    pe.innerHTML = presets.map(([label], i) => `<button class="chip" data-preset="${i}">${label}</button>`).join('');
    pe.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      const months = presets[Number(btn.dataset.preset)][1];
      const s = this.app.state;
      s.months.fill(false);
      months.forEach((m) => (s.months[m] = true));
      s.months[0] = true;
      this.app.applyFilters();
    });
  }

  // ---- Years (GPU-filtered, so dragging is cheap) ----

  buildYears() {
    const { minYear, maxYear } = this.ds;
    this.yearMin = $('#year-min');
    this.yearMax = $('#year-max');
    for (const input of [this.yearMin, this.yearMax]) {
      input.min = minYear;
      input.max = maxYear;
      input.step = 1;
    }
    this.yearMin.value = minYear;
    this.yearMax.value = maxYear;

    const onInput = (e) => {
      let a = Number(this.yearMin.value);
      let b = Number(this.yearMax.value);
      if (a > b) {
        if (e.target === this.yearMin) b = a;
        else a = b;
        this.yearMin.value = a;
        this.yearMax.value = b;
      }
      this.setYears(a, b);
    };
    this.yearMin.addEventListener('input', onInput);
    this.yearMax.addEventListener('input', onInput);

    const presets = [
      ['Last 3 years', maxYear - 2],
      ['Last 10 years', maxYear - 9],
      ['All', minYear],
    ];
    const pe = $('#year-presets');
    pe.innerHTML = presets.map(([label], i) => `<button class="chip" data-y="${i}">${label}</button>`).join('');
    pe.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-y]');
      if (!btn) return;
      const from = Math.max(minYear, presets[Number(btn.dataset.y)][1]);
      this.yearMin.value = from;
      this.yearMax.value = maxYear;
      this.setYears(from, maxYear);
    });
    this.syncYears();
  }

  setYears(a, b) {
    const ds = this.ds;
    const s = this.app.state;
    s.dayRange = [a <= ds.minYear ? ds.minDay : dateToDay(a, 1, 1), b >= ds.maxYear ? ds.maxDay : dateToDay(b, 12, 31)];
    this.syncYears();
    this.app.applyDateRange();
  }

  syncYears() {
    const { minYear, maxYear } = this.ds;
    const s = this.app.state;
    const a = new Date(Date.UTC(1900, 0, 1) + s.dayRange[0] * 86_400_000).getUTCFullYear();
    const b = new Date(Date.UTC(1900, 0, 1) + s.dayRange[1] * 86_400_000).getUTCFullYear();
    this.yearMin.value = a;
    this.yearMax.value = b;
    // When both thumbs sit at the right end, keep the "from" thumb on top so it can still be dragged.
    this.yearMin.style.zIndex = a >= maxYear ? 3 : 2;
    $('#year-label').textContent = a === b ? String(a) : `${a} – ${b}`;
    const span = Math.max(1, maxYear - minYear);
    const fill = $('#year-fill');
    fill.style.left = `${((a - minYear) / span) * 100}%`;
    fill.style.right = `${100 - ((b - minYear) / span) * 100}%`;
  }

  // ---- Type (fungal order) ----

  buildGroups() {
    const ds = this.ds;
    const counts = ds.meta.orders.count;
    const otherCount = ds.ordersByCount.slice(GROUP_SLOTS).reduce((n, o) => n + counts[o], 0);
    const el = $('#filter-groups');
    el.innerHTML = this.groupIds
      .map((o, i) => {
        const color = o === -1 ? GROUP_OTHER : GROUP_PALETTE[i] || GROUP_OTHER;
        const label = o === -1 ? 'Other' : ds.orderLabel(o);
        const title = o === -1 ? `${fmt(otherCount)} records` : `${ds.meta.orders.name[o]} · ${fmt(counts[o])} records`;
        return `<button class="chip" data-group="${o}" aria-pressed="true" title="${esc(title)}">
          <span class="dot" style="background:${rgb(color)}"></span>${esc(label)}</button>`;
      })
      .join('');
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-group]');
      if (!btn) return;
      const s = this.app.state;
      const selected = s.groups || new Set(this.groupIds);
      const next = toggleInSet(this.groupIds, selected, Number(btn.dataset.group));
      s.groups = next.size === this.groupIds.length ? null : next;
      this.app.applyFilters();
    });
  }

  // ---- Country, accuracy, specimens ----

  buildSelects() {
    const ds = this.ds;
    const counts = new Uint32Array(ds.meta.countries.length);
    for (let i = 0; i < ds.count; i++) counts[ds.country[i]]++;
    const options = ds.countryNames
      .map((name, i) => ({ name, i, n: counts[i] }))
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sel = $('#filter-country');
    sel.insertAdjacentHTML('beforeend', options.map((c) => `<option value="${c.i}">${esc(c.name)} (${fmt(c.n)})</option>`).join(''));
    sel.addEventListener('change', () => {
      this.app.state.country = Number(sel.value);
      this.app.applyFilters();
      if (this.app.state.country >= 0) this.zoomToCountry(this.app.state.country);
    });

    $('#filter-precision').addEventListener('change', (e) => {
      this.app.state.maxUncertainty = Number(e.target.value);
      this.app.applyFilters();
    });
    $('#filter-specimens').addEventListener('change', (e) => {
      this.app.state.includeSpecimens = e.target.checked;
      this.app.applyFilters();
    });
  }

  zoomToCountry(c) {
    // Use the 2nd–98th percentile of coordinates so overseas territories don't dominate.
    const ds = this.ds;
    const lons = [];
    const lats = [];
    for (let i = 0; i < ds.count; i++) {
      if (ds.country[i] !== c) continue;
      lons.push(ds.position[i * 2]);
      lats.push(ds.position[i * 2 + 1]);
    }
    if (!lons.length) return;
    lons.sort((a, b) => a - b);
    lats.sort((a, b) => a - b);
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    this.app.fitBbox([q(lons, 0.02), q(lats, 0.02), q(lons, 0.98), q(lats, 0.98)]);
  }

  // Reflect state into the controls (state can also change from the legend, reset, etc.).
  sync() {
    const s = this.app.state;
    document.querySelectorAll('#filter-categories [data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(s.categories[b.dataset.cat])));
    const allMonths = s.months.slice(1).every(Boolean);
    document.querySelectorAll('#filter-months [data-month]').forEach((b) =>
      b.setAttribute('aria-pressed', String(!allMonths && s.months[b.dataset.month])),
    );
    document.querySelectorAll('#filter-groups [data-group]').forEach((b) =>
      b.setAttribute('aria-pressed', String(!s.groups || s.groups.has(Number(b.dataset.group)))),
    );
    $('#filter-country').value = String(s.country);
    $('#filter-precision').value = String(s.maxUncertainty);
    $('#filter-specimens').checked = s.includeSpecimens;

    const active =
      (s.categories.every(Boolean) ? 0 : 1) +
      (allMonths ? 0 : 1) +
      (s.groups ? 1 : 0) +
      (s.country >= 0 ? 1 : 0) +
      (Number.isFinite(s.maxUncertainty) ? 1 : 0) +
      (s.includeSpecimens ? 0 : 1) +
      (s.dayRange[0] > this.ds.minDay || s.dayRange[1] < this.ds.maxDay ? 1 : 0);
    const tab = document.querySelector('.tabs [data-tab="filters"]');
    tab.innerHTML = active ? `Filters<span class="badge">${active}</span>` : 'Filters';
  }
}
