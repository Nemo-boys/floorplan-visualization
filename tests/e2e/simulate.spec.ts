/* Simulate: the builder (drag and drop, timeline, presets, checks), runs, ranges, history and scenario files.
   Runs against the app, or the reference with E2E_TARGET=reference. Expected numbers come from tests/golden. */
import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isReference = process.env.E2E_TARGET === 'reference';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
interface Spread {
  mean: number;
  lo: number;
  hi: number;
}
interface Run {
  days: { seed: number; avgWait: number; p90Wait: number }[];
  summary: Record<string, Spread>;
  typical_seed: number;
  fire_days: Record<string, number>;
  verdict: { title: string; bottleneck: string; bottleneck_util: number };
}
const golden = JSON.parse(fs.readFileSync(path.join(root, 'tests/golden/engine-golden.json'), 'utf8')) as {
  scenario_runs: Record<string, Run>;
};
/* The reference's own formatters (engine.js fmtMin, fmtClock; simui.js fmtN, fmtKm, rng). */
const fmtMin = (v: number): string => (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' min';
const fmtN = (v: number): string => String(Math.round(v));
const fmtKm = (v: number): string => v.toFixed(1) + ' km';
const fmtClock = (min: number): string => {
  const total = Math.round(480 + min),
    h24 = Math.floor(total / 60) % 24,
    mm = total % 60,
    h = ((h24 + 11) % 12) + 1;
  return h + ':' + String(mm).padStart(2, '0') + (h24 < 12 ? ' am' : ' pm');
};
const rng = (x: Spread, f: (v: number) => string): string =>
  f(x.mean) + (Math.abs(x.hi - x.lo) > 1e-9 ? f(x.lo) + ' to ' + f(x.hi) : '');
const call = (page: Page, body: string): Promise<unknown> =>
  page.evaluate('(() => { const F = window.__fi || window; ' + body + ' })()');
const toast = (page: Page): Locator => page.locator('#toast');
const card = (page: Page, i: number): Locator => page.locator('.bcard').nth(i);

async function open(page: Page): Promise<void> {
  await page.goto('#simulate');
  await expect(page.locator('#app')).toHaveClass(/sim-scenario/);
  await expect(page.locator('#chkStatus')).toContainText('Ready to run');
}
/* Press, move past the 6 px threshold in steps, and release, as a person dragging would. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const b = await from.boundingBox();
  if (!b) throw new Error('nothing to drag');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 10, b.y + b.height / 2 + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('drag a palette block into its section', async ({ page }) => {
  await open(page);
  const sec = page.locator('.bsec[data-group="timeline"]');
  await expect(sec.locator('.bcard')).toHaveCount(2);
  await sec.locator('.bcard').last().scrollIntoViewIfNeeded();
  const last = await sec.locator('.bcard').last().boundingBox();
  if (!last) throw new Error('no card');
  // Below the middle of the last card: the block goes at the end of the section.
  await drag(page, page.locator('.pchip[data-add="group"]'), { x: last.x + 60, y: last.y + last.height * 0.8 });
  await expect(sec.locator('.bcard')).toHaveCount(3);
  await expect(sec.locator('.bcard').last().locator('.bt b')).toHaveText('Group arrival');
  await expect(sec.locator('header .cnt')).toHaveText('3');
  await expect(page.locator('.dragghost')).toHaveCount(0);
  await expect(page.locator('#presetRow .preset.on em')).toHaveText('edited');
});

test('reorder a card within its section', async ({ page }) => {
  await open(page);
  const sec = page.locator('.bsec[data-group="visits"]');
  const names = sec.locator('.bcard .bsum');
  await expect(names.first()).toHaveText('Quick follow-up: 25%, 8–12 min');
  // Fold the three visit types so they fit on screen together, as a person would.
  for (let i = 0; i < 3; i++) await sec.locator('.bcard').nth(i).locator('[data-act="fold"]').click();
  // Centre them, away from the canvas edges where dragging scrolls the canvas.
  await sec
    .locator('.bcard')
    .nth(1)
    .evaluate(el => el.scrollIntoView({ block: 'center' }));
  const first = await sec.locator('.bcard').first().boundingBox();
  if (!first) throw new Error('no card');
  await drag(page, sec.locator('.bcard').nth(2).locator('.grip'), { x: first.x + 60, y: first.y + first.height * 0.3 });
  await expect(names.first()).toHaveText('Long visit: 15%, 30–40 min');
  await expect(names.nth(1)).toHaveText('Quick follow-up: 25%, 8–12 min');
});

test('move and resize a timeline bar, and the card fields follow', async ({ page }) => {
  await open(page);
  // The nurses' break, 12:00 to 2:00 pm on an 8:00 am to 6:00 pm day.
  const bar = page.locator('#dayTimeline .tl-bar.soft').first();
  const id = (await bar.getAttribute('data-id')) as string;
  const track = await page.locator('#dayTimeline .tl-lane[data-lane="staff"] .tl-track').boundingBox();
  const box = await bar.boundingBox();
  if (!track || !box) throw new Error('no timeline');
  const hour = track.width / 10;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + hour / 2, y, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + hour, y, { steps: 4 });
  await expect(page.locator('#tlTip')).toHaveText('1:00 pm to 3:00 pm');
  await page.mouse.up();
  await expect(page.locator('#tlTip')).toBeHidden();
  await expect(page.locator('#f_' + id + '_from')).toHaveValue('13:00');
  await expect(page.locator('#f_' + id + '_to')).toHaveValue('15:00');
  // Stretch the right edge by half an hour.
  const right = page.locator('#dayTimeline .tl-bar[data-id="' + id + '"] [data-h="r"]');
  const rb = await right.boundingBox();
  if (!rb) throw new Error('no edge');
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + hour / 4, rb.y + rb.height / 2, { steps: 3 });
  await page.mouse.move(rb.x + rb.width / 2 + hour / 2, rb.y + rb.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('#f_' + id + '_to')).toHaveValue('15:30');
  await expect(page.locator('.bcard[data-id="' + id + '"] .bsum')).toHaveText(
    'Nurses take 30 min between 1:00 pm and 3:30 pm, one at a time'
  );
});

test('load a preset over edits, then Undo', async ({ page }) => {
  await open(page);
  await page.locator('#scnName').fill('My Tuesday');
  await expect(page.locator('#presetRow .preset.on em')).toHaveText('edited');
  await page.locator('#presetRow [data-preset="short"]').click();
  await expect(toast(page)).toContainText('Loaded “Short-staffed day”. Your edits were replaced.');
  await expect(page.locator('#scnName')).toHaveValue('Short-staffed day');
  await page.locator('#toastAct').click();
  await expect(page.locator('#scnName')).toHaveValue('My Tuesday');
  await expect(page.locator('#presetRow [data-preset="normal"]')).toHaveAttribute('aria-pressed', 'true');
});

test('errors block the Run button', async ({ page }) => {
  await open(page);
  await call(page, 'F.loadPreset("custom");');
  await expect(page.locator('#chkStatus')).toHaveClass(/bad/);
  await expect(page.locator('#chkStatus b')).toHaveText('4 problems to fix');
  await expect(page.locator('#runBtn')).toBeDisabled();
  await expect(page.locator('#sweepBtn')).toBeDisabled();
  await page.locator('#chkList li').first().locator('button').click();
  await call(page, 'F.addBlock("shift"); F.addBlock("shift"); F.addBlock("shift"); F.addBlock("appointments");');
  await expect(page.locator('#chkStatus b')).toHaveText('Ready to run');
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(card(page, 2).locator('.bsum')).toHaveText('3 providers, 8:00 am to 6:00 pm');
  await expect(card(page, 3).locator('.bsum')).toHaveText('2 nurses, 8:00 am to 6:00 pm');
});

test('Normal Tuesday on layout A matches the golden summary', async ({ page }) => {
  await open(page);
  await page.locator('#runBtn').click();
  await expect(page.locator('#app')).toHaveClass(/sim-results/, { timeout: 60000 });
  const g = golden.scenario_runs['A/normal-tuesday'],
    a = g.summary,
    typical = g.days.find(d => d.seed === g.typical_seed) as Run['days'][0];
  await expect(page.locator('.rmeta')).toHaveText('Normal Tuesday20 days on Primary care clinic, version 1');
  await expect(page.locator('.verdict .vt')).toHaveText(g.verdict.title);
  await expect(page.locator('.verdict p')).toHaveText(
    'On a typical day the average wait is ' +
      fmtMin(typical.avgWait) +
      ', and 1 in 10 patients wait more than ' +
      fmtMin(typical.p90Wait) +
      '. Across 20 days, average waits ranged from ' +
      fmtMin(a.avgWait.lo) +
      ' to ' +
      fmtMin(a.avgWait.hi) +
      '.' +
      (a.notSeen.mean >= 0.05
        ? ' On average ' +
          (a.notSeen.mean < 1 ? 'less than 1 patient was' : fmtN(a.notSeen.mean) + ' patients were') +
          ' still waiting when the staff went home.'
        : '')
  );
  await expect(page.locator('.rsec h3').first()).toHaveText('Busiest: ' + g.verdict.bottleneck);
  const tiles = [
    'Patients seen' + rng(a.seen, fmtN),
    'Average wait' + rng(a.avgWait, fmtMin),
    '1 in 10 waited over' + rng(a.p90Wait, fmtMin),
    'Time in the clinic' + rng(a.avgTime, fmtMin),
    'Walking per nurse' + rng(a.nurseKm, fmtKm),
    'Last patient leaves' + fmtClock(a.lastExit.mean)
  ]
    .concat(a.noShows.mean > 0 ? ['No-shows' + rng(a.noShows, fmtN)] : [])
    .concat(a.turnedAway.mean > 0 ? ['Walk-ins turned away' + rng(a.turnedAway, fmtN)] : [])
    .concat(a.notSeen.mean > 0 ? ['Not seen before staff left' + rng(a.notSeen, fmtN)] : []);
  await expect(page.locator('.rgrid > div')).toHaveText(tiles);
  if (!isReference) await expect(page.locator('#askWhy')).toBeHidden();
  await expect(page.locator('#histCount')).toHaveText('1');
  await expect(page.locator('#playNote')).toHaveText('The 3D plays the typical day from this run.');
});

test('Flu-season Monday’s rule fires on 18 of 20 days', async ({ page }) => {
  await open(page);
  const g = golden.scenario_runs['A/flu-season-monday'];
  expect(Object.values(g.fire_days)).toEqual([18]);
  await call(page, 'F.loadPreset("flu"); F.runScenarioNow();');
  await expect(page.locator('.rules li')).toHaveText(
    'Fired on 18 of 20 days. When the line at reception is more than 3 for 10 min, call in 1 receptionist for 240 min'
  );
  await expect(page.locator('.verdict .vt')).toHaveText(g.verdict.title);
});

test('a range run, then a history comparison', async ({ page }) => {
  await open(page);
  await page.locator('.sweep summary').click();
  await expect(page.locator('#swValues')).toHaveValue('1, 2, 3');
  await page.locator('#sweepBtn').click();
  await expect(page.locator('#app')).toHaveClass(/sim-results/, { timeout: 90000 });
  await expect(page.locator('.rmeta')).toContainText('Normal Tuesday: nurses 1, 2, 3');
  await expect(page.locator('.rsec h3', { hasText: 'Nurses, compared' })).toBeVisible();
  await expect(page.locator('.cmp.small tbody tr th')).toHaveText(['1', '2', '3']);
  await call(page, 'F.loadPreset("flu"); F.runScenarioNow(); F.setSimTab("history");');
  await expect(page.locator('#historyList > li')).toHaveCount(2);
  await expect(page.locator('#historyList .hmain small').nth(0)).toContainText(', 20 days');
  await expect(page.locator('#historyList .hmain small').nth(2)).toContainText(', 10 days per value');
  const boxes = page.locator('#historyList input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.locator('#histCompare')).toHaveText('Compare selected (2)');
  await page.locator('#histCompare').click();
  await expect(page.locator('#histCompareBox h3')).toHaveText('Runs compared');
  await expect(page.locator('#histCompareBox tbody th')).toHaveText([
    'Verdict',
    'Average wait',
    '1 in 10 waited over',
    'Patients seen',
    'Walking per nurse',
    'Busiest',
    'What’s different'
  ]);
  await expect(page.locator('#histCompareBox tbody tr').last().locator('td').first()).toHaveText('The starting point');
  await page.locator('#histClear').click();
  await expect(page.locator('#historyList li.empty h3')).toHaveText('Nothing here yet');
  await page.locator('#toastAct').click();
  await expect(page.locator('#historyList > li')).toHaveCount(2);
});

test('import a scenario .json, and download one', async ({ page }) => {
  await open(page);
  await page.locator('#scnImport').setInputFiles(path.join(root, 'samples/scenarios/flu-season-monday.scenario.json'));
  await expect(toast(page)).toHaveText(
    'Imported flu-season-monday.scenario.json. Check the list on the right for anything to fix.'
  );
  await expect(page.locator('#scnName')).toHaveValue('Flu-season Monday');
  await expect(page.locator('.bcard')).toHaveCount(13);
  await expect(page.locator('#presetRow [data-preset="custom"]')).toHaveAttribute('aria-pressed', 'true');
  if (isReference) return; // The reference saves through the artifact viewer (planned difference 2).
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#scnDownload').click()]);
  expect(dl.suggestedFilename()).toBe('flu-season-monday.scenario.json');
  const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(saved.schema).toBe('fi.scenario.v1');
  expect(saved.name).toBe('Flu-season Monday');
  expect(saved.blocks).toHaveLength(13);
  await expect(toast(page)).toHaveText('Saved the scenario.');
});

test('the transport: play, pause, speeds and clicking the timeline', async ({ page }) => {
  await open(page);
  await call(page, 'F.runScenarioNow();');
  const play = page.locator('#playBtn');
  await expect(page.locator('[data-speed="0.1666667"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-speed="5"]').click();
  await expect(page.locator('[data-speed="5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toHaveAttribute('aria-label', /the day/);
  const label = await play.getAttribute('aria-label');
  await play.click();
  await expect(play).not.toHaveAttribute('aria-label', label as string);
  const tl = await page.locator('#tl').boundingBox();
  if (!tl) throw new Error('no timeline');
  await page.mouse.click(tl.x + tl.width * 0.5, tl.y + tl.height / 2);
  await expect(page.locator('#clock')).not.toHaveText('9:30 am');
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Play the day');
  await page.locator('#restartBtn').click();
  await expect(page.locator('#clock')).toHaveText('8:00 am');
});
