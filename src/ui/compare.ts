/* ---------- Comparing layouts on the same day ---------- */
import {
  ClinicSim,
  DAY_KEYS,
  daySeed,
  fmtMin,
  preparePlan,
  roleName,
  runDay,
  summarizeDays,
  type Metrics,
  type PreparedPlan,
  type SimScenario
} from '../engine';
import { state, type CompareRow } from '../state';
import { $, esc } from './dom';
import { SAMPLES } from './import';

export function headlessDay(P: PreparedPlan, sc?: SimScenario): Metrics {
  const sim = new ClinicSim(P.m, P.g, P.pf, P.info, sc || state.scenario, state.seed);
  sim.runAll();
  return sim.metrics();
}
export function quickMeans(P: PreparedPlan, sc: SimScenario, n: number): Record<string, number> {
  const days = [];
  for (let d = 0; d < n; d++) days.push(runDay(P, sc, daySeed(sc.seed || 42, d)));
  const sum = summarizeDays(days),
    out: Record<string, number> = {};
  for (const k of DAY_KEYS) out[k] = sum.agg[k].mean;
  return out;
}
export function compareRows(sc?: SimScenario): CompareRow[] {
  sc = sc || state.scenario;
  const v = state.versions[state.vIndex],
    P0 = state.P as PreparedPlan,
    rows: CompareRow[] = [
      {
        name: v.name + (state.versions.length > 1 ? ', version ' + v.n : ''),
        m: quickMeans(P0, sc, 5),
        info: P0.info,
        current: true
      }
    ];
  for (const k of ['A', 'B', 'C']) {
    if (v.key === k && state.vIndex === 0 && !Object.keys(v.renames).length) continue;
    const P = preparePlan(SAMPLES[k], []);
    rows.push({ name: P.m.name, m: quickMeans(P, sc, 5), info: P.info });
  }
  return rows;
}
export function runCompare(): void {
  const rows = compareRows();
  state.compare = { scenarioKey: state.scenario.label, rows };
  const lines: [string, (r: CompareRow) => number, 'max' | 'min' | null, (v: number) => string][] = [
    ['Patients seen', r => r.m.seen, 'max', v => String(v)],
    ['Average wait', r => r.m.avgWait, 'min', fmtMin],
    ['1 in 10 waited over', r => r.m.p90Wait, 'min', fmtMin],
    ['Walking per nurse', r => r.m.nurseKm, 'min', v => v.toFixed(1) + ' km'],
    ['Exam rooms in use', r => r.m.examUse, null, v => Math.round(v * 100) + '%'],
    ['Longest patient journey', r => r.info.routes.journey.len, 'min', v => Math.round(v) + ' m'],
    ['Longest way out', r => (r.info.routes.egress ? r.info.routes.egress.len : 0), 'min', v => Math.round(v) + ' m']
  ];
  let html =
    '<thead><tr><th scope="col">Same day, same arrivals</th>' +
    rows.map(r => '<th scope="col">' + esc(r.name) + (r.current ? '<small>Yours</small>' : '') + '</th>').join('') +
    '</tr></thead><tbody>';
  for (const [label, get, better, fmt] of lines) {
    const vals = rows.map(get),
      mx = Math.max(...vals.map(Math.abs), 1e-9),
      bestV = better === 'max' ? Math.max(...vals) : better === 'min' ? Math.min(...vals) : null,
      same = vals.every(x => Math.abs(x - vals[0]) < 1e-9);
    html +=
      '<tr><th scope="row">' +
      label +
      '</th>' +
      vals
        .map(
          x =>
            '<td' +
            (bestV !== null && !same && Math.abs(x - bestV) < 1e-9 ? ' class="best"' : '') +
            '><span class="num">' +
            fmt(x) +
            '</span><span class="bar"><i style="width:' +
            Math.round((Math.abs(x) / mx) * 100) +
            '%"></i></span></td>'
        )
        .join('') +
      '</tr>';
  }
  $('#compareTable').innerHTML = html + '</tbody>';
  const byNurse = rows.slice().sort((a, b) => a.m.nurseKm - b.m.nurseKm),
    lo = byNurse[0],
    hi = byNurse[byNurse.length - 1],
    pct = hi.m.nurseKm ? Math.round((1 - lo.m.nurseKm / hi.m.nurseKm) * 100) : 0;
  $('#compareHeadline').textContent =
    pct > 0
      ? lo.name + ' needs ' + pct + '% less nurse walking than ' + hi.name + ' on the same day.'
      : 'The layouts perform about the same on this day.';
  const S = state.scenario;
  $('#compareCaption').textContent =
    '“' +
    S.label +
    '”, averaged over 5 days each: about ' +
    S.patients +
    ' patients, ' +
    S.providers +
    ' ' +
    roleName('provider', S.providers) +
    ', ' +
    S.nurses +
    ' ' +
    roleName('nurse', S.nurses) +
    '.';
  $('#comparePanel').hidden = false;
}
