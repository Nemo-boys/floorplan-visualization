/* Procedural canvas textures for the equipment faces. Drawn once per page, shared by every instance. Each
   face has a colour map and, where something glows, an emissive map that is black except for the lights. */
import * as THREE from 'three';
import type { Cooling } from '../engine/types';

export interface Face {
  map: THREE.Texture;
  emissive?: THREE.Texture;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// deterministic pseudo-random so textures look the same every load
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* Rack front: perforated doors over servers, with status LEDs. AI racks show compute trays and a switch
   block in the middle (the NVLink spine of an NVL72-class rack). */
export function rackFront(kind: Cooling): Face {
  const W = 128;
  const H = 512;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, W, H);
  g.fillStyle = '#17181b';
  g.fillRect(0, 0, W, H);
  const r = rng(kind.length * 97);
  const units = kind === 'liquid' ? 48 : 42;
  const uh = (H - 24) / units;
  for (let u = 0; u < units; u++) {
    const y = 12 + u * uh;
    const isSwitch = kind === 'liquid' && u >= 20 && u < 29;
    const blank = kind !== 'liquid' && r() < 0.12;
    g.fillStyle = blank ? '#121315' : isSwitch ? '#26282d' : '#1e2024';
    g.fillRect(8, y + 0.6, W - 16, uh - 1.2);
    if (blank) continue;
    // perforation
    g.fillStyle = isSwitch ? '#33363c' : '#2a2d32';
    for (let x = 30; x < W - 12; x += 4) g.fillRect(x, y + 2, 2, Math.max(1, uh - 4));
    // LEDs
    const led = isSwitch ? '#4cc2ff' : r() < 0.06 ? '#ffb340' : '#38e07b';
    const n = isSwitch ? 6 : 2;
    for (let k = 0; k < n; k++) {
      const lx = isSwitch ? 34 + k * 14 : 13 + k * 6;
      eg.fillStyle = led;
      eg.fillRect(lx, y + uh / 2 - 1, 3, 2);
      g.fillStyle = led;
      g.fillRect(lx, y + uh / 2 - 1, 3, 2);
    }
  }
  // door frame
  g.strokeStyle = '#2e3035';
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  // top light bar
  eg.fillStyle = kind === 'liquid' ? '#3aa0ff' : '#e8eef7';
  eg.fillRect(10, 5, W - 20, 3);
  return { map: tex(c), emissive: tex(ec) };
}

export function rackBack(): Face {
  const W = 128;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#141518';
  g.fillRect(0, 0, W, H);
  const r = rng(7);
  const colors = ['#2f6fdc', '#e2b23a', '#d9534f', '#6b6f78', '#3fae6b'];
  for (let x = 16; x < W - 12; x += 7) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = 0.55;
    g.fillRect(x, 20, 3, H - 40);
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#2a2c30';
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  return { map: tex(c) };
}

/* Air handler: light cabinet with three fans and a small display. */
export function crahFront(): Face {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#e9ebee';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 3; i++) {
    const cy = 100 + i * 140;
    g.fillStyle = '#c9cdd3';
    g.beginPath();
    g.arc(128, cy, 58, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9aa0a8';
    g.lineWidth = 2;
    for (let rr = 14; rr < 58; rr += 9) {
      g.beginPath();
      g.arc(128, cy, rr, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#7d838c';
    g.beginPath();
    g.arc(128, cy, 10, 0, Math.PI * 2);
    g.fill();
  }
  const [ec, eg] = canvas(256, 512);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 256, 512);
  eg.fillStyle = '#3d8bfd';
  eg.fillRect(96, 20, 64, 14);
  g.fillStyle = '#3d8bfd';
  g.fillRect(96, 20, 64, 14);
  return { map: tex(c), emissive: tex(ec) };
}

/* CDU: steel cabinet with a teal status screen and pipe flanges. */
export function cduFront(): Face {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#d6dadf';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#c3c8ce';
  g.fillRect(16, 140, 224, 340);
  g.strokeStyle = '#a9afb7';
  g.lineWidth = 3;
  for (let y = 160; y < 470; y += 18) {
    g.beginPath();
    g.moveTo(26, y);
    g.lineTo(230, y);
    g.stroke();
  }
  const [ec, eg] = canvas(256, 512);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 256, 512);
  for (const ctx of [g, eg]) {
    ctx.fillStyle = '#13c2c2';
    ctx.fillRect(40, 40, 120, 60);
  }
  g.fillStyle = '#0b3d3d';
  g.font = 'bold 22px sans-serif';
  g.fillText('CDU', 70, 78);
  return { map: tex(c), emissive: tex(ec) };
}

