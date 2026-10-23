/* ---------- Running: many days, then the typical day plays in 3D ---------- */
import {
  applyOverrides,
  compileScenario,
  daySeed,
  runDay,
  summarizeDays,
  verdictOf,
  type CompiledScenario,
  type DayResult,
  type DaysSummary,
  type PreparedPlan,
  type Verdict
} from '../../engine';
import { state, type PlanTag, type Run } from '../../state';
import { $, reduceMotion } from '../dom';
import { toast } from '../toast';
import { resetSim, updateTransport } from '../transport';
import { focusProblem, refreshChecks } from './checks';
import { SWEEP_FIELDS } from './consts';
import { saveHistory } from './history';
import { setSimTab } from './index';
import { renderDayTimeline } from './timeline';

export function planTag(): PlanTag {
  const v = state.versions[state.vIndex];
  return v ? { name: v.name, version: v.n } : { name: 'Plan', version: 1 };
}
export function setProgress(done: number, total: number, label?: string): void {
  const bar = $('#runProgress');
  bar.hidden = total === 0;
  (bar.querySelector('i') as HTMLElement).style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
  (bar.querySelector('span') as HTMLElement).textContent = label || '';
}
export async function runDays(sc: CompiledScenario, n: number, onTick?: (k: number) => void): Promise<DayResult[]> {
  const days: DayResult[] = [];
  for (let d = 0; d < n; d++) {
    days.push(runDay(state.P as PreparedPlan, sc, daySeed(sc.seed, d)));
    if (onTick && d % 2 === 1) {
      onTick(d + 1);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  return days;
}
export function playTypical(sc: CompiledScenario, seed: number): void {
  state.scenario = sc;
  state.seed = seed;
  resetSim(Math.max(sc.opens, Math.min(90, sc.closes - 60)));
  state.playing = !reduceMotion;
  updateTransport();
}
const newRun = (sc: CompiledScenario, sum: DaysSummary, v: Verdict): Run => ({
  id: 'r' + Date.now().toString(36),
  at: Date.now(),
  kind: 'run',
  name: (state.scn as NonNullable<typeof state.scn>).name,
  scn: JSON.parse(JSON.stringify(state.scn)),
  sc,
  sum,
  v,
  fires: sum.typical.fireList,
  plan: planTag()
});
export async function runScenario(opts?: { save?: boolean }): Promise<Run | undefined> {
  if (state.running || !state.P || !state.scn) return;
  refreshChecks();
  const errs = state.probs.filter(p => p.level === 'error');
  if (errs.length) {
    setSimTab('scenario');
    focusProblem(state.probs.indexOf(errs[0]));
    toast('Fix this first: ' + errs[0].msg);
    return;
  }
  const sc = compileScenario(state.scn),
    n = sc.days;
  state.running = true;
  refreshChecks();
  setProgress(0, n, 'Simulating ' + n + ' days…');
  const days = await runDays(sc, n, k => setProgress(k, n, 'Simulating day ' + k + ' of ' + n + '…'));
  const sum = summarizeDays(days),
    v = verdictOf(sum);
  state.running = false;
  setProgress(0, 0);
  state.run = newRun(sc, sum, v);
  state.sweep = null;
  if (!opts || opts.save !== false) saveHistory(state.run);
  playTypical(sc, sum.typical.seed);
  refreshChecks();
  renderDayTimeline();
  setSimTab('results');
  return state.run;
}
export function runScenarioNow(): Run | null {
  if (state.running || !state.P || !state.scn) return null;
  refreshChecks();
  if (state.probs.some(p => p.level === 'error')) return null;
  const sc = compileScenario(state.scn),
    days: DayResult[] = [];
  for (let d = 0; d < sc.days; d++) days.push(runDay(state.P, sc, daySeed(sc.seed, d)));
  const sum = summarizeDays(days),
    v = verdictOf(sum);
  state.run = newRun(sc, sum, v);
  saveHistory(state.run);
  playTypical(sc, sum.typical.seed);
  refreshChecks();
  renderDayTimeline();
  setSimTab('results');
  return state.run;
}
export function parseSweepValues(text: unknown, field: string): number[] {
  const max = field === 'patients' ? 200 : 10,
    min = field === 'patients' ? 1 : 1;
  const vals = String(text || '')
    .split(/[\s,;]+/)
    .map(Number)
    .filter(x => Number.isInteger(x) && x >= min && x <= max);
  return [...new Set(vals)].slice(0, 6);
}
export async function runSweep(): Promise<void> {
  if (state.running || !state.P || !state.scn) return;
  const scn = state.scn;
  refreshChecks();
  if (state.probs.some(p => p.level === 'error')) {
    toast('Fix the problems in the scenario first.');
    return;
  }
  const field = $<HTMLSelectElement>('#swField').value,
    vals = parseSweepValues($<HTMLInputElement>('#swValues').value, field);
  if (vals.length < 2) {
    toast('Enter at least two values, like 1, 2, 3.');
    return;
  }
  const base = compileScenario(scn),
    n = Math.min(10, base.days),
    rows: { value: number; sum: DaysSummary; v: Verdict; sc: CompiledScenario }[] = [],
    total = vals.length * n;
  state.running = true;
  refreshChecks();
  for (let i = 0; i < vals.length; i++) {
    const s2 = applyOverrides(scn, { [field]: vals[i] }),
      sc = compileScenario(s2);
    const days = await runDays(sc, n, k =>
      setProgress(i * n + k, total, SWEEP_FIELDS[field] + ' = ' + vals[i] + ': day ' + k + ' of ' + n)
    );
    const sum = summarizeDays(days);
    rows.push({ value: vals[i], sum, v: verdictOf(sum), sc });
  }
  state.running = false;
  setProgress(0, 0);
  const mid = rows[Math.floor((rows.length - 1) / 2)];
  state.run = {
    id: 'r' + Date.now().toString(36),
    at: Date.now(),
    kind: 'range',
    name: scn.name + ': ' + SWEEP_FIELDS[field].toLowerCase() + ' ' + vals.join(', '),
    scn: JSON.parse(JSON.stringify(scn)),
    sc: mid.sc,
    sum: mid.sum,
    v: mid.v,
    fires: mid.sum.typical.fireList,
    plan: planTag(),
    sweep: { field, n, rows: rows.map(r => ({ value: r.value, agg: r.sum.agg, v: r.v })) }
  };
  saveHistory(state.run);
  playTypical(mid.sc, mid.sum.typical.seed);
  refreshChecks();
  setSimTab('results');
}
