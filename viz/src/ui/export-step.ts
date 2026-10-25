/* ---------- Step 4: Export ---------- */
import { fmtMin } from '../engine';
import { exportBundle, planJsonExport } from '../export/bundle';
import { planSVG } from '../plan2d/plan-svg';
import { state } from '../state';
import { R3 } from '../view3d/r3';
import { quickMeans } from './compare';
import { $, esc } from './dom';
import { downloadFile, slug } from './download';

export function renderExport(): void {
  if (!state.P) return;
  const v = state.versions[state.vIndex],
    P = state.P;
  if (!state.exportMetrics) state.exportMetrics = quickMeans(P, state.scenario, 5);
  const mt = state.exportMetrics as Record<string, number>,
    pass = state.checks.filter(c => c.pass).length;
  $('#exName').textContent = v.name;
  $('#exVersion').textContent = 'Version ' + v.n + ': ' + v.change;
  $('#exStats').innerHTML = [
    ['Rooms', P.m.rooms.length + ' (' + P.info.exams.length + ' exam rooms)'],
    ['Floor area', Math.round(P.m.rooms.reduce((s, r) => s + r.w * r.h, 0)) + ' m²'],
    ['Checks', pass + ' of ' + state.checks.length + ' pass'],
    ['Average wait', fmtMin(mt.avgWait) + ' (' + state.scenario.label + ')'],
    ['Walking per nurse', mt.nurseKm.toFixed(1) + ' km per day'],
    ['Longest patient journey', Math.round(P.info.routes.journey.len) + ' m']
  ]
    .map(([k, t]) => '<div><dt>' + k + '</dt><dd>' + esc(t) + '</dd></div>')
    .join('');
  $('#exPreview').innerHTML = planSVG(P, { furniture: true, labels: true, dims: true });
  const name = slug(v.name) + '-v' + v.n;
  $('#exZipName').textContent = name + '.zip';
  $('#exGlbNote').hidden = !!R3;
  // Planned difference 2 (PLAN.md): downloads are the browser's own, so the buttons are always enabled.
  document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(b => {
    b.disabled = false;
  });
}
const TYPES: Record<string, string> = { zip: 'application/zip', json: 'application/json', svg: 'image/svg+xml' };
/* The status line reads “Preparing…”, then “Saved…” or the error. A browser download can't report a cancel. */
export async function saveFile(filename: string, makeData: () => string | Uint8Array): Promise<void> {
  const status = $('#exStatus');
  status.textContent = 'Preparing ' + filename + '…';
  try {
    const data = makeData();
    downloadFile(filename, data, TYPES[filename.split('.').pop() as string]);
    status.textContent = 'Saved ' + filename + '.';
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
    status.textContent = 'Couldn’t save ' + filename + (code ? ' (' + code + ')' : '') + '.';
  }
}
export function bindExport(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(b =>
    b.addEventListener('click', () => {
      const v = state.versions[state.vIndex],
        base = slug(v.name) + '-v' + v.n,
        kind = b.dataset.export;
      if (kind === 'zip') saveFile(base + '.zip', exportBundle);
      else if (kind === 'json') saveFile(base + '.json', planJsonExport);
      else if (kind === 'svg') saveFile(base + '.svg', () => planSVG(state.P as NonNullable<typeof state.P>, {}));
    })
  );
}
