/* Differential tests: the pure parts of reference-src/export.js and the port give identical bytes and text. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { writeGLB, type ExportModel } from '../../src/export/glb';
import { blenderScript, readmeMd, skillMd } from '../../src/export/texts';
import { crc32, makeZip } from '../../src/export/zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = new Function(
  fs.readFileSync(path.join(root, 'reference-src/export.js'), 'utf8') +
    '\nreturn { writeGLB, crc32, makeZip, blenderScript, skillMd, readmeMd, ITEM_NAMES, FLOOR_EXPORT };'
)() as {
  writeGLB: typeof writeGLB;
  crc32: typeof crc32;
  makeZip: typeof makeZip;
  blenderScript: typeof blenderScript;
  skillMd: typeof skillMd;
  readmeMd: typeof readmeMd;
};

it('the Blender script, the skill and the README', () => {
  for (const name of ['Primary care clinic', 'Layout B', 'O’Neil "North" clinic'])
    expect(blenderScript(name)).toBe(R.blenderScript(name));
  expect(skillMd()).toBe(R.skillMd());
  expect(readmeMd('Primary care clinic', 3, '2026-10-23')).toBe(R.readmeMd('Primary care clinic', 3, '2026-10-23'));
});

it('crc32 and makeZip give the same bytes', () => {
  const bytes = new Uint8Array(5000).map((_, i) => (i * 7919) % 251);
  expect(crc32(bytes)).toBe(R.crc32(bytes));
  expect(crc32(new Uint8Array(0))).toBe(0);
  const files = [
    { name: 'clinic.glb', data: bytes },
    { name: 'plan.json', data: '{"rooms": []}' },
    { name: 'claude-skill/floorplan-to-blender/SKILL.md', data: 'Ünïcode — ✓' }
  ];
  const when = new Date(2026, 9, 23, 14, 37, 58);
  expect(Array.from(makeZip(files, when))).toEqual(Array.from(R.makeZip(files, when)));
});

it('writeGLB gives the same bytes', () => {
  const tri = (k: number): Float32Array => new Float32Array([0, 0, 0, k, 0, 0, 0, k, 0, k, k, 0, 0, 0, k, 1, 2, 3]);
  const model: ExportModel = {
    materials: [
      { name: 'Material 1', color: [0.5, 0.25, 0.125], alpha: 1, metallic: 0, roughness: 0.8 },
      { name: 'Material 2', color: [0.6, 0.8, 0.9], alpha: 0.3, metallic: 0.1, roughness: 0.04 }
    ],
    meshes: [
      { name: 'Exam 3 floor', primitives: [{ positions: tri(1), normals: tri(0.5), material: 0 }] },
      {
        name: 'Walls, windows and frames',
        primitives: [
          { positions: tri(2), normals: tri(1), material: 0 },
          { positions: new Float32Array([1, 2, 3]), normals: new Float32Array([0, 1, 0]), material: 1 }
        ]
      }
    ],
    nodes: [
      { name: 'Clinic', children: [1, 2] },
      { name: 'Exam 3', children: [3] },
      { name: 'Walls, windows and frames', mesh: 1 },
      { name: 'Exam 3 floor', mesh: 0 }
    ],
    roots: [0]
  };
  expect(Array.from(writeGLB(model))).toEqual(Array.from(R.writeGLB(model)));
});
