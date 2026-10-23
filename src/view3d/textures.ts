/* ---------- Textures drawn in the browser (no image downloads) ---------- */
import * as THREE from 'three';
import { mulberry32 } from '../engine';
import { R3 } from './r3';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const ctx = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d') as CanvasRenderingContext2D;
export function texFrom(c: HTMLCanvasElement, sx?: number, sy?: number, repeat?: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = R3 ? R3.aniso : 1;
  t.userData.size = [sx || 1, sy || 1];
  return t;
}
export function woodTex(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512),
    g = ctx(c),
    rnd = mulberry32(11),
    pw = 512 / 12;
  for (let r = 0; r < 12; r++) {
    let x = -rnd() * 320;
    while (x < 512) {
      const len = 170 + rnd() * 260,
        b = 194 + rnd() * 24;
      g.fillStyle = 'rgb(' + Math.round(b + 24) + ',' + Math.round(b + 3) + ',' + Math.round(b - 34) + ')';
      g.fillRect(x, r * pw, len, pw);
      g.globalAlpha = 0.08;
      g.strokeStyle = '#6b4a2a';
      g.lineWidth = 1;
      for (let q = 0; q < 6; q++) {
        const yy = r * pw + 3 + rnd() * (pw - 6);
        g.beginPath();
        g.moveTo(x, yy);
        g.bezierCurveTo(
          x + len * 0.3,
          yy + (rnd() - 0.5) * 5,
          x + len * 0.7,
          yy + (rnd() - 0.5) * 5,
          x + len,
          yy + (rnd() - 0.5) * 3
        );
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(90,60,30,0.32)';
      g.fillRect(x, r * pw, 1.4, pw);
      x += len;
    }
    g.fillStyle = 'rgba(90,60,30,0.26)';
    g.fillRect(0, r * pw, 512, 1.2);
  }
  return texFrom(c, 2.4, 2.4);
}
export function speckleTex(
  base: string,
  specks: string[],
  size: number,
  tiles?: number,
  grout?: string
): THREE.CanvasTexture {
  const c = makeCanvas(256, 256),
    g = ctx(c),
    rnd = mulberry32(5);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let q = 0; q < 2200; q++) {
    g.fillStyle = specks[(rnd() * specks.length) | 0];
    g.globalAlpha = 0.18 + rnd() * 0.32;
    const s = 0.6 + rnd() * 1.5;
    g.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  g.globalAlpha = 1;
  if (tiles) {
    g.strokeStyle = grout as string;
    g.lineWidth = 1.4;
    for (let q = 0; q <= tiles; q++) {
      const p = (q * 256) / tiles;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, 256);
      g.moveTo(0, p);
      g.lineTo(256, p);
      g.stroke();
    }
  }
  return texFrom(c, size, size);
}
export function carpetTex(): THREE.CanvasTexture {
  const c = makeCanvas(256, 256),
    g = ctx(c),
    rnd = mulberry32(9);
  for (let ty = 0; ty < 4; ty++)
    for (let tx = 0; tx < 4; tx++) {
      const b = 150 + rnd() * 14;
      g.fillStyle = 'rgb(' + Math.round(b + 22) + ',' + Math.round(b + 16) + ',' + Math.round(b + 6) + ')';
      g.fillRect(tx * 64, ty * 64, 64, 64);
      for (let q = 0; q < 380; q++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,50,40,0.12)';
        g.fillRect(tx * 64 + rnd() * 64, ty * 64 + rnd() * 64, 1.2, 1.2);
      }
    }
  return texFrom(c, 2.0, 2.0);
}
export function gradientTex(stops: [number, string][], w: number, h: number, vertical?: boolean): HTMLCanvasElement {
  const c = makeCanvas(w, h),
    g = ctx(c),
    gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  return c;
}
export function chevronTex(): THREE.CanvasTexture {
  const c = makeCanvas(128, 64),
    g = ctx(c);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(34, 10);
  g.lineTo(64, 32);
  g.lineTo(34, 54);
  g.lineTo(46, 54);
  g.lineTo(76, 32);
  g.lineTo(46, 10);
  g.closePath();
  g.fill();
  const t = texFrom(c, 1, 1);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
export function labelTex(name: string, sub: string): THREE.CanvasTexture {
  const c = makeCanvas(512, 168),
    g = ctx(c);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(30,42,54,0.82)';
  g.font = '700 62px "Atkinson Hyperlegible", system-ui, sans-serif';
  g.fillText(name, 256, 62, 500);
  g.fillStyle = 'rgba(30,42,54,0.6)';
  g.font = '400 42px "Atkinson Hyperlegible", system-ui, sans-serif';
  g.fillText(sub, 256, 126, 500);
  return texFrom(c, 1, 1, false);
}
