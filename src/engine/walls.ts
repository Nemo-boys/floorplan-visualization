/* Walls, door gaps and windows, worked out from the room edges and the grid. */
import { CELL } from './grid';
import type { DoorGap, Grid, Model, Orient, PlanWindow, Wall } from './types';

interface Run {
  from: number;
  to: number;
  ext: boolean;
}

/* Wall segments wherever two different rooms (or a room and the outside) meet, minus door openings. */
export function extractWalls(m: Model, g: Grid): Wall[] {
  const out: Wall[] = [];
  const R = (i: number, j: number): number => (i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : g.room[j * g.nx + i]);
  for (let i = 0; i <= g.nx; i++) {
    let run: Run | null = null;
    for (let j = 0; j <= g.ny; j++) {
      let wall = false,
        ext = false;
      if (j < g.ny) {
        const a = R(i - 1, j),
          b = R(i, j);
        if (a !== b && (a >= 0 || b >= 0) && !g.vDoor.has(i * 4096 + j)) {
          wall = true;
          ext = a < 0 || b < 0;
        }
      }
      if (run && wall && run.ext === ext) {
        run.to = j + 1;
        continue;
      }
      if (run) {
        out.push({ orient: 'v', at: i * CELL, from: run.from * CELL, to: run.to * CELL, ext: run.ext });
        run = null;
      }
      if (wall) run = { from: j, to: j + 1, ext };
    }
  }
  for (let j = 0; j <= g.ny; j++) {
    let run: Run | null = null;
    for (let i = 0; i <= g.nx; i++) {
      let wall = false,
        ext = false;
      if (i < g.nx) {
        const a = R(i, j - 1),
          b = R(i, j);
        if (a !== b && (a >= 0 || b >= 0) && !g.hDoor.has(i * 4096 + j)) {
          wall = true;
          ext = a < 0 || b < 0;
        }
      }
      if (run && wall && run.ext === ext) {
        run.to = i + 1;
        continue;
      }
      if (run) {
        out.push({ orient: 'h', at: j * CELL, from: run.from * CELL, to: run.to * CELL, ext: run.ext });
        run = null;
      }
      if (wall) run = { from: i, to: i + 1, ext };
    }
  }
  return out;
}
export function doorGaps(m: Model): DoorGap[] {
  return m.doors
    .filter(d => d.cov && d.cov.length)
    .map(d => ({
      id: d.id,
      a: d.a,
      b: d.b,
      orient: d.orient,
      at: (d.line as number) * CELL,
      from: Math.min(...(d.cov as number[])) * CELL,
      to: (Math.max(...(d.cov as number[])) + 1) * CELL,
      kind: d.kind,
      isEntrance: d.isEntrance
    }));
}
/* Window openings on exterior walls of rooms that would have them. */
export const WINDOW_TYPES = new Set([
  'exam_room',
  'staff_lounge',
  'provider_office',
  'waiting',
  'nurse_station',
  'lab',
  'procedure_room',
  'reception'
]);
export function planWindows(m: Model): PlanWindow[] {
  const out: PlanWindow[] = [],
    tol = 0.05,
    ent = m.doors.filter(d => d.isEntrance);
  for (const r of m.rooms) {
    if (!WINDOW_TYPES.has(r.type)) continue;
    const sides: { orient: Orient; at: number; a: number; b: number }[] = [];
    if (r.y < tol) sides.push({ orient: 'h', at: 0, a: r.x, b: r.x + r.w });
    if (Math.abs(r.y + r.h - m.D) < tol) sides.push({ orient: 'h', at: m.D, a: r.x, b: r.x + r.w });
    if (r.x < tol) sides.push({ orient: 'v', at: 0, a: r.y, b: r.y + r.h });
    if (Math.abs(r.x + r.w - m.W) < tol) sides.push({ orient: 'v', at: m.W, a: r.y, b: r.y + r.h });
    for (const s of sides) {
      const L = s.b - s.a;
      if (L < 2.0) continue;
      const n = L > 5.6 ? 2 : 1,
        ww = Math.min(1.6, (L - 0.9 * (n + 1)) / n);
      if (ww < 0.8) continue;
      for (let q = 0; q < n; q++) {
        const c = s.a + (L * (q + 0.5)) / n,
          from = c - ww / 2,
          to = c + ww / 2;
        const clash = ent.some(
          d =>
            d.orient === s.orient &&
            Math.abs((s.orient === 'h' ? d.cy : d.cx) - s.at) < tol &&
            Math.abs((s.orient === 'h' ? d.cx : d.cy) - c) < ww / 2 + d.width / 2 + 0.3
        );
        if (!clash) out.push({ orient: s.orient, at: s.at, from, to, room: r.id });
      }
    }
  }
  return out;
}
