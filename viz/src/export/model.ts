/* Builds the export model from the same plan, walls and furniture the 3D view uses. Each room becomes a group named after it. */
import * as THREE from 'three';
import type { PreparedPlan } from '../engine';
import { state } from '../state';
import { buildItem } from '../view3d/furniture';
import { r3 } from '../view3d/r3';
import { doorLeaves, floorMatFor, wallBoxes, type WallBoxes } from '../view3d/scene';
import { wx, wz } from '../view3d/coords';
import type { ExportMaterial, ExportModel, ExportNode, ExportPrimitive } from './glb';

export function concatF32(list: ArrayLike<number>[]): Float32Array {
  let n = 0;
  for (const a of list) n += a.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const a of list) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
export const FLOOR_EXPORT = {
  wood: '#c9a57a',
  vinyl: '#e6ece8',
  grey: '#dcdfe0',
  corridor: '#e4e1da',
  tile: '#e3eaee',
  carpet: '#b7ab99'
};
export const ITEM_NAMES: Record<string, string> = {
  chair: 'Chair',
  examTable: 'Exam table',
  stool: 'Stool',
  casework: 'Cabinets and sink',
  workstation: 'Workstation',
  counter: 'Reception counter',
  sinkCounter: 'Counter',
  shelf: 'Shelving',
  toilet: 'Toilet',
  basin: 'Basin',
  table: 'Table',
  kitchenette: 'Kitchenette',
  fridge: 'Fridge',
  plant: 'Plant',
  rug: 'Rug',
  cabinet: 'Cabinet',
  drawChair: 'Blood-draw chair',
  bin: 'Bin',
  bed: 'Hospital bed',
  screen: 'Privacy screen',
  fileCabinet: 'File cabinet',
  hamper: 'Linen hamper',
  procTable: 'Procedure table',
  cart: 'Cart',
  desk: 'Desk'
};
type StdMat = THREE.Material & { color: THREE.Color; metalness?: number; roughness?: number };
export function buildExportModel(): ExportModel {
  const R3 = r3(),
    P = state.P as PreparedPlan,
    m = P.m,
    mats: ExportMaterial[] = [],
    matIdx = new Map<string, number>(),
    meshes: ExportModel['meshes'] = [],
    nodes: (ExportNode & { children: number[] })[] = [];
  const matOf = (mat: StdMat, override?: string): number => {
    const c = override ? new THREE.Color(override) : mat.color,
      alpha = mat.transparent ? (mat.opacity == null ? 1 : mat.opacity) : 1;
    const metal = mat.metalness || 0,
      rough = mat.roughness == null ? 0.8 : mat.roughness;
    const key = [c.r, c.g, c.b, alpha, metal, rough].map(v => v.toFixed(3)).join('|');
    if (!matIdx.has(key)) {
      matIdx.set(key, mats.length);
      mats.push({
        name: 'Material ' + (mats.length + 1),
        color: [c.r, c.g, c.b],
        alpha,
        metallic: metal,
        roughness: rough
      });
    }
    return matIdx.get(key) as number;
  };
  const prims = (obj: THREE.Object3D, override?: string): ExportPrimitive[] => {
    obj.updateMatrixWorld(true);
    const by = new Map<number, THREE.BufferGeometry[]>();
    obj.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      const mi = matOf(mesh.material as StdMat, override);
      if (!by.has(mi)) by.set(mi, []);
      (by.get(mi) as THREE.BufferGeometry[]).push(g);
    });
    const out = [...by.entries()].map(([mi, gs]) => ({
      positions: concatF32(gs.map(g => g.attributes.position.array)),
      normals: concatF32(gs.map(g => g.attributes.normal.array)),
      material: mi
    }));
    by.forEach(gs => gs.forEach(g => g.dispose()));
    return out;
  };
  const node = (name: string, extra?: { mesh: number }): number => {
    nodes.push(Object.assign({ name, children: [] as number[] }, extra || {}));
    return nodes.length - 1;
  };
  const meshNode = (name: string, obj: THREE.Object3D, override?: string): number | null => {
    const pr = prims(obj, override);
    if (!pr.length) return null;
    meshes.push({ name, primitives: pr });
    return node(name, { mesh: meshes.length - 1 });
  };
  const root = node('Clinic');
  const roomNodes = m.rooms.map(r => {
    const n = node(r.label);
    nodes[root].children.push(n);
    return n;
  });
  m.rooms.forEach((r, k) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.02, r.h), R3.mat.white);
    g.position.set(wx(r.x + r.w / 2), 0.01, wz(r.y + r.h / 2));
    const kind = floorMatFor(r.type)[1],
      key = Object.keys(R3.tex).find(t => R3.tex[t] === kind) || 'vinyl';
    const fc =
      (
        {
          wood: FLOOR_EXPORT.wood,
          vinyl: FLOOR_EXPORT.vinyl,
          vinylGrey: FLOOR_EXPORT.grey,
          corridor: FLOOR_EXPORT.corridor,
          tile: FLOOR_EXPORT.tile,
          carpet: FLOOR_EXPORT.carpet
        } as Record<string, string>
      )[key] || FLOOR_EXPORT.vinyl;
    const n = meshNode(r.label + ' floor', g, fc);
    if (n != null) nodes[roomNodes[k]].children.push(n);
    g.geometry.dispose();
  });
  const counts: Record<string, number> = {};
  for (const it of P.furn.items) {
    const o = buildItem(it);
    if (!o) continue;
    const base = ITEM_NAMES[it.kind] || it.kind,
      key = it.room + ':' + base;
    counts[key] = (counts[key] || 0) + 1;
    const n = meshNode(base + ' ' + counts[key], o);
    if (n != null) nodes[roomNodes[it.room] != null ? roomNodes[it.room] : root].children.push(n);
  }
  const H = 2.7,
    boxes = wallBoxes(H),
    wallGroup = new THREE.Group();
  for (const key of Object.keys(boxes) as (keyof WallBoxes)[])
    for (const b of boxes[key]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.sx, b.y1 - b.y0, b.sz), R3.mat[key]);
      mesh.position.set(wx(b.x), (b.y0 + b.y1) / 2, wz(b.y));
      wallGroup.add(mesh);
    }
  const wn = meshNode('Walls, windows and frames', wallGroup);
  if (wn != null) nodes[root].children.push(wn);
  wallGroup.traverse(o => (o as THREE.Mesh).geometry && (o as THREE.Mesh).geometry.dispose());
  const doorGroup = new THREE.Group();
  for (const L of doorLeaves(H)) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(L.len, L.hgt, 0.04), R3.mat.door);
    leaf.position.set(wx(L.hx + (L.dx * L.len) / 2), L.hgt / 2 + 0.01, wz(L.hy + (L.dy * L.len) / 2));
    leaf.rotation.y = Math.atan2(L.dy, L.dx);
    doorGroup.add(leaf);
  }
  const dn = meshNode('Doors', doorGroup);
  if (dn != null) nodes[root].children.push(dn);
  doorGroup.traverse(o => (o as THREE.Mesh).geometry && (o as THREE.Mesh).geometry.dispose());
  const out: ExportNode[] = nodes;
  for (const nd of out) if (!(nd.children as number[]).length) delete nd.children;
  return { materials: mats, meshes, nodes: out, roots: [root] };
}
