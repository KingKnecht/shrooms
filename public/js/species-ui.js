import { CATEGORIES, EDIBILITY_FLAGS, GROUP_PALETTE, GROUP_OTHER } from './data.js';
import { esc, fmt, rgb, safeUrl } from './util.js';
import { fetchSpeciesInfo } from './species-info.js';
import { lang, t, MONTHS, MONTH_INITIALS } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

// Flags already implied by the displayed category; the rest are listed as extras.
const IMPLIED_FLAGS = { 0: 0, 1: 1 | 2, 2: 1, 3: 4 | 8, 4: 16, 5: 32, 6: 64, 7: 64 | 128 };

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
    $('#list-note').textContent = !top.length
      ? t('list.empty')
      : top.length > shown.length
        ? t('list.countTop', { n: fmt(top.length), k: shown.length })
        : t('list.count', { n: top.length });
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
    this.detail.innerHTML = `<div class="empty"><p>${t('details.empty')}</p></div>`;
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
        (v, i) => `<div class="bar${peakSet.has(i) ? ' peak' : ''}" title="${esc(t('details.barTitle', { month: MONTHS[i], n: fmt(v) }))}">
          <div style="height:${(v / max) * 100}%"></div></div>`,
      )
      .join('');
    const peakLabel = sum ? [...peakSet].sort((a, b) => a - b).map((i) => MONTHS[i]).join(', ') : '–';
    return `<div data-season>
      <h3 class="section-title">${t('details.season')} <small>${regional ? t('details.seasonInView', { n: fmt(p.inView) }) : t('details.seasonAll')}</small></h3>
      <div class="season">${bars}</div>
      <div class="season-labels">${MONTH_INITIALS.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
      <p class="note">${t('details.peak', { months: esc(peakLabel) })}</p>
    </div>`;
  }

  renderSpecies(s) {
    const ds = this.ds;
    const p = this.profile;
    const key = ds.meta.species.key[s];
    const common = ds.commonName(s);
    const cat = CATEGORIES[ds.speciesCategory[s]];
    const extra = ds.meta.species.edibility[s] & ~IMPLIED_FLAGS[cat.id];
    const flags = EDIBILITY_FLAGS.filter((bit) => extra & bit).map((bit) => t(`flag.${bit}`));
    const crumbs = [
      ['order', ds.speciesOrder[s]],
      ['family', ds.speciesFamily[s]],
      ['genus', ds.speciesGenus[s]],
    ];

    this.detail.innerHTML = `
      <div class="hero" data-hero hidden></div>
      <div class="sp-rank">${t('rank.species')}</div>
      <h2 class="sp-title">${common ? esc(common) : `<i>${esc(ds.speciesName(s))}</i>`}</h2>
      <p class="sp-sci">${common ? `<i>${esc(ds.speciesName(s))}</i> ` : ''}<span class="auth" data-auth></span></p>

      <div class="edibility" style="--c:${rgb(cat.color)}">
        <div>
          <strong>${esc(t(`cat.${cat.id}`))}${flags.length ? ` <span class="muted">(${esc(t('details.also', { flags: flags.join(', ') }))})</span>` : ''}</strong>
          <p>${esc(t(`advice.${cat.id}`))}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><b>${fmt(p.total)}</b><span>${t('stat.records')}</span></div>
        <div class="stat"><b>${fmt(p.inView)}</b><span>${t('stat.inView')}</span></div>
        <div class="stat"><b>${fmt(p.countries.length)}</b><span>${t('stat.countries')}</span></div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" data-act="zoom">${t('details.zoom')}</button>
        <button class="btn" data-act="filter">${this.app.state.taxon?.rank === 'species' && this.app.state.taxon.idx === s ? t('details.showAll') : t('details.only')}</button>
      </div>

      ${this.seasonHtml(p)}

      <div data-remote><div class="skeleton"></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div></div>

      <h3 class="section-title">${t('details.classification')}</h3>
      <div class="crumbs">${crumbs
        .map(([rank, idx]) => `<button data-rank="${rank}" data-idx="${idx}" title="${esc(t('details.filterBy', { rank: t(`rank.${rank}`) }))}">${esc(ds.taxonName(rank, idx))}</button>`)
        .join('<span class="sep">›</span>')}</div>

      <h3 class="section-title">${t('details.countries')}</h3>
      <ul class="sub-list">${p.countries
        .slice(0, 6)
        .map(([c, n]) => `<li><span>${esc(ds.countryNames[c])}</span><span class="n">${fmt(n)}</span></li>`)
        .join('')}</ul>

      <h3 class="section-title">${t('details.links')}</h3>
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
        if (this.ds.manifest.speciesApi) {
          const res = await fetch(`api/species/${key}?lang=${lang}`);
          if (!res.ok) throw new Error(res.status);
          info = await res.json();
        } else {
          // Static hosting: ask the upstream APIs directly.
          const sp = this.ds.meta.species;
          info = await fetchSpeciesInfo({ key, name: sp.name[s], wiki: sp.wiki[s], lang });
        }
        this.infoCache.set(key, info);
      } catch {
        info = null;
      }
    }
    // The user may have moved on to another taxon while we were waiting.
    if (this.current?.rank !== 'species' || this.current.idx !== s) return;
    const remote = this.detail.querySelector('[data-remote]');
    if (!info) {
      remote.innerHTML = `<p class="muted">${t('details.failed')}</p>`;
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

    // Other names in the UI language first, then in the other dataset language.
    const ds = this.ds;
    const known = new Set([ds.commonName(s), ds.speciesName(s)].map((n) => n.toLowerCase()));
    const namesIn = (l) => {
      const out = new Map(); // lowercased → first spelling seen
      const candidates = [l === lang ? info.inaturalist?.commonName : null, ds.meta.species[l]?.[s], ...(info.gbif?.vernacular?.[l] || [])];
      for (const n of candidates) if (n && !known.has(n.toLowerCase()) && !out.has(n.toLowerCase())) out.set(n.toLowerCase(), n);
      return [...out.values()];
    };
    const otherLang = lang === 'en' ? 'de' : 'en';
    const primary = namesIn(lang).slice(0, 5);
    const secondary = namesIn(otherLang).slice(0, 4);

    const traits = Object.entries(info.traits || {}).filter(([prop]) => prop !== 'P789');
    const wp = info.wikipedia;

    remote.innerHTML = `
      ${primary.length || secondary.length ? `<h3 class="section-title">${t('details.aka')}</h3>
        <p class="wiki">${primary.map(esc).join(' · ')}${secondary.length ? `${primary.length ? '<br>' : ''}<span class="muted">${t(`lang.${otherLang}`)}:</span> ${secondary.map(esc).join(' · ')}` : ''}</p>` : ''}
      ${traits.length ? `<h3 class="section-title">${t('details.identification')}</h3>
        <dl class="traits">${traits.map(([prop, v]) => `<dt>${esc(t(`trait.${prop}`))}</dt><dd>${esc(v.join(', '))}</dd>`).join('')}</dl>` : ''}
      ${wp?.extract ? `<h3 class="section-title">${t('details.about')}</h3><div class="wiki" lang="${esc(wp.lang || 'en')}"><p>${esc(wp.extract)}</p>
        ${safeUrl(wp.url) ? `<a href="${esc(safeUrl(wp.url))}" target="_blank" rel="noopener">${t('details.readMore')}</a>` : ''}</div>` : ''}
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
      <div class="sp-rank">${esc(t(`rank.${taxon.rank}`))}</div>
      <h2 class="sp-title">${esc(name)}</h2>
      ${subtitle ? `<p class="sp-sci">${esc(subtitle)}</p>` : ''}
      <div class="stats">
        <div class="stat"><b>${fmt(p.total)}</b><span>${t('stat.records')}</span></div>
        <div class="stat"><b>${fmt(p.species.length)}</b><span>${t('stat.species')}</span></div>
        <div class="stat"><b>${fmt(p.inView)}</b><span>${t('stat.inView')}</span></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="zoom">${t('details.zoom')}</button>
        ${key ? `<a class="btn" href="https://www.gbif.org/species/${key}" target="_blank" rel="noopener">GBIF ↗</a>` : ''}
      </div>
      ${parents.length ? `<h3 class="section-title">${t('details.classification')}</h3><div class="crumbs">${parents
        .map(([rank, idx]) => `<button data-rank="${rank}" data-idx="${idx}">${esc(ds.taxonName(rank, idx))}</button>`)
        .join('<span class="sep">›</span>')}</div>` : ''}
      ${this.seasonHtml(p)}
      <h3 class="section-title">${t('details.mix')} <small>${t('details.mixBy')}</small></h3>
      <div class="chips">${[1, 2, 3, 4, 5, 6, 7, 0]
        .filter((c) => catCounts[c])
        .map((c) => `<span class="chip" aria-pressed="true"><span class="dot" style="background:${rgb(CATEGORIES[c].color)}"></span>${esc(t(`catShort.${c}`))} <span class="count">${fmt(catCounts[c])}</span></span>`)
        .join('')}</div>
      <h3 class="section-title">${t('details.species')} <small>${fmt(p.species.length)}</small></h3>
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