/* UPS / battery / switchgear / power panel fronts. */
export function cabinetFront(base: string, accent: string, kind: 'ups' | 'battery' | 'switchgear' | 'pdu'): Face {
  const [c, g] = canvas(256, 256);
  const [ec, eg] = canvas(256, 256);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const doors = kind === 'switchgear' ? 4 : kind === 'pdu' ? 1 : 3;
  const dw = 256 / doors;
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 3;
  for (let i = 0; i < doors; i++) g.strokeRect(i * dw + 4, 6, dw - 8, 244);
  for (let i = 0; i < doors; i++) {
    const x = i * dw + dw / 2;
    if (kind === 'ups' && i === 0) {
      for (const ctx of [g, eg]) {
        ctx.fillStyle = accent;
        ctx.fillRect(x - 22, 40, 44, 26);
      }
    } else if (kind === 'battery') {
      for (const ctx of [g, eg]) {
        ctx.fillStyle = accent;
        for (let k = 0; k < 4; k++) ctx.fillRect(x - 14 + k * 8, 30, 4, 4);
      }
    } else if (kind === 'switchgear') {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 3; k++) g.fillRect(x - 16, 50 + k * 60, 32, 20);
      eg.fillStyle = accent;
      eg.fillRect(x - 3, 30, 6, 6);
      g.fillStyle = accent;
      g.fillRect(x - 3, 30, 6, 6);
    } else if (kind === 'pdu') {
      for (const ctx of [g, eg]) {
        ctx.fillStyle = accent;
        ctx.fillRect(x - 30, 30, 60, 8);
      }
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let k = 0; k < 6; k++) g.fillRect(x - 28, 70 + k * 26, 56, 12);
    }
    // vents
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 150; y < 236; y += 8) g.fillRect(i * dw + 18, y, dw - 36, 3);
  }
  return { map: tex(c), emissive: tex(ec) };
}

/* Generator container side: ribbed steel. */
export function containerSide(base: string): Face {
  const [c, g] = canvas(512, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 10) {
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(x, 0, 4, 128);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + 5, 0, 3, 128);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 512, 6);
  g.fillRect(0, 122, 512, 6);
  return { map: tex(c) };
}

/* Dry cooler top: a row of fans. */
export function fanTop(count: number): Face {
  const [c, g] = canvas(128, 128 * count);
  g.fillStyle = '#c4c9cf';
  g.fillRect(0, 0, 128, 128 * count);
  for (let i = 0; i < count; i++) {
    const cy = 64 + i * 128;
    g.fillStyle = '#2a2d31';
    g.beginPath();
    g.arc(64, cy, 54, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6f757d';
    g.lineWidth = 2;
    for (let rr = 12; rr < 54; rr += 8) {
      g.beginPath();
      g.arc(64, cy, rr, 0, Math.PI * 2);
      g.stroke();
    }
    g.save();
    g.translate(64, cy);
    g.fillStyle = '#555b63';
    for (let b = 0; b < 5; b++) {
      g.rotate((Math.PI * 2) / 5);
      g.beginPath();
      g.ellipse(24, 0, 22, 7, 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  return { map: tex(c) };
}

/* Raised-floor tiles, 600 mm, with the occasional perforated tile. Repeats per metre * 1/0.6. */
export function floorTiles(dark: boolean): THREE.Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = dark ? '#24272c' : '#eef0f3';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = dark ? '#33373d' : '#d5d9de';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* Temperature ramp: cool blue -> green -> amber -> red. */
export function heatColor(tC: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [18, [0.22, 0.48, 0.98]],
    [23, [0.2, 0.75, 0.75]],
    [26, [0.35, 0.82, 0.38]],
    [29, [1.0, 0.75, 0.2]],
    [33, [1.0, 0.35, 0.18]],
    [40, [0.85, 0.08, 0.22]]
  ];
  if (tC <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (tC <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (tC - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return stops[stops.length - 1][1];
}
