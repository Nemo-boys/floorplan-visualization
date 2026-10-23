/* Export: the step's content, browser downloads, and the bundle checked against contracts/export-bundle.md, the glTF
   validator and the reference's own exportBundle(). Writes the validator report and the ZIP listing to
   reports/export/. */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Color } from 'three';

const isReference = process.env.E2E_TARGET === 'reference';
const REFERENCE_URL = 'http://localhost:5174/reference.html';
const require = createRequire(import.meta.url);
const validator = require('gltf-validator') as {
  validateBytes: (
    b: Uint8Array
  ) => Promise<{ issues: { numErrors: number; numWarnings: number; messages: unknown[] } }>;
};
const outDir = path.join('reports', 'export');
const ENTRIES = [
  'clinic.glb',
  'plan.json',
  'plan.svg',
  'build_in_blender.py',
  'claude-skill/floorplan-to-blender/SKILL.md',
  'README.md'
];

/* The bundle the page builds, as bytes. */
async function bundleOf(page: Page): Promise<Uint8Array> {
  const b64 = (await page.evaluate(
    '(() => { const F = window.__fi || window; const z = F.exportBundle(); let s = ""; for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000)); return btoa(s); })()'
  )) as string;
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
/* Reads a stored (uncompressed) ZIP: entries in order, with their bytes and the local header flags. */
function unzip(z: Uint8Array): { name: string; data: Uint8Array; method: number; flags: number }[] {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength),
    out = [];
  let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) {
    const flags = dv.getUint16(o + 6, true),
      method = dv.getUint16(o + 8, true),
      size = dv.getUint32(o + 18, true),
      nl = dv.getUint16(o + 26, true),
      xl = dv.getUint16(o + 28, true);
    const name = new TextDecoder().decode(z.subarray(o + 30, o + 30 + nl));
    const data = z.subarray(o + 30 + nl + xl, o + 30 + nl + xl + size);
    out.push({ name, data, method, flags });
    o += 30 + nl + xl + size;
  }
  return out;
}
interface Gltf {
  scenes: { name: string; nodes: number[] }[];
  nodes: { name: string; mesh?: number; children?: number[] }[];
  meshes: { name: string; primitives: { attributes: Record<string, number>; material: number }[] }[];
  materials: {
    name: string;
    pbrMetallicRoughness: { baseColorFactor: number[] };
    alphaMode?: string;
    doubleSided?: boolean;
  }[];
}
function glbJson(glb: Uint8Array): Gltf {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  expect(dv.getUint32(0, true)).toBe(0x46546c67);
  expect(dv.getUint32(4, true)).toBe(2);
  expect(dv.getUint32(8, true)).toBe(glb.byteLength);
  const jlen = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jlen)));
}
async function openExport(page: Page, url?: string): Promise<void> {
  await page.goto((url || '') + '#export');
  await expect(page.locator('#app')).toHaveClass(/step-export/);
  await expect(page.locator('#exStats div')).toHaveCount(6);
}

test('the Export step shows the final plan, its numbers and the outputs', async ({ page }) => {
  await openExport(page);
  await expect(page.locator('#exName')).toHaveText('Primary care clinic');
  await expect(page.locator('#exVersion')).toHaveText('Version 1: Received from Module 1');
  await expect(page.locator('#exStats dt')).toHaveText([
    'Rooms',
    'Floor area',
    'Checks',
    'Average wait',
    'Walking per nurse',
    'Longest patient journey'
  ]);
  await expect(page.locator('#exStats dd').nth(0)).toHaveText('18 (6 exam rooms)');
  await expect(page.locator('#exStats dd').nth(1)).toHaveText('245 m²');
  await expect(page.locator('#exStats dd').nth(2)).toHaveText('5 of 5 pass');
  await expect(page.locator('#exStats dd').nth(3)).toContainText('(Normal Tuesday)');
  await expect(page.locator('#exStats dd').nth(5)).toHaveText('48 m');
  await expect(page.locator('#exZipName')).toHaveText('primary-care-clinic-v1.zip');
  await expect(page.locator('#exPreview svg')).toHaveCount(1);
  await expect(page.locator('#exGlbNote')).toBeHidden();
  await expect(page.locator('.out.planned button')).toBeDisabled();
  if (isReference) return;
  // Planned difference 2: always enabled, and no note about the artifact viewer.
  for (const k of ['zip', 'json', 'svg']) await expect(page.locator('[data-export="' + k + '"]')).toBeEnabled();
  await expect(page.locator('#exDlNote')).toHaveCount(0);
});

test('the three downloads use the browser, with the status line', async ({ page }) => {
  test.skip(isReference, 'The reference saves through the artifact viewer (planned difference 2).');
  await openExport(page);
  for (const [k, file] of [
    ['json', 'primary-care-clinic-v1.json'],
    ['svg', 'primary-care-clinic-v1.svg'],
    ['zip', 'primary-care-clinic-v1.zip']
  ]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="' + k + '"]').click()]);
    expect(dl.suggestedFilename()).toBe(file);
    await expect(page.locator('#exStatus')).toHaveText('Saved ' + file + '.');
    const bytes = fs.readFileSync(await dl.path());
    if (k === 'json') expect(JSON.parse(bytes.toString('utf8')).version).toBe(1);
    if (k === 'svg') expect(bytes.toString('utf8')).toMatch(/^<svg xmlns/);
    if (k === 'zip') expect(unzip(new Uint8Array(bytes)).map(e => e.name)).toEqual(ENTRIES);
  }
});

