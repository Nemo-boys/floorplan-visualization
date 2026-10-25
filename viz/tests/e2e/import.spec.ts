/* Step 1: Import, through all three paths. Expected texts were read from the reference, and this file runs against
   both (E2E_TARGET=reference for the reference). */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (f: string): string =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f + '.plan.json');
const EXPECTS = ' The page expects plan.json v0.1: rooms with "rect" or "polygon_mm", and doors with "center_mm".';

async function expectSummary(
  page: Page,
  s: { name: string; source: string; rows: [string, string][]; header: string }
): Promise<void> {
  await expect(page.locator('#importSummary')).toBeVisible();
  await expect(page.locator('#importName')).toHaveText(s.name);
  await expect(page.locator('#importSource')).toHaveText(s.source);
  await expect(page.locator('#importArea')).toHaveText('245 m² on a 24.0 × 10.2 m footprint');
  const rows = page.locator('#importRead li');
  await expect(rows).toHaveCount(7);
  for (let i = 0; i < s.rows.length; i++) {
    await expect(rows.nth(i).locator('b')).toHaveText(s.rows[i][0]);
    await expect(rows.nth(i).locator('span').last()).toHaveText(s.rows[i][1]);
    await expect(rows.nth(i).locator('.ok svg')).toHaveCount(1);
  }
  await expect(page.locator('#importThumb svg')).toHaveCount(1);
  await expect(page.locator('#planName')).toHaveText(s.header);
  await expect(page.locator('#planVersion')).toHaveText('Version 1');
}

test.beforeEach(async ({ page }) => {
  await page.goto('#import');
  await expect(page.locator('#importSummary')).toBeHidden();
  await expect(page.locator('#importNext')).toBeDisabled();
});

test('the Module 1 pipeline card opens Layout A as “Primary care clinic”', async ({ page }) => {
  await expect(page.locator('.inbox .file b')).toHaveText('plan_primary-care_v3.json');
  await expect(page.locator('.source').first().locator('.small.muted')).toHaveText(
    'Preview: a sample file stands in for Module 1’s output.'
  );
  await page.locator('#openPipeline').click();
  await expectSummary(page, {
    name: 'Primary care clinic',
    source: 'From the Module 1 pipeline',
    header: 'Primary care clinic',
    rows: [
      ['Rooms', '18 rooms, including 6 exam rooms'],
      ['Doors', '18 doors and openings'],
      ['Entrance', 'On the south side, into the waiting'],
      ['Walls', 'Worked out from the room edges'],
      ['Windows', '13 on outside walls'],
      ['Furniture', '88 items placed from the room types'],
      ['Waiting room', '17 seats']
    ]
  });
  await page.locator('#importNext').click();
  await expect(page.locator('#app')).toHaveClass(/step-review/);
  await expect(page).toHaveURL(/#review$/);
});

test('a sample card opens that layout', async ({ page }) => {
  await expect(page.locator('#thumbTextA')).toHaveText(
    'Lobby in the middle, nurse station across from the waiting room. Nurses walk 12 m to the average exam room.'
  );
  await expect(page.locator('#thumbTextC')).toHaveText(
    'Lobby in the middle, nurse station surrounded by the exam rooms. Nurses walk 10 m to the average exam room.'
  );
  await expect(page.locator('#thumbA svg, #thumbB svg, #thumbC svg')).toHaveCount(3);
  await page.locator('[data-sample="B"]').click();
  await expectSummary(page, {
    name: 'Layout B',
    source: 'Sample layout',
    header: 'Layout B',
    rows: [
      ['Rooms', '18 rooms, including 6 exam rooms'],
      ['Doors', '18 doors and openings'],
      ['Entrance', 'On the west side, into the waiting'],
      ['Walls', 'Worked out from the room edges'],
      ['Windows', '15 on outside walls'],
      ['Furniture', '90 items placed from the room types'],
      ['Waiting room', '19 seats']
    ]
  });
});

test('an uploaded plan with polygons and no doors gets a door per room', async ({ page }) => {
  await page.locator('#fileInput').setInputFiles(fixture('polygons-no-doors'));
  await expectSummary(page, {
    name: 'Northside clinic',
    source: 'Uploaded file',
    header: 'Northside clinic',
    rows: [
      ['Rooms', '18 rooms, including 6 exam rooms'],
      ['Doors', 'None in the file, so a door to the corridor was added for each room'],
      ['Entrance', 'On the south side, into the waiting'],
      ['Walls', 'Worked out from the room edges'],
      ['Windows', '12 on outside walls'],
      ['Furniture', '92 items placed from the room types'],
      ['Waiting room', '26 seats']
    ]
  });
  await expect(page.locator('#fileMsg')).toBeHidden();
  await page.locator('#importNext').click();
  await expect(page.locator('#app')).toHaveClass(/step-review/);
});

test('a file that can’t be read shows the exact error and keeps the current plan', async ({ page }) => {
  const msg = page.locator('#fileMsg');
  await page.locator('#fileInput').setInputFiles(fixture('not-json'));
  await expect(msg).toBeVisible();
  await expect(msg).toHaveText(
    "Couldn’t read not-json.plan.json: Expected property name or '}' in JSON at position 2 (line 1 column 3)." + EXPECTS
  );
  await expect(page.locator('#planName')).toHaveText('No plan yet');
  await page.locator('#openPipeline').click();
  await page.locator('#fileInput').setInputFiles(fixture('no-rooms'));
  await expect(msg).toHaveText('Couldn’t read no-rooms.plan.json: json.rooms is not iterable.' + EXPECTS);
  await expect(page.locator('#planName')).toHaveText('Primary care clinic');
  await page.locator('#fileInput').setInputFiles(fixture('polygons-no-doors'));
  await expect(msg).toBeHidden();
  await expect(page.locator('#planName')).toHaveText('Northside clinic');
});
