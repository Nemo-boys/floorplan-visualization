/* Step 1: Import. The plan header, the sample cards and the summary of what was read. */
import {
  SAMPLE_SPECS,
  inwardDir,
  makeSamplePlan,
  planWindows,
  preparePlan,
  type Model,
  type PlanJson
} from '../engine';
import { planSVG } from '../plan2d/plan-svg';
import { state, type Version } from '../state';
import { $, esc } from './dom';
import { ICON } from './icons';

export const SAMPLES: Record<string, PlanJson> = {
  A: makeSamplePlan('A'),
  B: makeSamplePlan('B'),
  C: makeSamplePlan('C')
};
export function updatePlanHeader(): void {
  const v = state.versions[state.vIndex];
  $('#planName').textContent = v ? v.name : 'No plan yet';
  $('#planVersion').textContent = v ? 'Version ' + v.n : 'Start by importing a plan';
}
export function renderImportSummary(v: Version): void {
  const P = state.P;
  if (!P) return;
  const m = P.m,
    exams = m.rooms.filter(r => r.type === 'exam_room').length;
  const doorsReal = m.doors.filter(d => !d.isEntrance).length,
    wins = planWindows(m).length;
  const rows = [
    ['Rooms', m.rooms.length + ' rooms, including ' + exams + ' exam rooms'],
    [
      'Doors',
      m.inferredDoors
        ? 'None in the file, so a door to the corridor was added for each room'
        : doorsReal + ' doors and openings'
    ],
    ['Entrance', 'On the ' + facadeName(m) + ' side, into the ' + m.rooms[P.info.entK].label.toLowerCase()],
    ['Walls', 'Worked out from the room edges'],
    ['Windows', wins + ' on outside walls'],
    ['Furniture', P.furn.items.length + ' items placed from the room types'],
    ['Waiting room', P.info.seats.length + ' seats']
  ];
  $('#importSummary').hidden = false;
  $('#importName').textContent = v.name;
  $('#importSource').textContent =
    v.source === 'pipeline' ? 'From the Module 1 pipeline' : v.source === 'file' ? 'Uploaded file' : 'Sample layout';
  $('#importArea').textContent =
    Math.round(m.rooms.reduce((s, r) => s + r.w * r.h, 0)) +
    ' m² on a ' +
    m.W.toFixed(1) +
    ' × ' +
    m.D.toFixed(1) +
    ' m footprint';
  $('#importRead').innerHTML = rows
    .map(([k, t]) => '<li><span class="ok">' + ICON.pass + '</span><b>' + k + '</b><span>' + esc(t) + '</span></li>')
    .join('');
  $('#importThumb').innerHTML = planSVG(P, {
    compact: true,
    labels: false,
    furniture: true,
    doors: false,
    dims: false,
    entrance: true
  });
}
export function facadeName(m: Model): string {
  const d = m.doors.find(q => q.isEntrance);
  if (!d) return 'front';
  const n = inwardDir(d, m);
  return n.y > 0 ? 'south' : n.y < 0 ? 'north' : n.x > 0 ? 'west' : 'east';
}
export function renderSampleThumbs(): void {
  for (const k of ['A', 'B', 'C']) {
    const el = $('#thumb' + k),
      t = $('#thumbText' + k);
    if (!el) continue;
    const P = preparePlan(SAMPLES[k], []);
    el.innerHTML = planSVG(P, { compact: true, labels: false, furniture: true, doors: false, dims: false });
    if (t)
      t.textContent =
        SAMPLE_SPECS[k].blurb + '. Nurses walk ' + Math.round(P.info.avgNurse) + ' m to the average exam room.';
  }
}
