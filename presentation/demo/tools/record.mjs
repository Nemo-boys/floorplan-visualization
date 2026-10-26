// Records the demo's screen captures into presentation/demo/recordings/<shot>.mp4 (1920x1080, 30 fps).
//   make dev                                    # in another terminal: app + API on :8000
//   node presentation/demo/tools/record.mjs              # every shot
//   node presentation/demo/tools/record.mjs dc_test      # one shot
//   HEADED=1 CHROME_CHANNEL=chrome node ...               # watch it in real Chrome (best WebGPU)
// Each shot drives the app with a visible cursor (smooth moves, typed text) and is paced to its dialogue in
// script.json (target seconds below). A shot starts from a fresh page; the loading part is trimmed off.
import { open, click, type, wait, moveTo, center, drag, startCapture, BASE } from './lib.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../recordings');
fs.mkdirSync(OUT, { recursive: true });

async function orbit(page, dx = 260, ms = 2600) {
  const c = await center(page, '#view, canvas');
  await drag(page, { x: c.x - dx / 2, y: c.y + 40 }, { x: c.x + dx / 2, y: c.y + 10 }, ms);
}

async function ask(page, text, settleMs) {
  const box = page.locator('textarea[placeholder^="Ask or tell"]').last();
  const onScreen = async () => { const r = await box.boundingBox().catch(() => null); return r && r.x >= 0 && r.y >= 0 && r.x + r.width <= 1920 && r.y + r.height <= 1080; };
  if (!(await onScreen())) { await click(page, '.assistant-btn:visible'); await wait(page, 900); }
  const b = await box.boundingBox();
  await moveTo(page, b.x + 60, b.y + b.height / 2, 500);
  await box.click();
  await type(page, text, 32);
  await wait(page, 300);
  await page.keyboard.press('Enter');
  await wait(page, settleMs);
}

// Clinic shots share one prepared page per shot: `prep` runs before capture starts, `act` is what's recorded.
const clinicToReview = async page => {
  await page.locator('#pipeGo').click();
  await page.waitForSelector('[data-candidate]', { timeout: 120000 });
  await page.locator('[data-candidate]').first().click();
  await page.locator('#importNext').click();
  await wait(page, 5000);
  const dismiss = page.locator('button[aria-label="Dismiss"]');
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
};

