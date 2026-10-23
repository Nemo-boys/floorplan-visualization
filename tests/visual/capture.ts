/*
 * Screenshots of every state in PLAN.md (“Screenshot states”), for the reference or for the app.
 *
 *   tsx tests/visual/capture.ts [baseUrl] [outDir]
 *     baseUrl  default http://localhost:5174/reference.html  (start it with: npm run reference)
 *     outDir   default tests/visual/reference
 *   CAPTURE_ONLY=edit-swap,export  re-captures only those states and keeps the other shots already in outDir.
 *   CAPTURE_CHANNEL=chrome         uses the installed Google Chrome instead of Playwright's Chromium (for WebGPU).
 *   CAPTURE_ARGS="--disable-features=WebGPUService"  extra browser flags, separated by spaces.
 *   --chrome and --no-webgpu after the folders do the same as the two lines above (npm scripts on Windows can't set
 *   variables inline).
 *
 * Ported from tools/capture-reference.mjs: same states, steps, freeze and reference adjustments.
 * It also writes shots.json with each shot's 3D canvas rectangle, which compare.ts uses for the
 * looser in-canvas tolerance, and index.html, a contact sheet of all shots.
 *
 * Every step runs in the page through one helper, so it works for both targets:
 * the reference exposes page globals (state, tour, seek, ...), and the app exposes window.__fi in test builds.
 */
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export interface Viewport {
  tag: string;
  viewport: { width: number; height: number };
  colorScheme: 'light' | 'dark';
  isMobile?: boolean;
  hasTouch?: boolean;
}

// A click can name a point inside the element, as fractions of its box (default: the center).
export type Step =
  ['click', string, { fx: number; fy: number }?] | ['wait', number] | ['eval', string] | ['check', string, number];

