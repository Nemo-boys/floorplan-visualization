#!/usr/bin/env node
/*
 * Screenshots of every state in PLAN.md (“Screenshot states”), for the reference or for the app.
 *
 *   node tools/capture-reference.mjs [baseUrl] [outDir]
 *     baseUrl  default http://localhost:5174/reference.html  (start it with: npm run reference)
 *     outDir   default tests/visual/reference
 *
 * Phase 0 turns this into tests/visual/capture.ts. The same states and steps are then captured from the app
 * (http://localhost:5173/) and compared. Needs Playwright with Chromium, and internet for the reference
 * (it loads three.js and the font from CDNs).
 *
 * Every step runs in the page through one helper, so it works for both targets:
 * the reference exposes page globals (state, tour, seek, ...), and the app exposes window.__fi in test builds.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:5174/reference.html';
const outDir = process.argv[3] || 'tests/visual/reference';
const VIEWPORTS = [
  { tag: 'desktop-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { tag: 'desktop-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { tag: 'phone-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true }
];
// Code that runs inside the page. F: functions, S: state, T: the tour object.
const inPage = body => '(() => { const F = window.__fi || window; const S = window.__fi ? window.__fi.state : state; const T = window.__fi ? window.__fi.tour : tour; ' + body + ' })()';
const FREEZE = inPage('S.playing = false; if (S.P && S.sim) F.seek(90);');
const STATES = [
  { name: 'import-empty', hash: 'import' },
  { name: 'import-loaded', hash: 'import', steps: [['click', '#openPipeline']] },
  { name: 'review', hash: 'review' },
  { name: 'review-dock-open', hash: 'review', steps: [['click', '#pdPill'], ['wait', 800]] },
  { name: 'review-room-card', hash: 'review', steps: [['click', '#pdPill'], ['wait', 800], ['click', '.plansvg .room[data-id="exam_room_3"]']] },
  { name: 'review-tour', hash: 'review', steps: [['eval', inPage('F.startTour(3); T.playing = false;')], ['wait', 900]] },
  { name: 'review-full-walls', hash: 'review', steps: [['click', '[data-walls="full"]']] },
  { name: 'edit-swap', hash: 'edit', steps: [['wait', 800], ['click', '.plansvg .room[data-id="nurse_station_1"]'], ['click', '.plansvg .room[data-id="exam_room_5"]']] },
  { name: 'edit-rename', hash: 'edit', steps: [['click', '[data-tool="rename"]'], ['wait', 800], ['click', '.plansvg .room[data-id="exam_room_1"]']] },
  { name: 'edit-furniture', hash: 'edit', steps: [['click', '[data-tool="furniture"]'], ['click', '[data-place="bed"]']] },
  { name: 'simulate-scenario', hash: 'simulate' },
  { name: 'simulate-custom', hash: 'simulate', steps: [['eval', inPage('F.loadPreset("custom");')]] },
  { name: 'simulate-results', hash: 'simulate', steps: [['eval', inPage('F.runScenarioNow();')]] },
  { name: 'simulate-results-flu', hash: 'simulate', steps: [['eval', inPage('F.loadPreset("flu"); F.runScenarioNow();')]] },
  { name: 'simulate-history', hash: 'simulate', steps: [['eval', inPage('F.runScenarioNow(); F.loadPreset("flu"); F.runScenarioNow(); F.setSimTab("history");')], ['check', '#historyList input[type="checkbox"]', 2], ['click', '#histCompare']] },
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

async function runStep(page, [kind, a, b]) {
  if (kind === 'click') await page.locator(a).first().click();
  else if (kind === 'wait') await page.waitForTimeout(a);
  else if (kind === 'eval') await page.evaluate(a);
  else if (kind === 'check') { const boxes = await page.locator(a).all(); for (const box of boxes.slice(0, b)) await box.check(); }
}

const browser = await chromium.launch();
const shots = [], failures = [];
fs.mkdirSync(outDir, { recursive: true });
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: vp.viewport, colorScheme: vp.colorScheme, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* no storage */ } });
  for (const st of STATES) {
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
      await page.screenshot({ path: path.join(outDir, file), mask: MASK.map(s => page.locator(s)) });
      shots.push({ vp: vp.tag, name: st.name, file });
    } catch (e) {
      failures.push(vp.tag + ' ' + st.name + ': ' + e.message.split('\n')[0]);
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
const sheet = '<!doctype html><meta charset="utf-8"><title>Screenshots</title><style>body{font:14px system-ui;margin:20px;background:#eef1ef}h2{margin:28px 0 8px}div{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0;background:#fff;padding:8px;border-radius:10px}img{display:block;max-width:420px;height:auto;border:1px solid #ccc}figcaption{margin-top:6px}</style>'
  + VIEWPORTS.map(vp => '<h2>' + vp.tag + '</h2><div>' + shots.filter(s => s.vp === vp.tag).map(s => '<figure><a href="' + s.file + '"><img src="' + s.file + '" alt="' + s.name + '"></a><figcaption>' + s.name + '</figcaption></figure>').join('') + '</div>').join('');
fs.writeFileSync(path.join(outDir, 'index.html'), sheet);
console.log(shots.length + ' screenshots in ' + outDir + (failures.length ? '\nFailed:\n  ' + failures.join('\n  ') : ''));
process.exit(failures.length ? 1 : 0);
