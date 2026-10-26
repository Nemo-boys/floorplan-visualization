/* The 2D site plan: an SVG in metres with pan, zoom, hover and click-to-inspect. */
import type { Design, Equip, EquipKind, Room, RoomType } from '../engine/types';
import { s } from './dom';

export type Tint = (e: Equip) => string | null; // a lens can recolour equipment

const ROOM_FILL: Record<RoomType, string> = {
  data_hall: 'var(--p-hall)',
  ups_room: 'var(--p-power)',
  battery_room: 'var(--p-power)',
  electrical_room: 'var(--p-power)',
  mechanical_room: 'var(--p-power)',
  mmr: 'var(--p-support)',
  noc: 'var(--p-support)',
  office: 'var(--p-support)',
  staging: 'var(--p-support)',
  loading_dock: 'var(--p-support)',
  storage: 'var(--p-support)',
  corridor: 'var(--p-corridor)',
  generator_yard: 'var(--p-yard)',
  cooling_yard: 'var(--p-yard)'
};

export const EQUIP_FILL: Record<EquipKind, string> = {
  rack: 'var(--p-rack)',
  cdu: 'var(--liquid)',
  crah: 'var(--cold)',
  pdu: 'var(--power)',
  ups: '#e8960c',
  battery: '#34a853',
  switchgear: '#7d7d85',
  generator: '#5e5ce6',
  transformer: '#ff9f0a',
  drycooler: '#40b4e5'
};

export interface PlanView {
  el: SVGSVGElement;
  render(d: Design, tint?: Tint): void;
  select(id: string | null): void;
  fit(): void;
  zoom(factor: number): void;
  setInsets(i: { left: number; right: number; top: number; bottom: number }): void;
}