export interface ShotState {
  name: string;
  hash: string;
  steps?: Step[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Shot {
  vp: string;
  name: string;
  file: string;
  canvas: Rect | null;
}

export const VIEWPORTS: Viewport[] = [
  { tag: 'desktop-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { tag: 'desktop-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { tag: 'phone-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true }
];

// Code that runs inside the page. F: functions, S: state, T: the tour object.
const inPage = (body: string): string =>
  '(() => { const F = window.__fi || window; const S = window.__fi ? window.__fi.state : state; const T = window.__fi ? window.__fi.tour : tour; ' +
  body +
  ' })()';
const FREEZE = inPage('S.playing = false; if (S.P && S.sim) F.seek(90);');

export const STATES: ShotState[] = [
  { name: 'import-empty', hash: 'import' },
  { name: 'import-loaded', hash: 'import', steps: [['click', '#openPipeline']] },
  { name: 'review', hash: 'review' },
  {
    name: 'review-dock-open',
    hash: 'review',
    steps: [
      ['click', '#pdPill'],
      ['wait', 800]
    ]
  },
  {
    name: 'review-room-card',
    hash: 'review',
    steps: [
      ['click', '#pdPill'],
      ['wait', 800],
      ['click', '.plansvg .room[data-id="exam_room_3"]']
    ]
  },
  {
    name: 'review-tour',
    hash: 'review',
    steps: [
      ['eval', inPage('F.startTour(3); T.playing = false;')],
      ['wait', 900]
    ]
  },
  { name: 'review-full-walls', hash: 'review', steps: [['click', '[data-walls="full"]']] },
  {
    name: 'edit-swap',
    hash: 'edit',
    steps: [
      ['wait', 800],
      ['click', '.plansvg .room[data-id="nurse_station_1"]'],
      // A nurse's dot sits on the center of exam_room_5 and takes the click, so click its upper-left quarter.
      ['click', '.plansvg .room[data-id="exam_room_5"]', { fx: 0.25, fy: 0.25 }]
    ]
  },
  {
    name: 'edit-rename',
    hash: 'edit',
    steps: [
      ['click', '[data-tool="rename"]'],
      ['wait', 800],
      ['click', '.plansvg .room[data-id="exam_room_1"]']
    ]
  },
  {
    name: 'edit-furniture',
    hash: 'edit',
    steps: [
      ['click', '[data-tool="furniture"]'],
      ['click', '[data-place="bed"]']
    ]
  },
  { name: 'simulate-scenario', hash: 'simulate' },
  { name: 'simulate-custom', hash: 'simulate', steps: [['eval', inPage('F.loadPreset("custom");')]] },
  { name: 'simulate-results', hash: 'simulate', steps: [['eval', inPage('F.runScenarioNow();')]] },
  {
    name: 'simulate-results-flu',
    hash: 'simulate',
    steps: [['eval', inPage('F.loadPreset("flu"); F.runScenarioNow();')]]
  },
  {
    name: 'simulate-history',
    hash: 'simulate',
    steps: [
      ['eval', inPage('F.runScenarioNow(); F.loadPreset("flu"); F.runScenarioNow(); F.setSimTab("history");')],
      ['check', '#historyList input[type="checkbox"]', 2],
      ['click', '#histCompare']
    ]
  },
  { name: 'compare-layouts', hash: 'simulate', steps: [['eval', inPage('F.runScenarioNow(); F.runCompare();')]] },
  { name: 'export', hash: 'export' },
  { name: 'assistant', hash: 'review', steps: [['click', '#assistantBtn']] }
];

// The reference still has the chat and the preview's download note. Before each screenshot of the reference,
// apply planned differences 1 and 2 (PLAN.md), so the shots show what the app should look like.
const ADJUST_REFERENCE = `(() => {
  if (window.__fi) return;
  const d = document.querySelector('#assistant');
  if (d) d.innerHTML = '<header><h2>Assistant</h2><button type="button" class="btn small ghost" id="chatClose">Close</button></header><p class="assistant-later">The assistant will be connected in a later version.</p>';
  if (!document.querySelector('#assistantLaterCss')) { const s = document.createElement('style'); s.id = 'assistantLaterCss'; s.textContent = '.assistant-later { margin: 0; padding: 16px 14px; color: var(--ink-2); font-size: 13.5px; }'; document.head.appendChild(s); }
  for (const sel of ['#askBigger', '#askWhy', '#exDlNote']) { const e = document.querySelector(sel); if (e) e.hidden = true; }
  document.querySelectorAll('[data-export]').forEach(b => { b.disabled = false; });
})()`;

// Times and dates change from run to run, so they are masked out of the screenshots.
const MASK = ['#historyList .hmain small:first-of-type', '#histCompareBox thead small', '#versions small'];

// The 3D canvas, if it is showing: compare.ts allows a looser tolerance inside it.
const CANVAS_RECT = `(() => {
  const c = document.querySelector('#view canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const x = Math.max(0, r.left), y = Math.max(0, r.top);
  const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
  return w > 0 && h > 0 && c.offsetParent !== null ? { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) } : null;
})()`;

async function runStep(page: Page, step: Step): Promise<void> {
  switch (step[0]) {
    case 'click': {
      const el = page.locator(step[1]).first();
      const at = step[2];
      const box = at ? await el.boundingBox() : null;
      await el.click(box && at ? { position: { x: box.width * at.fx, y: box.height * at.fy } } : {});
      break;
    }
    case 'wait':
      await page.waitForTimeout(step[1]);
      break;
    case 'eval':
      await page.evaluate(step[1]);
      break;
    case 'check': {
      const boxes = await page.locator(step[1]).all();
      for (const box of boxes.slice(0, step[2])) await box.check();
      break;
    }
  }
}

function contactSheet(shots: Shot[]): string {
  return (
    '<!doctype html><meta charset="utf-8"><title>Screenshots</title><style>body{font:14px system-ui;margin:20px;background:#eef1ef}h2{margin:28px 0 8px}div{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0;background:#fff;padding:8px;border-radius:10px}img{display:block;max-width:420px;height:auto;border:1px solid #ccc}figcaption{margin-top:6px}</style>' +
    VIEWPORTS.map(
      vp =>
        '<h2>' +
        vp.tag +
        '</h2><div>' +
        shots
          .filter(s => s.vp === vp.tag)
          .map(
            s =>
              '<figure><a href="' +
              s.file +
              '"><img src="' +
              s.file +
              '" alt="' +
              s.name +
              '"></a><figcaption>' +
              s.name +
              '</figcaption></figure>'
          )
          .join('') +
        '</div>'
    ).join('')
  );
}

async function main(): Promise<number> {
  const base = process.argv[2] || 'http://localhost:5174/reference.html';
  const outDir = process.argv[3] || 'tests/visual/reference';
  try {
    await fetch(base);
  } catch {
    console.error('Nothing is serving ' + base + '. Start it first (npm run reference, or npm run dev).');
    return 1;
  }
  const browser = await chromium.launch({
    channel: process.env.CAPTURE_CHANNEL || (process.argv.includes('--chrome') ? 'chrome' : undefined),
    args: (process.env.CAPTURE_ARGS || '')
      .split(' ')
      .filter(Boolean)
      .concat(process.argv.includes('--no-webgpu') ? ['--disable-features=WebGPUService'] : [])
  });
  const only = process.env.CAPTURE_ONLY ? process.env.CAPTURE_ONLY.split(',') : null;
  const manifest = path.join(outDir, 'shots.json');
  const kept: Shot[] =
    only && fs.existsSync(manifest)
      ? (JSON.parse(fs.readFileSync(manifest, 'utf8')) as Shot[]).filter(s => !only.includes(s.name))
      : [];
  const shots: Shot[] = [];
  const failures: string[] = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      colorScheme: vp.colorScheme,
      isMobile: !!vp.isMobile,
      hasTouch: !!vp.hasTouch,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce'
    });
    await context.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* no storage */
      }
    });
    for (const st of STATES.filter(s => !only || only.includes(s.name))) {
      const page = await context.newPage();
      const file = vp.tag + '--' + st.name + '.png';
      try {
        await page.goto(base + '#' + st.hash);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1200);
        for (const step of st.steps || []) await runStep(page, step);
        await page.evaluate(FREEZE);
        await page.evaluate(ADJUST_REFERENCE);
        await page.waitForTimeout(700);
        const canvas = (await page.evaluate(CANVAS_RECT)) as Rect | null;
        await page.screenshot({ path: path.join(outDir, file), mask: MASK.map(s => page.locator(s)) });
        shots.push({ vp: vp.tag, name: st.name, file, canvas });
      } catch (e) {
        failures.push(vp.tag + ' ' + st.name + ': ' + (e instanceof Error ? e.message : String(e)).split('\n')[0]);
      }
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  const order = (s: Shot): number =>
    VIEWPORTS.findIndex(v => v.tag === s.vp) * STATES.length + STATES.findIndex(t => t.name === s.name);
  const all = kept.concat(shots).sort((a, b) => order(a) - order(b));
  fs.writeFileSync(path.join(outDir, 'index.html'), contactSheet(all));
  fs.writeFileSync(manifest, JSON.stringify(all, null, 2) + '\n');
  console.log(
    shots.length + ' screenshots in ' + outDir + (failures.length ? '\nFailed:\n  ' + failures.join('\n  ') : '')
  );
  return failures.length ? 1 : 0;
}

process.exit(await main());
