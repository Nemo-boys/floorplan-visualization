/* ---------- People ---------- */
import * as THREE from 'three';
import { inwardDir, mulberry32, posAt, type Agent, type PreparedPlan, type Vec } from '../engine';
import { state } from '../state';
import { Bx, geoCache } from './geometry';
import { M } from './materials';
import { R3, r3, type Limb, type Person } from './r3';
import { lerpAngle, wx, wz, yawOf } from './coords';

const plan = (): PreparedPlan => state.P as PreparedPlan;
export const SKIN = ['#f1c9a8', '#e2ae87', '#c98b64', '#a06c4b', '#7b4f35', '#5b3b29'];
export const HAIR = ['#2a1f17', '#4b3426', '#6b4b30', '#a7834f', '#cfcac3', '#161616'];
export const SHIRTS = [
  '#4a6fa5',
  '#7a9e7e',
  '#b8692a',
  '#8d4b6c',
  '#c9a227',
  '#5a6670',
  '#a33c3c',
  '#3d7a8c',
  '#7d6aa8',
  '#d4d0c8'
];
export const PANTS = ['#2f3a4a', '#3b3b3b', '#5a4a3a', '#2a4a5a', '#4a4a58', '#6b6455'];
export function pmat(color: string): THREE.MeshStandardMaterial {
  const c = r3().cache,
    k = 'pm' + color;
  if (!c[k]) c[k] = M(color, 0.75);
  return c[k] as THREE.MeshStandardMaterial;
}
export function capsule(r: number, l: number, mat: THREE.Material, y: number): THREE.Mesh {
  const m = new THREE.Mesh(
    geoCache('cap' + r + ',' + l, () => new THREE.CapsuleGeometry(r, l, 4, 12)),
    mat
  );
  m.position.y = y;
  m.castShadow = true;
  return m;
}
export function makePerson(a: Agent): Person {
  const rnd = mulberry32(a.id * 977 + 13),
    skin = pmat(SKIN[(rnd() * SKIN.length) | 0]),
    hair = pmat(HAIR[(rnd() * HAIR.length) | 0]);
  let top: THREE.MeshStandardMaterial, legs: THREE.MeshStandardMaterial;
  if (a.role === 'nurse') {
    top = legs = pmat('#2c8c89');
  } else if (a.role === 'provider') {
    top = pmat('#f3f5f7');
    legs = pmat('#2e3540');
  } else if (a.role === 'reception') {
    top = pmat('#3b507d');
    legs = pmat('#3a3d44');
  } else {
    top = pmat(SHIRTS[(rnd() * SHIRTS.length) | 0]);
    legs = pmat(PANTS[(rnd() * PANTS.length) | 0]);
  }
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  body.add(capsule(0.155, 0.3, top, 0.3));
  if (a.role === 'provider') {
    const coat = new THREE.Mesh(
      geoCache('coat', () => new THREE.CylinderGeometry(0.17, 0.2, 0.3, 14)),
      top
    );
    coat.position.y = -0.06;
    coat.castShadow = true;
    body.add(coat);
    const st = new THREE.Mesh(
      geoCache('steth', () => new THREE.TorusGeometry(0.085, 0.008, 6, 20)),
      pmat('#22262b')
    );
    st.position.set(0, 0.55, 0.06);
    st.rotation.x = 1.25;
    body.add(st);
  }
  const neck = new THREE.Mesh(
    geoCache('neck', () => new THREE.CylinderGeometry(0.042, 0.045, 0.1, 10)),
    skin
  );
  neck.position.y = 0.64;
  body.add(neck);
  const head = new THREE.Mesh(
    geoCache('head', () => new THREE.SphereGeometry(0.105, 18, 14)),
    skin
  );
  head.position.y = 0.76;
  head.castShadow = true;
  body.add(head);
  const hk = rnd() < 0.5 ? 0 : 1;
  const hairM = new THREE.Mesh(
    geoCache(
      'hair' + hk,
      () => new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * (hk ? 0.62 : 0.5))
    ),
    hair
  );
  hairM.position.set(0, 0.775, -0.008);
  hairM.rotation.x = -0.25;
  body.add(hairM);
  const limb = (x: number, y: number, upperMat: THREE.Material, lowerMat: THREE.Material, isArm: boolean): Limb => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    if (isArm) {
      pivot.add(capsule(0.045, 0.5, upperMat, -0.3));
      const hand = new THREE.Mesh(
        geoCache('hand', () => new THREE.SphereGeometry(0.045, 10, 8)),
        skin
      );
      hand.position.y = -0.6;
      pivot.add(hand);
      return { pivot };
    }
    pivot.add(capsule(0.066, 0.32, upperMat, -0.22));
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    pivot.add(knee);
    knee.add(capsule(0.055, 0.34, lowerMat, -0.21));
    const shoe = Bx(0.1, 0.06, 0.22, pmat('#23262b'), 0, -0.42, 0.045);
    shoe.castShadow = true;
    knee.add(shoe);
    return { pivot, knee };
  };
  const armL = limb(0.205, 0.53, top, top, true),
    armR = limb(-0.205, 0.53, top, top, true);
  const legL = limb(0.085, 0, legs, legs, false) as Required<Limb>,
    legR = limb(-0.085, 0, legs, legs, false) as Required<Limb>;
  const badge = new THREE.Mesh(
    geoCache('badge', () => new THREE.SphereGeometry(0.07, 14, 10)),
    new THREE.MeshBasicMaterial({ color: '#3bb273' })
  );
  badge.position.y = 1.02;
  badge.visible = false;
  body.add(badge);
  r3().root.add(root);
  const fresh = a.role === 'patient' && state.sim && state.sim.now - (a.tArrive as number) < 0.6;
  const start = fresh ? outsidePoint() : a.rest ? { x: a.rest.x as number, y: a.rest.y as number } : { x: a.x, y: a.y },
    ent = plan().m.doors.find(d => d.isEntrance),
    n = ent ? inwardDir(ent, plan().m) : { x: 0, y: 1 };
  const f0: Vec = a.rest && a.rest.dir ? a.rest.dir : n;
  return {
    root,
    body,
    armL,
    armR,
    legL,
    legR,
    badge,
    dx: start.x,
    dy: start.y,
    px: start.x,
    py: start.y,
    yaw: yawOf(f0.x, f0.y),
    phase: rnd() * 6,
    swing: 0,
    sit: a.rest && a.rest.pose === 'sit' ? 1 : 0
  };
}
export function outsidePoint(): Vec {
  const m = plan().m,
    d = m.doors.find(q => q.isEntrance);
  if (!d) return { x: m.W / 2, y: -1.5 };
  const n = inwardDir(d, m);
  return { x: d.cx - n.x * 2.2, y: d.cy - n.y * 2.2 };
}
export const WAIT_COLORS: [number, string][] = [
  [5, '#3bb273'],
  [15, '#e0a21b'],
  [Infinity, '#d64532']
];
export function updatePeople(dt: number): void {
  if (!R3 || !state.sim) return;
  const R = R3;
  const sim = state.sim,
    t = sim.now,
    seen = new Set<number>();
  for (const a of sim.agents) {
    if (!a.active && (a.leftAt == null || t - a.leftAt > 1.6 || !R.people.has(a.id))) continue;
    let p = R.people.get(a.id);
    if (!p) {
      p = makePerson(a);
      R.people.set(a.id, p);
    }
    seen.add(a.id);
    const e = posAt(a, t);
    let tx = e.x,
      ty = e.y,
      face: Vec | null | undefined = null,
      pose: string = 'stand',
      seatH = 0;
    if (!a.active) {
      const o = outsidePoint();
      tx = o.x;
      ty = o.y;
      pose = 'walk';
    } else if (e.moving) {
      tx += -e.dy * a.lane;
      ty += e.dx * a.lane;
      face = { x: e.dx, y: e.dy };
      pose = 'walk';
    } else if (a.rest) {
      tx = a.rest.x as number;
      ty = a.rest.y as number;
      face = a.rest.dir;
      pose = a.rest.pose;
      seatH = a.rest.h || 0;
    }
    const k = e.moving && a.active ? 1 : 1 - Math.exp(-dt * 8);
    p.dx += (tx - p.dx) * k;
    p.dy += (ty - p.dy) * k;
    const vx = (p.dx - p.px) / Math.max(dt, 1e-3),
      vy = (p.dy - p.py) / Math.max(dt, 1e-3);
    p.px = p.dx;
    p.py = p.dy;
    const sp = Math.hypot(vx, vy);
    if (!face && sp > 0.08) face = { x: vx / sp, y: vy / sp };
    if (face && Math.abs(face.x) + Math.abs(face.y) > 0)
      p.yaw = lerpAngle(p.yaw, yawOf(face.x, face.y), 1 - Math.exp(-dt * 9));
    const walking = sp > 0.12 && pose !== 'sit';
    const sitTarget = pose === 'sit' && Math.hypot(tx - p.dx, ty - p.dy) < 0.25 ? 1 : 0;
    p.sit += (sitTarget - p.sit) * (1 - Math.exp(-dt * 7));
    p.swing += ((walking ? Math.min(1, sp / 1.1) : 0) - p.swing) * (1 - Math.exp(-dt * 8));
    if (p.swing > 0.01) p.phase += dt * Math.min(40, Math.max(4, sp * 5.2));
    p.root.position.set(wx(p.dx), 0, wz(p.dy));
    p.root.rotation.y = p.yaw;
    const st = 1 - p.sit,
      s = Math.sin(p.phase) * 0.55 * p.swing;
    p.body.position.y = (0.88 + Math.abs(Math.sin(p.phase)) * 0.025 * p.swing) * st + (seatH + 0.07) * p.sit;
    p.body.position.z = -0.1 * p.sit;
    p.legL.pivot.rotation.x = -s * st - (Math.PI / 2) * p.sit;
    p.legR.pivot.rotation.x = s * st - (Math.PI / 2) * p.sit;
    p.legL.knee.rotation.x = Math.max(0, Math.sin(p.phase + 1.3)) * 0.75 * p.swing * st + (Math.PI / 2) * p.sit;
    p.legR.knee.rotation.x =
      Math.max(0, Math.sin(p.phase + 1.3 + Math.PI)) * 0.75 * p.swing * st + (Math.PI / 2) * p.sit;
    p.armL.pivot.rotation.x = s * 0.85 * st - 0.5 * p.sit;
    p.armR.pivot.rotation.x = -s * 0.85 * st - 0.5 * p.sit;
    p.armL.pivot.rotation.z = 0.06;
    p.armR.pivot.rotation.z = -0.06;
    const waiting = a.role === 'patient' && a.waitingSince != null && a.active;
    p.badge.visible = state.layers.waits && waiting;
    if (p.badge.visible) {
      const w = t - (a.waitingSince as number);
      p.badge.material.color.set((WAIT_COLORS.find(c => w < c[0]) as [number, string])[1]);
    }
  }
  for (const [id, p] of R.people)
    if (!seen.has(id)) {
      R.root.remove(p.root);
      R.people.delete(id);
    }
}