export function createPlan(onPick: (kind: 'room' | 'equip', id: string | null) => void): PlanView {
  const svg = s('svg', { class: 'plan', role: 'img', 'aria-label': 'Site plan' });
  const g = s('g');
  svg.append(g);
  let vb = { x: 0, y: 0, w: 100, h: 100 };
  let site = { w: 100, h: 100 };
  let selected: string | null = null;

  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // the floating cards cover the edges of the stage, so the site is fitted into what's left
  let insets = { left: 0, right: 0, top: 0, bottom: 0 };
  const fit = () => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const wide = r.width > 860;
    const ins = wide ? insets : { left: 0, right: 0, top: 0, bottom: 0 };
    const availW = Math.max(100, r.width - ins.left - ins.right);
    const availH = Math.max(100, r.height - ins.top - ins.bottom);
    const k = Math.max((site.w * 1.06) / availW, (site.h * 1.06) / availH); // metres per pixel
    const cx = site.w / 2 - ((ins.left - ins.right) / 2) * k;
    const cy = site.h / 2 - ((ins.top - ins.bottom) / 2) * k;
    vb = { x: cx - (r.width * k) / 2, y: cy - (r.height * k) / 2, w: r.width * k, h: r.height * k };
    apply();
  };
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const w = Math.min(site.w * 3, Math.max(4, vb.w * factor));
    const k = w / vb.w;
    vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w, h: vb.h * k };
    apply();
  };
  const toPlan = (ev: { clientX: number; clientY: number }) => {
    const r = svg.getBoundingClientRect();
    return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.w, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.h };
  };

  svg.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const p = toPlan(ev);
      zoomAt(Math.exp(ev.deltaY * 0.0015), p.x, p.y);
    },
    { passive: false }
  );
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  svg.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, moved: false };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      svg.classList.add('dragging');
    }
    if (!drag.moved) return;
    const r = svg.getBoundingClientRect();
    vb.x = drag.vx - (dx / r.width) * vb.w;
    vb.y = drag.vy - (dy / r.height) * vb.h;
    apply();
  });
  svg.addEventListener('pointerup', (ev) => {
    const wasDrag = drag?.moved;
    drag = null;
    svg.classList.remove('dragging');
    if (wasDrag) return;
    const t = (ev.target as Element).closest('[data-id]');
    if (!t) return onPick('room', null);
    onPick(t.getAttribute('data-kind') === 'equip' ? 'equip' : 'room', t.getAttribute('data-id'));
  });

  function render(d: Design, tint?: Tint) {
    site = { w: d.site.w / 1000, h: d.site.h / 1000 };
    const H = d.site.h;
    const R = (x: number, y: number, w: number, hh: number) => ({
      x: x / 1000,
      y: (H - y - hh) / 1000,
      width: w / 1000,
      height: hh / 1000
    });
    g.replaceChildren();
    g.append(s('rect', { x: 0, y: 0, width: site.w, height: site.h, fill: 'var(--p-site)' }));

    const rooms = [...d.rooms].sort((a, b) => Number(b.outdoor) - Number(a.outdoor));
    rooms.forEach((r) => {
      const el = s('rect', {
        ...R(r.x, r.y, r.w, r.h),
        class: 'room',
        fill: ROOM_FILL[r.type],
        'data-id': r.id,
        'data-kind': 'room',
        ...(r.outdoor ? { 'stroke-dasharray': '0.5 0.4' } : {}),
        ...(r.id === 'future_hall' ? { 'stroke-dasharray': '0.6 0.4', fill: 'var(--p-support)' } : {})
      });
      g.append(el);
    });
    d.aisles.forEach((a) => {
      g.append(
        s('rect', {
          ...R(a.rect.x, a.rect.y, a.rect.w, a.rect.h),
          fill: a.kind === 'cold' ? 'rgba(61,139,253,0.16)' : 'rgba(255,107,74,0.13)',
          'pointer-events': 'none'
        })
      );
    });
    const b = d.building;
    g.append(s('rect', { ...R(b.x, b.y, b.w, b.h), class: 'wall' }));
    // doors: a gap in the wall
    d.doors.forEach((door) => {
      const t = 400;
      const r =
        door.axis === 'x'
          ? R(door.x - door.width / 2, door.y - t / 2, door.width, t)
          : R(door.x - t / 2, door.y - door.width / 2, t, door.width);
      g.append(s('rect', { ...r, fill: door.rooms[1] === 'outside' ? 'var(--accent)' : 'var(--p-building)', 'pointer-events': 'none', opacity: door.rooms[1] === 'outside' ? 0.9 : 1 }));
    });

    let fronts = '';
    d.equipment.forEach((e) => {
      const fill = tint?.(e) ?? EQUIP_FILL[e.kind];
      g.append(
        s('rect', {
          ...R(e.x, e.y, e.w, e.h),
          class: 'eq',
          fill,
          rx: e.kind === 'rack' ? 0.04 : 0.12,
          'data-id': e.id,
          'data-kind': 'equip'
        })
      );
      if (e.kind === 'rack') {
        const x0 = e.x / 1000;
        const x1 = (e.x + e.w) / 1000;
        const y = e.facing === 'N' ? (H - e.y - e.h) / 1000 + 0.06 : (H - e.y) / 1000 - 0.06;
        fronts += `M${x0 + 0.06} ${y}H${x1 - 0.06}`;
      }
    });
    if (fronts) g.append(s('path', { d: fronts, stroke: 'var(--cold)', 'stroke-width': 0.1, fill: 'none', 'pointer-events': 'none' }));

    // labels on top
    rooms.forEach((r) => labelRoom(r, H));
    select(selected);
  }

  function labelRoom(r: Room, H: number) {
    if (r.type === 'corridor') return;
    const w = r.w / 1000;
    const hh = r.h / 1000;
    const want = r.type === 'data_hall' ? 1.3 : Math.min(1.5, Math.max(0.9, Math.min(w, hh) / 6));
    const size = Math.min(want, (w * 0.9) / (r.name.length * 0.55)); // shrink long names to fit
    if (size < 0.6) return;
    const isHall = r.type === 'data_hall' && r.id !== 'future_hall';
    const t = s('text', {
      x: r.x / 1000 + w / 2,
      y: isHall ? (H - r.y - r.h) / 1000 - 0.6 : (H - r.y - r.h / 2) / 1000 + size * 0.35,
      'text-anchor': 'middle',
      'font-size': size,
      'font-weight': 600,
      fill: 'var(--ink-2)'
    });
    t.textContent = r.name;
    g.append(t);
  }

  function select(id: string | null) {
    selected = id;
    g.querySelectorAll('.sel').forEach((el) => el.classList.remove('sel'));
    if (id) g.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('sel');
  }

  return {
    el: svg,
    render,
    select,
    fit,
    zoom: (f) => zoomAt(f, vb.x + vb.w / 2, vb.y + vb.h / 2),
    setInsets: (i) => (insets = i)
  };
}
