/* ---------- Furniture planner: what goes in each room, where people sit or stand, and what blocks walking ---------- */
import { clamp } from './util';
import type { Door, FurnItem, FurnOpts, FurnSpots, Furniture, Model, Rect, Room, Spot, Vec } from './types';

export const ITEM_SIZE: Record<string, [number, number, number]> = {
  chair: [0.5, 0.5, 1],
  examTable: [0.72, 1.9, 1],
  stool: [0.42, 0.42, 0],
  casework: [2.0, 0.6, 1],
  desk: [1.2, 0.6, 1],
  counter: [2.6, 0.65, 1],
  workstation: [2.6, 0.7, 1],
  sinkCounter: [1.8, 0.6, 1],
  shelf: [2.6, 0.42, 1],
  toilet: [0.42, 0.68, 1],
  basin: [0.55, 0.45, 1],
  table: [1.2, 0.8, 1],
  kitchenette: [2.2, 0.62, 1],
  fridge: [0.62, 0.66, 1],
  plant: [0.45, 0.45, 1],
  rug: [2.4, 1.5, 0],
  cabinet: [1.0, 0.45, 1],
  drawChair: [0.7, 0.85, 1],
  bin: [0.4, 0.4, 1],
  bed: [0.98, 2.12, 1],
  screen: [1.4, 0.35, 1],
  fileCabinet: [0.5, 0.6, 1],
  hamper: [0.5, 0.5, 1],
  procTable: [0.8, 2.0, 1],
  cart: [0.55, 0.85, 1]
};
export const PLACEABLE = ['bed', 'chair', 'desk', 'plant', 'cabinet', 'screen'];
export function itemRect(it: { x: number; y: number; w: number; d: number; dir: Vec }): Rect {
  const alongX = Math.abs(it.dir.x) > 0.5;
  const ex = (alongX ? it.d : it.w) / 2,
    ey = (alongX ? it.w : it.d) / 2;
  return { x0: it.x - ex, x1: it.x + ex, y0: it.y - ey, y1: it.y + ey };
}
export function rectsOverlap(a: Rect, b: Rect, pad?: number): boolean {
  pad = pad || 0;
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}
export function roomDoors(m: Model, r: Room): Door[] {
  const tol = 0.06;
  return m.doors.filter(d => {
    const onX = d.cx > r.x - tol && d.cx < r.x + r.w + tol,
      onY = d.cy > r.y - tol && d.cy < r.y + r.h + tol;
    if (d.orient === 'h') return onX && (Math.abs(d.cy - r.y) < tol || Math.abs(d.cy - (r.y + r.h)) < tol);
    return onY && (Math.abs(d.cx - r.x) < tol || Math.abs(d.cx - (r.x + r.w)) < tol);
  });
}
export function doorZone(d: Door, r: Room): Rect {
  const half = d.width / 2 + 0.38,
    depth = 1.15;
  if (d.orient === 'h') {
    const inside = Math.abs(d.cy - r.y) < 0.06 ? [r.y, r.y + depth] : [r.y + r.h - depth, r.y + r.h];
    return { x0: d.cx - half, x1: d.cx + half, y0: inside[0], y1: inside[1] };
  }
  const inside = Math.abs(d.cx - r.x) < 0.06 ? [r.x, r.x + depth] : [r.x + r.w - depth, r.x + r.w];
  return { x0: inside[0], x1: inside[1], y0: d.cy - half, y1: d.cy + half };
}
export type Side = 'S' | 'N' | 'W' | 'E';
export interface RoomFrame {
  side: Side;
  U: number;
  V: number;
  pt: (u: number, v: number) => Vec;
  dir: (du: number, dv: number) => Vec;
  doorU: number;
}
/* Room frame: u runs along the main door wall (to the right when looking in), v runs from that wall into the room. */
export function roomFrame(r: Room, door: Door | undefined): RoomFrame {
  let side: Side = 'S';
  if (door) {
    const t = 0.06;
    if (door.orient === 'h') side = Math.abs(door.cy - r.y) < t ? 'S' : 'N';
    else side = Math.abs(door.cx - r.x) < t ? 'W' : 'E';
  }
  const F = {
    S: { f: [0, 1], rt: [1, 0], o: [r.x, r.y], U: r.w, V: r.h },
    N: { f: [0, -1], rt: [-1, 0], o: [r.x + r.w, r.y + r.h], U: r.w, V: r.h },
    W: { f: [1, 0], rt: [0, -1], o: [r.x, r.y + r.h], U: r.h, V: r.w },
    E: { f: [-1, 0], rt: [0, 1], o: [r.x + r.w, r.y], U: r.h, V: r.w }
  }[side];
  const pt = (u: number, v: number): Vec => ({
    x: F.o[0] + F.rt[0] * u + F.f[0] * v,
    y: F.o[1] + F.rt[1] * u + F.f[1] * v
  });
  const dir = (du: number, dv: number): Vec => {
    const x = F.rt[0] * du + F.f[0] * dv,
      y = F.rt[1] * du + F.f[1] * dv,
      L = Math.hypot(x, y) || 1;
    return { x: x / L, y: y / L };
  };
  const doorU = door ? F.rt[0] * (door.cx - F.o[0]) + F.rt[1] * (door.cy - F.o[1]) : F.U / 2;
  return { side, U: F.U, V: F.V, pt, dir, doorU };
}
export function snapDir(d: Vec): Vec {
  return Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) || 1 };
}
export type AddItem = (kind: string, p: Vec, dir: Vec, opts?: FurnOpts) => FurnItem | null;
export function planFurniture(m: Model): Furniture {
  const items: FurnItem[] = [],
    spots: FurnSpots = { seats: [], exams: {}, nurseHomes: [], officeHomes: [] };
  m.rooms.forEach((r, k) => {
    const doors = roomDoors(m, r);
    const zones = doors.map(d => doorZone(d, r));
    const mainDoor =
      doors.find(
        d =>
          d.a === 'corridor_1' ||
          d.b === 'corridor_1' ||
          m.rooms.find(q => q.id === (d.a === r.id ? d.b : d.a))?.type === 'corridor'
      ) ||
      doors.find(d => !d.isEntrance) ||
      doors[0];
    const F = roomFrame(r, mainDoor);
    const mine: FurnItem[] = [];
    const add: AddItem = (kind, p, dir, opts) => {
      const sz = ITEM_SIZE[kind] || [0.5, 0.5, 1];
      const it: FurnItem = Object.assign(
        { kind, room: k, x: p.x, y: p.y, dir: snapDir(dir), look: dir, w: sz[0], d: sz[1], block: !!sz[2] },
        opts || {}
      );
      const R = itemRect(it);
      if (R.x0 < r.x - 0.01 || R.x1 > r.x + r.w + 0.01 || R.y0 < r.y - 0.01 || R.y1 > r.y + r.h + 0.01) return null;
      if (it.block && !it.allowDoorZone && zones.some(z => rectsOverlap(z, R))) return null;
      if (it.block && mine.some(o => o.block && rectsOverlap(itemRect(o), R, -0.02))) return null;
      mine.push(it);
      items.push(it);
      return it;
    };
    const place = (kind: string, u: number, v: number, du: number, dv: number, opts?: FurnOpts): FurnItem | null =>
      add(kind, F.pt(u, v), F.dir(du, dv), opts);
    const U = F.U,
      V = F.V;
    const spot = (
      u: number,
      v: number,
      du: number,
      dv: number,
      pose: Spot['pose'],
      h: number,
      au?: number,
      av?: number
    ): Spot => {
      const p = F.pt(u, v),
        a = F.pt(au == null ? u : au, av == null ? v : av);
      return { x: p.x, y: p.y, dir: F.dir(du, dv), pose, h: h || 0, ax: a.x, ay: a.y, room: k };
    };
    if (r.type === 'exam_room' && U >= 2.2 && V >= 3.2) {
      const right = F.doorU <= U / 2,
        s = right ? 1 : -1;
      const tU = right ? U - 0.5 : 0.5,
        tV = V - 1.2,
        aisle = tU - s * 0.95;
      const table = place('examTable', tU, tV, 0, 1);
      place('casework', right ? 0.32 : U - 0.32, V - 1.15, s, 0, {
        w: Math.min(2.0, V - 2.2),
        sink: true,
        monitor: true
      });
      place('chair', right ? 0.38 : U - 0.38, 1.5, s, 0, { tone: 'guest' });
      if (table) {
        place('stool', aisle - s * 0.05, tV + 0.55, s, -0.45);
        spots.exams[r.id] = {
          patient: spot(tU - s * 0.16, tV - 0.15, -s, 0, 'sit', 0.8, aisle + s * 0.05, tV - 0.15),
          nurse: spot(aisle - s * 0.05, tV - 0.85, s, 0.35, 'stand', 0),
          provider: spot(aisle - s * 0.05, tV + 0.55, s, -0.45, 'sit', 0.55)
        };
      }
    } else if (r.type === 'procedure_room' && U >= 3.0 && V >= 3.4) {
      place('procTable', U / 2, V / 2 + 0.2, 0, 1);
      place('sinkCounter', U / 2, V - 0.3, 0, -1, { w: Math.min(2.4, U - 0.4) });
      place('cart', 0.4, V / 2, 1, 0);
      place('stool', U / 2 - 0.85, V / 2, 1, 0);
    } else if (r.type === 'nurse_station' || r.type === 'provider_office') {
      const w = Math.min(U - 0.2, 2.9),
        n = clamp(Math.floor(w / 0.9), 1, 3);
      const desk = place('workstation', U / 2, V - 0.35, 0, -1, { w, seats: n });
      if (desk)
        for (let q = 0; q < n; q++) {
          const u = U / 2 + (q - (n - 1) / 2) * (w / n);
          place('chair', u, V - 1.0, 0, 1, { tone: 'task' });
          (r.type === 'nurse_station' ? spots.nurseHomes : spots.officeHomes).push(
            spot(u, V - 1.0, 0, 1, 'sit', 0.46, u, V - 1.55)
          );
        }
      const far = F.doorU < U / 2 ? U - 0.23 : 0.23;
      place(r.type === 'nurse_station' ? 'cabinet' : 'shelf', far, 1.95, F.doorU < U / 2 ? -1 : 1, 0, {
        w: 1.2,
        tall: true
      });
      place('plant', F.doorU < U / 2 ? 0.3 : U - 0.3, V - 1.75, 0, 1);
    } else if (r.type === 'staff_lounge') {
      const kitchenRight = F.doorU < U / 2,
        kU = kitchenRight ? U - 0.31 : 0.31,
        kw = Math.min(2.4, V - 1.65);
      place('kitchenette', kU, V - 0.08 - kw / 2, kitchenRight ? -1 : 1, 0, { w: kw });
      place('fridge', kitchenRight ? U - 0.34 : 0.34, V - 0.12 - kw - 0.33, kitchenRight ? -1 : 1, 0);
      const tU = kitchenRight ? (U - 0.62) / 2 : 0.62 + (U - 0.62) / 2,
        tV = V - 1.45;
      place('table', tU, tV, 1, 0);
      for (const [du, dv] of [
        [-0.36, -0.62],
        [0.36, -0.62],
        [-0.36, 0.62],
        [0.36, 0.62]
      ])
        place('chair', tU + du, tV + dv, 0, dv < 0 ? 1 : -1, { tone: 'cafe', block: false });
      place('plant', kitchenRight ? 0.3 : U - 0.3, 1.45, 0, 1);
    } else if (r.type === 'restroom') {
      place('toilet', U / 2, V - 0.36, 0, -1);
      place('basin', 0.25, Math.max(1.4, V - 1.6), 1, 0);
      place('bin', U - 0.25, Math.max(1.3, V - 1.9), -1, 0, { block: false });
    } else if (r.type === 'clean_utility' || r.type === 'storage') {
      const len = V - 1.3;
      if (len > 1) {
        place('shelf', 0.21, 1.25 + len / 2, 1, 0, { w: len, tall: true });
        place('shelf', U - 0.21, 1.25 + len / 2, -1, 0, { w: len, tall: true });
      }
    } else if (r.type === 'soiled_utility') {
      place('sinkCounter', U / 2, V - 0.3, 0, -1, { w: Math.min(U - 0.2, 2.0) });
      place('hamper', 0.3, V - 1.4, 1, 0);
      place('hamper', 0.3, V - 2.0, 1, 0);
      place('bin', U - 0.27, V - 1.5, -1, 0);
    } else if (r.type === 'lab') {
      place('sinkCounter', U / 2, V - 0.31, 0, -1, { w: U - 0.1, lab: true });
      const sideRight = F.doorU < U / 2,
        sU = sideRight ? U - 0.31 : 0.31,
        sl = Math.max(0.8, V - 2.2);
      place('sinkCounter', sU, V - 0.62 - sl / 2, sideRight ? -1 : 1, 0, { w: sl, lab: true, noSink: true });
      place('drawChair', sideRight ? 0.45 : U - 0.45, 1.85, sideRight ? 1 : -1, 0);
      place('stool', sideRight ? 1.15 : U - 1.15, 1.85, sideRight ? -1 : 1, 0);
    } else if (r.type === 'waiting') {
      layoutWaiting(m, r, k, doors, add, spots);
    } else if (r.type === 'reception') {
      layoutReception(m, r, k, doors, add, spots);
    }
  });
  const blocks = items.filter(it => it.block).map(itemRect);
  return { items, spots, blocks };
}
export function layoutWaiting(m: Model, r: Room, k: number, doors: Door[], add: AddItem, spots: FurnSpots): void {
  const walls = [
    { a: [r.x, r.y], b: [r.x + r.w, r.y], n: [0, 1] },
    { a: [r.x + r.w, r.y + r.h], b: [r.x, r.y + r.h], n: [0, -1] },
    { a: [r.x, r.y + r.h], b: [r.x, r.y], n: [1, 0] },
    { a: [r.x + r.w, r.y], b: [r.x + r.w, r.y + r.h], n: [-1, 0] }
  ];
  let seatCount = 0;
  for (const w of walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]),
      tx = (w.b[0] - w.a[0]) / L,
      ty = (w.b[1] - w.a[1]) / L;
    const blocked = [
      [0, 0.5],
      [L - 0.5, L]
    ];
    for (const d of doors) {
      const onWall = Math.abs((d.cx - w.a[0]) * w.n[0] + (d.cy - w.a[1]) * w.n[1]) < 0.06;
      if (!onWall) continue;
      const t = (d.cx - w.a[0]) * tx + (d.cy - w.a[1]) * ty,
        margin = d.kind === 'opening' ? 1.5 : d.isEntrance ? 1.0 : 0.75;
      blocked.push([t - d.width / 2 - margin, t + d.width / 2 + margin]);
    }
    blocked.sort((p, q) => p[0] - q[0]);
    let cur = 0;
    const free: number[][] = [];
    for (const [s0, s1] of blocked) {
      if (s0 > cur) free.push([cur, s0]);
      cur = Math.max(cur, s1);
    }
    if (cur < L) free.push([cur, L]);
    for (const [f0, f1] of free) {
      const n = Math.floor((f1 - f0) / 0.56);
      for (let q = 0; q < n && seatCount < 28; q++) {
        const t = f0 + ((f1 - f0) * (q + 0.5)) / n;
        const p = { x: w.a[0] + tx * t + w.n[0] * 0.33, y: w.a[1] + ty * t + w.n[1] * 0.33 };
        const it = add('chair', p, { x: w.n[0], y: w.n[1] }, { tone: 'waiting' });
        if (it) {
          seatCount++;
          spots.seats.push({
            x: p.x,
            y: p.y,
            dir: { x: w.n[0], y: w.n[1] },
            pose: 'sit',
            h: 0.46,
            ax: p.x + w.n[0] * 0.5,
            ay: p.y + w.n[1] * 0.5,
            room: k
          });
        }
      }
    }
  }
  if (r.w >= 4.5 && r.h >= 3.6) {
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2;
    add('rug', { x: cx, y: cy }, { x: 0, y: 1 }, { w: Math.min(2.8, r.w - 2.4), d: Math.min(1.7, r.h - 2.3) });
    if (r.w >= 5.5)
      for (const side of [-1, 1])
        for (let q = -1; q <= 1; q++) {
          const p = { x: cx + q * 0.56, y: cy + side * 0.27 },
            dir = { x: 0, y: side };
          if (add('chair', p, dir, { tone: 'waiting' }))
            spots.seats.push({ x: p.x, y: p.y, dir, pose: 'sit', h: 0.46, ax: p.x, ay: p.y + side * 0.5, room: k });
        }
  }
  for (const [cx, cy] of [
    [r.x + 0.3, r.y + 0.3],
    [r.x + r.w - 0.3, r.y + 0.3],
    [r.x + 0.3, r.y + r.h - 0.3],
    [r.x + r.w - 0.3, r.y + r.h - 0.3]
  ])
    add('plant', { x: cx, y: cy }, { x: 0, y: 1 }, { w: 0.42, d: 0.42 });
}
export function layoutReception(m: Model, r: Room, k: number, doors: Door[], add: AddItem, spots: FurnSpots): void {
  const wr = m.rooms.find(q => q.type === 'waiting');
  const opening = wr && doors.find(d => d.a === wr.id || d.b === wr.id);
  if (!opening) return;
  let n: Vec;
  if (opening.orient === 'v') n = Math.abs(opening.cx - r.x) < 0.06 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  else n = Math.abs(opening.cy - r.y) < 0.06 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  const along = opening.orient === 'v' ? r.h : r.w,
    len = Math.min(along - 0.5, opening.width + 0.9);
  const base = { x: opening.cx, y: opening.cy };
  const face = { x: -n.x, y: -n.y };
  add('counter', { x: base.x + n.x * 0.5, y: base.y + n.y * 0.5 }, face, { w: len, allowDoorZone: true });
  add('chair', { x: base.x + n.x * 1.25, y: base.y + n.y * 1.25 }, face, { tone: 'task', allowDoorZone: true });
  spots.receptionist = {
    x: base.x + n.x * 1.25,
    y: base.y + n.y * 1.25,
    dir: face,
    pose: 'sit',
    h: 0.46,
    ax: base.x + n.x * 1.8,
    ay: base.y + n.y * 1.8,
    room: k
  };
  spots.counter = {
    x: base.x - n.x * 0.5,
    y: base.y - n.y * 0.5,
    dir: n,
    pose: 'stand',
    h: 0,
    ax: base.x - n.x * 0.5,
    ay: base.y - n.y * 0.5
  };
  const back = {
    x: base.x + n.x * (opening.orient === 'v' ? r.w : r.h),
    y: base.y + n.y * (opening.orient === 'v' ? r.w : r.h)
  };
  const side = opening.orient === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 };
  add(
    'fileCabinet',
    {
      x: back.x - n.x * 0.32 + side.x * (along / 2 - 0.45),
      y: back.y - n.y * 0.32 + side.y * (along / 2 - 0.45)
    },
    n.x || n.y ? { x: -n.x, y: -n.y } : n
  );
  add(
    'plant',
    { x: back.x - n.x * 0.3 - side.x * (along / 2 - 0.3), y: back.y - n.y * 0.3 - side.y * (along / 2 - 0.3) },
    face,
    { w: 0.42, d: 0.42 }
  );
}
