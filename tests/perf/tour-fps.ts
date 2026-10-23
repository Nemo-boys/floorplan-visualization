/*
 * Frames per second during the guided tour (PLAN.md, Phase 7 gate: at least 30 on a laptop with integrated graphics).
 *
 *   tsx tests/perf/tour-fps.ts [baseUrl]      default http://localhost:5173/  (start it with: npm run dev)
 *
 * Uses the installed Google Chrome, once with WebGPU and once with it turned off, at 1440×900 and the screen's
 * pixel ratio of 1.5. Counts animation frames for 15 seconds while the tour plays.
 */
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:5173/';
const MODES: [string, string[]][] = [
  ['WebGPU', []],
  ['WebGPU off (WebGL2)', ['--disable-features=WebGPUService']]
];
let failed = false;
for (const [name, args] of MODES) {
  const browser = await chromium.launch({ channel: 'chrome', args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await page.goto(base + '#review');
  await page.waitForFunction(() => document.querySelector('#rendererBadge')?.textContent !== 'Starting');
  await page.waitForTimeout(1500);
  const badge = await page.locator('#rendererBadge').textContent();
  const r = (await page.evaluate(`(async () => {
    const F = window.__fi || window;
    F.startTour(0);
    const times = [];
    await new Promise(done => {
      const t0 = performance.now();
      const tick = t => { times.push(t); if (t - t0 < 15000) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    });
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    return { fps: (times.length - 1) / ((times[times.length - 1] - times[0]) / 1000), p95: gaps[Math.floor(gaps.length * 0.95)] };
  })()`)) as { fps: number; p95: number };
  const ok = r.fps >= 30;
  if (!ok) failed = true;
  console.log(
    (ok ? 'ok    ' : 'SLOW  ') +
      name.padEnd(22) +
      ' badge ' +
      String(badge).padEnd(7) +
      ' ' +
      r.fps.toFixed(1) +
      ' fps average, 95th percentile frame ' +
      r.p95.toFixed(1) +
      ' ms'
  );
  await browser.close();
}
process.exit(failed ? 1 : 0);
