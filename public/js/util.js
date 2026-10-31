import { lang } from './i18n.js';

const numberFormat = new Intl.NumberFormat(lang);

export const fmt = (n) => numberFormat.format(n);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const rgb = ([r, g, b], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

// Strip diacritics and lowercase for search matching.
export const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Only allow http(s) links from external data, and prefer https.
export function safeUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url.replace(/^http:\/\//i, 'https://');
}
