/* ---------- Floor plan: a collapsible glass panel inside the 3D view ---------- */
import { clamp } from '../engine';
import { planSVG } from '../plan2d/plan-svg';
import { state, type Corner, type Dock } from '../state';
import { highlightRoom } from '../view3d/marks';
import { $, reduceMotion } from './dom';
import { refreshPlanOverlay } from './plan-panel';
import { renderReviewInfo } from './review';

export const DOCK_KEY = 'fi.planDock.v1';
export function loadDock(): Dock | null {
  try {
    const v = JSON.parse(localStorage.getItem(DOCK_KEY) || 'null');
    if (v && ['tl', 'tr', 'bl', 'br'].includes(v.corner))
      return { open: !!v.open, corner: v.corner as Corner, w: +v.w || 440, h: +v.h || 300 };
  } catch {
    /* storage unavailable */
  }
  return null;
}
export function saveDock(): void {
  try {
    localStorage.setItem(DOCK_KEY, JSON.stringify(state.dock));
  } catch {
    /* storage unavailable */
  }
}
export function applyDock(): void {
  const d = state.dock,
    el = document.querySelector<HTMLElement>('#planDock'),
    body = document.querySelector<HTMLElement>('#view3dBody');
  if (!el || !body || !d) return;
  const bw = body.clientWidth || 900,
    bh = body.clientHeight || 560;
  const w = clamp(d.w, 280, Math.max(280, bw - 24)),
    h = clamp(d.h, 200, Math.max(200, bh - (d.corner[0] === 't' ? 82 : 24)));
  el.style.setProperty('--pd-w', Math.round(w) + 'px');
  el.style.setProperty('--pd-h', Math.round(h) + 'px');
  el.dataset.open = String(!!d.open);
  el.dataset.corner = d.corner;
  $('#pdPill').setAttribute('aria-expanded', String(!!d.open));
  (['tl', 'tr', 'bl', 'br'] as Corner[]).forEach(c => body.classList.toggle('dock-' + c, d.corner === c));
  saveDock();
}
export function setDockOpen(open: boolean): void {
  (state.dock as Dock).open = !!open;
  applyDock();
  if (open) refreshPlanOverlay();
}
export function renderDockThumb(): void {
  const t = document.querySelector('#pdThumb');
  if (t && state.P)
    t.innerHTML = planSVG(state.P, {
      compact: true,
      labels: false,
      furniture: false,
      doors: false,
      dims: false,
      entrance: false,
      windows: false
    });
}
export function bindDock(): void {
  const el = $('#planDock'),
    head = $('#pdHead'),
    pill = $('#pdPill'),
    body = $('#view3dBody');
  let drag: { id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean; fromPill: boolean } | null =
    null;
  pill.addEventListener('click', e => {
    if (e.detail === 0) setDockOpen(true);
  });
  $('#pdCollapse').addEventListener('click', () => setDockOpen(false));
  const start = (e: PointerEvent, fromPill: boolean): void => {
    if (e.button !== 0) return;
    if (!fromPill && (e.target as Element).closest('button')) return;
    const r = el.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      fromPill
    };
    el.setPointerCapture(e.pointerId);
  };
  head.addEventListener('pointerdown', e => start(e, false));
  pill.addEventListener('pointerdown', e => start(e, true));
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      el.classList.add('dragging');
    }
    const br = body.getBoundingClientRect();
    const x = clamp(e.clientX - br.left - drag.dx, 0, Math.max(0, br.width - el.offsetWidth)),
      y = clamp(e.clientY - br.top - drag.dy, 0, Math.max(0, br.height - el.offsetHeight));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });
  const end = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      el.classList.remove('dragging');
      if (d.fromPill) setDockOpen(true);
      return;
    }
    const before = el.getBoundingClientRect(),
      br = body.getBoundingClientRect();
    const cx = before.left + before.width / 2 - br.left,
      cy = before.top + before.height / 2 - br.top;
    (state.dock as Dock).corner = ((cy < br.height / 2 ? 't' : 'b') + (cx < br.width / 2 ? 'l' : 'r')) as Corner;
    el.style.left = el.style.top = el.style.right = el.style.bottom = '';
    applyDock();
    const after = el.getBoundingClientRect();
    el.style.transform =
      'translate(' + Math.round(before.left - after.left) + 'px, ' + Math.round(before.top - after.top) + 'px)';
    void el.offsetWidth;
    el.classList.remove('dragging');
    if (!reduceMotion) el.style.transition = 'transform 420ms cubic-bezier(.3, 1.3, .5, 1)';
    el.style.transform = '';
    setTimeout(() => {
      el.style.transition = '';
    }, 440);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  const rz = $('#pdResize');
  let rs: { x: number; y: number; w: number; h: number } | null = null;
  rz.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    rz.setPointerCapture(e.pointerId);
    rs = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight };
    el.classList.add('dragging');
  });
  rz.addEventListener('pointermove', e => {
    if (!rs) return;
    const dock = state.dock as Dock;
    const c = dock.corner,
      sx = c[1] === 'r' ? -1 : 1,
      sy = c[0] === 'b' ? -1 : 1;
    dock.w = rs.w + sx * (e.clientX - rs.x);
    dock.h = rs.h + sy * (e.clientY - rs.y);
    applyDock();
  });
  const rend = (): void => {
    if (!rs) return;
    rs = null;
    el.classList.remove('dragging');
    const r = el.getBoundingClientRect(),
      dock = state.dock as Dock;
    dock.w = r.width;
    dock.h = r.height;
    saveDock();
  };
  rz.addEventListener('pointerup', rend);
  rz.addEventListener('pointercancel', rend);
  $('#roomCardClose').addEventListener('click', () => {
    state.selectedRoom = null;
    highlightRoom(null);
    renderReviewInfo();
    refreshPlanOverlay();
  });
}
