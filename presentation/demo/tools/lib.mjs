// Shared helpers for scripted screen recordings: a visible cursor, smooth moves, human typing.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export const BASE = process.env.APP_URL || 'http://127.0.0.1:8000';
export const W = 1920, H = 1080;

const CURSOR_JS = `
(() => {
  if (window.__cursorOn) return; window.__cursorOn = true;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l14 8-6.2 1.6L9.6 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none',
      transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
    document.documentElement.appendChild(c);
    document.addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX - 6) + 'px,' + (e.clientY - 4) + 'px)'; }, true);
    document.addEventListener('mousedown', e => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 22) + 'px', top: (e.clientY - 22) + 'px', width: '44px', height: '44px',
        borderRadius: '50%', background: 'rgba(10,132,255,.28)', border: '2px solid rgba(10,132,255,.65)', zIndex: 2147483646,
        pointerEvents: 'none', transform: 'scale(.3)', opacity: '1', transition: 'transform .45s ease-out, opacity .45s ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.3)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

export async function open({ video, dir = 'out', dark = false } = {}) {
  // On a machine with a GPU, Chrome runs the app on WebGPU. In a GPU-less container set FI_SOFTWARE_GL=1: headless
  // WebGPU on SwiftShader fails on large buffers, so that path hides navigator.gpu and the app falls back to WebGL2.
  const soft = process.env.FI_SOFTWARE_GL === '1';
  const args = ['--hide-scrollbars', '--ignore-gpu-blocklist', ...(soft ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--enable-unsafe-webgpu'])];
  const headless = process.env.HEADED !== '1';
  const browser = await chromium.launch({ headless, args, ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}) });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light',
    ...(video ? { recordVideo: { dir, size: { width: W, height: H } } } : {})
  });
  await ctx.addInitScript(CURSOR_JS);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch {} });
  if (soft) await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  page.__pos = { x: W / 2, y: H / 2 };
  return { browser, ctx, page };
}

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function moveTo(page, x, y, ms = 700) {
  const { x: x0, y: y0 } = page.__pos;
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    await page.mouse.move(x0 + (x - x0) * t, y0 + (y - y0) * t);
    await page.waitForTimeout(ms / steps);
  }
  page.__pos = { x, y };
}

export async function center(page, sel) {
  const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export async function click(page, sel, { ms = 700, pause = 250 } = {}) {
  const p = await center(page, sel);
  await moveTo(page, p.x, p.y, ms);
  await page.waitForTimeout(pause);
  await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
}

export async function type(page, text, delay = 38) {
  for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(delay + Math.random() * 30); }
}

export async function drag(page, from, to, ms = 1400, button = 'left') {
  await moveTo(page, from.x, from.y, 500);
  await page.mouse.down({ button });
  await moveTo(page, to.x, to.y, ms);
  await page.mouse.up({ button });
}

export const wait = (page, ms) => page.waitForTimeout(ms);

// High-quality capture: CDP screencast frames (JPEG q95) with their timestamps, joined by ffmpeg at 30 fps.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export async function startCapture(page, outFile) {
  const dir = outFile + '.frames';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const name = String(frames.length).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(dir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return async function stop({ trimStart = 0 } = {}) {
    await page.waitForTimeout(300);
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    if (frames.length < 2) throw new Error('no frames captured for ' + outFile);
    const t0 = frames[0].t + trimStart;
    const list = frames.filter(f => f.t >= t0);
    let txt = '';
    for (let i = 0; i < list.length; i++) {
      const d = i + 1 < list.length ? Math.max(0.001, list[i + 1].t - list[i].t) : 0.5;
      txt += `file '${list[i].name}'\nduration ${d.toFixed(4)}\n`;
    }
    txt += `file '${list[list.length - 1].name}'\n`;
    fs.writeFileSync(path.join(dir, 'list.txt'), txt);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', outFile]);
    fs.rmSync(dir, { recursive: true, force: true });
    return outFile;
  };
}
