/* 0.3 m walkable grid. Furniture footprints block cells; door thresholds always stay open. */
import type { Grid, Model, Rect, Vec } from './types';

export const CELL = 0.3;
export function buildGrid(m: Model, blocks: Rect[] | null | undefined): Grid {
  const nx = Math.round(m.W / CELL),
    ny = Math.round(m.D / CELL);
  const room = new Int16Array(nx * ny).fill(-1),
    blocked = new Uint8Array(nx * ny);
  m.rooms.forEach((r, k) => {
    const i0 = Math.round(r.x / CELL),
      i1 = Math.round((r.x + r.w) / CELL);
    const j0 = Math.round(r.y / CELL),
      j1 = Math.round((r.y + r.h) / CELL);
    for (let j = Math.max(0, j0); j < Math.min(ny, j1); j++)
      for (let i = Math.max(0, i0); i < Math.min(nx, i1); i++) room[j * nx + i] = k;
  });
  for (const b of blocks || []) {
    for (let j = Math.max(0, Math.floor(b.y0 / CELL)); j < Math.min(ny, Math.ceil(b.y1 / CELL)); j++)
      for (let i = Math.max(0, Math.floor(b.x0 / CELL)); i < Math.min(nx, Math.ceil(b.x1 / CELL)); i++) {
        const cx = (i + 0.5) * CELL,
          cy = (j + 0.5) * CELL;
        if (cx > b.x0 - 0.04 && cx < b.x1 + 0.04 && cy > b.y0 - 0.04 && cy < b.y1 + 0.04) blocked[j * nx + i] = 1;
      }
  }
  const vDoor = new Set<number>(),
    hDoor = new Set<number>();
  for (const d of m.doors) {
    const half = d.width / 2 + 1e-6;
    const cov: number[] = (d.cov = []);
    if (d.orient === 'v') {
      const line = (d.line = Math.round(d.cx / CELL));
      for (let j = 0; j < ny; j++)
        if (Math.abs((j + 0.5) * CELL - d.cy) <= half) {
          vDoor.add(line * 4096 + j);
          cov.push(j);
          for (let q = -2; q <= 1; q++) {
            const i = line + q;
            if (i >= 0 && i < nx) blocked[j * nx + i] = 0;
          }
        }
    } else {
      const line = (d.line = Math.round(d.cy / CELL));
      for (let i = 0; i < nx; i++)
        if (Math.abs((i + 0.5) * CELL - d.cx) <= half) {
          hDoor.add(i * 4096 + line);
          cov.push(i);
          for (let q = -2; q <= 1; q++) {
            const j = line + q;
            if (j >= 0 && j < ny) blocked[j * nx + i] = 0;
          }
        }
    }
  }
  const passE = new Uint8Array(nx * ny),
    passN = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i,
        r = room[c];
      if (r < 0 || blocked[c]) continue;
      if (i + 1 < nx) {
        const r2 = room[c + 1];
        if (r2 >= 0 && !blocked[c + 1] && (r2 === r || vDoor.has((i + 1) * 4096 + j))) passE[c] = 1;
      }
      if (j + 1 < ny) {
        const r2 = room[c + nx];
        if (r2 >= 0 && !blocked[c + nx] && (r2 === r || hDoor.has(i * 4096 + j + 1))) passN[c] = 1;
      }
    }
  return { nx, ny, room, blocked, passE, passN, vDoor, hDoor };
}
export function isFree(g: Grid, c: number): boolean {
  return c >= 0 && g.room[c] >= 0 && !g.blocked[c];
}
export function cellXY(g: Grid, c: number): Vec {
  return { x: ((c % g.nx) + 0.5) * CELL, y: (((c / g.nx) | 0) + 0.5) * CELL };
}
export function cellAt(g: Grid, x: number, y: number): number {
  const i = Math.floor(x / CELL),
    j = Math.floor(y / CELL);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return -1;
  const c = j * g.nx + i;
  return isFree(g, c) ? c : -1;
}
export function stepOK(g: Grid, a: number, b: number): boolean {
  const ai = a % g.nx,
    aj = (a / g.nx) | 0,
    bi = b % g.nx,
    bj = (b / g.nx) | 0;
  if (bj === aj && bi === ai + 1) return !!g.passE[a];
  if (bj === aj && bi === ai - 1) return !!g.passE[b];
  if (bi === ai && bj === aj + 1) return !!g.passN[a];
  if (bi === ai && bj === aj - 1) return !!g.passN[b];
  return false;
}
