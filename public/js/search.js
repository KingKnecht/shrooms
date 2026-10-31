import { esc, fmt, normalize } from './util.js';

const RANK_WEIGHT = { order: 4, family: 3, genus: 2, species: 1 };

function buildIndex(ds) {
  const entries = [];
  const sp = ds.meta.species;
  for (let i = 0; i < ds.nSpecies; i++) {
    const terms = [sp.name[i], sp.en[i], sp.de[i]].filter(Boolean).map(normalize);
    entries.push({ rank: 'species', idx: i, count: sp.count[i], terms });
  }
  for (const [rank, table] of [
    ['genus', ds.meta.genera],
    ['family', ds.meta.families],
    ['order', ds.meta.orders],
  ]) {
    for (let i = 0; i < table.name.length; i++) {
      const terms = [normalize(table.name[i])];
      if (rank === 'order' && ds.orderLabel(i) !== table.name[i]) terms.push(normalize(ds.orderLabel(i)));
      entries.push({ rank, idx: i, count: table.count[i], terms });
    }
  }
  return entries;
}

function score(entry, q) {
  let best = 0;
  for (const t of entry.terms) {
    if (t === q) best = Math.max(best, 4);
    else if (t.startsWith(q)) best = Math.max(best, 3);
    else if (t.includes(` ${q}`) || t.includes(`-${q}`)) best = Math.max(best, 2);
    else if (q.length >= 3 && t.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

export function setupSearch(input, list, app) {
  const ds = app.ds;
  const index = buildIndex(ds);
  let results = [];
  let active = -1;

  const describe = (r) => {
    if (r.rank === 'species') {
      const common = ds.commonName(r.idx);
      return {
        name: common || `<i>${esc(ds.speciesName(r.idx))}</i>`,
        sub: common ? `<i>${esc(ds.speciesName(r.idx))}</i>` : esc(ds.meta.species.de[r.idx] || ds.taxonName('family', ds.speciesFamily[r.idx])),
      };
    }
    const name = ds.taxonName(r.rank, r.idx);
    const sub =
      r.rank === 'order'
        ? ds.orderLabel(r.idx) !== name ? ds.orderLabel(r.idx) : ''
        : r.rank === 'genus'
          ? ds.taxonName('family', ds.genusFamily[r.idx])
          : ds.taxonName('order', ds.familyOrder[r.idx]);
    return { name: esc(name), sub: esc(sub) };
  };

  function render() {
    if (!results.length) {
      list.innerHTML = input.value.trim() ? '<li class="r-empty">No matching taxa in this dataset</li>' : '';
      list.hidden = !input.value.trim();
      return;
    }
    list.innerHTML = results
      .map((r, i) => {
        const d = describe(r);
        return `<li role="option" data-i="${i}" aria-selected="${i === active}">
          <span class="r-name">${d.name}</span>
          <span class="r-sub">${d.sub}</span>
          <span class="r-meta"><span class="r-rank">${r.rank}</span>${fmt(r.count)}</span>
        </li>`;
      })
      .join('');
    list.hidden = false;
  }

  function search() {
    const q = normalize(input.value.trim());
    active = -1;
    if (q.length < 2) {
      results = [];
      render();
      return;
    }
    const scored = [];
    for (const e of index) {
      const s = score(e, q);
      if (s) scored.push([s, e]);
    }
    scored.sort((a, b) => b[0] - a[0] || b[1].count - a[1].count || RANK_WEIGHT[b[1].rank] - RANK_WEIGHT[a[1].rank]);
    results = scored.slice(0, 30).map(([, e]) => e);
    render();
  }

  function choose(r) {
    if (!r) return;
    input.value = '';
    results = [];
    list.hidden = true;
    input.blur();
    app.selectTaxon({ rank: r.rank, idx: r.idx }, { fly: true });
  }

  input.addEventListener('input', search);
  input.addEventListener('focus', () => {
    if (app.sheet.state() !== 'full') app.sheet.set('full');
    if (input.value.trim()) search();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      render();
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      choose(results[Math.max(0, active)]);
    } else if (e.key === 'Escape') {
      input.value = '';
      results = [];
      list.hidden = true;
    }
  });
  // pointerdown fires before the input's blur, so the choice survives.
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    choose(results[Number(li.dataset.i)]);
  });
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 150));
}