const SHOTS = {
  clinic_generate: {
    target: 13, url: '/',
    act: async page => {
      await wait(page, 600);
      await click(page, '#pipeBrief');
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await type(page, 'Primary care clinic with 6 exam rooms, a nurse station, reception and waiting, an ADA restroom, clean and soiled utility rooms.', 18);
      await click(page, '#pipeGo');
      await page.waitForSelector('[data-candidate]', { timeout: 120000 });
      await wait(page, 900);
      const c = page.locator('.pipelist li').first();
      const b = await c.boundingBox();
      await moveTo(page, b.x + 160, b.y + b.height / 2, 900);
      await wait(page, 2500);
    }
  },
  clinic_review: {
    target: 14, url: '/',
    prep: async page => {
      await page.locator('#pipeGo').click();
      await page.waitForSelector('[data-candidate]', { timeout: 120000 });
    },
    act: async page => {
      await click(page, '[data-candidate]');
      await wait(page, 900);
      await click(page, '#importNext');
      await wait(page, 3500);
      await orbit(page, 320, 2600);
      await click(page, 'button:has-text("Guided tour")');
      await wait(page, 6500);
    }
  },
  clinic_simulate: {
    target: 14, url: '/', prep: clinicToReview,
    act: async page => {
      await click(page, '[data-next="simulate"]');
      await wait(page, 1800);
      await click(page, '[data-qpreset="flu"]');
      await wait(page, 1200);
      await click(page, 'button:has-text("Run 20 days")');
      await page.waitForSelector('#app.sim-results', { timeout: 240000 });
      await wait(page, 5000);
    }
  },
  clinic_assistant: {
    target: 16, url: '/',
    prep: async page => {
      await clinicToReview(page);
      await page.locator('[data-next="simulate"]').click();
      await wait(page, 1500);
      await page.locator('[data-qpreset="flu"]').click();
      await page.locator('button:has-text("Run 20 days")').click();
      await page.waitForSelector('#app.sim-results', { timeout: 240000 });
      await wait(page, 2000);
    },
    act: async page => { await ask(page, 'What if we add a nurse?', 11000); }
  },
  clinic_compare: {
    target: 7, url: '/',
    prep: async page => {
      await SHOTS.clinic_assistant.prep(page);
    },
    act: async page => { await ask(page, 'Compare the layouts', 6000); }
  },
  clinic_edit: {
    target: 19, url: '/', prep: clinicToReview,
    act: async page => {
      await click(page, '#editToggle');
      await wait(page, 900);
      await click(page, '#askBigger');
      await wait(page, 700);
      await click(page, '#editText');
      await page.locator('#editText').fill('');
      await type(page, 'Make the waiting room 20% bigger, keep the restrooms fixed', 26);
      await click(page, '#editGo');
      await wait(page, 6000);
      if (!(await page.locator('#editText').isVisible().catch(() => false))) await click(page, '#askBigger');
      await click(page, '#editText');
      await page.locator('#editText').fill('');
      await type(page, 'Make the waiting room 250% bigger', 26);
      await click(page, '#editGo');
      await wait(page, 6000);
    }
  },
  clinic_export: {
    target: 8, url: '/', prep: clinicToReview,
    act: async page => {
      await click(page, '[data-next="simulate"]');
      await wait(page, 1200);
      await click(page, '[data-next="export"]');
      await wait(page, 3000);
      await click(page, 'button:has-text("Download .zip")').catch(() => {});
      await wait(page, 2500);
    }
  },
  dc_design: {
    target: 25, url: '/datacenter',
    act: async page => {
      await wait(page, 600);
      const box = page.locator('textarea, [contenteditable]').first();
      await click(page, box);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await type(page, '20 MW AI factory, liquid cooled, N+1 cooling, 2N power', 30);
      await page.keyboard.press('Enter');
      await wait(page, 5000);
      await orbit(page, 300, 2600);
      for (const lens of ['Power', 'Heat', 'Backup']) {
        await click(page, `button:text-is("${lens}")`);
        await wait(page, 3200);
      }
    }
  },
  dc_test: {
    target: 16, url: '/datacenter',
    prep: async page => { await page.locator('textarea, [contenteditable]').first().click(); await page.keyboard.press('Enter'); await wait(page, 5000); },
    act: async page => {
      await click(page, 'button:has-text("Test this design")');
      await wait(page, 2500);
      await click(page, 'button:has-text("grid goes down")');
      await wait(page, 4000);
      await click(page, 'button:has-text("Worst day")');
      await wait(page, 4500);
      await ask(page, 'Why?', 4000);
    }
  },
  dc_cost: {
    target: 12, url: '/datacenter',
    prep: SHOTS_dcPrep(),
    act: async page => {
      await click(page, '[data-step="cost"]');
      await wait(page, 3500);
      await ask(page, 'Electricity at 15 cents', 6000);
    }
  },
  dc_export: {
    target: 7, url: '/datacenter',
    prep: SHOTS_dcPrep(),
    act: async page => {
      await page.locator('button:has-text("OpenUSD for Omniverse")').scrollIntoViewIfNeeded();
      await click(page, 'button:has-text("OpenUSD for Omniverse")');
      await wait(page, 4000);
    }
  }
};

function SHOTS_dcPrep() {
  return async page => { await page.locator('textarea, [contenteditable]').first().click(); await page.keyboard.press('Enter'); await wait(page, 5000); };
}

const only = process.argv.slice(2);
for (const [name, shot] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  const { browser, ctx, page } = await open({ acceptDownloads: true });
  try {
    await page.goto(BASE + shot.url, { waitUntil: 'networkidle' });
    await wait(page, 1500);
    if (shot.prep) await shot.prep(page);
    const stop = await startCapture(page, path.join(OUT, name + '.mp4'));
    await wait(page, 400);
    await shot.act(page);
    await stop({ trimStart: 0.2 });
    console.log('recorded', name, `(dialogue ~${shot.target} s)`);
  } catch (e) {
    console.log('FAILED  ', name, String(e.message || e).slice(0, 1500));
  } finally {
    await ctx.close();
    await browser.close();
  }
}
