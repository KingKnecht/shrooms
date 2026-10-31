import { CATEGORIES, EDIBILITY_FLAGS, GROUP_PALETTE, GROUP_OTHER, MONTH_INITIALS, MONTHS } from './data.js';
import { esc, fmt, rgb, safeUrl } from './util.js';

const $ = (sel) => document.querySelector(sel);

// Flags already implied by the displayed category; the rest are listed as extras.
const IMPLIED_FLAGS = { 0: 0, 1: 1 | 2, 2: 1, 3: 4 | 8, 4: 16, 5: 32, 6: 64, 7: 64 | 128 };

const CATEGORY_ADVICE = {
  0: 'No edibility information available. Treat as unknown.',
  1: 'Considered a choice edible. Several dangerous lookalikes may exist, so be certain of the identification.',
  2: 'Reported as edible. Confirm the identification with an expert before eating.',
  3: 'Edible only with care (e.g. after cooking) or known to cause reactions in some people.',
  4: 'Not considered edible (bitter, tough or too small).',
  5: 'Contains psychoactive compounds. Possession may be illegal and the species can be toxic.',
  6: 'Poisonous. Do not eat.',
  7: 'Deadly poisonous. Even small amounts can be fatal.',
};

export class SpeciesUI {
  constructor(app) {
    this.app = app;
    this.ds = app.ds;
    this.current = null;
    this.list = $('#species-list');
    this.detail = $('#species-detail');
    this.infoCache = new Map();

    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-species]');
      if (li) this.app.selectTaxon({ rank: 'species', idx: Number(li.dataset.species) });
    });
    this.detail.addEventListener('click', (e) => this.onDetailClick(e));
  }

  colorFor(s) {
    if (this.app.colorMode === 'group') {
      const slot = this.ds.ordersByCount.indexOf(this.ds.speciesOrder[s]);
      return rgb(slot >= 0 && slot < GROUP_PALETTE.length ? GROUP_PALETTE[slot] : GROUP_OTHER);
    }
    return rgb(CATEGORIES[this.ds.speciesCategory[s]].color);
  }

  // ---- "In view" list ----

  renderList(stats) {
    if (!stats) return;
    const ds = this.ds;
    const top = [];
    for (let s = 0; s < stats.counts.length; s++) if (stats.counts[s]) top.push(s);
    top.sort((a, b) => stats.counts[b] - stats.counts[a]);
    const shown = top.slice(0, 150);
    const max = shown.length ? stats.counts[shown[0]] : 1;
    $('#list-note').textContent = top.length
      ? `${fmt(top.length)} species in the current view${top.length > shown.length ? `, top ${shown.length} shown` : ''}.`
      : 'No matching records in the current view. Zoom out or relax the filters.';
    this.list.innerHTML = shown
      .map((s) => {
        const common = ds.commonName(s);
        const n = stats.counts[s];
        return `<li data-species="${s}">
          <span class="dot" style="background:${this.colorFor(s)}"></span>
          <span class="s-name">${common ? esc(common) : `<i>${esc(ds.speciesName(s))}</i>`}</span>
          <span class="s-count">${fmt(n)}<span class="s-bar" style="width:${Math.max(4, (n / max) * 48)}px"></span></span>
          <span class="s-sci">${common ? esc(ds.speciesName(s)) : esc(ds.taxonName('family', ds.speciesFamily[s]))}</span>
        </li>`;
      })
      .join('');
  }

  // ---- Details ----

  clear() {
    this.current = null;
    this.detail.innerHTML = `<div class="empty"><p>Search for a species, pick one from <strong>In view</strong>, or tap a point on the map to see details here.</p></div>`;
  }

  showTaxon(taxon) {
    this.current = taxon;
    this.profile = this.app.engine.taxonProfile(taxon, this.app.map.bounds());
    if (taxon.rank === 'species') this.renderSpecies(taxon.idx);
    else this.renderHigherTaxon(taxon);
  }

  // Map moved: update the regional seasonality for the shown taxon.
  refreshInView() {
    if (!this.current) return;
    this.profile = this.app.engine.taxonProfile(this.current, this.app.map.bounds());
    const el = this.detail.querySelector('[data-season]');
    if (el) el.outerHTML = this.seasonHtml(this.profile);
  }

  seasonHtml(p) {
    const regional = p.inView >= 25;
    const months = regional ? p.monthsInView : p.months;
    const values = Array.from({ length: 12 }, (_, i) => months[i + 1]);
    const max = Math.max(1, ...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const peak = values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const peakSet = new Set(peak.filter(([v]) => v >= max * 0.6).map(([, i]) => i));
    const bars = values
      .map(
        (v, i) => `<div class="bar${peakSet.has(i) ? ' peak' : ''}" title="${MONTHS[i]}: ${fmt(v)} records">
          <div style="height:${(v / max) * 100}%"></div></div>`,
      )
      .join('');
    const peakLabel = sum ? [...peakSet].sort((a, b) => a - b).map((i) => MONTHS[i]).join(', ') : '–';
    return `<div data-season>
      <h3 class="section-title">Season <small>${regional ? `in current view (${fmt(p.inView)} records)` : 'all records'}</small></h3>
      <div class="season">${bars}</div>
      <div class="season-labels">${MONTH_INITIALS.map((m) => `<span>${m}</span>`).join('')}</div>
      <p class="note">Most records: <strong>${peakLabel}</strong></p>
    </div>`;
  }

  renderSpecies(s) {
    const ds = this.ds;
    const p = this.profile;
    const key = ds.meta.species.key[s];
    const common = ds.commonName(s);
    const cat = CATEGORIES[ds.speciesCategory[s]];
    const extra = ds.meta.species.edibility[s] & ~IMPLIED_FLAGS[cat.id];
    const flags = EDIBILITY_FLAGS.filter(([bit]) => extra & bit).map(([, label]) => label.toLowerCase());
    const crumbs = [
      ['order', ds.speciesOrder[s]],
      ['family', ds.speciesFamily[s]],
      ['genus', ds.speciesGenus[s]],
    ];

    this.detail.innerHTML = `
      <div class="hero" data-hero hidden></div>
      <div class="sp-rank">Species</div>
      <h2 class="sp-title">${common ? esc(common) : `<i>${esc(ds.speciesName(s))}</i>`}</h2>
      <p class="sp-sci">${common ? `<i>${esc(ds.speciesName(s))}</i> ` : ''}<span class="auth" data-auth></span></p>

      <div class="edibility" style="--c:${rgb(cat.color)}">
        <div>
          <strong>${esc(cat.label)}${flags.length ? ` <span class="muted">(also ${esc(flags.join(', '))})</span>` : ''}</strong>
          <p>${CATEGORY_ADVICE[cat.id]}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><b>${fmt(p.total)}</b><span>records</span></div>
        <div class="stat"><b>${fmt(p.inView)}</b><span>in view</span></div>
        <div class="stat"><b>${fmt(p.countries.length)}</b><span>countries</span></div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" data-act="zoom">Zoom to records</button>
        <button class="btn" data-act="filter">${this.app.state.taxon?.rank === 'species' && this.app.state.taxon.idx === s ? 'Show all species' : 'Show only this'}</button>
      </div>

      ${this.seasonHtml(p)}

      <div data-remote><div class="skeleton"></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div></div>

      <h3 class="section-title">Classification</h3>
      <div class="crumbs">${crumbs
        .map(([rank, idx]) => `<button data-rank="${rank}" data-idx="${idx}" title="Filter by ${rank}">${esc(rank === 'order' ? `${ds.taxonName(rank, idx)}` : ds.taxonName(rank, idx))}</button>`)
        .join('<span class="sep">›</span>')}</div>

      <h3 class="section-title">Top countries</h3>
      <ul class="sub-list">${p.countries
        .slice(0, 6)
        .map(([c, n]) => `<li><span>${esc(ds.countryNames[c])}</span><span class="n">${fmt(n)}</span></li>`)
        .join('')}</ul>

      <h3 class="section-title">Links</h3>
      <div class="btn-row" data-links>
        <a class="btn" href="https://www.gbif.org/species/${key}" target="_blank" rel="noopener">GBIF ↗</a>
      </div>
    `;
    this.loadRemote(s, key);
  }

  async loadRemote(s, key) {
    let info = this.infoCache.get(key);
    if (!info) {
      try {
        const res = await fetch(`/api/species/${key}`);
        if (!res.ok) throw new Error(res.status);
        info = await res.json();
        this.infoCache.set(key, info);
      } catch {
        info = null;
      }
    }
    // The user may have moved on to another taxon while we were waiting.
    if (this.current?.rank !== 'species' || this.current.idx !== s) return;
    const remote = this.detail.querySelector('[data-remote]');
    if (!info) {
      remote.innerHTML = '<p class="muted">Additional information could not be loaded.</p>';
      return;
    }

    const photo = safeUrl(info.inaturalist?.photo?.large || info.inaturalist?.photo?.url) || safeUrl(info.wikipedia?.thumbnail);
    const hero = this.detail.querySelector('[data-hero]');
    if (photo) {
      const credit = info.inaturalist?.photo?.attribution || (info.wikipedia?.thumbnail ? 'Wikipedia' : '');
      hero.innerHTML = `<img src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="credit">${esc(credit)}</span>`;
      hero.querySelector('img').addEventListener('error', () => (hero.hidden = true));
      hero.hidden = false;
    }
    if (info.gbif?.authorship) this.detail.querySelector('[data-auth]').textContent = info.gbif.authorship;

    const ds = this.ds;
    const names = new Set();
    const known = [ds.commonName(s), ds.speciesName(s)].map((n) => n.toLowerCase());
    for (const n of [info.inaturalist?.commonName, ...(info.gbif?.vernacular?.en || [])]) {
      if (n && !known.includes(n.toLowerCase())) names.add(n);
    }
    const de = new Set([ds.meta.species.de[s], ...(info.gbif?.vernacular?.de || [])].filter(Boolean));

    const traits = Object.entries(info.traits || {}).filter(([k]) => k !== 'Edibility');
    const wp = info.wikipedia;

    remote.innerHTML = `
      ${names.size || de.size ? `<h3 class="section-title">Also known as</h3>
        <p class="wiki">${[...names].slice(0, 5).map(esc).join(' · ')}${de.size ? `${names.size ? '<br>' : ''}<span class="muted">German:</span> ${[...de].slice(0, 4).map(esc).join(' · ')}` : ''}</p>` : ''}
      ${traits.length ? `<h3 class="section-title">Identification</h3>
        <dl class="traits">${traits.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v.join(', '))}</dd>`).join('')}</dl>` : ''}
      ${wp?.extract ? `<h3 class="section-title">About</h3><div class="wiki"><p>${esc(wp.extract)}</p>
        ${safeUrl(wp.url) ? `<a href="${esc(safeUrl(wp.url))}" target="_blank" rel="noopener">Read more on Wikipedia ↗</a>` : ''}</div>` : ''}
    `;

    const links = this.detail.querySelector('[data-links]');
    if (info.inaturalist?.url) links.insertAdjacentHTML('beforeend', `<a class="btn" href="${esc(info.inaturalist.url)}" target="_blank" rel="noopener">iNaturalist ↗</a>`);
    if (safeUrl(wp?.url)) links.insertAdjacentHTML('beforeend', `<a class="btn" href="${esc(safeUrl(wp.url))}" target="_blank" rel="noopener">Wikipedia ↗</a>`);
  }

  renderHigherTaxon(taxon) {
    const ds = this.ds;
    const p = this.profile;
    const name = ds.taxonName(taxon.rank, taxon.idx);
    const key = ds.taxonTable(taxon.rank).key[taxon.idx];
    const subtitle = taxon.rank === 'order' && ds.orderLabel(taxon.idx) !== name ? ds.orderLabel(taxon.idx) : '';
    const parents = [];
    if (taxon.rank === 'genus') parents.push(['order', ds.familyOrder[ds.genusFamily[taxon.idx]]], ['family', ds.genusFamily[taxon.idx]]);
    if (taxon.rank === 'family') parents.push(['order', ds.familyOrder[taxon.idx]]);

    const catCounts = new Array(8).fill(0);
    for (const [s, n] of p.species) catCounts[ds.speciesCategory[s]] += n;

    this.detail.innerHTML = `
      <div class="sp-rank">${esc(taxon.rank)}</div>
      <h2 class="sp-title">${esc(name)}</h2>
      ${subtitle ? `<p class="sp-sci">${esc(subtitle)}</p>` : ''}
      <div class="stats">
        <div class="stat"><b>${fmt(p.total)}</b><span>records</span></div>
        <div class="stat"><b>${fmt(p.species.length)}</b><span>species</span></div>
        <div class="stat"><b>${fmt(p.inView)}</b><span>in view</span></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="zoom">Zoom to records</button>
        ${key ? `<a class="btn" href="https://www.gbif.org/species/${key}" target="_blank" rel="noopener">GBIF ↗</a>` : ''}
      </div>
      ${parents.length ? `<h3 class="section-title">Classification</h3><div class="crumbs">${parents
        .map(([rank, idx]) => `<button data-rank="${rank}" data-idx="${idx}">${esc(ds.taxonName(rank, idx))}</button>`)
        .join('<span class="sep">›</span>')}</div>` : ''}
      ${this.seasonHtml(p)}
      <h3 class="section-title">Edibility mix <small>by records</small></h3>
      <div class="chips">${[1, 2, 3, 4, 5, 6, 7, 0]
        .filter((c) => catCounts[c])
        .map((c) => `<span class="chip" aria-pressed="true"><span class="dot" style="background:${rgb(CATEGORIES[c].color)}"></span>${CATEGORIES[c].short} <span class="count">${fmt(catCounts[c])}</span></span>`)
        .join('')}</div>
      <h3 class="section-title">Species <small>${fmt(p.species.length)}</small></h3>
      <ul class="sub-list">${p.species
        .slice(0, 200)
        .map(([s, n]) => `<li><button data-species="${s}">${ds.commonName(s) ? `${esc(ds.commonName(s))} <i class="muted">${esc(ds.speciesName(s))}</i>` : `<i>${esc(ds.speciesName(s))}</i>`}</button><span class="n">${fmt(n)}</span></li>`)
        .join('')}</ul>
    `;
  }

  onDetailClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const app = this.app;
    if (btn.dataset.act === 'zoom' && this.profile?.bbox) {
      app.fitBbox(this.profile.bbox);
      if (window.innerWidth <= 760) app.sheet.set('peek');
    } else if (btn.dataset.act === 'filter' && this.current) {
      const t = app.state.taxon;
      const same = t && t.rank === this.current.rank && t.idx === this.current.idx;
      app.selectTaxon(same ? null : this.current, { showDetails: !same });
      if (same) this.showTaxon(this.current);
    } else if (btn.dataset.rank) {
      app.selectTaxon({ rank: btn.dataset.rank, idx: Number(btn.dataset.idx) });
    } else if (btn.dataset.species) {
      app.selectTaxon({ rank: 'species', idx: Number(btn.dataset.species) });
    }
  }
}
