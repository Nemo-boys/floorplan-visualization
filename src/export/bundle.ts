/* The plan.json export and the .zip bundle. */
import type { PreparedPlan } from '../engine';
import { planSVG } from '../plan2d/plan-svg';
import { state } from '../state';
import { R3 } from '../view3d/r3';
import { writeGLB } from './glb';
import { buildExportModel } from './model';
import { blenderScript, readmeMd, skillMd } from './texts';
import { makeZip, type ZipFile } from './zip';

export function planJsonExport(): string {
  const v = state.versions[state.vIndex],
    out = JSON.parse(JSON.stringify(state.json));
  out.version = v.n;
  out.exported_at = new Date().toISOString();
  out.furniture_added = state.placed.map(it => ({
    kind: it.kind,
    center_mm: [Math.round(it.x * 1000), Math.round(it.y * 1000)],
    facing: it.dir
  }));
  out.checks = state.checks.map(c => ({ rule: c.label, pass: c.pass, detail: c.detail, source: c.source }));
  return JSON.stringify(out, null, 2);
}
export function exportBundle(): Uint8Array {
  const v = state.versions[state.vIndex],
    when = new Date().toISOString().slice(0, 10),
    files: ZipFile[] = [];
  if (R3) files.push({ name: 'clinic.glb', data: writeGLB(buildExportModel()) });
  files.push({ name: 'plan.json', data: planJsonExport() });
  files.push({ name: 'plan.svg', data: planSVG(state.P as PreparedPlan, {}) });
  files.push({ name: 'build_in_blender.py', data: blenderScript(v.name) });
  files.push({ name: 'claude-skill/floorplan-to-blender/SKILL.md', data: skillMd() });
  files.push({ name: 'README.md', data: readmeMd(v.name, v.n, when) });
  return makeZip(files);
}
