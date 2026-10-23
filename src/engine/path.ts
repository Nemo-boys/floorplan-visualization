/* Pathfinding on the walkable grid. */
import { Heap } from './heap';
import { cellAt, cellXY, isFree, stepOK } from './grid';
import type { Grid, Path, Pathfinder, Vec } from './types';

/* A straight segment is walkable if every cell it crosses is free and each crossing is an open step. */
export function segmentClear(g: Grid, a: Vec, b: Vec, pad?: number): boolean {
  const L = Math.hypot(b.x - a.x, b.y - a.y),
    steps = Math.max(1, Math.ceil(L / 0.08));
  const nxv = L ? -(b.y - a.y) / L : 0,
    nyv = L ? (b.x - a.x) / L : 0;
  for (const off of pad ? [-pad, 0, pad] : [0]) {
    let prev = cellAt(g, a.x + nxv * off, a.y + nyv * off);
    if (prev < 0) return false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps,
        c = cellAt(g, a.x + (b.x - a.x) * t + nxv * off, a.y + (b.y - a.y) * t + nyv * off);
      if (c < 0) return false;
      if (c !== prev) {
        const pi = prev % g.nx,
          pj = (prev / g.nx) | 0,
          ci = c % g.nx,
          cj = (c / g.nx) | 0;
        if (pi !== ci && pj !== cj) {
          const m1 = pj * g.nx + ci,
            m2 = cj * g.nx + pi;
          if (!(
            isFree(g, m1) &&
            stepOK(g, prev, m1) &&
            stepOK(g, m1, c) &&
            isFree(g, m2) &&
            stepOK(g, prev, m2) &&
            stepOK(g, m2, c)
          ))
            return false;
        } else if (!stepOK(g, prev, c)) return false;
        prev = c;
      }
    }
  }
  return true;
}
export function astar(g: Grid, s: number, t: number): number[] | null {
  if (s === t) return [s];
  const N = g.nx * g.ny,
    cost = new Float64Array(N).fill(Infinity),
    came = new Int32Array(N).fill(-1),
    closed = new Uint8Array(N);
  const tx = t % g.nx,
    ty = (t / g.nx) | 0;
  const h = (c: number): number => {
    const dx = Math.abs((c % g.nx) - tx),
      dy = Math.abs(((c / g.nx) | 0) - ty);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const open = new Heap<[number, number]>((a, b) => a[1] < b[1]);
  cost[s] = 0;
  open.push([s, h(s)]);
  while (open.size) {
    const c = open.pop()[0];
    if (c === t) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const i = c % g.nx,
      j = (c / g.nx) | 0,
      nx = g.nx;
    const E = i + 1 < nx && g.passE[c],
      Wst = i > 0 && g.passE[c - 1],
      Nn = j + 1 < g.ny && g.passN[c],
      S = j > 0 && g.passN[c - nx];
    const relax = (n: number, w: number): void => {
      const v = cost[c] + w;
      if (v < cost[n]) {
        cost[n] = v;
        came[n] = c;
        open.push([n, v + h(n)]);
      }
    };
    if (E) relax(c + 1, 1);
    if (Wst) relax(c - 1, 1);
    if (Nn) relax(c + nx, 1);
    if (S) relax(c - nx, 1);
    if (E && Nn && g.passN[c + 1] && g.passE[c + nx]) relax(c + 1 + nx, Math.SQRT2);
    if (Wst && Nn && g.passN[c - 1] && g.passE[c + nx - 1]) relax(c - 1 + nx, Math.SQRT2);
    if (E && S && g.passN[c + 1 - nx] && g.passE[c - nx]) relax(c + 1 - nx, Math.SQRT2);
    if (Wst && S && g.passN[c - 1 - nx] && g.passE[c - nx - 1]) relax(c - 1 - nx, Math.SQRT2);
  }
  if (came[t] < 0) return null;
  const out = [t];
  let c = t;
  while (c !== s) {
    c = came[c];
    out.push(c);
  }
  return out.reverse();
}
/* Shortest paths, then "string pulling" so people walk in straight lines instead of grid zig-zags. */
export function makePathfinder(g: Grid): Pathfinder {
  const cache = new Map<number, Path | null>();
  return function path(s: number, t: number): Path | null {
    if (s < 0 || t < 0) return null;
    const key = s * 100003 + t;
    if (cache.has(key)) return cache.get(key) as Path | null;
    const cells = astar(g, s, t);
    let r: Path | null = null;
    if (cells) {
      const P = cells.map(c => cellXY(g, c)),
        pts = [P[0]];
      let i = 0;
      while (i < P.length - 1) {
        let j = P.length - 1;
        while (j > i + 1 && !segmentClear(g, P[i], P[j], 0.16)) j--;
        pts.push(P[j]);
        i = j;
      }
      const cum = [0];
      for (let k = 1; k < pts.length; k++)
        cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      r = { cells, pts, cum, len: cum[cum.length - 1] };
    }
    cache.set(key, r);
    return r;
  };
}
