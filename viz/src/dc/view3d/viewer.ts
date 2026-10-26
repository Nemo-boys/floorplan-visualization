/* The 3D view. One InstancedMesh per kind of equipment (thousands of racks in a handful of draw calls),
   frames drawn only when something changes, WebGPU when the browser has it and WebGL2 otherwise.

   World axes: x east, y up, z south (plan y north becomes -z). Metres. The site is centred on the origin. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { chooseRenderer, type AnyRenderer } from '../../view3d/renderer';
import type { Design, Equip, EquipKind, Rect, Room, RoomType } from '../engine/types';
import { colorFor, type LensData } from '../ui/lens';
import {
  cabinetFront,
  containerSide,
  crahFront,
  cduFront,
  fanTop,
  floorTiles,
  heatColor,
  rackBack,
  rackFront,
  type Face
} from './textures';

export type Preset = 'overview' | 'inside' | 'top';
export interface Viewer {
  el: HTMLElement;
  ready: Promise<string>; // renderer kind
  setDesign(d: Design): void;
  setLens(data: LensData): void;
  select(id: string | null): void;
  preset(p: Preset): void;
  zoom(factor: number): void;
  setTheme(dark: boolean): void;
  setInsets(i: Insets): void;
  invalidate(): void;
}
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const WALL_H = 3.4;
const FLOOR_T = 0.08;

const ZONE: Partial<Record<RoomType, [string, string]>> = {
  // [light, dark]
  data_hall: ['#f4f6f9', '#22262c'],
  ups_room: ['#f6f1e7', '#2a2620'],
  battery_room: ['#f6f1e7', '#2a2620'],
  electrical_room: ['#f6f1e7', '#2a2620'],
  mechanical_room: ['#eef3f3', '#1f2727'],
  corridor: ['#fbfbfc', '#26272a'],
  generator_yard: ['#d9dad6', '#1a1b1c'],
  cooling_yard: ['#d9dad6', '#1a1b1c']
};
const SUPPORT: [string, string] = ['#f1f1f3', '#242427'];

type Mat = THREE.MeshStandardMaterial;
const std = (p: THREE.MeshStandardMaterialParameters): Mat => new THREE.MeshStandardMaterial(p);
const face = (f: Face, extra: THREE.MeshStandardMaterialParameters = {}): Mat =>
  std({
    map: f.map,
    emissiveMap: f.emissive ?? null,
    emissive: f.emissive ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
    emissiveIntensity: f.emissive ? 1.6 : 0,
    roughness: 0.55,
    metalness: 0.2,
    ...extra
  });

// face textures are drawn once per page and shared by every design
const faces = new Map<string, Face>();
const cached = (key: string, make: () => Face): Face => {
  let f = faces.get(key);
  if (!f) faces.set(key, (f = make()));
  return f;
};

/* Box faces in BoxGeometry order: +x, -x, +y (top), -y, +z (front), -z (back). */
function boxMaterials(kind: EquipKind, d: Design): Mat[] {
  const side = (color: string, metal = 0.3, rough = 0.5) => std({ color, metalness: metal, roughness: rough });
  const six = (s: Mat, top: Mat, front: Mat, back: Mat) => [s, s, top, s, front, back];
  switch (kind) {
    case 'rack': {
      const s = side('#1b1c1f', 0.55, 0.42);
      return six(s, side('#232428', 0.5, 0.5), face(cached(`rack-${d.profile.key}`, () => rackFront(d.profile.key)), { metalness: 0.4, roughness: 0.45 }), face(cached('rack-back', rackBack)));
    }
    case 'cdu': {
      const s = side('#cfd4da', 0.4, 0.4);
      return six(s, s, face(cached('cdu', cduFront)), s);
    }
    case 'crah': {
      const s = side('#e3e6ea', 0.2, 0.5);
      return six(s, s, face(cached('crah', crahFront)), s);
    }
    case 'pdu': {
      const s = side('#3a3c40', 0.4, 0.5);
      return six(s, s, face(cached('pdu', () => cabinetFront('#3a3c40', '#ffb340', 'pdu'))), s);
    }
    case 'ups': {
      const s = side('#eceef1', 0.15, 0.5);
      return six(s, s, face(cached('ups', () => cabinetFront('#eceef1', '#30d158', 'ups'))), s);
    }
    case 'battery': {
      const s = side('#2b2e33', 0.3, 0.5);
      return six(s, s, face(cached('battery', () => cabinetFront('#2b2e33', '#30d158', 'battery'))), s);
    }
    case 'switchgear': {
      const s = side('#b9bec5', 0.35, 0.45);
      return six(s, s, face(cached('switchgear', () => cabinetFront('#b9bec5', '#ff453a', 'switchgear'))), s);
    }
    case 'generator': {
      const s = face(cached('container', () => containerSide('#6b7a90')), { metalness: 0.4, roughness: 0.5 });
      return six(s, side('#5e6b80', 0.4, 0.55), s, s);
    }
    case 'transformer': {
      const s = side('#8e949c', 0.5, 0.45);
      return six(s, s, s, s);
    }
    case 'drycooler': {
      const s = side('#b8bec6', 0.45, 0.4);
      return six(s, face(cached('fans', () => fanTop(4)), { metalness: 0.3 }), s, s);
    }
  }
}

