/* The app shell: steps, deep links, keyboard, the assistant drawer and themes. Runs against the app, or against the
   reference with E2E_TARGET=reference (PLAN.md, “Test hooks”). */
import { expect, test, type Page } from '@playwright/test';

const isReference = process.env.E2E_TARGET === 'reference';
const tab = (page: Page, step: string) => page.locator('[data-step="' + step + '"]');
const selectedStep = (page: Page) =>
  page.evaluate(() => (document.querySelector('[data-step][aria-selected="true"]') as HTMLElement).dataset.step);

test.describe('steps before and after import', () => {
  test('every step except Import stays disabled until a plan is imported', async ({ page }) => {
    await page.goto('#import');
    await expect(tab(page, 'import')).toHaveAttribute('aria-selected', 'true');
    for (const s of ['review', 'simulate', 'export']) await expect(tab(page, s)).toBeDisabled();
    await expect(page.locator('#planName')).toHaveText('No plan yet');
    await expect(page.locator('#planVersion')).toHaveText('Start by importing a plan');
    // setStep refuses other steps without a plan.
    await page.evaluate(() => {
      const F = (window as unknown as { __fi?: { setStep: (s: string) => void } }).__fi || (window as never);
      (F as { setStep: (s: string) => void }).setStep('simulate');
    });
    expect(await selectedStep(page)).toBe('import');

    await page.locator('#openPipeline').click();
    for (const s of ['review', 'simulate', 'export']) await expect(tab(page, s)).toBeEnabled();
    await expect(page.locator('#planName')).toHaveText('Primary care clinic');
    await expect(page.locator('#planVersion')).toHaveText('Version 1');
    await expect(page.locator('#importNext')).toBeEnabled();
    await tab(page, 'export').click();
    expect(await selectedStep(page)).toBe('export');
    await expect(page).toHaveURL(/#export$/);
    await expect(tab(page, 'import')).toHaveClass(/done/);
  });

  test('each sample card imports its layout', async ({ page }) => {
    await page.goto('#import');
    await page.locator('[data-sample="C"]').click();
    await expect(page.locator('#planName')).toHaveText('Layout C');
    await expect(page.locator('#thumbTextB')).toHaveText(
      'Lobby at the west end, exam rooms grouped at the far east end. Nurses walk 15 m to the average exam room.'
    );
  });
});

test.describe('deep links', () => {
  for (const [hash, step] of [
    ['review', 'review'],
    ['simulate', 'simulate'],
    ['export', 'export'],
    ['edit', 'review']
  ])
    test('#' + hash + ' loads the pipeline sample and opens ' + step, async ({ page }) => {
      await page.goto('#' + hash);
      await expect(page.locator('#app')).toHaveClass(new RegExp('step-' + step));
      expect(await selectedStep(page)).toBe(step);
      await expect(page.locator('#planName')).toHaveText('Primary care clinic');
      await expect(page).toHaveURL(new RegExp('#' + step + '$'));
      for (const s of ['review', 'simulate', 'export']) await expect(tab(page, s)).toBeEnabled();
    });
  test('#import loads nothing', async ({ page }) => {
    await page.goto('#import');
    await expect(page.locator('#planName')).toHaveText('No plan yet');
  });
});

test('left and right arrows move between enabled steps', async ({ page }) => {
  await page.goto('#import');
  await tab(page, 'import').focus();
  await page.keyboard.press('ArrowRight');
  expect(await selectedStep(page)).toBe('import');
  await page.locator('#openPipeline').click();
  await tab(page, 'import').focus();
  await page.keyboard.press('ArrowRight');
  expect(await selectedStep(page)).toBe('review');
  await expect(tab(page, 'review')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await selectedStep(page)).toBe('export');
});

test('the Assistant button opens and closes the drawer', async ({ page }) => {
  await page.goto('#review');
  const btn = page.locator('#assistantBtn'),
    drawer = page.locator('#assistant');
  await expect(drawer).toBeHidden();
  await btn.click();
  await expect(drawer).toBeVisible();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#app')).toHaveClass(/chat-open/);
  if (!isReference) {
    await expect(drawer.locator('.assistant-later')).toHaveText('The assistant will be connected in a later version.');
    await expect(drawer.locator('textarea, form, .chips')).toHaveCount(0);
    await expect(page.locator('#askBigger')).toBeHidden();
  }
  await page.locator('#chatClose').click();
  await expect(drawer).toBeHidden();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await btn.click();
  await expect(drawer).toBeHidden();
});

test('data-theme forces light or dark', async ({ page }) => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('#import');
  expect(await bg()).toBe('rgb(238, 241, 239)');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await bg()).toBe('rgb(17, 23, 28)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await bg()).toBe('rgb(238, 241, 239)');
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  expect(await bg()).toBe('rgb(17, 23, 28)');
});
