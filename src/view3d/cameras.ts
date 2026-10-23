/* ---------- Cameras: overview (damped orbit), walk, follow a patient ---------- */
import { cellAt, cellXY, clamp, stepOK, type Agent, type Grid, type PreparedPlan, type Vec } from '../engine';
import { state, type ViewMode } from '../state';
import { $, isTouch, reduceMotion } from '../ui/dom';
import { updateTransport } from '../ui/transport';
import { onViewChange } from '../ui/review';
import { highlightRoom } from './marks';
import { R3, r3 } from './r3';
import { buildWalls, effectiveWalls } from './scene';
import { wx, wz } from './coords';

const plan = (): PreparedPlan => state.P as PreparedPlan;
export interface OrbitPose {
  tx: number;
  tz: number;
  r: number;
  theta: number;
  phi: number;
}
export const orbit: { cur: OrbitPose; goal: OrbitPose } = {
  cur: { tx: 0, tz: 0, r: 30, theta: -0.5, phi: 0.86 },
  goal: { tx: 0, tz: 0, r: 30, theta: -0.5, phi: 0.86 }
};
export function fitCamera(instant?: boolean): void {
  if (!R3) return;
  const m = plan().m,
    t = Math.tan(((R3.camera.fov / 2) * Math.PI) / 180),
    asp = Math.max(0.5, R3.camera.aspect || 1.6);
  const r = 1.05 * Math.max((m.W / 2 + 1.5) / (t * asp), (m.D / 2 + 2) / t) + 3;
  Object.assign(orbit.goal, { tx: 0, tz: 0.8, r: clamp(r, 8, 80), theta: -0.5, phi: 0.86 });
  if (instant) Object.assign(orbit.cur, orbit.goal);
}
export function applyOrbit(dt?: number): void {
  const c = orbit.cur,
    g = orbit.goal,
    k = dt === undefined ? 1 : 1 - Math.exp(-dt * (reduceMotion ? 20 : 8));
  for (const key of ['tx', 'tz', 'r', 'theta', 'phi'] as (keyof OrbitPose)[]) c[key] += (g[key] - c[key]) * k;
  const sp = Math.sin(c.phi);
  const cam = r3().camera;
  cam.position.set(c.tx + c.r * sp * Math.sin(c.theta), c.r * Math.cos(c.phi), c.tz + c.r * sp * Math.cos(c.theta));
  cam.lookAt(c.tx, 0.3, c.tz);
}
export const walker = { x: 0, y: 0, yaw: 0, pitch: -0.08, keys: new Set<string>(), pad: new Set<string>() };
export function startWalk(): void {
  const g = plan().g,
    p = cellXY(g, plan().info.entranceCell),
    r = plan().m.rooms[plan().info.entK];
  walker.x = p.x;
  walker.y = p.y;
  walker.pitch = -0.08;
  walker.yaw = Math.atan2(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.y);
}
export function lineOK(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  let c = cellAt(g, x0, y0);
  const t = cellAt(g, x1, y1);
  if (c < 0 || t < 0) return false;
  for (let guard = 0; c !== t && guard < 8; guard++) {
    const ci = c % g.nx,
      cj = (c / g.nx) | 0,
      ti = t % g.nx,
      tj = (t / g.nx) | 0;
    const n = ti > ci ? c + 1 : ti < ci ? c - 1 : tj > cj ? c + g.nx : c - g.nx;
    if (!stepOK(g, c, n)) return false;
    c = n;
  }
  return c === t;
}
export function tryMove(dx: number, dy: number): void {
  if (!dx && !dy) return;
  const nx = walker.x + dx,
    ny = walker.y + dy;
  if (lineOK(plan().g, walker.x, walker.y, nx + Math.sign(dx) * 0.2, ny + Math.sign(dy) * 0.2)) {
    walker.x = nx;
    walker.y = ny;
  }
}
export function updateWalk(dt: number): void {
  const k = walker.keys,
    pd = walker.pad;
  let f = 0,
    s = 0;
  if (k.has('w') || k.has('arrowup') || pd.has('f')) f += 1;
  if (k.has('s') || k.has('arrowdown') || pd.has('b')) f -= 1;
  if (k.has('d') || pd.has('r')) s += 1;
  if (k.has('a') || pd.has('l')) s -= 1;
  if (k.has('arrowleft') || k.has('q') || pd.has('tl')) walker.yaw -= 1.8 * dt;
  if (k.has('arrowright') || k.has('e') || pd.has('tr')) walker.yaw += 1.8 * dt;
  const sp = 1.7 * dt,
    fx = Math.sin(walker.yaw),
    fy = Math.cos(walker.yaw),
    rx = Math.cos(walker.yaw),
    ry = -Math.sin(walker.yaw);
  let dx = (fx * f + rx * s) * sp,
    dy = (fy * f + ry * s) * sp;
  const L = Math.hypot(dx, dy);
  if (L > sp) {
    dx *= sp / L;
    dy *= sp / L;
  }
  tryMove(dx, 0);
  tryMove(0, dy);
  const cp = Math.cos(walker.pitch);
  const cam = r3().camera;
  cam.position.set(wx(walker.x), 1.62, wz(walker.y));
  cam.lookAt(wx(walker.x + fx * cp), 1.62 + Math.sin(walker.pitch), wz(walker.y + fy * cp));
}
export const follow: { cam: Vec | null; look: Vec | null } = { cam: null, look: null };
export function pickFollow(): Agent | null {
  const sim = state.sim;
  if (!sim) return null;
  const list = sim.agents.filter(a => a.role === 'patient' && a.active);
  if (!list.length) return null;
  list.sort((a, b) => (b.tArrive as number) - (a.tArrive as number));
  return list.find(a => a.phase === 'in') || list[0];
}
export function patientStatus(a: Agent | null | undefined): string {
  if (!a) return 'Waiting for the next patient to arrive';
  const room = a.room ? plan().m.rooms.find(r => r.id === a.room) : null;
  if (a.move)
    return a.leaving
      ? 'Heading out'
      : a.phase === 'out'
        ? 'Walking to checkout'
        : room
          ? 'Walking to ' + room.label
          : a.seat
            ? 'Finding a seat'
            : 'Walking to reception';
  if (a.waitingSince != null)
    return (
      (room ? 'Waiting in ' + room.label + ' for the provider' : 'Waiting in the lobby') +
      ', ' +
      Math.round((state.sim as NonNullable<typeof state.sim>).now - a.waitingSince) +
      ' min so far'
    );
  if (room) return 'With staff in ' + room.label;
  return a.phase === 'out' ? 'Checking out' : 'Checking in at reception';
}
export function updateFollow(dt: number): void {
  const sim = state.sim;
  let a = sim && sim.agents.find(x => x.id === state.followId && x.active);
  if (!a) {
    a = pickFollow();
    state.followId = a ? a.id : null;
  }
  const p = a && r3().people.get(a.id);
  $('#followChip').textContent = 'Following a patient: ' + patientStatus(a);
  if (!p) {
    applyOrbit(dt);
    return;
  }
  const back = { x: -Math.sin(p.yaw), y: Math.cos(p.yaw) };
  const want = { x: p.dx + back.x * 3.6, y: p.dy + back.y * 3.6 };
  const k = 1 - Math.exp(-dt * 3);
  follow.cam = follow.cam
    ? { x: follow.cam.x + (want.x - follow.cam.x) * k, y: follow.cam.y + (want.y - follow.cam.y) * k }
    : want;
  follow.look = follow.look
    ? { x: follow.look.x + (p.dx - follow.look.x) * k * 2, y: follow.look.y + (p.dy - follow.look.y) * k * 2 }
    : { x: p.dx, y: p.dy };
  const cam = r3().camera;
  cam.position.set(wx(follow.cam.x), 3.4, wz(follow.cam.y));
  cam.lookAt(wx(follow.look.x), 1.0, wz(follow.look.y));
}
export function setView(v: ViewMode): void {
  if (v !== 'orbit' && !R3) return;
  const before = effectiveWalls();
  state.view = v;
  document
    .querySelectorAll<HTMLElement>('[data-view]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  $('#walkPad').hidden = !(v === 'walk' && isTouch);
  $('#followChip').hidden = v !== 'follow';
  if (v !== 'tour' && R3) highlightRoom(null);
  onViewChange(v);
  const hintEl = document.querySelector<HTMLElement>('#viewHint');
  if (hintEl)
    hintEl.textContent =
      v === 'tour'
        ? 'The camera visits every room. Use the controls below to pause or skip.'
        : v === 'walk'
          ? isTouch
            ? 'Use the buttons to walk; drag to look around.'
            : 'W A S D to walk, arrow keys or drag to turn, Esc to go back.'
          : v === 'follow'
            ? 'The camera follows one patient through their visit.'
            : isTouch
              ? 'Drag to turn, pinch to zoom, double-tap a room to zoom in.'
              : 'Drag to turn, scroll to zoom, right-drag to pan, double-click a room to zoom in.';
  if (v === 'walk') startWalk();
  if (v === 'follow') {
    follow.cam = null;
    follow.look = null;
    state.followId = null;
    if (!state.playing) {
      state.playing = true;
      updateTransport();
    }
  }
  if (before !== effectiveWalls()) buildWalls();
}
