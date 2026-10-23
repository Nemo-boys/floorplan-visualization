/* Review and editing: the guided tour, swaps (on the plan and in 3D), rename, furniture and versions. Runs against
   the app, or the reference with E2E_TARGET=reference. Rooms in 3D are found by sweeping the pointer over the canvas
   and reading the hover tooltip, so no extra test hooks are needed. */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const golden = JSON.parse(fs.readFileSync(path.join(root, 'tests/golden/engine-golden.json'), 'utf8')) as {
  layouts: { A: { tour: string[] } };
};
const inPage = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(
    '(() => { const F = window.__fi || window; const S = window.__fi ? window.__fi.state : state; const T = window.__fi ? window.__fi.tour : tour; ' +
      body +
      ' })()'
  ) as Promise<T>;
const toast = (page: Page) => page.locator('#toast');
const planRoom = (page: Page, id: string) => page.locator('.plansvg .room[data-id="' + id + '"]');

/* Where each room is on screen in the 3D view: sweep synthetic pointer moves over the canvas inside the page and read
   the hover tooltip. Only points where the canvas is on top (no overlay) are kept. Returns the middle hit per room. */
async function scan3D(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return mids(await sweep3D(page));
}
async function sweep3D(page: Page): Promise<Record<string, [number, number][]>> {
  const hits = await page.evaluate(() => {
    const c = document.querySelector('#view canvas') as HTMLCanvasElement,
      r = c.getBoundingClientRect(),
      out: Record<string, [number, number][]> = {};
    for (let j = 1; j < 40; j++)
      for (let i = 1; i < 60; i++) {
        const x = r.left + (r.width * i) / 60,
          y = r.top + (r.height * j) / 40;
        if (document.elementFromPoint(x, y) !== c) continue;
        c.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 99 }));
        const t = document.querySelector('#tooltip') as HTMLElement;
        if (!t.hidden) {
          const n = (t.querySelector('b') as HTMLElement).textContent as string;
          (out[n] ||= []).push([x, y]);
        }
      }
    return out;
  });
  return hits;
}
function mids(hits: Record<string, [number, number][]>): Record<string, { x: number; y: number }> {
  const mid: Record<string, { x: number; y: number }> = {};
  for (const [name, list] of Object.entries(hits)) {
    const cx = list.reduce((s, p) => s + p[0], 0) / list.length,
      cy = list.reduce((s, p) => s + p[1], 0) / list.length;
    const best = list.reduce((b, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? p : b));
    mid[name] = { x: best[0], y: best[1] };
  }
  return mid;
}
/* Picks a room on the 2D plan. Furniture outlines and people dots on the plan take the pointer (docs/deviations.md,
   open question 3), so the click is delivered to the room itself. */
const pickOnPlan = (page: Page, id: string): Promise<void> => planRoom(page, id).dispatchEvent('click');
async function freeze(page: Page): Promise<void> {
  await inPage(page, 'S.playing = false; if (S.P && S.sim) F.seek(90);');
}

test('the guided tour visits all 19 stops of layout A in order, with the right caption at each', async ({ page }) => {
  await page.goto('#review');
  await page.waitForTimeout(800);
  await freeze(page);
  await inPage(page, 'F.startTour(0); T.playing = false;');
  const order = golden.layouts.A.tour;
  expect(order).toHaveLength(19);
  await expect(page.locator('#tourBar')).toBeVisible();
  await expect(page.locator('#caption')).toBeVisible();
  await expect(page.locator('#tourPrev')).toBeDisabled();
  for (let i = 0; i < order.length; i++) {
    const want = order[i] === 'entrance' ? 'Entrance' : order[i] === 'exit' ? 'Back outside' : order[i];
    await expect(page.locator('#capTitle')).toHaveText(want);
    await expect(page.locator('#tourCount')).toHaveText('Stop ' + (i + 1) + ' of 19');
    if (i < order.length - 1) await inPage(page, 'F.nextTourStop();');
  }
  await expect(page.locator('#tourNext')).toBeDisabled();
  await inPage(page, 'F.nextTourStop();');
  await expect(page.locator('#capTitle')).toHaveText('That’s the whole clinic');
  await expect(page.locator('#capPurpose')).toHaveText(
    'Every room connects to the entrance. The farthest room is 18 m from the exit (Exam 1).'
  );
  await page.locator('#tourExit').click();
  await expect(page.locator('#tourBar')).toBeHidden();
  await expect(page.locator('[data-view="orbit"]')).toHaveAttribute('aria-pressed', 'true');
});

