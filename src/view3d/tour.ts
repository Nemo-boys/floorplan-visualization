/* ---------- Guided tour: the camera visits every room in visit order ---------- */
import * as THREE from 'three';
import { clamp, inwardDir, roomDoors, roomFrame, tourStops, type PreparedPlan, type TourStop } from '../engine';
import { state } from '../state';
import { reduceMotion } from '../ui/dom';
import { onTourStop } from '../ui/review';
import { orbit, setView } from './cameras';
import { highlightRoom } from './marks';
import { R3, r3 } from './r3';
import { wx, wz } from './coords';

const plan = (): PreparedPlan => state.P as PreparedPlan;
interface PosePoint {
  x: number;
  h: number;
  y: number;
  raw?: boolean;
  rx?: number;
  rz?: number;
}
interface CamPose {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
}
export interface TourState {
  stops: TourStop[];
  i: number;
  phase: 'idle' | 'move' | 'dwell';
  t: number;
  from: CamPose | null;
  to: CamPose | null;
  playing: boolean;
  dwell: number;
  moveTime: number;
  look: THREE.Vector3 | null;
}
export const tour: TourState = {
  stops: [],
  i: 0,
  phase: 'idle',
  t: 0,
  from: null,
  to: null,
  playing: false,
  dwell: 6.5,
  moveTime: 2.4,
  look: null
};
export function stopPose(stop: TourStop): { pos: PosePoint; tgt: PosePoint } {
  const m = plan().m,
    d = m.doors.find(q => q.isEntrance),
    n = d ? inwardDir(d, m) : { x: 0, y: 1 };
  if (stop.kind === 'entrance') {
    const e = d as NonNullable<typeof d>;
    return {
      pos: { x: e.cx - n.x * 9.5, h: 4.4, y: e.cy - n.y * 9.5 },
      tgt: { x: e.cx + n.x * 1.2, h: 0.9, y: e.cy + n.y * 1.2 }
    };
  }
  if (stop.kind === 'exit') {
    const cam = r3().camera;
    const t = Math.tan(((cam.fov / 2) * Math.PI) / 180),
      asp = Math.max(0.5, cam.aspect || 1.6);
    const r = 1.05 * Math.max((m.W / 2 + 1.5) / (t * asp), (m.D / 2 + 2) / t) + 3,
      th = -0.5,
      ph = 0.86;
    return {
      pos: {
        x: m.W / 2 - r * Math.sin(ph) * Math.sin(th),
        h: r * Math.cos(ph),
        y: m.D / 2 - 0.8 - r * Math.sin(ph) * Math.cos(th),
        raw: true,
        rx: r * Math.sin(ph) * Math.sin(th),
        rz: 0.8 + r * Math.sin(ph) * Math.cos(th)
      },
      tgt: { x: m.W / 2, h: 0.3, y: m.D / 2 - 0.8 }
    };
  }
  const r = stop.room as NonNullable<TourStop['room']>,
    doors = roomDoors(m, r),
    main = doors.find(q => !q.isEntrance && q.kind !== 'opening') || doors[0];
  const F = roomFrame(r, main),
    out = F.dir(0, -1),
    c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const dist = clamp(Math.max(r.w, r.h) * 1.3 + 3.2, 5.8, 15);
  return {
    pos: { x: c.x + out.x * dist * 0.62, h: dist * 0.82, y: c.y + out.y * dist * 0.62 },
    tgt: { x: c.x, h: 0.4, y: c.y }
  };
}
export function poseVec(p: PosePoint): THREE.Vector3 {
  if (p.raw) return new THREE.Vector3(p.rx, p.h, p.rz);
  return new THREE.Vector3(wx(p.x), p.h, wz(p.y));
}
export function startTour(index?: number): void {
  if (!R3 || !state.P) return;
  tour.stops = tourStops(state.P);
  tour.i = clamp(index || 0, 0, tour.stops.length - 1);
  tour.look = new THREE.Vector3(orbit.cur.tx, 0.3, orbit.cur.tz);
  tour.playing = true;
  setView('tour');
  beginTourMove();
}
export function beginTourMove(): void {
  const st = tour.stops[tour.i],
    p = stopPose(st);
  tour.from = { pos: r3().camera.position.clone(), tgt: (tour.look || new THREE.Vector3()).clone() };
  tour.to = { pos: poseVec(p.pos), tgt: new THREE.Vector3(wx(p.tgt.x), p.tgt.h, wz(p.tgt.y)) };
  tour.phase = 'move';
  tour.t = 0;
  highlightRoom(st.room || null);
  onTourStop(tour.i, tour.stops.length, st);
}
export function updateTour(dt: number): void {
  if (!tour.from) return;
  const cam = r3().camera,
    to = tour.to as CamPose;
  if (tour.phase === 'move') {
    tour.t += dt / (reduceMotion ? 0.05 : tour.moveTime);
    const u = clamp(tour.t, 0, 1),
      k = u * u * (3 - 2 * u);
    cam.position.lerpVectors(tour.from.pos, to.pos, k);
    tour.look = tour.look || new THREE.Vector3();
    tour.look.lerpVectors(tour.from.tgt, to.tgt, k);
    cam.lookAt(tour.look);
    if (u >= 1) {
      tour.phase = 'dwell';
      tour.t = 0;
    }
  } else {
    tour.t += dt;
    const a = reduceMotion ? 0 : Math.sin(tour.t * 0.4) * 0.06,
      base = to.pos.clone().sub(to.tgt);
    base.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    cam.position.copy(to.tgt).add(base);
    cam.lookAt(to.tgt);
    tour.look = to.tgt.clone();
    if (tour.playing && tour.t >= tour.dwell) nextTourStop();
  }
}
export function nextTourStop(): void {
  if (tour.i < tour.stops.length - 1) {
    tour.i++;
    beginTourMove();
  } else {
    tour.playing = false;
    onTourStop(tour.i, tour.stops.length, tour.stops[tour.i], true);
  }
}
export function prevTourStop(): void {
  if (tour.i > 0) {
    tour.i--;
    beginTourMove();
  }
}
export function syncOrbitFromCamera(): void {
  const t = tour.look || new THREE.Vector3(orbit.cur.tx, 0.3, orbit.cur.tz),
    c = r3().camera.position;
  const dx = c.x - t.x,
    dy = c.y,
    dz = c.z - t.z,
    r = Math.max(5, Math.hypot(dx, dy, dz));
  Object.assign(orbit.cur, { tx: t.x, tz: t.z, r, phi: Math.acos(clamp(dy / r, -1, 1)), theta: Math.atan2(dx, dz) });
  Object.assign(orbit.goal, orbit.cur);
}
export function endTour(): void {
  tour.playing = false;
  tour.phase = 'idle';
  if (R3) syncOrbitFromCamera();
  setView('orbit');
}
