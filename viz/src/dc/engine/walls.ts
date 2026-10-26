/* Walls along every room edge, merged where rooms share an edge, with gaps for doors. Shared by the 3D view
   and the USD export, so both draw the same building. Millimetres, plan axes. */
import type { Design } from './types';

export const WALL_H_MM = 3400;
export const DOOR_H_MM = 2600;

/* A wall run: horizontal when h is 0 (runs along x from x to x+w at y), vertical when w is 0. t is its
   thickness: 350 mm outside, 180 mm inside. */
export interface WallBox {
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
}

export function wallBoxes(d: Design): WallBox[] {
  type Seg = { a: number; b: number; ext: boolean };
  const horiz = new Map<number, Seg[]>();
  const vert = new Map<number, Seg[]>();
  const b = d.building;
  const isExt = (pos: number, axis: 'h' | 'v') => (axis === 'h' ? pos === b.y || pos === b.y + b.h : pos === b.x || pos === b.x + b.w);
  const add = (m: Map<number, Seg[]>, k: number, a: number, bb: number, ext: boolean) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push({ a, b: bb, ext });
  };
  d.rooms
    .filter((r) => !r.outdoor)
    .forEach((r) => {
      add(horiz, r.y, r.x, r.x + r.w, isExt(r.y, 'h'));
      add(horiz, r.y + r.h, r.x, r.x + r.w, isExt(r.y + r.h, 'h'));
      add(vert, r.x, r.y, r.y + r.h, isExt(r.x, 'v'));
      add(vert, r.x + r.w, r.y, r.y + r.h, isExt(r.x + r.w, 'v'));
    });
  const merge = (segs: Seg[]) => {
    segs.sort((p, q) => p.a - q.a);
    const out: Seg[] = [];
    segs.forEach((s) => {
      const last = out[out.length - 1];
      if (last && s.a <= last.b) {
        last.b = Math.max(last.b, s.b);
        last.ext = last.ext || s.ext;
      } else out.push({ ...s });
    });
    return out;
  };
  const boxes: WallBox[] = [];
  const cut = (segs: Seg[], doors: { c: number; w: number }[]) => {
    const out: Seg[] = [];
    segs.forEach((s) => {
      let parts: Seg[] = [s];
      doors.forEach((dr) => {
        const da = dr.c - dr.w / 2;
        const db = dr.c + dr.w / 2;
        parts = parts.flatMap((p) => (db <= p.a || da >= p.b ? [p] : [{ ...p, b: da }, { ...p, a: db }].filter((q) => q.b - q.a > 50)));
      });
      out.push(...parts);
    });
    return out;
  };
  horiz.forEach((segs, y) => {
    const doors = d.doors.filter((dr) => dr.axis === 'x' && Math.abs(dr.y - y) < 1).map((dr) => ({ c: dr.x, w: dr.width }));
    cut(merge(segs), doors).forEach((s) => boxes.push({ x: s.a, y, w: s.b - s.a, h: 0, t: s.ext ? 350 : 180 }));
  });
  vert.forEach((segs, x) => {
    const doors = d.doors.filter((dr) => dr.axis === 'y' && Math.abs(dr.x - x) < 1).map((dr) => ({ c: dr.y, w: dr.width }));
    cut(merge(segs), doors).forEach((s) => boxes.push({ x, y: s.a, w: 0, h: s.b - s.a, t: s.ext ? 350 : 180 }));
  });
  return boxes;
}