test('swap two rooms on the floor plan, with the preview, then restore version 1', async ({ page }) => {
  await page.goto('#edit');
  await page.waitForTimeout(800);
  await freeze(page);
  await expect(page.locator('#rbTitle')).toHaveText('Editing the plan');
  await expect(page.locator('#swapStatus')).toHaveText('Click the first room, on the floor plan or in the 3D view.');
  await pickOnPlan(page, 'nurse_station_1');
  await expect(page.locator('#swapStatus')).toHaveText('1Nurse stationNow click the room to swap it with.');
  await pickOnPlan(page, 'exam_room_5');
  await expect(page.locator('#swapPreview')).toHaveText(
    'If you swap them:Nurse walk to the average exam room: 12 m to 11 mLongest patient journey: 48 m to 48 m'
  );
  await expect(page.locator('#swapApply')).toBeEnabled();
  await page.locator('#swapApply').click();
  await expect(toast(page)).toHaveText('Swapped Nurse station and Exam 5, saved as version 2.');
  await expect(page.locator('#planVersion')).toHaveText('Version 2');
  await expect(page.locator('#versions li')).toHaveCount(2);
  await expect(page.locator('#versions li.current .vc')).toContainText('Swapped Nurse station and Exam 5');
  await expect(page.locator('#tStaff')).toHaveText('11 m on average');
  await page.locator('#versions [data-restore="0"]').click();
  await expect(toast(page)).toHaveText('Restored version 1.');
  await expect(page.locator('#versions li.current .vn')).toHaveText('v1');
  await expect(page.locator('#tStaff')).toHaveText('12 m on average');
  await page.locator('#doneEditing').click();
  await expect(toast(page)).toHaveText('Editing closed. The plan is now at version 1.');
});

test('refusals: the waiting room stays put, and rooms must be on the same side', async ({ page }) => {
  await page.goto('#edit');
  await page.waitForTimeout(800);
  await freeze(page);
  await pickOnPlan(page, 'waiting_1');
  await pickOnPlan(page, 'exam_room_1');
  await expect(page.locator('#swapPreview .warn')).toHaveText(
    'The waiting room and reception stay where they are, because the entrance and check-in counter depend on them.'
  );
  await expect(page.locator('#swapApply')).toBeDisabled();
  await pickOnPlan(page, 'exam_room_2');
  await pickOnPlan(page, 'exam_room_4');
  await expect(page.locator('#swapPreview .warn')).toHaveText('Pick two rooms on the same side of the corridor.');
});

test('swap two rooms by clicking them in the 3D view', async ({ page }) => {
  await page.goto('#edit');
  await page.waitForTimeout(800);
  await freeze(page);
  await page.locator('#pdCollapse').click();
  const spots = await scan3D(page),
    a = spots['Exam 1'],
    b = spots['Exam 3'];
  expect(a && b).toBeTruthy();
  await page.mouse.move(a.x, a.y);
  await expect(page.locator('#tooltip .tip-hint')).toHaveText('Click to pick this room first');
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(400);
  await page.mouse.move(b.x, b.y);
  await expect(page.locator('#tooltip .tip-hint')).toHaveText('Click to swap with Exam 1');
  await page.mouse.click(b.x, b.y);
  await expect(page.locator('#swapStatus')).toHaveText('1Exam 12Exam 3');
  await expect(page.locator('#swapPreview .preview')).toHaveText('If you swap them:');
  await page.locator('#swapApply').click();
  await expect(toast(page)).toHaveText('Swapped Exam 1 and Exam 3, saved as version 2.');
});

