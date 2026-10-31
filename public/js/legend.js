import { CATEGORIES, GROUP_PALETTE, GROUP_OTHER, AGE_RAMP } from './data.js';
import { GROUP_SLOTS } from './filters.js';
import { esc, rgb } from './util.js';
import { t } from './i18n.js';

export class Legend {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.collapsed = window.innerWidth <= 760;
    el.addEventListener('click', (e) => {
      if (e.target.closest('h3')) {
        this.collapsed = !this.collapsed;
        this.render();
        return;
      }
      const item = e.target.closest('.legend-item');
      if (!item) return;
      if (item.dataset.cat) app.filtersUI.toggleCategory(Number(item.dataset.cat));
      if (item.dataset.group) document.querySelector(`#filter-groups [data-group="${item.dataset.group}"]`)?.click();
    });
  }

  render() {
    const app = this.app;
    const ds = app.ds;
    const s = app.state;
    let title;
    let body;
    if (app.mode === 'heatmap') {
      title = t('legend.density');
      body = `<div class="legend-ramp" style="background:linear-gradient(90deg, rgb(65,40,30), rgb(180,85,40), rgb(245,170,90), rgb(255,225,160))"></div>
        <div class="legend-ramp-labels"><span>${t('legend.fewer')}</span><span>${t('legend.more')}</span></div>`;
    } else if (app.colorMode === 'edibility') {
      title = t('color.edibility');
      body = [1, 2, 3, 4, 5, 6, 7, 0]
        .map((id) => {
          const c = CATEGORIES[id];
          return `<button class="legend-item" data-cat="${id}" aria-pressed="${s.categories[id]}">
            <span class="dot" style="background:${rgb(c.color)}"></span>${esc(t(`cat.${id}`))}</button>`;
        })
        .join('');
    } else if (app.colorMode === 'group') {
      title = t('legend.type');
      const ids = [...ds.ordersByCount.slice(0, GROUP_SLOTS), -1];
      body = ids
        .map((o, i) => {
          const color = o === -1 ? GROUP_OTHER : GROUP_PALETTE[i];
          const on = !s.groups || s.groups.has(o);
          return `<button class="legend-item" data-group="${o}" aria-pressed="${on}">
            <span class="dot" style="background:${rgb(color)}"></span>${esc(o === -1 ? t('group.other') : ds.orderLabel(o))}</button>`;
        })
        .join('');
    } else {
      title = t('color.year');
      body = `<div class="legend-ramp" style="background:linear-gradient(90deg, ${AGE_RAMP.map((c) => rgb(c)).join(', ')})"></div>
        <div class="legend-ramp-labels"><span>${ds.minYear}</span><span>${ds.maxYear}</span></div>`;
    }
    this.el.classList.toggle('collapsed', this.collapsed);
    this.el.innerHTML = `<h3>${title}<button data-toggle aria-label="${t(this.collapsed ? 'legend.expand' : 'legend.collapse')}">${this.collapsed ? '▸' : '▾'}</button></h3>
      <div class="legend-items">${body}</div>`;
  }
}
