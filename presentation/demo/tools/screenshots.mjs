// Takes the still screenshots used by the slides and as stand-ins in the draft cut.
//   node presentation/demo/tools/screenshots.mjs            (server running: make dev)
// Writes presentation/demo/screenshots/*.png at 1920x1080. Each step is best-effort: a failed step is logged and skipped.
import { open, click, type, wait, BASE } from './lib.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const only = process.argv.slice(2);
const want = n => !only.length || only.includes(n);

async function step(name, fn) {
  try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, String(e.message || e).split('\n')[0]); }
}
import fs from 'fs';
// Playwright waits for a stable frame; continuous animation (the Heat lens airflow) never gives one, so fall back to CDP.
async function shot(page, name) {
  try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 8000 }); }
  catch {
    const cdp = await page.context().newCDPSession(page);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    await cdp.detach();
  }
}

async function assistantAsk(page, text, settle = 9000) {
  const open = await page.locator('#assistant').isVisible().catch(() => false);
  if (!open) await click(page, '#assistantBtn');
  await wait(page, 600);
  const box = page.locator('#assistant textarea, .assistant textarea, aside textarea').last();
  await box.click();
  await type(page, text, 20);
  await page.keyboard.press('Enter');
  await wait(page, settle);
}

async function clinic() {
  const { browser, page } = await open();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await wait(page, 1200);
  await step('clinic-import', () => shot(page, 'clinic-import'));
  await step('clinic-candidates', async () => {
    await click(page, '#pipeGo');
    await page.waitForSelector('[data-candidate]', { timeout: 60000 });
    await wait(page, 800);
    await shot(page, 'clinic-candidates');
  });
  await step('clinic-review', async () => {
    await click(page, '[data-candidate]');
    await wait(page, 1200);
    await click(page, '#importNext');
    await wait(page, 7000);
    await shot(page, 'clinic-review');
  });
  await step('clinic-tour', async () => {
    await click(page, 'button:has-text("Guided tour")');
    await wait(page, 8000);
    await shot(page, 'clinic-tour');
    await click(page, '#tourExit');
    await wait(page, 2500);
  });
  await step('clinic-plan', async () => {
    await click(page, '#pdPill');
    await wait(page, 1500);
    await click(page, '#rStaff + .sw').catch(() => {});
    await wait(page, 2500);
    await shot(page, 'clinic-plan');
  });
  await step('clinic-simulate', async () => {
    await page.evaluate(() => (window.__fi ? window.__fi.setStep('simulate') : document.querySelector('[data-step="simulate"]').click()));
    await wait(page, 3000);
    await click(page, '[data-qpreset="flu"]').catch(() => click(page, 'text=Flu-season'));
    await wait(page, 1500);
    await shot(page, 'clinic-simulate');
  });
  await step('clinic-results', async () => {
    await click(page, 'button:has-text("Run 20 days")');
    await page.waitForSelector('#app.sim-results', { timeout: 240000 });
    await wait(page, 6000);
    await shot(page, 'clinic-results');
  });
  await step('clinic-assistant', async () => {
    await assistantAsk(page, 'What if we add a nurse?', 4000);
    await page.waitForSelector('#app.sim-results', { timeout: 240000 });
    await wait(page, 9000);
    await shot(page, 'clinic-assistant');
  });
  await step('clinic-compare', async () => {
    await assistantAsk(page, 'Compare the layouts', 20000);
    await shot(page, 'clinic-compare');
    await page.keyboard.press('Escape');
    await wait(page, 800);
  });
  await step('clinic-edit', async () => {
    await page.evaluate(() => document.querySelector('[data-step="review"]').click());
    await wait(page, 3000);
    if (await page.locator('#assistant').isVisible().catch(() => false)) await click(page, '#assistantBtn');
    await click(page, '#editToggle');
    await wait(page, 1500);
    const t = page.locator('#editText');
    await t.fill('');
    await t.click();
    await type(page, 'Make the waiting room 20% bigger, keep the restrooms fixed', 15);
    await click(page, '#editGo');
    await wait(page, 9000);
    await shot(page, 'clinic-edit');
  });
  await step('clinic-edit-impossible', async () => {
    const t = page.locator('#editText');
    await t.fill('');
    await t.click();
    await type(page, 'Make the waiting room 250% bigger', 15);
    await click(page, '#editGo');
    await wait(page, 9000);
    await shot(page, 'clinic-edit-impossible');
  });
  await step('clinic-export', async () => {
    await click(page, '#doneEditing').catch(() => {});
    await wait(page, 800);
    await page.evaluate(() => document.querySelector('[data-step="export"]').click());
    await wait(page, 4000);
    await shot(page, 'clinic-export');
  });
  await browser.close();
}

async function datacenter() {
  const { browser, page } = await open();
  await page.goto(BASE + '/datacenter', { waitUntil: 'networkidle' });
  await wait(page, 1500);
  await step('dc-describe', () => shot(page, 'dc-describe'));
  await step('dc-design', async () => {
    await page.locator('textarea, [contenteditable]').first().click();
    await page.keyboard.press('Enter');
    await wait(page, 8000);
    await shot(page, 'dc-design');
  });
  for (const lens of ['Power', 'Heat', 'Backup']) {
    await step('dc-' + lens.toLowerCase(), async () => {
      await click(page, `[data-lens] >> text="${lens}"`).catch(() => click(page, `button:text-is("${lens}")`));
      await wait(page, 5000);
      await shot(page, 'dc-' + lens.toLowerCase());
    });
  }
  await step('dc-export', async () => {
    await click(page, 'button:text-is("Layout")');
    await wait(page, 2500);
    await page.locator('button:has-text("OpenUSD for Omniverse")').scrollIntoViewIfNeeded();
    await wait(page, 800);
    await page.locator('button:has-text("OpenUSD for Omniverse")').hover();
    await wait(page, 600);
    await shot(page, 'dc-export');
  });
  await step('dc-test', async () => {
    await click(page, 'button:has-text("Test this design")');
    await wait(page, 6000);
    await shot(page, 'dc-test-start');
    await click(page, 'button:has-text("grid goes down")');
    await wait(page, 6000);
    await shot(page, 'dc-test-grid');
    await click(page, 'button:has-text("Worst day")');
    await wait(page, 7000);
    await shot(page, 'dc-test');
  });
  await step('dc-cost', async () => {
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /4\s*Cost/.test(b.innerText)).click());
    await wait(page, 5000);
    await shot(page, 'dc-cost');
  });
  await browser.close();
}

if (want('clinic')) await clinic();
if (want('dc')) await datacenter();
