/* ---------- Furniture models (local +z is the front of the item) ---------- */
import * as THREE from 'three';
import { mulberry32, type FurnItem } from '../engine';
import { Bx, Cy, Rb, Sp, rot } from './geometry';
import { m2 } from './materials';
import { r3 } from './r3';
import { wx, wz, yawOf } from './coords';

type It = Partial<FurnItem>;
const mats = (): Record<string, THREE.Material> => r3().mat;

export const FURN: Record<string, (it: It) => THREE.Group> = {
  chair(it) {
    const g = new THREE.Group(),
      m = mats();
    if (it.tone === 'task') {
      g.add(Cy(0.028, 0.028, 0.36, m.metal, 0, 0.23, 0, 10));
      for (let q = 0; q < 5; q++) {
        const a = (q / 5) * Math.PI * 2,
          l = Bx(0.03, 0.025, 0.27, m.metal, Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13);
        l.rotation.y = a;
        g.add(l);
      }
      g.add(Rb(0.47, 0.08, 0.45, 0.04, m.fabricSlate, 0, 0.46, 0));
      g.add(Rb(0.44, 0.44, 0.07, 0.035, m.fabricSlate, 0, 0.8, -0.2));
      return g;
    }
    const seat = it.tone === 'waiting' ? m.fabricBlue : it.tone === 'cafe' ? m.wood : m.fabricSlate;
    g.add(Rb(0.48, 0.07, 0.46, 0.035, seat, 0, 0.45, 0.01));
    g.add(Rb(0.48, 0.42, 0.06, 0.03, seat, 0, 0.73, -0.21));
    for (const [x, z] of [
      [-0.2, -0.19],
      [0.2, -0.19],
      [-0.2, 0.19],
      [0.2, 0.19]
    ])
      g.add(Cy(0.014, 0.014, 0.42, m.metal, x, 0.21, z, 8));
    return g;
  },
  stool() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Cy(0.2, 0.2, 0.07, m.fabricSlate, 0, 0.55, 0, 20));
    g.add(Cy(0.025, 0.025, 0.48, m.chrome, 0, 0.28, 0, 10));
    for (let q = 0; q < 5; q++) {
      const a = (q / 5) * Math.PI * 2,
        l = Bx(0.025, 0.025, 0.24, m.metal, Math.sin(a) * 0.12, 0.035, Math.cos(a) * 0.12);
      l.rotation.y = a;
      g.add(l);
    }
    return g;
  },
  examTable() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Rb(0.62, 0.58, 1.5, 0.04, m.white, 0, 0.29, 0.12));
    g.add(Rb(0.72, 0.12, 1.2, 0.05, m.vinylTeal, 0, 0.66, 0.3));
    const back = Rb(0.72, 0.12, 0.66, 0.05, m.vinylTeal, 0, 0.8, -0.5);
    back.rotation.x = 0.42;
    g.add(back);
    g.add(Bx(0.5, 0.006, 1.18, m.paper, 0, 0.723, 0.3));
    g.add(Bx(0.36, 0.1, 0.12, m.white, 0, 0.32, 0.93));
    g.add(rot(Cy(0.05, 0.05, 0.56, m.paper, 0, 0.98, -0.83, 14), 0, 0, Math.PI / 2));
    return g;
  },
  casework(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number,
      n = Math.max(1, Math.round(w / 0.5));
    g.add(Bx(w, 0.86, 0.57, m.white, 0, 0.43, -0.015));
    g.add(Bx(w + 0.02, 0.04, 0.62, m.counterTop, 0, 0.88, 0));
    for (let q = 1; q < n; q++) g.add(Bx(0.006, 0.76, 0.006, m.metal, -w / 2 + (q * w) / n, 0.44, 0.27));
    for (let q = 0; q < n; q++) g.add(Bx(0.12, 0.014, 0.014, m.chrome, -w / 2 + ((q + 0.5) * w) / n, 0.78, 0.28));
    if (it.sink) {
      g.add(Bx(0.42, 0.02, 0.36, m.steel, w / 2 - 0.42, 0.897, 0.02));
      const f = Cy(0.012, 0.012, 0.24, m.chrome, w / 2 - 0.42, 1.0, -0.2, 8);
      g.add(f);
      g.add(Bx(0.012, 0.012, 0.14, m.chrome, w / 2 - 0.42, 1.11, -0.14));
    }
    if (it.monitor) {
      g.add(Bx(0.5, 0.3, 0.025, m.screen, -w / 2 + 0.45, 1.17, -0.12));
      g.add(Bx(0.05, 0.2, 0.05, m.metal, -w / 2 + 0.45, 0.99, -0.15));
      g.add(Bx(0.42, 0.016, 0.15, m.metal, -w / 2 + 0.45, 0.908, 0.1));
      g.add(Bx(0.22, 0.03, 0.16, m.red, -w / 2 + 0.95, 1.25, -0.26));
    }
    return g;
  },
  workstation(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number,
      n = it.seats || 1;
    g.add(Bx(w, 0.035, 0.7, m.wood, 0, 0.74, 0));
    g.add(Bx(0.04, 0.72, 0.62, m.white, -w / 2 + 0.03, 0.36, 0));
    g.add(Bx(0.04, 0.72, 0.62, m.white, w / 2 - 0.03, 0.36, 0));
    g.add(Bx(w - 0.1, 0.42, 0.02, m.white, 0, 0.5, -0.32));
    for (let q = 0; q < n; q++) {
      const x = (q - (n - 1) / 2) * (w / n);
      g.add(Bx(0.54, 0.32, 0.025, m.screen, x, 1.05, -0.2));
      g.add(Bx(0.05, 0.16, 0.05, m.metal, x, 0.84, -0.23));
      g.add(Bx(0.2, 0.012, 0.16, m.metal, x, 0.763, -0.23));
      g.add(Bx(0.42, 0.016, 0.14, m.metal, x, 0.766, 0.08));
      g.add(Bx(0.06, 0.016, 0.1, m.white, x + 0.3, 0.766, 0.1));
    }
    g.add(Bx(0.21, 0.012, 0.3, m.paper, -w / 2 + 0.28, 0.766, 0.08));
    g.add(Cy(0.04, 0.035, 0.09, m.ceramic, w / 2 - 0.24, 0.8, 0.12, 12));
    return g;
  },
  counter(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number;
    g.add(Bx(w, 1.04, 0.08, m.wood, 0, 0.52, 0.29));
    g.add(Bx(w + 0.06, 0.04, 0.32, m.counterTop, 0, 1.06, 0.25));
    g.add(Bx(w, 0.035, 0.6, m.white, 0, 0.74, 0));
    g.add(Bx(0.04, 0.72, 0.55, m.white, -w / 2 + 0.02, 0.36, -0.02));
    g.add(Bx(0.04, 0.72, 0.55, m.white, w / 2 - 0.02, 0.36, -0.02));
    const mon = Bx(0.5, 0.3, 0.025, m.screen, 0, 1.0, 0.12);
    g.add(mon);
    g.add(Bx(0.05, 0.14, 0.05, m.metal, 0, 0.82, 0.15));
    g.add(Bx(0.42, 0.016, 0.15, m.metal, 0, 0.766, -0.12));
    g.add(Bx(0.18, 0.05, 0.12, m.metal, w / 2 - 0.35, 0.78, -0.05));
    g.add(Bx(0.08, 0.24, 0.06, m.red, -w / 2 + 0.3, 1.2, 0.25));
    return g;
  },
  sinkCounter(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number;
    g.add(Bx(w, 0.86, 0.57, m.white, 0, 0.43, -0.015));
    g.add(Bx(w + 0.02, 0.04, 0.62, it.lab ? m.counterTop : m.counterTop, 0, 0.88, 0));
    const n = Math.max(1, Math.round(w / 0.55));
    for (let q = 1; q < n; q++) g.add(Bx(0.006, 0.76, 0.006, m.metal, -w / 2 + (q * w) / n, 0.44, 0.27));
    if (!it.noSink) {
      g.add(Bx(0.46, 0.02, 0.38, m.steel, w * 0.25, 0.897, 0.02));
      g.add(Cy(0.013, 0.013, 0.26, m.chrome, w * 0.25, 1.01, -0.2, 8));
    }
    if (it.lab) {
      const x0 = -w / 2 + 0.35;
      g.add(Cy(0.13, 0.15, 0.18, m.white, x0, 0.99, -0.05, 18));
      g.add(Bx(0.18, 0.05, 0.22, m.metal, x0 + 0.5, 0.925, -0.05));
      g.add(Bx(0.05, 0.28, 0.05, m.metal, x0 + 0.5, 1.07, -0.13));
      g.add(rot(Cy(0.03, 0.04, 0.1, m.metal, x0 + 0.5, 1.12, -0.02, 10), 0.5, 0, 0));
      for (let q = 0; q < 6; q++)
        g.add(Cy(0.012, 0.012, 0.09, q % 2 ? m.red : m.blueBin, x0 + 0.9 + q * 0.04, 0.95, 0.05, 8));
    }
    return g;
  },
  shelf(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number,
      h = it.tall ? 1.85 : 1.2,
      d = 0.4,
      rnd = mulberry32(Math.round((it.x as number) * 97 + (it.y as number) * 31));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) g.add(Bx(0.025, h, 0.025, m.steel, sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)));
    const levels = it.tall ? [0.12, 0.55, 0.98, 1.41, 1.83] : [0.12, 0.6, 1.18];
    for (const y of levels) g.add(Bx(w, 0.02, d, m.steel, 0, y, 0));
    for (let li = 0; li < levels.length - 1; li++) {
      let x = -w / 2 + 0.06;
      while (x < w / 2 - 0.2) {
        const bw = 0.18 + rnd() * 0.3,
          bh = 0.14 + rnd() * 0.22,
          mat = [m.cardboard, m.blueBin, m.white, m.cardboard][(rnd() * 4) | 0];
        if (x + bw > w / 2 - 0.04) break;
        g.add(
          Bx(
            bw,
            Math.min(bh, levels[li + 1] - levels[li] - 0.04),
            d * (0.7 + rnd() * 0.2),
            mat,
            x + bw / 2,
            levels[li] + 0.01 + Math.min(bh, levels[li + 1] - levels[li] - 0.04) / 2,
            0
          )
        );
        x += bw + 0.04 + rnd() * 0.06;
      }
    }
    return g;
  },
  cabinet(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w || 1.0;
    g.add(Bx(w, 1.9, 0.44, m.white, 0, 0.95, 0));
    g.add(Bx(0.006, 1.82, 0.006, m.metal, 0, 0.95, 0.222));
    g.add(Bx(w - 0.06, 0.006, 0.006, m.metal, 0, 0.95, 0.222));
    for (const sx of [-1, 1]) {
      g.add(Bx(0.014, 0.18, 0.02, m.chrome, sx * 0.06, 1.25, 0.235));
      g.add(Bx(0.014, 0.12, 0.02, m.chrome, sx * 0.06, 0.75, 0.235));
    }
    return g;
  },
  fileCabinet() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Bx(0.5, 1.32, 0.6, m.metal, 0, 0.66, 0));
    for (let q = 0; q < 4; q++) {
      g.add(Bx(0.44, 0.005, 0.006, m.chrome, 0, 0.33 + q * 0.32, 0.302));
      g.add(Bx(0.14, 0.02, 0.02, m.chrome, 0, 0.18 + q * 0.32, 0.31));
    }
    return g;
  },
  toilet() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Cy(0.16, 0.12, 0.38, m.ceramic, 0, 0.19, 0.05, 20));
    g.add(Cy(0.19, 0.19, 0.04, m.ceramic, 0, 0.41, 0.06, 22));
    g.add(Rb(0.4, 0.36, 0.17, 0.04, m.ceramic, 0, 0.62, -0.25));
    g.add(rot(Cy(0.016, 0.016, 0.62, m.chrome, 0.42, 0.85, 0.05, 8), Math.PI / 2, 0, 0));
    return g;
  },
  basin() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Rb(0.52, 0.16, 0.42, 0.06, m.ceramic, 0, 0.8, 0));
    g.add(Cy(0.016, 0.016, 0.16, m.chrome, 0, 0.93, -0.15, 8));
    g.add(Bx(0.03, 0.03, 0.1, m.chrome, 0, 1.0, -0.12));
    return g;
  },
  bin() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Cy(0.17, 0.15, 0.42, m.metal, 0, 0.21, 0, 18));
    g.add(Cy(0.175, 0.175, 0.03, m.white, 0, 0.43, 0, 18));
    return g;
  },
  hamper() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Bx(0.46, 0.02, 0.46, m.steel, 0, 0.12, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) g.add(Cy(0.012, 0.012, 0.86, m.steel, sx * 0.21, 0.5, sz * 0.21, 8));
    g.add(Rb(0.42, 0.62, 0.42, 0.08, m.bag, 0, 0.5, 0));
    return g;
  },
  table() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Rb(1.2, 0.04, 0.8, 0.02, m.wood, 0, 0.74, 0));
    for (const [x, z] of [
      [-0.54, -0.34],
      [0.54, -0.34],
      [-0.54, 0.34],
      [0.54, 0.34]
    ])
      g.add(Cy(0.02, 0.02, 0.72, m.metal, x, 0.36, z, 8));
    g.add(Cy(0.04, 0.035, 0.1, m.ceramic, 0.2, 0.81, 0.1, 12));
    g.add(Sp(0.07, m.plant, -0.3, 0.83, -0.05));
    return g;
  },
  kitchenette(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number;
    g.add(Bx(w, 0.86, 0.58, m.wood, 0, 0.43, -0.02));
    g.add(Bx(w + 0.02, 0.04, 0.62, m.counterTop, 0, 0.88, 0));
    g.add(Bx(0.46, 0.02, 0.38, m.steel, -w * 0.2, 0.897, 0.02));
    g.add(Cy(0.013, 0.013, 0.26, m.chrome, -w * 0.2, 1.01, -0.2, 8));
    g.add(Bx(0.48, 0.28, 0.36, m.metal, w / 2 - 0.36, 1.04, -0.08));
    g.add(Bx(0.3, 0.18, 0.005, m.screen, w / 2 - 0.4, 1.05, 0.102));
    g.add(Cy(0.08, 0.08, 0.22, m.white, w * 0.15, 1.01, -0.12, 14));
    return g;
  },
  fridge() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Rb(0.6, 1.8, 0.64, 0.03, m.steel, 0, 0.9, 0));
    g.add(Bx(0.02, 0.5, 0.03, m.metal, 0.22, 1.25, 0.33));
    g.add(Bx(0.58, 0.005, 0.01, m.metal, 0, 1.2, 0.322));
    return g;
  },
  plant(it) {
    const g = new THREE.Group(),
      m = mats(),
      rnd = mulberry32(Math.round((it.x as number) * 131 + (it.y as number) * 17));
    g.add(Cy(0.17, 0.13, 0.36, m.pot, 0, 0.18, 0, 18));
    g.add(Cy(0.155, 0.155, 0.02, m.soil, 0, 0.35, 0, 18));
    for (let q = 0; q < 6; q++) {
      const a = rnd() * Math.PI * 2,
        rr = 0.04 + rnd() * 0.1;
      g.add(
        Sp(0.12 + rnd() * 0.1, q % 2 ? m.plant : m.plantDark, Math.cos(a) * rr, 0.5 + rnd() * 0.55, Math.sin(a) * rr)
      );
    }
    return g;
  },
  rug(it) {
    const g = new THREE.Group(),
      m = mats(),
      w = it.w as number,
      d = it.d as number;
    g.add(Bx(w, 0.012, d, m.rug, 0, 0.006, 0));
    g.add(Bx(w - 0.22, 0.013, d - 0.22, m.rugInner, 0, 0.007, 0));
    return g;
  },
  drawChair() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Bx(0.5, 0.42, 0.5, m.metal, 0, 0.21, 0));
    g.add(Rb(0.56, 0.1, 0.56, 0.04, m.fabricBlue, 0, 0.47, 0.02));
    g.add(Rb(0.56, 0.62, 0.1, 0.04, m.fabricBlue, 0, 0.82, -0.26));
    for (const sx of [-1, 1]) g.add(Rb(0.1, 0.08, 0.6, 0.03, m.fabricBlue, sx * 0.33, 0.7, 0.05));
    return g;
  },
  procTable() {
    const g = FURN.examTable({});
    g.add(Cy(0.02, 0.02, 1.9, m2().chrome, 0.7, 0.95, -0.4, 8));
    const lamp = Cy(0.2, 0.24, 0.12, m2().white, 0.45, 1.9, 0, 20);
    g.add(lamp);
    return g;
  },
  cart() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Bx(0.5, 0.75, 0.8, m.white, 0, 0.45, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        g.add(rot(Cy(0.04, 0.04, 0.03, m.metal, sx * 0.2, 0.04, sz * 0.33, 10), 0, 0, Math.PI / 2));
    return g;
  },
  bed() {
    const g = new THREE.Group(),
      m = mats();
    g.add(Bx(0.9, 0.08, 2.0, m.metal, 0, 0.4, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        g.add(Cy(0.025, 0.025, 0.36, m.chrome, sx * 0.38, 0.2, sz * 0.9, 8));
        g.add(rot(Cy(0.05, 0.05, 0.04, m.metal, sx * 0.38, 0.04, sz * 0.9, 10), 0, 0, Math.PI / 2));
      }
    g.add(Rb(0.9, 0.18, 1.96, 0.06, m.mattress, 0, 0.53, 0));
    g.add(Rb(0.92, 0.07, 1.25, 0.05, m.blanket, 0, 0.63, 0.32));
    g.add(Rb(0.55, 0.12, 0.32, 0.06, m.mattress, 0, 0.68, -0.74));
    g.add(Rb(0.96, 0.62, 0.06, 0.03, m.white, 0, 0.74, -1.02));
    g.add(Rb(0.96, 0.42, 0.06, 0.03, m.white, 0, 0.6, 1.02));
    for (const sx of [-1, 1]) g.add(Bx(0.025, 0.2, 0.9, m.chrome, sx * 0.47, 0.72, -0.35));
    return g;
  },
  desk() {
    return FURN.workstation({ w: 1.2, seats: 1 });
  },
  screen() {
    const g = new THREE.Group(),
      m = mats();
    for (let q = -1; q <= 1; q++) {
      const p = new THREE.Group();
      p.add(Bx(0.46, 1.6, 0.02, m.fabricMint, 0, 0.95, 0));
      p.add(Bx(0.48, 0.03, 0.04, m.chrome, 0, 1.76, 0));
      p.add(Bx(0.03, 1.72, 0.04, m.chrome, 0.23, 0.9, 0));
      p.position.x = q * 0.47;
      p.rotation.y = q * 0.25;
      g.add(p);
    }
    return g;
  }
};
export function buildItem(it: FurnItem): THREE.Group | null {
  const f = FURN[it.kind];
  if (!f) return null;
  const g = f(it);
  g.position.set(wx(it.x), 0, wz(it.y));
  const d = it.kind === 'stool' && it.look ? it.look : it.dir;
  g.rotation.y = yawOf(d.x, d.y);
  return g;
}
