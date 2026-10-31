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
    drag = {
      y: e.clientY,
      h: panel.getBoundingClientRect().height,
      state: panel.dataset.sheet,
      onHandle: Boolean(e.target.closest('#sheet-handle')),
      moved: false,
      id: e.pointerId,
    };
    panel.classList.add('dragging');
    // Listen on window: the pointer leaves the handle as soon as it moves, and mouse
    // pointers (unlike touch) aren't implicitly captured by the element they started on.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    drag.moved = true;
    const h = heights();
    const next = Math.max(h.peek - 40, Math.min(h.full, drag.h - dy));
    panel.style.setProperty('--sheet-h', `${next}px`);
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    panel.classList.remove('dragging');
    const h = heights();
    if (drag.moved) {
      const cur = panel.getBoundingClientRect().height;
      const grew = cur - drag.h;
      // Snap to the nearest state; a clear drag (>60px) always moves at least one step that way.
      let best = STATES.reduce((a, b) => (Math.abs(h[b] - cur) < Math.abs(h[a] - cur) ? b : a));
      if (best === drag.state && Math.abs(grew) > 60) {
        const i = STATES.indexOf(drag.state) + Math.sign(grew);
        best = STATES[Math.max(0, Math.min(STATES.length - 1, i))];
      }
      api.set(best);
    } else if (drag.onHandle && e.type === 'pointerup') {
      // Tap on the handle cycles peek → half → full → peek.
      api.set(STATES[(STATES.indexOf(panel.dataset.sheet) + 1) % STATES.length]);
    }
    drag = null;
  }

  handle.addEventListener('pointerdown', start);
  head.addEventListener('pointerdown', start);

  return api;
}
