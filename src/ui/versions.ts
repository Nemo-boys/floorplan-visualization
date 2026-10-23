/* ---------- Versions: every change is saved so it can be compared and undone ---------- */
import { SAMPLE_SPECS, clamp, makePlanFromSpec, preparePlan, runChecks, type FurnItem, type PlanJson } from '../engine';
import { state, type PlanSource, type Version } from '../state';
import { R3 } from '../view3d/r3';
import { tour } from '../view3d/tour';
import { $ } from './dom';
import { renderImportSummary, updatePlanHeader } from './import';
import { renderPlan2D } from './plan-panel';
import {
  buildScene,
  fillRoomDefaults,
  fitCamera,
  renderBuilder,
  renderChecks,
  renderDockThumb,
  renderEditTools,
  renderExport,
  renderReviewInfo,
  renderVersions,
  resetSim,
  selectItem,
  setView,
  stopPlacing,
  updateRouteText
} from './pending';

export function clonePlaced(it: FurnItem): FurnItem {
  return {
    kind: it.kind,
    x: it.x,
    y: it.y,
    dir: { x: it.dir.x, y: it.dir.y },
    w: it.w,
    d: it.d,
    block: true,
    placed: true,
    room: it.room
  } as FurnItem;
}
export function planJsonFromVersion(v: Version): PlanJson {
  const json: PlanJson = v.spec ? makePlanFromSpec(v.spec) : JSON.parse(JSON.stringify(v.baseJson));
  json.name = v.name;
  json.blurb = v.blurb || json.blurb || '';
  for (const r of json.rooms) if (v.renames[r.id as string]) r.label = v.renames[r.id as string];
  return json;
}
export function applyVersion(v: Version, keepCamera?: boolean): void {
  state.json = planJsonFromVersion(v);
  state.spec = v.spec;
  state.placed = v.placed.map(clonePlaced);
  state.P = preparePlan(state.json, state.placed);
  state.checks = runChecks(state.P);
  state.compare = null;
  state.exportMetrics = null;
  stopPlacing();
  selectItem(null);
  if (R3) {
    if (state.view === 'tour') {
      tour.playing = false;
      tour.phase = 'idle';
    }
    if (state.view !== 'orbit') setView('orbit');
    buildScene();
  }
  resetSim(state.sim ? clamp(state.sim.now, 90, 420) : 90);
  renderPlan2D();
  renderDockThumb();
  updatePlanHeader();
  updateRouteText();
  renderVersions();
  renderChecks();
  renderReviewInfo();
  renderEditTools();
  if (state.step === 'export') renderExport();
  if (state.scn) {
    fillRoomDefaults(state.scn);
    renderBuilder();
  }
  if (!keepCamera) fitCamera(true);
}
export function commitVersion(change: string, mutate: (nv: Version) => void): Version {
  const cur = state.versions[state.vIndex];
  const nv: Version = {
    n: state.versions.length + 1,
    change,
    spec: cur.spec ? JSON.parse(JSON.stringify(cur.spec)) : null,
    baseJson: cur.baseJson,
    renames: Object.assign({}, cur.renames),
    placed: state.placed.map(clonePlaced),
    name: cur.name,
    blurb: cur.blurb,
    source: cur.source,
    at: new Date()
  };
  mutate(nv);
  state.versions = state.versions.slice(0, state.vIndex + 1).concat([nv]);
  state.vIndex = state.versions.length - 1;
  applyVersion(nv, true);
  return nv;
}
export type ImportSource =
  { kind: 'file'; json: PlanJson; file?: string } | { kind: 'pipeline' | 'sample'; key: string };
export function importPlan(src: ImportSource): void {
  let v: Version;
  if (src.kind === 'file')
    v = {
      n: 1,
      change: 'Uploaded ' + (src.file || 'plan.json'),
      spec: null,
      baseJson: src.json,
      renames: {},
      placed: [],
      name: src.json.name || 'Your plan',
      blurb: src.json.blurb || '',
      source: 'file',
      at: new Date()
    };
  else {
    const spec = JSON.parse(JSON.stringify(SAMPLE_SPECS[src.key])),
      pipe = src.kind === 'pipeline';
    v = {
      n: 1,
      change: pipe ? 'Received from Module 1' : 'Opened ' + spec.name,
      spec,
      baseJson: null,
      renames: {},
      placed: [],
      name: pipe ? 'Primary care clinic' : spec.name,
      blurb: spec.blurb,
      source: src.kind as PlanSource,
      key: src.key,
      at: new Date()
    };
  }
  preparePlan(planJsonFromVersion(v), []);
  state.versions = [v];
  state.vIndex = 0;
  state.source = v.source;
  state.swapSel = [];
  state.renameSel = null;
  state.selectedRoom = null;
  applyVersion(v);
  renderImportSummary(v);
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => {
    if (b.dataset.step !== 'import') b.disabled = false;
  });
  $<HTMLButtonElement>('#importNext').disabled = false;
}
