/* Accessibility: axe on every step (light and dark), and one keyboard-only run through the whole flow. Runs against
   the app, or the reference with E2E_TARGET=reference. The only axe findings allowed are the three contrast findings
   the approved design has too (docs/deviations.md, row 4); anything else fails. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const isReference = process.env.E2E_TARGET === 'reference';
const STATES: [string, string, string][] = [
  ['import', 'import', ''],
  ['import-loaded', 'import', 'document.querySelector("#openPipeline").click();'],
  ['review with the floor plan', 'review', 'document.querySelector("#pdPill").click();'],
  ['edit', 'edit', ''],
  ['simulate', 'simulate', ''],
  ['results', 'simulate', 'F.runScenarioNow();'],
  ['history', 'simulate', 'F.runScenarioNow(); F.loadPreset("flu"); F.runScenarioNow(); F.setSimTab("history");'],
  ['compare layouts', 'simulate', 'F.runScenarioNow(); F.runCompare();'],
  ['export', 'export', ''],
  ['assistant', 'review', 'document.querySelector("#assistantBtn").click();']
];
/* Known in the approved design, light mode only: verdict pills in History and the “Planned” card's text. Elements are
   named by tag and classes, because axe picks different selectors for the same element. */
const KNOWN = new Set([
  'color-contrast span.vpill.good',
  'color-contrast span.vpill.busy',
  'color-contrast .planned > p'
]);
/* Only in the reference: its download buttons are disabled (planned difference 2), so the scrollable Export page has
   nothing focusable. */
if (isReference) KNOWN.add('scrollable-region-focusable #exportView');
const key = (id: string, target: string, html: string): string => {
  const m = /^<(\w+)[^>]*\sclass="([^"]+)"/.exec(html);
  return id + ' ' + (m && !target.startsWith('#') ? m[1] + '.' + m[2].trim().split(/\s+/).join('.') : target);
};

for (const scheme of ['light', 'dark'] as const)
  for (const [name, hash, act] of STATES)
    test('axe: ' + name + ' (' + scheme + ')', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('#' + hash);
      await page.waitForTimeout(1200);
      if (act) await page.evaluate('(() => { const F = window.__fi || window; ' + act + ' })()');
      await page.waitForTimeout(500);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const found = r.violations.flatMap(v => v.nodes.map(n => key(v.id, n.target.join(' '), n.html)));
      expect(found.filter(f => !KNOWN.has(f))).toEqual([]);
    });

/* Tab forward until the element matches; fails if it never gets focus. */
async function tabTo(page: Page, selector: string, max = 250): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(s => !!document.activeElement && document.activeElement.matches(s), selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached ' + selector);
}
async function expectFocusRing(page: Page): Promise<void> {
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element);
    return s.outlineStyle + ' ' + s.outlineWidth;
  });
  // 2.5px in the CSS; Chrome rounds outline widths to whole device pixels.
  expect(ring).toMatch(/^solid [1-9][0-9.]*px$/);
}

test('keyboard only: import, review, tour, edit, simulate, history, export and the assistant', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('#import');
  await page.waitForTimeout(800);
  // Import through the pipeline card, then go on to Review.
  await tabTo(page, '#openPipeline');
  await expectFocusRing(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#importSummary')).toBeVisible();
  await tabTo(page, '#importNext');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveClass(/step-review/);
  // Step tabs with the arrow keys.
  await page.locator('[data-step="review"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).toHaveClass(/step-simulate/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#app')).toHaveClass(/step-review/);
  // Open the floor plan, then take the tour and leave it with Esc.
  await tabTo(page, '#pdPill');
  await page.keyboard.press('Enter');
  await expect(page.locator('#planDock')).toHaveAttribute('data-open', 'true');
  await tabTo(page, '[data-view="tour"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tourBar')).toBeVisible();
  await tabTo(page, '#tourNext');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tourCount')).toHaveText('Stop 2 of 19');
  await page.keyboard.press('Escape');
  await expect(page.locator('#tourBar')).toBeHidden();
  // Walls, then editing: tools and Done editing.
  await tabTo(page, '[data-walls="full"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-walls="full"]')).toHaveAttribute('aria-pressed', 'true');
  await tabTo(page, '#editToggle');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveClass(/editing/);
  await tabTo(page, '[data-tool="furniture"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toolFurniture')).toBeVisible();
  await tabTo(page, '[data-place="plant"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#placeHint')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#placeHint')).toBeHidden();
  await tabTo(page, '#doneEditing');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).not.toHaveClass(/editing/);
  // Simulate: add a block from the palette, change a field, run.
  await tabTo(page, '#reviewBar [data-next="simulate"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveClass(/step-simulate/);
  await tabTo(page, '.pchip[data-add="group"]');
  await expectFocusRing(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.bsec[data-group="timeline"] .bcard')).toHaveCount(3);
  await tabTo(page, '#scnName');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Keyboard Tuesday');
  await tabTo(page, '#runBtn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveClass(/sim-results/, { timeout: 60000 });
  await expect(page.locator('.rmeta')).toContainText('Keyboard Tuesday');
  // The transport: pause or play with the keyboard.
  await tabTo(page, '#playBtn');
  const label = await page.locator('#playBtn').getAttribute('aria-label');
  await page.keyboard.press('Enter');
  await expect(page.locator('#playBtn')).not.toHaveAttribute('aria-label', label as string);
  // History: select runs with Space.
  await tabTo(page, '[data-simtab="history"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#historyList > li')).toHaveCount(1);
  await tabTo(page, '#historyList input[type="checkbox"]');
  await page.keyboard.press('Space');
  await expect(page.locator('#historyList input[type="checkbox"]').first()).toBeChecked();
  // Export.
  await tabTo(page, '#simBar [data-next="export"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveClass(/step-export/);
  if (!isReference) {
    await tabTo(page, '[data-export="json"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(dl.suggestedFilename()).toBe('primary-care-clinic-v1.json');
  }
  // The assistant drawer opens and closes from the keyboard.
  await page.locator('#assistantBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#assistant')).toBeVisible();
  await tabTo(page, '#chatClose');
  await page.keyboard.press('Enter');
  await expect(page.locator('#assistant')).toBeHidden();
});
