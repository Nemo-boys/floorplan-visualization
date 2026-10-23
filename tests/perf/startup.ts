/*
 * Startup timing of the production build (PLAN.md, Phase 8: time to first render).
 *
 *   npm run build && npx vite preview --port 4173 --strictPort   (in another terminal)
 *   tsx tests/perf/startup.ts [appUrl] [referenceUrl]
 *       defaults: http://localhost:4173/ and http://localhost:5174/reference.html
 *
 * Uses the installed Google Chrome with an empty cache. Medians of 5 loads each:
 *   first paint     first-contentful-paint
 *   thumbnails      the three sample thumbnails on Import are drawn
 *   3D ready        on #review, the renderer badge shows the renderer and the 3D view has drawn a frame
 */
import { chromium, type Page } from '@playwright/test';

const app = process.argv[2] || 'http://localhost:4173/',
  ref = process.argv[3] || 'http://localhost:5174/reference.html';
const median = (v: number[]): number => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
const waitFor = (page: Page, fn: string): Promise<number> =>
  page.evaluate(
    '(async () => { while (!(' +
      fn +
      ')) await new Promise(r => requestAnimationFrame(r)); return performance.now(); })()'
  ) as Promise<number>;

async function measure(url: string): Promise<{ fcp: number; thumbs: number; ready3d: number; webgpu: boolean }> {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url + '#import');
  const thumbs = await waitFor(page, "document.querySelectorAll('#thumbA svg, #thumbB svg, #thumbC svg').length === 3");
  const fcp = (await page.evaluate(
    "performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0"
  )) as number;
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page2.goto(url + '#review');
  const ready3d = await waitFor(
    page2,
    "/WebGPU|WebGL2/.test(document.querySelector('#rendererBadge').textContent) && document.querySelector('#view canvas') && document.querySelector('#view canvas').width > 0 && document.querySelector('#planName').textContent === 'Primary care clinic'"
  );
  const webgpu = (await page2.locator('#rendererBadge').textContent()) === 'WebGPU';
  await browser.close();
  return { fcp, thumbs, ready3d, webgpu };
}
for (const [name, url] of [
  ['app (production build)', app],
  ['reference', ref]
]) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await measure(url));
  console.log(
    name.padEnd(24) +
      'first paint ' +
      median(runs.map(r => r.fcp)).toFixed(0) +
      ' ms, thumbnails ' +
      median(runs.map(r => r.thumbs)).toFixed(0) +
      ' ms, 3D ready ' +
      median(runs.map(r => r.ready3d)).toFixed(0) +
      ' ms (' +
      (runs[0].webgpu ? 'WebGPU' : 'WebGL2') +
      ')'
  );
}
