/* ---------- Geometry helpers ---------- */
import * as THREE from 'three';
import { r3 } from './r3';
import { wx, wz } from './coords';

export function geoCache<T>(key: string, make: () => T): T {
  const c = r3().cache;
  if (!c[key]) c[key] = make();
  return c[key] as T;
}
export function roundedBoxGeo(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  return geoCache('rb' + [w, h, d, r].map(v => v.toFixed(3)).join(','), () => {
    const bs = Math.min(r, h * 0.35, w * 0.3, d * 0.3),
      sw = w - 2 * bs,
      sd = d - 2 * bs,
      rr = Math.max(0.001, Math.min(r * 0.6, sw / 2, sd / 2));
    const s = new THREE.Shape(),
      x = -sw / 2,
      y = -sd / 2;
    s.moveTo(x + rr, y);
    s.lineTo(x + sw - rr, y);
    s.quadraticCurveTo(x + sw, y, x + sw, y + rr);
    s.lineTo(x + sw, y + sd - rr);
    s.quadraticCurveTo(x + sw, y + sd, x + sw - rr, y + sd);
    s.lineTo(x + rr, y + sd);
    s.quadraticCurveTo(x, y + sd, x, y + sd - rr);
    s.lineTo(x, y + rr);
    s.quadraticCurveTo(x, y, x + rr, y);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(0.002, h - 2 * bs),
      bevelEnabled: true,
      bevelThickness: bs,
      bevelSize: bs,
      bevelSegments: 3,
      curveSegments: 5
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bs - h / 2, 0);
    return g;
  });
}
export const BOX = (): THREE.BoxGeometry => geoCache('box', () => new THREE.BoxGeometry(1, 1, 1));
export function Bx(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(BOX(), mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}
export function Cy(
  rt: number,
  rb: number,
  h: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  seg?: number
): THREE.Mesh {
  const m = new THREE.Mesh(
    geoCache('cy' + [rt, rb, h, seg || 16].join(','), () => new THREE.CylinderGeometry(rt, rb, h, seg || 16)),
    mat
  );
  m.position.set(x, y, z);
  return m;
}
export function Rb(
  w: number,
  h: number,
  d: number,
  r: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const m = new THREE.Mesh(roundedBoxGeo(w, h, d, r), mat);
  m.position.set(x, y, z);
  return m;
}
export function rot<T extends THREE.Object3D>(o: T, x?: number, y?: number, z?: number): T {
  o.rotation.set(x || 0, y || 0, z || 0);
  return o;
}
export function Sp(r: number, mat: THREE.Material, x: number, y: number, z: number, detail?: number): THREE.Mesh {
  const m = new THREE.Mesh(
    geoCache('ico' + r + ',' + (detail || 1), () => new THREE.IcosahedronGeometry(r, detail || 1)),
    mat
  );
  m.position.set(x, y, z);
  return m;
}
/* Merge many small meshes into one mesh per material, so a furnished clinic stays fast. */
export function mergeByMaterial(group: THREE.Object3D): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  group.traverse(o => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(mesh.matrixWorld);
    const mat = mesh.material as THREE.Material,
      key = mat.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat, geos: [] });
    (buckets.get(key) as { geos: THREE.BufferGeometry[] }).geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    let n = 0;
    for (const g of b.geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of b.geos) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = !b.mat.transparent;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
export interface FloorRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  uv?: (px: number, py: number) => number[];
}
/* Flat quads lying on the floor (x0..x1, y0..y1 in plan metres) with world-space texture coordinates. */
export function floorQuads(rects: FloorRect[], y: number, uvSize: number[]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [];
  for (const r of rects) {
    const xs = [r.x0, r.x1],
      ys = [r.y0, r.y1];
    const P = [
      [xs[0], ys[0]],
      [xs[1], ys[0]],
      [xs[1], ys[1]],
      [xs[0], ys[0]],
      [xs[1], ys[1]],
      [xs[0], ys[1]]
    ];
    for (const [px, py] of P) {
      pos.push(wx(px), y, wz(py));
      nor.push(0, 1, 0);
      if (r.uv) uv.push(...r.uv(px, py));
      else uv.push(px / uvSize[0], py / uvSize[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
