/* ---------- Building ---------- */
import * as THREE from 'three';
import {
  clamp,
  doorGaps,
  extractWalls,
  inwardDir,
  mulberry32,
  planWindows,
  roomDoors,
  roomFrame,
  type Model,
  type PreparedPlan,
  type Vec,
  type Wall
} from '../engine';
import { state } from '../state';
import { themeColors } from '../ui/theme';
import { BOX, Bx, Cy, Sp, floorQuads, mergeByMaterial, type FloorRect } from './geometry';
import { buildItem } from './furniture';
import { setSun } from './init';
import { disposeMarkMaterials } from './marks';
import { R3, r3, type Mat } from './r3';
import { gradientTex, labelTex, makeCanvas, texFrom } from './textures';
import { wx, wz } from './coords';

const plan = (): PreparedPlan => state.P as PreparedPlan;
type Disposable = THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material };

export function floorMatFor(type: string): [Mat, THREE.CanvasTexture] {
  const R3 = r3(),
    m = R3.mat;
  if (type === 'waiting' || type === 'reception' || type === 'staff_lounge') return [m.floorWood, R3.tex.wood];
  if (type === 'corridor') return [m.floorCorridor, R3.tex.corridor];
  if (type === 'restroom') return [m.floorTile, R3.tex.tile];
  if (type === 'provider_office') return [m.floorCarpet, R3.tex.carpet];
  if (type === 'clean_utility' || type === 'soiled_utility' || type === 'storage')
    return [m.floorGrey, R3.tex.vinylGrey];
  return [m.floorVinyl, R3.tex.vinyl];
}
export function clearRoot(): void {
  const R3 = r3();
  disposeMarkMaterials();
  R3.root.traverse(o => {
    const d = o as Disposable;
    if (d.geometry && !Object.values(R3.cache).includes(d.geometry)) d.geometry.dispose();
  });
  R3.root.clear();
  for (const p of R3.people.values()) R3.root.remove(p.root);
  R3.people.clear();
  R3.hl = null;
  R3.marks = null;
  R3.hoverMark = null;
  R3.hoverKey = null;
}
export function buildScene(): void {
  if (!R3) return;
  const R = R3;
  clearRoot();
  const P = plan(),
    m = P.m,
    g = P.g,
    T = themeColors();
  R.groups = {};
  const grp = (name: string): THREE.Group => {
    const o = new THREE.Group();
    o.name = name;
    R.root.add(o);
    R.groups[name] = o;
    return o;
  };
  // Sky, ground, base slab, walkway, trees
  R.scene.background = texFrom(
    gradientTex(
      [
        [0, T.sky],
        [1, T.horizon]
      ],
      4,
      256,
      true
    ),
    1,
    1,
    false
  );
  R.scene.fog = new THREE.Fog(new THREE.Color(T.horizon), 55, 150);
  const site = grp('site');
  R.mat.ground.color.set(T.ground);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), R.mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.14;
  ground.receiveShadow = true;
  site.add(ground);
  const slab = Bx(m.W + 0.5, 0.14, m.D + 0.5, R.mat.base, 0, -0.07, 0);
  slab.receiveShadow = true;
  slab.castShadow = true;
  site.add(slab);
  const ent = m.doors.find(d => d.isEntrance);
  let walk: { x0: number; x1: number; y0: number; y1: number } | null = null;
  if (ent) {
    const n = inwardDir(ent, m),
      L = 7,
      Wd = 2.6;
    const cx = ent.cx - n.x * (L / 2 + 0.25),
      cy = ent.cy - n.y * (L / 2 + 0.25);
    walk = {
      x0: cx - (n.x ? L / 2 : Wd / 2),
      x1: cx + (n.x ? L / 2 : Wd / 2),
      y0: cy - (n.y ? L / 2 : Wd / 2),
      y1: cy + (n.y ? L / 2 : Wd / 2)
    };
    const pv = Bx(
      walk.x1 - walk.x0,
      0.02,
      walk.y1 - walk.y0,
      R.mat.paving,
      wx((walk.x0 + walk.x1) / 2),
      -0.13,
      wz((walk.y0 + walk.y1) / 2)
    );
    pv.receiveShadow = true;
    site.add(pv);
  }
  const trees = new THREE.Group(),
    rnd = mulberry32(21);
  const spots: number[][] = [];
  for (let x = 2; x < m.W; x += 5.5) {
    spots.push([x + rnd(), m.D + 3.2 + rnd()]);
    spots.push([x + 1.5 + rnd(), -3.4 - rnd()]);
  }
  for (let y = 1.5; y < m.D; y += 4.5) {
    spots.push([-3.3 - rnd(), y + rnd()]);
    spots.push([m.W + 3.3 + rnd(), y + rnd()]);
  }
  for (const [x, y] of spots) {
    if (walk && x > walk.x0 - 2.2 && x < walk.x1 + 2.2 && y > walk.y0 - 2.2 && y < walk.y1 + 2.2) continue;
    const s = 0.8 + rnd() * 0.5,
      t = new THREE.Group();
    t.add(Cy(0.07 * s, 0.1 * s, 1.7 * s, R.mat.trunk, 0, 0.85 * s - 0.14, 0, 8));
    t.add(Sp(0.95 * s, R.mat.leaf, 0, 2.15 * s, 0, 1));
    t.add(Sp(0.7 * s, R.mat.leaf2, 0.35 * s, 2.7 * s, 0.15 * s, 1));
    t.add(Sp(0.6 * s, R.mat.leaf, -0.3 * s, 2.55 * s, -0.25 * s, 1));
    t.position.set(wx(x), 0, wz(y));
    t.rotation.y = rnd() * 6;
    trees.add(t);
  }
  site.add(mergeByMaterial(trees));
  // Floors with world-space texture coordinates
  const floorsByMat = new Map<Mat, { tex: THREE.CanvasTexture; rects: FloorRect[] }>();
  for (const r of m.rooms) {
    const [mat, tex] = floorMatFor(r.type);
    if (!floorsByMat.has(mat)) floorsByMat.set(mat, { tex, rects: [] });
    (floorsByMat.get(mat) as { rects: FloorRect[] }).rects.push({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h });
  }
  const floors = grp('floors');
  for (const [mat, f] of floorsByMat) {
    const mesh = new THREE.Mesh(floorQuads(f.rects, 0.003, f.tex.userData.size), mat);
    mesh.receiveShadow = true;
    floors.add(mesh);
  }
  // Zone tint (planning view)
  const zones = grp('zones');
  for (const z of Object.keys(T.zones) as (keyof typeof T.zones)[]) {
    const rects = m.rooms
      .filter(r => r.zone === z)
      .map(r => ({ x0: r.x + 0.06, x1: r.x + r.w - 0.06, y0: r.y + 0.06, y1: r.y + r.h - 0.06 }));
    if (!rects.length) continue;
    const mesh = new THREE.Mesh(
      floorQuads(rects, 0.009, [1, 1]),
      new THREE.MeshBasicMaterial({ color: T.zones[z], transparent: true, opacity: 0.55, depthWrite: false })
    );
    mesh.renderOrder = 1;
    zones.add(mesh);
  }
  zones.visible = state.layers.zones;
  R.walls = extractWalls(m, g);
  R.gaps = doorGaps(m);
  R.windows = planWindows(m);
  buildWalls();
  buildFurniture();
  buildRoutes();
  buildHeat();
  buildLabels();
  buildSelection();
  setSun(state.sim ? state.sim.now : 90);
  const big = Math.max(m.W, m.D) / 2 + 7;
  Object.assign(R.sun.shadow.camera, { left: -big, right: big, top: big, bottom: -big, near: 1, far: 120 });
  R.sun.shadow.camera.updateProjectionMatrix();
}
export function effectiveWalls(): 'cut' | 'full' {
  return state.view === 'orbit' ? state.walls : state.view === 'tour' ? 'cut' : 'full';
}
export interface WallBox {
  x: number;
  y: number;
  sx: number;
  sz: number;
  y0: number;
  y1: number;
}
export type WallBoxes = Record<'wall' | 'wallExt' | 'cap' | 'glass' | 'frame' | 'sill', WallBox[]>;
/* Every wall piece as a box: walls, cut tops, window glass, frames, sills, lintels over doors. Used by the 3D view and the export. */
export function wallBoxes(H: number): WallBoxes {
  const R3 = r3();
  const boxes: WallBoxes = { wall: [], wallExt: [], cap: [], glass: [], frame: [], sill: [] };
  const put = (
    key: keyof WallBoxes,
    orient: string | undefined,
    at: number,
    a: number,
    b: number,
    y0: number,
    y1: number,
    t: number,
    off?: number
  ): void => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return;
    const mid = (a + b) / 2,
      len = b - a,
      o = off || 0;
    boxes[key].push(
      orient === 'v' ? { x: at + o, y: mid, sx: t, sz: len, y0, y1 } : { x: mid, y: at + o, sx: len, sz: t, y0, y1 }
    );
  };
  for (const w of R3.walls) {
    const t = w.ext ? 0.24 : 0.12,
      a = w.from - t / 2,
      b = w.to + t / 2,
      key = w.ext ? 'wallExt' : 'wall';
    const wins = w.ext
      ? R3.windows
          .filter(q => q.orient === w.orient && Math.abs(q.at - w.at) < 0.05 && q.to > w.from && q.from < w.to)
          .sort((p, q) => p.from - q.from)
      : [];
    let cur = a;
    for (const q of wins) {
      put(key, w.orient, w.at, cur, q.from, 0, H, t);
      put('cap', w.orient, w.at, cur, q.from, H, H + 0.02, t + 0.004);
      put(key, w.orient, w.at, q.from, q.to, 0, 0.9, t);
      put('sill', w.orient, w.at, q.from - 0.03, q.to + 0.03, 0.9, 0.93, t + 0.06);
      const top = Math.min(2.1, H);
      if (H > 2.1) {
        put(key, w.orient, w.at, q.from, q.to, 2.1, H, t);
        put('cap', w.orient, w.at, q.from, q.to, H, H + 0.02, t + 0.004);
      }
      put('glass', w.orient, w.at, q.from, q.to, 0.93, top, 0.02);
      put('frame', w.orient, w.at, q.from, q.from + 0.05, 0.9, top, t * 0.6);
      put('frame', w.orient, w.at, q.to - 0.05, q.to, 0.9, top, t * 0.6);
      if (q.to - q.from > 1.2)
        put('frame', w.orient, w.at, (q.from + q.to) / 2 - 0.02, (q.from + q.to) / 2 + 0.02, 0.9, top, t * 0.5);
      if (H > 2.1) put('frame', w.orient, w.at, q.from, q.to, 2.06, 2.1, t * 0.6);
      cur = q.to;
    }
    put(key, w.orient, w.at, cur, b, 0, H, t);
    put('cap', w.orient, w.at, cur, b, H, H + 0.02, t + 0.004);
  }
  for (const gp of R3.gaps) {
    const ext = gp.isEntrance,
      t = ext ? 0.24 : 0.12,
      top = Math.min(2.1, H);
    put('frame', gp.orient, gp.at, gp.from, gp.from + 0.05, 0, top, t + 0.03);
    put('frame', gp.orient, gp.at, gp.to - 0.05, gp.to, 0, top, t + 0.03);
    if (H > 2.1) {
      put(ext ? 'wallExt' : 'wall', gp.orient, gp.at, gp.from, gp.to, 2.1, H, t);
      put('cap', gp.orient, gp.at, gp.from, gp.to, H, H + 0.02, t + 0.004);
      put('frame', gp.orient, gp.at, gp.from, gp.to, 2.06, 2.1, t + 0.03);
    }
    if (ext) {
      put('glass', gp.orient, gp.at, gp.from + 0.05, (gp.from + gp.to) / 2 - 0.35, 0.02, top - 0.02, 0.03, 0.04);
      put('glass', gp.orient, gp.at, (gp.from + gp.to) / 2 + 0.35, gp.to - 0.05, 0.02, top - 0.02, 0.03, -0.04);
    }
  }
  return boxes;
}
export interface DoorLeaf {
  hx: number;
  hy: number;
  dx: number;
  dy: number;
  len: number;
  hgt: number;
  room: string;
}
/* Open door leaves, swung into the room (not into the corridor). */
export function doorLeaves(H: number): DoorLeaf[] {
  const out: DoorLeaf[] = [],
    m = plan().m;
  for (const gp of r3().gaps) {
    if (gp.kind !== 'door' || gp.isEntrance) continue;
    const ra =
      m.rooms.find(r => r.id === gp.a && r.type !== 'corridor') ||
      m.rooms.find(r => r.id === gp.b && r.type !== 'corridor');
    if (!ra) continue;
    const len = Math.min(0.95, gp.to - gp.from - 0.08),
      hgt = Math.min(2.04, H - 0.03),
      th = 1.2;
    let hx: number, hy: number, dx: number, dy: number;
    if (gp.orient === 'v') {
      const side = ra.x + ra.w / 2 < gp.at ? -1 : 1;
      hx = gp.at;
      hy = gp.from + 0.06;
      dx = side * Math.sin(th);
      dy = Math.cos(th);
    } else {
      const side = ra.y + ra.h / 2 < gp.at ? -1 : 1;
      hx = gp.from + 0.06;
      hy = gp.at;
      dx = Math.cos(th);
      dy = side * Math.sin(th);
    }
    out.push({ hx, hy, dx, dy, len, hgt, room: ra.id });
  }
  return out;
}
export function buildWalls(): void {
  if (!R3) return;
  const R = R3;
  if (R.groups.walls) {
    R.groups.walls.traverse(o => {
      const d = o as Disposable;
      if (d.geometry && d.geometry !== BOX()) d.geometry.dispose();
    });
    R.root.remove(R.groups.walls);
  }
  const grp = new THREE.Group();
  R.groups.walls = grp;
  R.root.add(grp);
  const m = plan().m,
    full = effectiveWalls() === 'full',
    H = full ? 2.7 : 1.2,
    mat = R.mat;
  const boxes = wallBoxes(H);
  const M4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3();
  for (const key of Object.keys(boxes) as (keyof WallBoxes)[]) {
    const list = boxes[key];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(BOX(), mat[key], list.length);
    list.forEach((b, i) => {
      p.set(wx(b.x), (b.y0 + b.y1) / 2, wz(b.y));
      s.set(b.sx, b.y1 - b.y0, b.sz);
      M4.compose(p, q, s);
      mesh.setMatrixAt(i, M4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = key !== 'glass';
    mesh.receiveShadow = key !== 'glass';
    if (key === 'glass') mesh.renderOrder = 5;
    grp.add(mesh);
  }
  const leaves = new THREE.Group();
  for (const L of doorLeaves(H)) {
    const leaf = new THREE.Mesh(BOX(), mat.door);
    leaf.scale.set(L.len, L.hgt, 0.04);
    leaf.position.set(wx(L.hx + (L.dx * L.len) / 2), L.hgt / 2 + 0.01, wz(L.hy + (L.dy * L.len) / 2));
    leaf.rotation.y = Math.atan2(L.dy, L.dx);
    leaves.add(leaf);
    const knob = Cy(0.02, 0.02, 0.12, mat.chrome, 0, 0, 0, 8);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(wx(L.hx + L.dx * (L.len - 0.07)), 1.0, wz(L.hy + L.dy * (L.len - 0.07)));
    leaves.add(knob);
  }
  grp.add(mergeByMaterial(leaves));
  const strips: FloorRect[] = [],
    w0 = 0.34;
  for (const w of R.walls) {
    const t = (w.ext ? 0.24 : 0.12) / 2;
    const sides = w.ext ? [insideSide(w, m)] : [-1, 1];
    for (const sd of sides) {
      if (w.orient === 'v') {
        const xa = w.at + sd * t,
          xb = w.at + sd * (t + w0);
        strips.push({
          x0: Math.min(xa, xb),
          x1: Math.max(xa, xb),
          y0: w.from,
          y1: w.to,
          uv: px => [0, Math.abs(px - xa) / w0]
        });
      } else {
        const ya = w.at + sd * t,
          yb = w.at + sd * (t + w0);
        strips.push({
          x0: w.from,
          x1: w.to,
          y0: Math.min(ya, yb),
          y1: Math.max(ya, yb),
          uv: (_px, py) => [0, Math.abs(py - ya) / w0]
        });
      }
    }
  }
  const ao = new THREE.Mesh(floorQuads(strips, 0.006, [1, 1]), mat.ao);
  ao.renderOrder = 1;
  grp.add(ao);
}
export function insideSide(w: Wall, m: Model): number {
  if (w.orient === 'v') return w.at < m.W / 2 ? 1 : -1;
  return w.at < m.D / 2 ? 1 : -1;
}
export function buildFurniture(): void {
  const R = r3();
  if (R.groups.furniture) {
    R.root.remove(R.groups.furniture);
    R.groups.furniture.traverse(o => {
      const d = o as Disposable;
      if (d.geometry && !Object.values(R.cache).includes(d.geometry)) d.geometry.dispose();
    });
  }
  const all = new THREE.Group();
  for (const it of plan().furn.items) {
    if (it.placed) continue;
    const o = buildItem(it);
    if (o) all.add(o);
  }
  const merged = mergeByMaterial(all);
  merged.name = 'furniture';
  merged.visible = state.layers.furniture;
  R.root.add(merged);
  R.groups.furniture = merged;
  if (R.groups.placed) R.root.remove(R.groups.placed);
  const placed = new THREE.Group();
  R.groups.placed = placed;
  R.root.add(placed);
  for (const it of state.placed) {
    const o = buildItem(it);
    if (!o) continue;
    o.traverse(c => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    o.userData.item = it;
    it.obj = o;
    placed.add(o);
  }
}
export function ribbonGeo(polys: Vec[][], hw: number, y: number, withJoints: boolean): THREE.BufferGeometry {
  const pos: number[] = [],
    uv: number[] = [];
  const v = (x: number, yy: number, u: number, vv: number): void => {
    pos.push(wx(x), y, wz(yy));
    uv.push(u, vv);
  };
  for (const pts of polys) {
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1],
        b = pts[k],
        L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6,
        nx = (-(b.y - a.y) / L) * hw,
        ny = ((b.x - a.x) / L) * hw;
      const u0 = acc / 0.75,
        u1 = (acc + L) / 0.75;
      v(a.x + nx, a.y + ny, u0, 1);
      v(a.x - nx, a.y - ny, u0, 0);
      v(b.x + nx, b.y + ny, u1, 1);
      v(b.x + nx, b.y + ny, u1, 1);
      v(a.x - nx, a.y - ny, u0, 0);
      v(b.x - nx, b.y - ny, u1, 0);
      acc += L;
    }
    if (withJoints)
      for (const p of pts) {
        const N = 10;
        for (let q = 0; q < N; q++) {
          const a0 = (q / N) * Math.PI * 2,
            a1 = ((q + 1) / N) * Math.PI * 2;
          v(p.x, p.y, 0.5, 0.5);
          v(p.x + Math.cos(a0) * hw, p.y + Math.sin(a0) * hw, 0.5, 0.5);
          v(p.x + Math.cos(a1) * hw, p.y + Math.sin(a1) * hw, 0.5, 0.5);
        }
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
export function buildRoutes(): void {
  const R = r3();
  if (R.groups.routes) {
    R.groups.routes.traverse(o => {
      const d = o as Disposable;
      if (d.geometry) d.geometry.dispose();
    });
    R.root.remove(R.groups.routes);
  }
  const grp = new THREE.Group();
  R.groups.routes = grp;
  R.root.add(grp);
  const T = themeColors(),
    r = plan().info.routes;
  const sets: Record<'journey' | 'staff' | 'egress', [Vec[][], string, number]> = {
    journey: [r.journey.legs, T.accent, 0.11],
    staff: [r.staff.map(s => s.pts), T.staff, 0.07],
    egress: [r.egress ? [r.egress.pts] : [], T.egress, 0.1]
  };
  const routeMeshes: Record<string, THREE.Object3D> = (R.routeMeshes = {});
  let lift = 0;
  for (const [k, [polys, color, hw]] of Object.entries(sets) as [keyof typeof sets, [Vec[][], string, number]][]) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      ribbonGeo(polys, hw, 0.02 + lift, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    const chev = new THREE.Mesh(
      ribbonGeo(polys, hw * 0.92, 0.022 + lift, false),
      new THREE.MeshBasicMaterial({
        color,
        map: R.tex.chevron,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    base.renderOrder = 3;
    chev.renderOrder = 4;
    g.add(base);
    g.add(chev);
    g.visible = state.routes[k];
    grp.add(g);
    routeMeshes[k] = g;
    lift += 0.002;
  }
}
export function buildHeat(): void {
  const R = r3(),
    g = plan().g;
  const small = makeCanvas(g.nx, g.ny),
    big = makeCanvas(g.nx * 6, g.ny * 6);
  const tex = texFrom(big, 1, 1, false);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(plan().m.W, plan().m.D),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.014;
  mesh.renderOrder = 2;
  mesh.visible = state.layers.traffic;
  R.root.add(mesh);
  R.heat = { small, big, tex, mesh };
}
export function heatRamp(f: number): number[] {
  const stops: [number, number[]][] = [
    [0, [255, 226, 120, 0]],
    [0.25, [255, 200, 80, 120]],
    [0.6, [245, 120, 45, 175]],
    [1, [200, 30, 40, 215]]
  ];
  let k = 1;
  while (k < stops.length - 1 && stops[k][0] < f) k++;
  const [f0, c0] = stops[k - 1],
    [f1, c1] = stops[k],
    u = clamp((f - f0) / (f1 - f0 || 1), 0, 1);
  return c0.map((v, q) => Math.round(v + (c1[q] - v) * u));
}
export function paintHeat(): void {
  if (!R3 || !R3.heat || !state.sim) return;
  const heat = R3.heat;
  const g = plan().g,
    h = state.sim.heat,
    sc = heat.small.getContext('2d') as CanvasRenderingContext2D,
    img = sc.createImageData(g.nx, g.ny);
  let mx = 0;
  for (let c = 0; c < h.length; c++) if (h[c] > mx) mx = h[c];
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const v = h[j * g.nx + i],
        o = ((g.ny - 1 - j) * g.nx + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = mx ? Math.round(Math.sqrt(v / mx) * 255) : 0;
    }
  sc.putImageData(img, 0, 0);
  const bc = heat.big.getContext('2d') as CanvasRenderingContext2D,
    BW = heat.big.width,
    BH = heat.big.height;
  bc.clearRect(0, 0, BW, BH);
  bc.filter = 'blur(5px)';
  bc.imageSmoothingEnabled = true;
  bc.drawImage(heat.small, 0, 0, BW, BH);
  bc.filter = 'none';
  const big = bc.getImageData(0, 0, BW, BH),
    d = big.data;
  for (let o = 0; o < d.length; o += 4) {
    const c = heatRamp(d[o + 3] / 255);
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = c[3];
  }
  bc.putImageData(big, 0, 0);
  heat.tex.needsUpdate = true;
}
export function buildLabels(): void {
  const R = r3();
  if (R.groups.labels) {
    R.groups.labels.traverse(o => {
      const d = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      if (d.material && d.material.map) d.material.map.dispose();
      if (d.geometry) d.geometry.dispose();
    });
    R.root.remove(R.groups.labels);
  }
  const grp = new THREE.Group();
  R.groups.labels = grp;
  R.root.add(grp);
  const m = plan().m;
  for (const r of m.rooms) {
    if (r.type === 'corridor') continue;
    const doors = roomDoors(m, r),
      main = doors.find(d => !d.isEntrance && d.kind !== 'opening') || doors[0],
      F = roomFrame(r, main);
    const w = clamp(Math.min(F.U, 3) * 0.86, 1.1, 2.3),
      h = (w * 168) / 512;
    const p = r.type === 'waiting' ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : F.pt(F.doorU, Math.min(0.62, F.V / 2));
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: labelTex(r.label, (r.w * r.h).toFixed(1) + ' m²'),
        transparent: true,
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(wx(p.x), 0.018, wz(p.y));
    mesh.renderOrder = 6;
    grp.add(mesh);
  }
  grp.visible = state.layers.labels;
}
export function buildSelection(): void {
  const R = r3();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.62, 48),
    new THREE.MeshBasicMaterial({
      color: themeColors().accent,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  ring.renderOrder = 7;
  R.root.add(ring);
  R.selRing = ring;
}
