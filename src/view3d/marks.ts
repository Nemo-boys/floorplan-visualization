/* Room highlights: the selected or toured room, rooms picked while editing, and the room under the pointer. */
import * as THREE from 'three';
import { clamp, type Room } from '../engine';
import { state } from '../state';
import { reduceMotion } from '../ui/dom';
import { themeColors } from '../ui/theme';
import { endTour } from './tour';
import { orbit, setView } from './cameras';
import { BOX } from './geometry';
import { R3, r3 } from './r3';
import { effectiveWalls } from './scene';
import { wx, wz } from './coords';

type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
export function highlightRoom(r: Room | null | undefined): void {
  if (!R3) return;
  const R = R3;
  if (!R.hl) {
    const g = new THREE.Group(),
      accent = themeColors().accent;
    const mat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95, depthWrite: false });
    const edges: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Mesh(BOX(), mat);
      e.renderOrder = 8;
      g.add(e);
      edges.push(e);
    }
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.14, depthWrite: false })
    );
    tint.rotation.x = -Math.PI / 2;
    tint.renderOrder = 7;
    g.add(tint);
    R.root.add(g);
    R.hl = g;
    R.hlParts = { edges, tint };
  }
  if (!r) {
    R.hl.visible = false;
    return;
  }
  const parts = R.hlParts as NonNullable<typeof R.hlParts>;
  const [n, s, w, e] = parts.edges,
    tint = parts.tint,
    cx = wx(r.x + r.w / 2),
    cz = wz(r.y + r.h / 2),
    th = 0.07,
    y = 0.035;
  n.scale.set(r.w, 0.02, th);
  n.position.set(cx, y, wz(r.y + r.h) + th / 2);
  s.scale.set(r.w, 0.02, th);
  s.position.set(cx, y, wz(r.y) - th / 2);
  w.scale.set(th, 0.02, r.h);
  w.position.set(wx(r.x) + th / 2, y, cz);
  e.scale.set(th, 0.02, r.h);
  e.position.set(wx(r.x + r.w) - th / 2, y, cz);
  tint.scale.set(r.w - 0.1, r.h - 0.1, 1);
  tint.position.set(cx, 0.016, cz);
  R.hl.visible = true;
}
export function focusRoom(r: Room | null | undefined): void {
  if (!R3 || !r) return;
  if (state.view !== 'orbit') {
    if (state.view === 'tour') endTour();
    else setView('orbit');
  }
  Object.assign(orbit.goal, {
    tx: wx(r.x + r.w / 2),
    tz: wz(r.y + r.h / 2),
    r: clamp(Math.max(r.w, r.h) * 2.4, 6, 18),
    phi: 0.8
  });
  highlightRoom(r);
}
export function markLabel(
  num: string | null | undefined,
  text: string,
  color: string
): { tex: THREE.CanvasTexture; aspect: number } {
  const fs = 30,
    h = 54,
    pad = 16,
    c = document.createElement('canvas'),
    m = c.getContext('2d') as CanvasRenderingContext2D;
  const font = '700 ' + fs + 'px "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif';
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width),
    circle = num ? h - 12 : 0,
    w = pad + (num ? circle + 10 : 0) + tw + pad,
    dpr = 2;
  c.width = w * dpr;
  c.height = h * dpr;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(dpr, dpr);
  const rr = h / 2;
  g.beginPath();
  g.moveTo(rr, 0);
  g.lineTo(w - rr, 0);
  g.arc(w - rr, rr, rr, -Math.PI / 2, Math.PI / 2);
  g.lineTo(rr, h);
  g.arc(rr, rr, rr, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  let x = pad;
  if (num) {
    g.beginPath();
    g.arc(x + circle / 2 - 4, h / 2, circle / 2, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(num, x + circle / 2 - 4, h / 2 + 1);
    x += circle + 6;
  }
  g.fillStyle = '#fff';
  g.font = font;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, x, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}
export function buildMark(
  r: Room,
  color: string,
  num: string | null | undefined,
  text: string | null | undefined,
  hover: boolean
): THREE.Group {
  const g = new THREE.Group(),
    cx = wx(r.x + r.w / 2),
    cz = wz(r.y + r.h / 2),
    col = new THREE.Color(color);
  const basic = (op: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
  const tint = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(0.2, r.w - 0.14), Math.max(0.2, r.h - 0.14)),
    basic(hover ? 0.18 : 0.32)
  );
  tint.rotation.x = -Math.PI / 2;
  tint.position.set(cx, 0.022, cz);
  tint.renderOrder = 7;
  g.add(tint);
  const H = effectiveWalls() === 'full' ? 2.62 : 1.14;
  if (!hover) {
    const vol = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.2, r.w - 0.18), H, Math.max(0.2, r.h - 0.18)),
      basic(0.1)
    );
    vol.position.set(cx, H / 2 + 0.02, cz);
    vol.renderOrder = 6;
    g.add(vol);
  }
  const edgeMat = basic(hover ? 0.7 : 1);
  for (const [y, th, hh] of hover
    ? [[0.045, 0.08, 0.05]]
    : [
        [0.05, 0.14, 0.07],
        [H + 0.03, 0.06, 0.04]
      ]) {
    const bars = [
      [r.w, th, cx, wz(r.y + r.h) + th / 2],
      [r.w, th, cx, wz(r.y) - th / 2],
      [th, r.h, wx(r.x) + th / 2, cz],
      [th, r.h, wx(r.x + r.w) - th / 2, cz]
    ];
    for (const [sx, sz, x, z] of bars) {
      const b = new THREE.Mesh(BOX(), edgeMat);
      b.scale.set(sx, hh, sz);
      b.position.set(x, y, z);
      b.renderOrder = 8;
      g.add(b);
    }
  }
  if (text) {
    const L = markLabel(num, text, color);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: L.tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false
      })
    );
    sp.scale.set(0.05 * L.aspect, 0.05, 1);
    sp.center.set(0.5, 0);
    sp.position.set(cx, H + 0.35, cz);
    sp.renderOrder = 30;
    g.add(sp);
  }
  g.userData = { tint, hover };
  return g;
}
export function disposeMark(g: THREE.Group | null | undefined): void {
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  g.traverse(o => {
    const d = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (d.geometry && d.geometry !== BOX()) d.geometry.dispose();
    if (d.material) {
      if (d.material.map) d.material.map.dispose();
      d.material.dispose();
    }
  });
}
export function disposeMarkMaterials(): void {
  if (!R3) return;
  if (R3.marks) for (const g of R3.marks.values()) disposeMark(g);
  if (R3.hoverMark) disposeMark(R3.hoverMark);
}
export interface RoomMark {
  id: string;
  color: string;
  num: string | null;
  text: string;
}
/* marks: [{ id, color, num, text }] */
export function setRoomMarks(list: RoomMark[]): void {
  if (!R3 || !state.P) return;
  const R = R3,
    P = state.P;
  if (!R.marks) R.marks = new Map();
  const marks = R.marks;
  const want = new Map(
    list.map(m => [m.id + '|' + m.color + '|' + (m.num || '') + '|' + m.text + '|' + effectiveWalls(), m])
  );
  for (const [k, g] of marks)
    if (!want.has(k)) {
      disposeMark(g);
      marks.delete(k);
    }
  for (const [k, m] of want) {
    if (marks.has(k)) continue;
    const r = P.m.rooms.find(q => q.id === m.id);
    if (!r) continue;
    const g = buildMark(r, m.color, m.num, m.text, false);
    R.root.add(g);
    marks.set(k, g);
  }
}
export function setHoverMark(r: Room | null, color?: string): void {
  if (!R3) return;
  const R = R3;
  const key = r ? r.id + '|' + color + '|' + effectiveWalls() : null;
  if (R.hoverKey === key) return;
  if (R.hoverMark) {
    disposeMark(R.hoverMark);
    R.hoverMark = null;
  }
  R.hoverKey = key;
  if (r && state.P) {
    R.hoverMark = buildMark(r, color as string, null, null, true);
    r3().root.add(R.hoverMark);
  }
}
export function pulseMarks(ts: number): void {
  if (!R3 || !R3.marks || !R3.marks.size) return;
  const k = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(ts / 280);
  for (const g of R3.marks.values()) (g.userData.tint as BasicMesh).material.opacity = 0.24 + 0.18 * k;
}
