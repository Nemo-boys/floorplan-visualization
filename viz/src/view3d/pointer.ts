/* ---------- Pointer: orbit, hover, double-click focus, placing and moving furniture ---------- */
import * as THREE from 'three';
import { clamp, type FurnItem, type PreparedPlan, type Room } from '../engine';
import { state } from '../state';
import { $, esc } from '../ui/dom';
import { onRoomHover } from '../ui/edit';
import { onRoomTap } from '../ui/review';
import { orbit, walker } from './cameras';
import { setHoverMark } from './marks';
import { commitPlaced, moveGhost, placeAt, positionPlaced, selectItem } from './placement';
import { R3, r3 } from './r3';
import { D2, W2, wx, wz } from './coords';

const plan = (): PreparedPlan => state.P as PreparedPlan;
export const ray = new THREE.Raycaster();
export const ndc = new THREE.Vector2();
export interface FloorHit {
  x: number;
  y: number;
  raw: THREE.Raycaster;
}
export function floorPoint(e: { clientX: number; clientY: number }): FloorHit | null {
  const R = r3();
  const rect = R.renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, R.camera);
  const o = ray.ray.origin,
    d = ray.ray.direction;
  if (Math.abs(d.y) < 1e-6) return null;
  const t = -o.y / d.y;
  if (t < 0) return null;
  return { x: o.x + d.x * t + W2() / 2, y: -(o.z + d.z * t) + D2() / 2, raw: ray };
}
export function roomAt(x: number, y: number): Room | undefined {
  return plan().m.rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}
export function pickPlaced(e: PointerEvent): FurnItem | null {
  const R = r3();
  if (!R.groups.placed || !R.groups.placed.children.length) return null;
  floorPoint(e);
  const hit = ray.intersectObjects(R.groups.placed.children, true)[0];
  if (!hit) return null;
  let o: THREE.Object3D | null = hit.object;
  while (o && !o.userData.item) o = o.parent;
  return o ? (o.userData.item as FurnItem) : null;
}
export function bindPointer(el: HTMLElement): void {
  const pts = new Map<number, { x: number; y: number; b: number; shift: boolean }>();
  let pinch = 0,
    dragItem: FurnItem | null = null,
    moved = 0,
    lastTap = 0;
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
    moved = 0;
    if (state.view !== 'orbit') return;
    if (state.placing) return;
    const it = e.button === 0 ? pickPlaced(e) : null;
    if (it) {
      dragItem = it;
      selectItem(it);
    }
  });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (state.placing) {
      moveGhost(e);
      hideTip();
    }
    if (!p) {
      hover(e);
      return;
    }
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()],
        d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && state.view === 'orbit') orbit.goal.r = clamp((orbit.goal.r * pinch) / d, 5, 90);
      pinch = d;
      return;
    }
    hideTip();
    if (dragItem) {
      const fp = floorPoint(e);
      if (fp) {
        dragItem.x = Math.round(fp.x * 10) / 10;
        dragItem.y = Math.round(fp.y * 10) / 10;
        positionPlaced(dragItem);
      }
      return;
    }
    if (state.view === 'orbit') {
      if (p.b === 2 || p.shift) {
        const s = orbit.goal.r * 0.0016,
          c = Math.cos(orbit.goal.theta),
          sn = Math.sin(orbit.goal.theta);
        orbit.goal.tx = clamp(orbit.goal.tx - c * dx * s - sn * dy * s, -W2(), W2());
        orbit.goal.tz = clamp(orbit.goal.tz + sn * dx * s - c * dy * s, -D2(), D2());
      } else {
        orbit.goal.theta -= dx * 0.006;
        orbit.goal.phi = clamp(orbit.goal.phi - dy * 0.005, 0.18, 1.42);
      }
    } else if (state.view === 'walk') {
      walker.yaw += dx * 0.005;
      walker.pitch = clamp(walker.pitch - dy * 0.004, -0.9, 0.9);
    }
  });
  const up = (e: PointerEvent): void => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
    if (dragItem) {
      const it = dragItem;
      dragItem = null;
      commitPlaced(it, 'moved');
      return;
    }
    if (!p || moved > 6) return;
    if (state.placing) {
      placeAt(e);
      return;
    }
    const now = performance.now();
    if (now - lastTap < 320) focusRoomAt(e);
    else if (state.view === 'orbit' && !pickPlaced(e)) {
      selectItem(null);
      const fp = floorPoint(e),
        rr = fp && roomAt(fp.x, fp.y);
      onRoomTap(rr || null);
    }
    lastTap = now;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', e => {
    pts.delete(e.pointerId);
    dragItem = null;
  });
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener(
    'wheel',
    e => {
      if (state.view !== 'orbit') return;
      e.preventDefault();
      orbit.goal.r = clamp(orbit.goal.r * Math.exp(e.deltaY * 0.0012), 5, 90);
    },
    { passive: false }
  );
}
export function focusRoomAt(e: PointerEvent): void {
  if (state.view !== 'orbit') return;
  const fp = floorPoint(e),
    r = fp && roomAt(fp.x, fp.y);
  if (!r) return;
  Object.assign(orbit.goal, {
    tx: wx(r.x + r.w / 2),
    tz: wz(r.y + r.h / 2),
    r: clamp(Math.max(r.w, r.h) * 2.4, 6, 18),
    phi: 0.78
  });
}
export function hover(e: PointerEvent): void {
  if (!R3 || state.view !== 'orbit' || state.placing) {
    hideTip();
    return;
  }
  const fp = floorPoint(e),
    r = fp && roomAt(fp.x, fp.y),
    tip = $('#tooltip');
  const hint = onRoomHover(r || null);
  if (!r) {
    hideTip();
    return;
  }
  const people: Record<string, number> = { patient: 0, nurse: 0, provider: 0, reception: 0 };
  for (const [id, p] of R3.people) {
    const a = (state.sim as NonNullable<typeof state.sim>).agents[id];
    if (a && a.active && p.dx >= r.x && p.dx <= r.x + r.w && p.dy >= r.y && p.dy <= r.y + r.h) people[a.role]++;
  }
  const parts: string[] = [];
  if (people.patient) parts.push(people.patient + (people.patient === 1 ? ' patient' : ' patients'));
  if (people.nurse) parts.push(people.nurse + (people.nurse === 1 ? ' nurse' : ' nurses'));
  if (people.provider) parts.push(people.provider + (people.provider === 1 ? ' provider' : ' providers'));
  if (people.reception) parts.push('receptionist');
  tip.innerHTML =
    '<b>' +
    esc(r.label) +
    '</b><span>' +
    (r.w * r.h).toFixed(1) +
    ' m², ' +
    r.w.toFixed(1) +
    ' × ' +
    r.h.toFixed(1) +
    ' m</span><span>' +
    (parts.length ? 'Now: ' + parts.join(', ') : 'Empty right now') +
    '</span>' +
    (hint ? '<em class="tip-hint">' + esc(hint) + '</em>' : '');
  const rect = $('#view3dBody').getBoundingClientRect();
  tip.style.transform =
    'translate(' + Math.round(e.clientX - rect.left + 14) + 'px,' + Math.round(e.clientY - rect.top + 14) + 'px)';
  tip.hidden = false;
}
export function hideTip(): void {
  const t = document.querySelector<HTMLElement>('#tooltip');
  if (t) t.hidden = true;
  if (R3 && R3.hoverMark) setHoverMark(null);
}