test('rename a room', async ({ page }) => {
  await page.goto('#edit');
  await page.waitForTimeout(800);
  await page.locator('[data-tool="rename"]').click();
  await expect(page.locator('#renameHint')).toHaveText('Click a room on the plan to rename it.');
  await pickOnPlan(page, 'exam_room_1');
  await expect(page.locator('#renameInput')).toHaveValue('Exam 1');
  await page.locator('#renameInput').fill('Triage');
  await page.locator('#renameInput').press('Enter');
  await expect(toast(page)).toHaveText('Renamed Exam 1 to Triage.');
  await expect(page.locator('#planVersion')).toHaveText('Version 2');
  await expect(page.locator('.plansvg text', { hasText: 'Triage' })).toHaveCount(1);
});

test('furniture: add, move, rotate and remove a bed', async ({ page }) => {
  await page.goto('#edit');
  await page.waitForTimeout(800);
  await freeze(page);
  await page.locator('[data-tool="furniture"]').click();
  // The floor-plan panel stays open from entering Edit; close it to see the 3D view.
  await expect(page.locator('#planDock')).toHaveAttribute('data-open', 'true');
  await page.locator('#pdCollapse').click();
  // Try points in the Waiting room, in a fixed order, until the bed fits and keeps doorways clear. Both targets render
  // the same, so they stop at the same point.
  const waiting = (await sweep3D(page))['Waiting'];
  expect(waiting && waiting.length).toBeTruthy();
  let spot: { x: number; y: number } | null = null;
  for (let k = 0; k < waiting.length && !spot; k += 3) {
    if (await page.locator('#placeHint').isHidden()) await page.locator('[data-place="bed"]').click();
    await expect(page.locator('#placeHint')).toBeVisible();
    const [x, y] = waiting[k];
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
    if (((await toast(page).textContent()) || '').startsWith('Hospital bed added')) spot = { x, y };
  }
  expect(spot).not.toBeNull();
  if (!spot) return;
  await expect(toast(page)).toHaveText('Hospital bed added. Walking routes now go around it, and the day restarted.');
  await expect(page.locator('#versions li.current .vc')).toContainText('Added a hospital bed');
  await expect(page.locator('#selectionTools')).toBeVisible();
  await expect(page.locator('#selectionName')).toHaveText('Hospital bed');
  await page.locator('#rotateBtn').click();
  await expect(toast(page)).toContainText('Hospital bed ');
  await expect(toast(page)).toContainText('. Walking routes now go around it, and the day restarted.');
  // Drag it a little to move it.
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move(spot.x + 12, spot.y + 4, { steps: 4 });
  await page.mouse.up();
  await expect(toast(page)).toHaveText('Hospital bed moved. Walking routes now go around it, and the day restarted.');
  await page.keyboard.press('Delete');
  await expect(toast(page)).toHaveText('Hospital bed removed. Walking routes now go around it, and the day restarted.');
  await expect(page.locator('#versions li.current .vc')).toContainText('Removed a hospital bed');
  await expect(page.locator('#selectionTools')).toBeHidden();
});

test('the room card shows a room picked on the plan', async ({ page }) => {
  await page.goto('#review');
  await page.waitForTimeout(800);
  await freeze(page);
  await page.locator('#pdPill').click();
  await expect(page.locator('#planDock')).toHaveAttribute('data-open', 'true');
  await pickOnPlan(page, 'exam_room_3');
  await expect(page.locator('#roomCard')).toBeVisible();
  await expect(page.locator('#roomInfo h3')).toHaveText('Exam 3');
  await expect(page.locator('#roomInfo > p').first()).toHaveText(
    'A nurse takes vitals first, then the provider sees the patient here.'
  );
  await expect(page.locator('#roomInfo .facts li')).toHaveText([
    '11.3 m², 2.7 × 4.2 m',
    '11 m from the nurse station',
    '11 m from the waiting room'
  ]);
  await page.locator('#roomCardClose').click();
  await expect(page.locator('#roomCard')).toBeHidden();
});
