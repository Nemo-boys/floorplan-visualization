/* ---------- Results, and the plan checks shown with them ---------- */
import { fmtClock, fmtMin, pipelineChecks, type Spread } from '../../engine';
import { state } from '../../state';
import { runCompare } from '../compare';
import { $, esc } from '../dom';
import { ICON } from '../icons';
import { SWEEP_FIELDS } from './consts';
import { setSimTab } from './index';

export function rng(x: Spread, f: (v: number) => string): string {
  return f(x.mean) + (Math.abs(x.hi - x.lo) > 1e-9 ? '<small>' + f(x.lo) + ' to ' + f(x.hi) + '</small>' : '');
}
export const fmtPct = (v: number): string => Math.round(v * 100) + '%',
  fmtKm = (v: number): string => v.toFixed(1) + ' km',
  fmtN = (v: number): string => String(Math.round(v));
export function renderResults(): void {
  const box = document.querySelector<HTMLElement>('#resultsBody');
  if (!box) return;
  const r = state.run;
  if (!r) {
    box.innerHTML =
      '<div class="empty"><h3>No results yet</h3><p>Set up a scenario and run it. The answer shows up here, and the 3D plays a typical day.</p><button type="button" class="btn primary" id="goScenario">Set up a scenario</button></div>';
    $('#goScenario').addEventListener('click', () => setSimTab('scenario'));
    $('#playNote').textContent = '';
    return;
  }
  const a = r.sum.agg,
    v = r.v,
    n = r.sum.n,
    tw = r.sum.typical;
  const util = Object.entries(v.util).sort((x, y) => y[1] - x[1]);
  const peak =
    v.peak && v.peak.lobby
      ? 'The lobby was fullest around ' + fmtClock(v.peak.t) + ' on the day shown, with ' + v.peak.lobby + ' waiting.'
      : 'The lobby never really filled up on the day shown.';
  const rules = (r.sc.rules || [])
    .map(rule => {
      const k = r.sum.fireDays[rule.id] || 0;
      return '<li><b>Fired on ' + k + ' of ' + n + ' days.</b> ' + esc(rule.label) + '</li>';
    })
    .join('');
  let sweep = '';
  if (r.sweep) {
    const S = r.sweep;
    sweep =
      '<section class="rsec"><h3>' +
      esc(SWEEP_FIELDS[S.field]) +
      ', compared</h3><p class="small muted">' +
      S.n +
      ' days each. The 3D plays the middle value.</p><div class="tablewrap"><table class="cmp small"><thead><tr><th scope="col">' +
      esc(SWEEP_FIELDS[S.field]) +
      '</th><th scope="col">Verdict</th><th scope="col">Average wait</th><th scope="col">1 in 10 over</th><th scope="col">Busiest</th></tr></thead><tbody>' +
      S.rows
        .map(
          x =>
            '<tr><th scope="row">' +
            x.value +
            '</th><td><span class="vpill ' +
            x.v.level +
            '">' +
            esc(x.v.title) +
            '</span></td><td>' +
            fmtMin(x.agg.avgWait.mean) +
            '</td><td>' +
            fmtMin(x.agg.p90Wait.mean) +
            '</td><td>' +
            esc(x.v.bottleneck.name) +
            ' ' +
            fmtPct(x.v.bottleneck.util) +
            '</td></tr>'
        )
        .join('') +
      '</tbody></table></div></section>';
  }
  const ns =
    a.notSeen.mean >= 0.05
      ? ' On average ' +
        (a.notSeen.mean < 1 ? 'less than 1 patient was' : fmtN(a.notSeen.mean) + ' patients were') +
        ' still waiting when the staff went home.'
      : '';
  box.innerHTML =
    '<p class="rmeta">' +
    esc(r.name) +
    '<span>' +
    n +
    (n === 1 ? ' day' : ' days') +
    ' on ' +
    esc(r.plan.name) +
    ', version ' +
    r.plan.version +
    '</span></p>' +
    '<div class="verdict ' +
    v.level +
    '"><span class="vt">' +
    esc(v.title) +
    '</span><p>On a typical day the average wait is ' +
    fmtMin(tw.avgWait) +
    ', and 1 in 10 patients wait more than ' +
    fmtMin(tw.p90Wait) +
    '.' +
    (n > 1
      ? ' Across ' +
        n +
        ' days, average waits ranged from ' +
        fmtMin(a.avgWait.lo) +
        ' to ' +
        fmtMin(a.avgWait.hi) +
        '.'
      : '') +
    esc(ns) +
    '</p></div>' +
    '<section class="rsec"><h3>Busiest: ' +
    esc(util[0][0]) +
    '</h3><p class="small">' +
    (util[0][0] === 'exam rooms' ? 'In use ' : 'Busy ') +
    fmtPct(util[0][1]) +
    (util[0][0] === 'exam rooms' ? ' of the day.' : ' of their time on shift.') +
    ' ' +
    esc(peak) +
    '</p><ul class="ubars">' +
    util
      .map(
        ([k, x]) =>
          '<li><span>' +
          esc(k.replace(/^./, c => c.toUpperCase())) +
          '</span><span class="ub"><i style="width:' +
          fmtPct(x) +
          '"></i></span><b>' +
          fmtPct(x) +
          '</b></li>'
      )
      .join('') +
    '</ul></section>' +
    '<section class="rsec"><h3>Across ' +
    n +
    (n === 1 ? ' day' : ' days') +
    '</h3><div class="rgrid">' +
    (
      [
        ['Patients seen', rng(a.seen, fmtN)],
        ['Average wait', rng(a.avgWait, fmtMin)],
        ['1 in 10 waited over', rng(a.p90Wait, fmtMin)],
        ['Time in the clinic', rng(a.avgTime, fmtMin)],
        ['Walking per nurse', rng(a.nurseKm, fmtKm)],
        ['Last patient leaves', fmtClock(a.lastExit.mean)]
      ] as [string, string][]
    )
      .concat(a.noShows.mean > 0 ? [['No-shows', rng(a.noShows, fmtN)]] : [])
      .concat(a.turnedAway.mean > 0 ? [['Walk-ins turned away', rng(a.turnedAway, fmtN)]] : [])
      .concat(a.notSeen.mean > 0 ? [['Not seen before staff left', rng(a.notSeen, fmtN)]] : [])
      .map(([k, x]) => '<div><span>' + k + '</span><b>' + x + '</b></div>')
      .join('') +
    '</div></section>' +
    (rules ? '<section class="rsec"><h3>Rules</h3><ul class="rules">' + rules + '</ul></section>' : '') +
    sweep +
    // Planned difference 1 (PLAN.md): “Ask the assistant why” stays in the markup but is hidden.
    '<div class="row"><button type="button" class="btn" id="cmpLayouts">Compare layouts with this scenario</button><button type="button" class="btn" id="askWhy" hidden>Ask the assistant why</button><button type="button" class="btn" id="editScn">Change the scenario</button></div>';
  $('#cmpLayouts').addEventListener('click', runCompare);
  $('#editScn').addEventListener('click', () => setSimTab('scenario'));
  $('#playNote').textContent = 'The 3D plays the typical day from this run.';
}
export function renderChecks(): void {
  const box = document.querySelector<HTMLElement>('#checks');
  if (!box) return;
  const pass = state.checks.filter(c => c.pass).length,
    fromPipeline = !!pipelineChecks(state.json);
  $('#checksSummary').textContent =
    pass + ' of ' + state.checks.length + (fromPipeline ? ' checks pass' : ' example checks pass');
  const note = document.querySelector<HTMLElement>('details.planchecks > p');
  if (note)
    note.textContent = fromPipeline
      ? 'From the AegisPlan rule checker. Only these implemented checks were evaluated.'
      : 'Example checks until Module 2 connects with the full U.S. rule set.';
  box.innerHTML = state.checks
    .map(
      c =>
        '<li class="' +
        (c.pass ? 'pass' : 'fail') +
        '"><span class="ic">' +
        (c.pass ? ICON.pass : ICON.fail) +
        '</span><span><b>' +
        esc(c.label) +
        '</b><small>' +
        esc(c.detail) +
        '</small><em>' +
        esc(c.source) +
        '</em></span></li>'
    )
    .join('');
}
