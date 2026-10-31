// Bottom-sheet behaviour for the panel on narrow screens: drag the handle (or header)
// to resize, and it snaps to peek / half / full.

const MOBILE = '(max-width: 760px)';
const STATES = ['peek', 'half', 'full'];

function heights() {
  const vh = window.innerHeight;
  return { peek: 156, half: Math.round(vh * 0.52), full: vh - 64 };
}

export function setupSheet(panel) {
  const handle = panel.querySelector('#sheet-handle');
  const head = panel.querySelector('.panel-head');
  const mq = matchMedia(MOBILE);

  const api = {
    state: () => (mq.matches ? panel.dataset.sheet : 'full'),
    set(state) {
      panel.dataset.sheet = state;
      panel.style.removeProperty('--sheet-h');
    },
  };

  let drag = null;

  function start(e) {
    if (!mq.matches || e.button > 0) return;
    if (e.target.closest('input, select, a, .active-taxon button')) return;
    drag = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false, id: e.pointerId };
    panel.classList.add('dragging');
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) e.target.setPointerCapture?.(e.pointerId);
    drag.moved = true;
    const h = heights();
    const next = Math.max(h.peek - 40, Math.min(h.full, drag.h - dy));
    panel.style.setProperty('--sheet-h', `${next}px`);
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    panel.classList.remove('dragging');
    const h = heights();
    if (drag.moved) {
      const cur = panel.getBoundingClientRect().height;
      const velocityUp = drag.h - cur;
      // Snap to the nearest state, biased in the drag direction.
      let best = STATES.reduce((a, b) => (Math.abs(h[b] - cur) < Math.abs(h[a] - cur) ? b : a));
      if (Math.abs(velocityUp) > 60) {
        const sorted = STATES.slice().sort((a, b) => h[a] - h[b]);
        best = velocityUp > 0 ? sorted.find((s) => h[s] > drag.h + 10) || 'full' : sorted.reverse().find((s) => h[s] < drag.h - 10) || 'peek';
      }
      api.set(best);
    } else if (e.target.closest('#sheet-handle')) {
      // Tap on the handle cycles peek → half → full → peek.
      api.set(STATES[(STATES.indexOf(panel.dataset.sheet) + 1) % STATES.length]);
    }
    drag = null;
  }

  for (const el of [handle, head]) {
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  return api;
}
