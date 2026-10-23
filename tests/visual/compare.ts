/*
 * Compares the app's screenshots with the reference's (PLAN.md, “Visual tolerance”).
 *
 *   tsx tests/visual/compare.ts [referenceDir] [outputDir] [diffDir]
 *     defaults: tests/visual/reference, tests/visual/output, tests/visual/diff
 *
 * Outside the 3D canvas at most 0.1% of pixels may differ (threshold 0.1). Inside it, up to 3% (threshold 0.2),
 * and any canvas diff over 1% is listed so someone can check it by eye. The canvas rectangle comes from the
 * reference's shots.json, written by capture.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Rect, Shot } from './capture';

const OUTSIDE = { threshold: 0.1, maxShare: 0.001 };
const INSIDE = { threshold: 0.2, maxShare: 0.03, reviewShare: 0.01 };

const refDir = process.argv[2] || 'tests/visual/reference';
const outDir = process.argv[3] || 'tests/visual/output';
const diffDir = process.argv[4] || 'tests/visual/diff';

const inRect = (r: Rect | null, x: number, y: number): boolean =>
  !!r && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

// Pixels that differ at this threshold, split into inside and outside the canvas.
function countDiffs(a: PNG, b: PNG, threshold: number, canvas: Rect | null): { inside: number; outside: number } {
  const { width, height } = a;
  const mask = new PNG({ width, height });
  pixelmatch(a.data, b.data, mask.data, width, height, { threshold, diffMask: true });
  let inside = 0;
  let outside = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (mask.data[(y * width + x) * 4 + 3] !== 255) continue;
      if (inRect(canvas, x, y)) inside++;
      else outside++;
    }
  return { inside, outside };
}

const shots = JSON.parse(fs.readFileSync(path.join(refDir, 'shots.json'), 'utf8')) as Shot[];
fs.mkdirSync(diffDir, { recursive: true });
const failures: string[] = [];
const review: string[] = [];
let passed = 0;
for (const shot of shots) {
  const outFile = path.join(outDir, shot.file);
  if (!fs.existsSync(outFile)) {
    failures.push(shot.file + ': no screenshot from the app');
    continue;
  }
  const a = PNG.sync.read(fs.readFileSync(path.join(refDir, shot.file)));
  const b = PNG.sync.read(fs.readFileSync(outFile));
  if (a.width !== b.width || a.height !== b.height) {
    failures.push(shot.file + ': size ' + b.width + '×' + b.height + ', expected ' + a.width + '×' + a.height);
    continue;
  }
  const canvasArea = shot.canvas ? shot.canvas.width * shot.canvas.height : 0;
  const outsideArea = a.width * a.height - canvasArea;
  const outside = countDiffs(a, b, OUTSIDE.threshold, shot.canvas).outside / Math.max(1, outsideArea);
  const inside = canvasArea ? countDiffs(a, b, INSIDE.threshold, shot.canvas).inside / canvasArea : 0;
  const pct = (v: number): string => (v * 100).toFixed(2) + '%';
  const line = shot.file + ': outside ' + pct(outside) + ', 3D ' + pct(inside);
  const ok = outside <= OUTSIDE.maxShare && inside <= INSIDE.maxShare;
  if (!ok || inside > INSIDE.reviewShare) {
    const diff = new PNG({ width: a.width, height: a.height });
    pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: OUTSIDE.threshold });
    fs.writeFileSync(path.join(diffDir, shot.file), PNG.sync.write(diff));
  }
  if (!ok) failures.push(line);
  else {
    passed++;
    if (inside > INSIDE.reviewShare) review.push(line);
  }
}
console.log(passed + ' of ' + shots.length + ' screenshots match.');
if (review.length) console.log('Check these 3D diffs by eye (over 1%):\n  ' + review.join('\n  '));
if (failures.length) console.log('Differ:\n  ' + failures.join('\n  ') + '\nDiff images in ' + diffDir);
process.exit(failures.length ? 1 : 0);