const unitBox = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
})();

const FACING_ROT: Record<string, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

interface KindMesh {
  mesh: THREE.InstancedMesh;
  ids: string[];
  normal: Mat[];
}

export function createViewer(onPick: (kind: 'room' | 'equip', id: string | null) => void, onHover?: (label: string | null) => void): Viewer {
  const el = document.createElement('div');
  el.className = 'viewer';
  const labels = document.createElement('div');
  labels.className = 'labels';
  el.append(labels);

  let renderer: AnyRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 3000);
  let controls: OrbitControls | null = null;
  let dirty = true;
  let dark = false;
  let design: Design | null = null;
  let siteSize = 100;
  let center = { x: 0, y: 0 };
  const root = new THREE.Group();
  scene.add(root);
  let disposables: { dispose(): void }[] = [];
  const kinds = new Map<EquipKind, KindMesh>();
  const byId = new Map<string, { kind: EquipKind; index: number; e: Equip }>();
  const roomMeshes: THREE.Mesh[] = [];
  let heatGroup: THREE.Group | null = null;
  let powerGroup: THREE.Group | null = null;
  let trays: THREE.InstancedMesh | null = null;
  let trayIds: ('A' | 'B')[] = [];
  const lensMat = std({ color: '#ffffff', roughness: 0.6, metalness: 0.05 });
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(unitBox),
    new THREE.LineBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.95, depthTest: false })
  );
  highlight.renderOrder = 10;
  highlight.visible = false;
  scene.add(highlight);
  const hoverBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(unitBox),
    new THREE.LineBasicMaterial({ color: 0x8e8e93, transparent: true, opacity: 0.8, depthTest: false })
  );
  hoverBox.renderOrder = 9;
  hoverBox.visible = false;
  scene.add(hoverBox);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), std({ color: '#e8e8eb', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const W = (x: number) => (x - center.x) / 1000;
  const Z = (y: number) => -(y - center.y) / 1000;
  const invalidate = () => (dirty = true);

  // ---------- startup ----------
  const ready = (async () => {
    const choice = await chooseRenderer();
    renderer = choice.renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.prepend(renderer.domElement);
    scene.environment = choice.pmrem(new RoomEnvironment(), 0.04);
    scene.environmentIntensity = 0.55;
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2;
    controls.screenSpacePanning = false;
    controls.addEventListener('change', invalidate);
    bindPointer(renderer.domElement);
    new ResizeObserver(resize).observe(el);
    resize();
    applyTheme();
    requestAnimationFrame(loop);
    return choice.kind;
  })();

  function resize() {
    if (!renderer) return;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    // shift the picture so the model centres in the space the floating cards leave free
    const ins = w > 860 ? insets : { left: 0, right: 0, top: 0, bottom: 0 };
    camera.setViewOffset(w, h, (ins.right - ins.left) / 2, (ins.bottom - ins.top) / 2, w, h);
    camera.updateProjectionMatrix();
    invalidate();
  }
  let insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

  /* Camera distance that fits the whole site in the free part of the view. */
  function fitDistance(): number {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    const ins = w > 860 ? insets : { left: 0, right: 0, top: 0, bottom: 0 };
    const freeW = Math.max(200, w - ins.left - ins.right);
    const freeH = Math.max(200, h - ins.top - ins.bottom);
    const r = design ? Math.hypot(design.site.w, design.site.h) / 2000 : 60;
    const fovV = (camera.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * (freeW / freeH));
    const dV = r / Math.tan((fovV * (freeH / h)) / 2);
    const dH = r / Math.tan(fovH / 2);
    return Math.max(dV, dH) * 0.82;
  }
  const OVERVIEW_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
  function hallsCentre(): THREE.Vector3 {
    if (!design || !design.rows.length) return new THREE.Vector3();
    const xs = design.rows.flatMap((r) => [r.rect.x, r.rect.x + r.rect.w]);
    const ys = design.rows.flatMap((r) => [r.rect.y, r.rect.y + r.rect.h]);
    return new THREE.Vector3(W((Math.min(...xs) + Math.max(...xs)) / 2), 0, Z((Math.min(...ys) + Math.max(...ys)) / 2));
  }

  // ---------- camera moves ----------
  let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number; dur: number } | null = null;
  function fly(pos: THREE.Vector3, target: THREE.Vector3, dur = 900) {
    if (!controls) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) dur = 0;
    tween = { from: camera.position.clone(), to: pos, tFrom: controls.target.clone(), tTo: target, t0: performance.now(), dur };
    invalidate();
  }
  function stepTween(now: number): boolean {
    if (!tween || !controls) return false;
    const k = tween.dur ? Math.min(1, (now - tween.t0) / tween.dur) : 1;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.from, tween.to, e);
    controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
    if (k >= 1) tween = null;
    return true;
  }
  function preset(p: Preset) {
    if (!design) return;
    if (p === 'overview') fly(OVERVIEW_DIR.clone().multiplyScalar(fitDistance()), new THREE.Vector3(0, 0, 0));
    else if (p === 'top') fly(new THREE.Vector3(0, fitDistance() * 1.05, 0.01), new THREE.Vector3(0, 0, 0));
    else {
      // stand at the west end of the first cold aisle and look down it
      const aisle = design.aisles.find((a) => a.kind === 'cold');
      if (!aisle) return;
      const r = aisle.rect;
      const y = Z(r.y + r.h / 2);
      fly(new THREE.Vector3(W(r.x) - 1.2, 1.65, y + 0.0), new THREE.Vector3(W(r.x + r.w), 1.3, y));
    }
  }
  function zoom(f: number) {
    if (!controls) return;
    const dir = camera.position.clone().sub(controls.target);
    fly(controls.target.clone().add(dir.multiplyScalar(f)), controls.target.clone(), 350);
  }

  // ---------- render loop ----------
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (!renderer || !controls) return;
    const visible = el.isConnected && el.offsetParent !== null;
    if (!visible) return;
    const moving = stepTween(now);
    const changed = controls.update();
    if (dirty || moving || changed) {
      dirty = false;
      renderer.render(scene, camera);
      placeLabels();
    }
  }

  // ---------- labels ----------
  let labelItems: { el: HTMLElement; p: THREE.Vector3 }[] = [];
  function placeLabels() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    const v = new THREE.Vector3();
    const dist = camera.position.distanceTo(controls!.target);
    const showAll = dist < siteSize * 0.9;
    const inside = camera.position.y < WALL_H + 2;
    labels.style.display = inside ? 'none' : '';
    if (inside) return;
    labelItems.forEach((l, i) => {
      v.copy(l.p).project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && (showAll || i < 12);
      l.el.style.display = on ? '' : 'none';
      if (on) l.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`;
    });
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hit(ev: PointerEvent): { kind: 'room' | 'equip'; id: string } | null {
    if (!renderer) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets: THREE.Object3D[] = [...[...kinds.values()].map((k) => k.mesh), ...roomMeshes];
    const hits = ray.intersectObjects(targets, false);
    for (const h of hits) {
      const km = [...kinds.values()].find((k) => k.mesh === h.object);
      if (km && h.instanceId !== undefined) return { kind: 'equip', id: km.ids[h.instanceId] };
      const id = h.object.userData.roomId as string | undefined;
      if (id) return { kind: 'room', id };
    }
    return null;
  }
  function boxFor(target: THREE.LineSegments, id: string | null) {
    target.visible = false;
    if (!id || !design) return;
    const item = byId.get(id);
    if (item) {
      const e = item.e;
      const along = e.facing === 'E' || e.facing === 'W';
      target.position.set(W(e.x + e.w / 2), 0, Z(e.y + e.h / 2));
      target.rotation.set(0, 0, 0);
      target.scale.set((along ? e.h : e.w) / 1000 + 0.06, e.height / 1000 + 0.06, (along ? e.w : e.h) / 1000 + 0.06);
      if (along) target.rotation.y = Math.PI / 2;
      target.visible = true;
      return;
    }
    const room = design.rooms.find((r) => r.id === id);
    if (room) {
      target.position.set(W(room.x + room.w / 2), 0, Z(room.y + room.h / 2));
      target.rotation.set(0, 0, 0);
      target.scale.set(room.w / 1000, room.outdoor ? 0.3 : WALL_H + 0.05, room.h / 1000);
      target.visible = true;
    }
  }
  function bindPointer(canvas: HTMLCanvasElement) {
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
    canvas.addEventListener('pointerup', (ev) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      down = null;
      const h = hit(ev);
      onPick(h?.kind ?? 'room', h?.id ?? null);
    });
    canvas.addEventListener('dblclick', (ev) => {
      const h = hit(ev as PointerEvent);
      if (!h || !controls) return;
      const item = byId.get(h.id);
      const room = design?.rooms.find((r) => r.id === h.id);
      const rect: Rect | undefined = item?.e ?? room;
      if (!rect) return;
      const t = new THREE.Vector3(W(rect.x + rect.w / 2), item ? 1 : 0, Z(rect.y + rect.h / 2));
      const span = Math.max(rect.w, rect.h) / 1000;
      const dir = camera.position.clone().sub(controls.target).normalize();
      fly(t.clone().add(dir.multiplyScalar(Math.max(6, span * 1.6))), t);
    });
    let pending = false;
    canvas.addEventListener('pointermove', (ev) => {
      if (pending || ev.buttons) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const h = hit(ev);
        canvas.style.cursor = h ? 'pointer' : '';
        boxFor(hoverBox, h?.kind === 'equip' ? h.id : null);
        onHover?.(h ? (byId.get(h.id)?.e.label ?? design?.rooms.find((r) => r.id === h.id)?.name ?? null) : null);
        invalidate();
      });
    });
    canvas.addEventListener('pointerleave', () => {
      hoverBox.visible = false;
      onHover?.(null);
      invalidate();
    });
  }

  // ---------- building the scene ----------
  function clear() {
    root.clear();
    disposables.forEach((d) => d.dispose());
    disposables = [];
    kinds.clear();
    byId.clear();
    roomMeshes.length = 0;
    labels.replaceChildren();
    labelItems = [];
    heatGroup = null;
    powerGroup = null;
    trays = null;
  }
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  function roomColor(t: RoomType): string {
    const c = ZONE[t] ?? SUPPORT;
    return dark ? c[1] : c[0];
  }

  function buildFloors(d: Design) {
    d.rooms.forEach((r) => {
      const geo = track(new THREE.BoxGeometry(r.w / 1000, FLOOR_T, r.h / 1000));
      const isHall = r.type === 'data_hall';
      const mat = track(
        std({
          color: isHall ? '#ffffff' : roomColor(r.type),
          roughness: r.outdoor ? 0.95 : 0.8,
          map: isHall ? track(tiles(r)) : null
        })
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(W(r.x + r.w / 2), r.outdoor ? -FLOOR_T / 2 + 0.01 : FLOOR_T / 2, Z(r.y + r.h / 2));
      m.receiveShadow = true;
      m.userData.roomId = r.id;
      m.userData.roomType = r.type;
      root.add(m);
      roomMeshes.push(m);
    });
    // aisle tints
    const tint = (kind: 'cold' | 'hot') => {
      const list = d.aisles.filter((a) => a.kind === kind);
      if (!list.length) return;
      const mat = track(
        new THREE.MeshBasicMaterial({ color: kind === 'cold' ? 0x3d8bfd : 0xff6b4a, transparent: true, opacity: dark ? 0.22 : 0.13, depthWrite: false })
      );
      const geo = track(new THREE.PlaneGeometry(1, 1));
      geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((a, i) => {
        m4.compose(
          new THREE.Vector3(W(a.rect.x + a.rect.w / 2), FLOOR_T + 0.006, Z(a.rect.y + a.rect.h / 2)),
          new THREE.Quaternion(),
          new THREE.Vector3(a.rect.w / 1000, 1, a.rect.h / 1000)
        );
        im.setMatrixAt(i, m4);
      });
      im.renderOrder = 1;
      root.add(im);
    };
    tint('cold');
    tint('hot');
  }

  function tiles(r: Room): THREE.Texture {
    const t = floorTiles(dark);
    t.repeat.set(r.w / 600, r.h / 600);
    return t;
  }

  /* Walls along every room edge, merged where rooms share an edge, with gaps for doors. */
  function buildWalls(d: Design) {
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
    const boxes: { x: number; y: number; w: number; h: number; t: number }[] = [];
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
    const mat = track(std({ color: dark ? '#4a4a50' : '#fdfdfd', roughness: 0.85 }));
    const im = new THREE.InstancedMesh(unitBox, mat, boxes.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    boxes.forEach((bx, i) => {
      const horizontal = bx.h === 0;
      const len = (horizontal ? bx.w : bx.h) / 1000 + bx.t / 1000;
      const cx = horizontal ? bx.x + bx.w / 2 : bx.x;
      const cy = horizontal ? bx.y : bx.y + bx.h / 2;
      m4.compose(
        new THREE.Vector3(W(cx), 0, Z(cy)),
        q,
        new THREE.Vector3(horizontal ? len : bx.t / 1000, WALL_H, horizontal ? bx.t / 1000 : len)
      );
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    root.add(im);
    // lintels over the doors, so openings read as doorways rather than slots
    const DOOR_H = 2.6;
    const lint = new THREE.InstancedMesh(unitBox, mat, d.doors.length);
    d.doors.forEach((dr, i) => {
      const t = dr.rooms[1] === 'outside' ? 0.35 : 0.18;
      const along = dr.axis === 'x';
      m4.compose(
        new THREE.Vector3(W(dr.x), DOOR_H, Z(dr.y)),
        q,
        new THREE.Vector3(along ? dr.width / 1000 : t, WALL_H - DOOR_H, along ? t : dr.width / 1000)
      );
      lint.setMatrixAt(i, m4);
    });
    lint.castShadow = true;
    lint.computeBoundingSphere();
    root.add(lint);
  }

  function buildEquipment(d: Design) {
    const groups = new Map<EquipKind, Equip[]>();
    d.equipment.forEach((e) => {
      if (!groups.has(e.kind)) groups.set(e.kind, []);
      groups.get(e.kind)!.push(e);
    });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    groups.forEach((list, kind) => {
      const mats = boxMaterials(kind, d);
      mats.forEach((m) => track(m));
      const im = new THREE.InstancedMesh(unitBox, mats, list.length);
      list.forEach((e, i) => {
        const along = e.facing === 'E' || e.facing === 'W';
        const width = (along ? e.h : e.w) / 1000;
        const depth = (along ? e.w : e.h) / 1000;
        const inset = kind === 'rack' || kind === 'cdu' ? 0.008 : 0.02; // hairline gap so neighbours read as separate units
        q.setFromAxisAngle(yAxis, FACING_ROT[e.facing]);
        m4.compose(
          new THREE.Vector3(W(e.x + e.w / 2), FLOOR_T + (kind === 'drycooler' ? 0.6 : 0), Z(e.y + e.h / 2)),
          q,
          new THREE.Vector3(width - inset * 2, e.height / 1000, depth - inset)
        );
        im.setMatrixAt(i, m4);
        byId.set(e.id, { kind, index: i, e });
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      root.add(im);
      kinds.set(kind, { mesh: im, ids: list.map((e) => e.id), normal: mats });
    });
  }

  /* Glass cold-aisle containment, overhead busway trays, and coolant pipes for liquid designs. */
  function buildOverhead(d: Design) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const colds = d.aisles.filter((a) => a.kind === 'cold');
    if (colds.length) {
      const glass = track(
        std({ color: '#cfe6ff', transparent: true, opacity: dark ? 0.16 : 0.22, roughness: 0.05, metalness: 0, depthWrite: false })
      );
      const frame = track(std({ color: dark ? '#5a5f68' : '#c7ccd3', metalness: 0.6, roughness: 0.35 }));
      const roof = new THREE.InstancedMesh(unitBox, glass, colds.length);
      const doors = new THREE.InstancedMesh(unitBox, glass, colds.length * 2);
      const rails = new THREE.InstancedMesh(unitBox, frame, colds.length * 2);
      colds.forEach((a, i) => {
        const r = a.rect;
        const cx = W(r.x + r.w / 2);
        const cz = Z(r.y + r.h / 2);
        const len = r.w / 1000;
        m4.compose(new THREE.Vector3(cx, 2.36, cz), q, new THREE.Vector3(len, 0.02, r.h / 1000));
        roof.setMatrixAt(i, m4);
        [-1, 1].forEach((s, k) => {
          m4.compose(new THREE.Vector3(cx + (s * len) / 2, FLOOR_T, cz), q, new THREE.Vector3(0.03, 2.3, r.h / 1000));
          doors.setMatrixAt(i * 2 + k, m4);
          m4.compose(new THREE.Vector3(cx, 2.36, cz + (s * r.h) / 2000), q, new THREE.Vector3(len, 0.05, 0.05));
          rails.setMatrixAt(i * 2 + k, m4);
        });
      });
      [roof, doors].forEach((m) => {
        m.renderOrder = 2;
        m.computeBoundingSphere();
        root.add(m);
      });
      rails.computeBoundingSphere();
      root.add(rails);
    }
    // busway trays, one per power path, above each row
    const sides: ('A' | 'B')[] = d.basis.powerRedundancy === '2N' ? ['A', 'B'] : ['A'];
    const trayMat = track(std({ color: '#d4b25a', metalness: 0.6, roughness: 0.35 }));
    trays = new THREE.InstancedMesh(unitBox, trayMat, d.rows.length * sides.length);
    trayIds = [];
    d.rows.forEach((row, i) => {
      sides.forEach((s, k) => {
        const off = (k - (sides.length - 1) / 2) * 0.32;
        m4.compose(
          new THREE.Vector3(W(row.rect.x + row.rect.w / 2), 2.95, Z(row.rect.y + row.rect.h / 2) + off),
          q,
          new THREE.Vector3(row.rect.w / 1000, 0.08, 0.22)
        );
        trays!.setMatrixAt(i * sides.length + k, m4);
        trayIds.push(s);
      });
    });
    trays.computeBoundingSphere();
    root.add(trays);
    // coolant pipes behind liquid-cooled rows
    if (d.profile.liquidShare > 0) {
      const pipeGeo = track(new THREE.CylinderGeometry(0.07, 0.07, 1, 12));
      pipeGeo.rotateZ(Math.PI / 2);
      const make = (color: string, offset: number) => {
        const mat = track(std({ color, metalness: 0.5, roughness: 0.3 }));
        const im = new THREE.InstancedMesh(pipeGeo, mat, d.rows.length);
        d.rows.forEach((row, i) => {
          const back = row.facing === 'N' ? row.rect.y - 150 : row.rect.y + row.rect.h + 150;
          m4.compose(new THREE.Vector3(W(row.rect.x + row.rect.w / 2), 2.45 + offset, Z(back)), q, new THREE.Vector3(row.rect.w / 1000, 1, 1));
          im.setMatrixAt(i, m4);
        });
        im.computeBoundingSphere();
        root.add(im);
      };
      make('#2f7cf6', 0);
      make('#e5484d', 0.18);
    }
  }

  function buildLabels(d: Design) {
    const rooms = d.rooms.filter((r) => r.type !== 'corridor' && (r.w * r.h) / 1e6 > 40);
    // halls and yards first: they stay visible when zoomed out
    rooms.sort((a, b) => Number(b.type === 'data_hall' || b.outdoor) - Number(a.type === 'data_hall' || a.outdoor));
    labelItems = rooms.map((r) => {
      const l = document.createElement('div');
      l.className = 'label3d';
      l.textContent = r.name;
      labels.append(l);
      return { el: l, p: new THREE.Vector3(W(r.x + r.w / 2), r.outdoor ? 0.6 : WALL_H + 0.6, Z(r.y + r.h / 2)) };
    });
  }

  function setDesign(d: Design) {
    const first = !design;
    const s0 = design ? siteSize : 0;
    design = d;
    center = { x: d.site.w / 2, y: d.site.h / 2 };
    siteSize = Math.max(d.site.w, d.site.h) / 1000;
    clear();
    buildFloors(d);
    buildWalls(d);
    buildEquipment(d);
    buildOverhead(d);
    buildLabels(d);
    ground.scale.setScalar(siteSize * 4);
    // the sun from the south-east, shadow frustum hugging the site
    sun.position.set(siteSize * 0.35, siteSize * 0.8, siteSize * 0.45);
    sun.target.position.set(0, 0, 0);
    const half = siteSize * 0.62;
    const sc = sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = siteSize * 3;
    sc.updateProjectionMatrix();
    camera.far = siteSize * 12;
    camera.updateProjectionMatrix();
    if (controls) controls.maxDistance = siteSize * 3;
    scene.fog = new THREE.Fog(dark ? 0x0b0b0c : 0xf2f2f4, siteSize * 2.2, siteSize * 6);
    highlight.visible = false;
    hoverBox.visible = false;
    if (first) {
      // open on the halls: they are what the brief asked for
      const t = hallsCentre();
      camera.position.copy(OVERVIEW_DIR).multiplyScalar(fitDistance() * 0.62).add(t);
      controls?.target.copy(t);
    } else if (s0 && Math.abs(s0 - siteSize) > 1) preset('overview');
    if (lastLens) setLens(lastLens);
    invalidate();
  }

  // ---------- lenses ----------
  let lastLens: LensData | null = null;
  function setLens(data: LensData) {
    lastLens = data;
    if (!design) return;
    const ghost = new THREE.Color(dark ? 0x2c2c30 : 0xd8d9dc);
    const c = new THREE.Color();
    kinds.forEach((km) => {
      const cols = km.ids.map((id) => colorFor(byId.get(id)!.e, data));
      const plain = cols.every((x) => x === null);
      if (plain) {
        km.mesh.material = km.normal;
        if (km.mesh.instanceColor) {
          for (let i = 0; i < km.ids.length; i++) km.mesh.setColorAt(i, c.setRGB(1, 1, 1));
          km.mesh.instanceColor.needsUpdate = true;
        }
        return;
      }
      km.mesh.material = lensMat;
      cols.forEach((col, i) => {
        if (col === 'ghost' || col === null) c.copy(ghost);
        else c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
        km.mesh.setColorAt(i, c);
      });
      km.mesh.instanceColor!.needsUpdate = true;
    });
    // trays light up by power path in the power lens
    if (trays) {
      const pa = new THREE.Color().setRGB(1, 0.66, 0.12, THREE.SRGBColorSpace);
      const pb = new THREE.Color().setRGB(0.62, 0.45, 1, THREE.SRGBColorSpace);
      trayIds.forEach((s, i) => trays!.setColorAt(i, data.lens === 'power' ? (s === 'A' ? pa : pb) : c.setRGB(1, 1, 1)));
      trays.instanceColor!.needsUpdate = true;
      (trays.material as Mat).emissive.set(data.lens === 'power' ? 0x332200 : 0x000000);
    }
    buildHeat(data);
    buildPowerPaths(data);
    invalidate();
  }

  function buildHeat(data: LensData) {
    if (heatGroup) {
      root.remove(heatGroup);
      heatGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
      });
      heatGroup = null;
    }
    if (data.lens !== 'heat' || !data.thermal) return;
    heatGroup = new THREE.Group();
    data.thermal.halls.forEach((f) => {
      const cv = document.createElement('canvas');
      cv.width = f.nx;
      cv.height = f.ny;
      const g = cv.getContext('2d')!;
      const img = g.createImageData(f.nx, f.ny);
      for (let j = 0; j < f.ny; j++) {
        for (let i = 0; i < f.nx; i++) {
          const [r, gg, b] = heatColor(f.temps[j * f.nx + i]);
          const k = ((f.ny - 1 - j) * f.nx + i) * 4; // canvas rows go down, plan rows go up
          img.data[k] = r * 255;
          img.data[k + 1] = gg * 255;
          img.data[k + 2] = b * 255;
          img.data[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.LinearFilter;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(f.room.w / 1000, f.room.h / 1000),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.78, depthWrite: false })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(W(f.room.x + f.room.w / 2), FLOOR_T + 0.02, Z(f.room.y + f.room.h / 2));
      plane.renderOrder = 3;
      heatGroup!.add(plane);
    });
    root.add(heatGroup);
  }

  /* In the power lens, glowing feeders from each UPS room to every hall's power panels. */
  function buildPowerPaths(data: LensData) {
    if (powerGroup) {
      root.remove(powerGroup);
      powerGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      powerGroup = null;
    }
    if (data.lens !== 'power' || !design) return;
    const d = design;
    powerGroup = new THREE.Group();
    const corridor = d.rooms.find((r) => r.id === 'corridor_1');
    if (!corridor) return;
    const y = 4.9;
    const sides: ('A' | 'B')[] = d.basis.powerRedundancy === '2N' ? ['A', 'B'] : ['A'];
    const halls = d.rooms.filter((r) => r.type === 'data_hall' && d.rows.some((row) => row.hall === r.id));
    sides.forEach((s, k) => {
      const ups = d.rooms.find((r) => r.id === `ups_${s}`);
      if (!ups) return;
      const lost = data.report.pools.find((p) => p.id === `power_${s}`)?.capacityKw === 0;
      const mat = new THREE.MeshBasicMaterial({ color: lost ? 0xff453a : s === 'A' ? 0xffa91f : 0x9e73ff });
      const off = (k - 0.5) * 0.6;
      const cy = corridor.y + corridor.h / 2;
      const pts: THREE.Vector3[][] = [];
      const ux = W(ups.x + ups.w / 2) + off;
      halls.forEach((h) => {
        const rows = d.rows.filter((r) => r.hall === h.id);
        const px = W(rows[0].rect.x + rows[0].rect.w) + 0.5 + off;
        const top = Math.max(...rows.map((r) => r.rect.y + r.rect.h));
        pts.push([
          new THREE.Vector3(ux, y, Z(ups.y + ups.h / 2)),
          new THREE.Vector3(ux, y, Z(cy) + off),
          new THREE.Vector3(px, y, Z(cy) + off),
          new THREE.Vector3(px, y, Z(top))
        ]);
      });
      pts.forEach((path) => {
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i];
          const b = path[i + 1];
          const len = a.distanceTo(b);
          if (len < 0.01) continue;
          const geo = new THREE.BoxGeometry(0.22, 0.22, len);
          const m = new THREE.Mesh(geo, mat);
          m.position.copy(a).add(b).multiplyScalar(0.5);
          m.lookAt(b);
          powerGroup!.add(m);
        }
      });
    });
    root.add(powerGroup);
  }

  function select(id: string | null) {
    boxFor(highlight, id);
    invalidate();
  }

  function applyTheme() {
    scene.background = new THREE.Color(dark ? 0x0b0b0c : 0xf2f2f4);
    (ground.material as Mat).color.set(dark ? '#111113' : '#dedfe3');
    hemi.intensity = dark ? 0.35 : 0.55;
    sun.intensity = dark ? 1.3 : 2.0;
    scene.environmentIntensity = dark ? 0.3 : 0.55;
    if (scene.fog) (scene.fog as THREE.Fog).color.set(dark ? 0x0b0b0c : 0xf2f2f4);
    invalidate();
  }
  function setTheme(next: boolean) {
    if (next === dark) return;
    dark = next;
    applyTheme();
    if (design) setDesign(design); // floors and walls take theme colours
  }

  if (import.meta.env.DEV) (window as unknown as { __dc: unknown }).__dc = { camera, scene, get controls() { return controls; }, get renderer() { return renderer; }, invalidate, kinds, byId };
  return {
    el,
    ready,
    setDesign,
    setLens,
    select,
    preset,
    zoom,
    setTheme,
    setInsets: (i) => {
      insets = i;
      resize();
    },
    invalidate
  };
}