test('the bundle follows contracts/export-bundle.md and the GLB passes the glTF validator', async ({ page }) => {
  await openExport(page);
  const zip = await bundleOf(page),
    entries = unzip(zip);
  expect(entries.map(e => e.name)).toEqual(ENTRIES);
  for (const e of entries) {
    expect(e.method, e.name + ' is stored').toBe(0);
    expect(e.flags & 0x0800, e.name + ' has a UTF-8 name').toBe(0x0800);
  }
  const glb = entries[0].data;
  const report = await validator.validateBytes(new Uint8Array(glb));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, (isReference ? 'reference' : 'app') + '-gltf-validator.json'),
    JSON.stringify(report, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, (isReference ? 'reference' : 'app') + '-zip-listing.txt'),
    entries.map(e => String(e.data.length).padStart(9) + '  ' + e.name).join('\n') + '\n'
  );
  expect(report.issues.numErrors).toBe(0);
  const g = glbJson(glb),
    plan = JSON.parse(new TextDecoder().decode(entries[1].data));
  // Node tree: Clinic, then one node per room (floor first, then furniture), then walls and doors.
  expect(g.scenes[0].name).toBe('Clinic');
  const rootNode = g.nodes[g.scenes[0].nodes[0]];
  expect(rootNode.name).toBe('Clinic');
  const kids = (rootNode.children as number[]).map(i => g.nodes[i]);
  const labels = plan.rooms.map((r: { label: string }) => r.label);
  expect(kids.map(n => n.name)).toEqual([...labels, 'Walls, windows and frames', 'Doors']);
  for (const room of kids.slice(0, labels.length)) {
    const names = (room.children || []).map(i => g.nodes[i].name);
    expect(names[0]).toBe(room.name + ' floor');
    for (const n of names.slice(1)) expect(n).toMatch(/^[A-Z][A-Za-z -]+ \d+$/);
  }
  expect(kids.find(n => n.name === 'Exam 3')?.children?.map(i => g.nodes[i].name)).toContain('Exam table 1');
  for (const n of g.nodes) {
    if (n.children) expect(n.children.length).toBeGreaterThan(0);
    if (n.mesh == null) expect(n.children, n.name + ' groups something').toBeDefined();
  }
  // Geometry: POSITION and NORMAL only, one primitive per material.
  for (const me of g.meshes) {
    const used = me.primitives.map(p => p.material);
    expect(new Set(used).size, me.name).toBe(used.length);
    for (const p of me.primitives) expect(Object.keys(p.attributes).sort()).toEqual(['NORMAL', 'POSITION']);
  }
  // Materials: linear base colors, the fixed floor colors, glass blended and double-sided.
  const lin = (hex: string): number[] => {
    const c = new Color(hex);
    return [c.r, c.g, c.b].map(v => Math.round(v * 1000));
  };
  const colors = g.materials.map(m =>
    m.pbrMetallicRoughness.baseColorFactor.slice(0, 3).map(v => Math.round(v * 1000))
  );
  for (const hex of ['#c9a57a', '#e6ece8', '#dcdfe0', '#e4e1da', '#e3eaee', '#b7ab99'])
    expect(colors).toContainEqual(lin(hex));
  const blended = g.materials.filter(m => m.alphaMode === 'BLEND');
  expect(blended.length).toBeGreaterThan(0);
  for (const m of blended) expect(m.doubleSided).toBe(true);
  // plan.json carries the export fields.
  expect(plan.version).toBe(1);
  expect(Array.isArray(plan.furniture_added)).toBe(true);
  expect(plan.checks).toHaveLength(5);
  expect(new TextDecoder().decode(entries[5].data)).toMatch(/^# Primary care clinic, version 1\n/);
});

test('the app builds the same bundle as the reference', async ({ page, browser }) => {
  test.skip(isReference, 'Compares the app with the reference.');
  await openExport(page);
  const ref = await browser.newPage();
  await openExport(ref, REFERENCE_URL);
  const a = unzip(await bundleOf(page)),
    b = unzip(await bundleOf(ref));
  expect(a.map(e => e.name)).toEqual(b.map(e => e.name));
  for (let i = 0; i < a.length; i++) {
    if (a[i].name === 'plan.json') {
      const ja = JSON.parse(new TextDecoder().decode(a[i].data)),
        jb = JSON.parse(new TextDecoder().decode(b[i].data));
      delete ja.exported_at;
      delete jb.exported_at;
      expect(ja).toEqual(jb);
    } else
      expect(Buffer.from(a[i].data).equals(Buffer.from(b[i].data)), a[i].name + ' is byte for byte the same').toBe(
        true
      );
  }
  await ref.close();
});
