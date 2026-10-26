/* What the assistant can read and do in the clinic. Every tool runs in the browser against the live state, so
   answers quote the same numbers the screen shows; actions go through the app's own functions (loadPreset,
   applyOverrides, runScenario, focusRoom), never around them. */
import type { Tool } from '../../assistant/types';
import { PURPOSE, SCENARIO_PRESETS, compileScenario, fmtClock, fmtMin, validateScenario, type Room } from '../../engine';
import { state, type StepName } from '../../state';
import { focusRoom } from '../../view3d/marks';
import { compareRows, runCompare } from '../compare';
import { onRoomTap } from '../review';
import { loadPreset, setSimTab } from '../simulate';
import { runScenario } from '../simulate/runner';
import { setStep } from '../stepper';
import { dayCounts, setDay } from './quick';

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => Math.round(v * 100) + '%';
const need = () => {
  if (!state.P) throw new Error('No plan is open yet. Open a sample layout on the Import step first.');
  return state.P;
};
const area = (r: Room) => r1(r.w * r.h);
const typeName = (t: string) => t.replace(/_/g, ' ');

const ALIASES: [RegExp, string][] = [
  [/\b(lobby|waiting area|waiting room)\b/, 'waiting'],
  [/\b(front desk|check.?in|checkout|desk)\b/, 'reception'],
  [/\b(bathroom|toilet|washroom|wc|loo)\b/, 'restroom'],
  [/\b(break ?room|kitchen|lounge)\b/, 'staff lounge'],
  [/\b(doctor'?s? office|office)\b/, 'provider office'],
  [/\bexam rooms?\b/, 'exam']
];

export function roomsMatching(q: string): Room[] {
  const P = need();
  let s = q.toLowerCase().trim();
  const exactFirst = P.m.rooms.find(r => r.id.toLowerCase() === s || r.label.toLowerCase() === s);
  if (exactFirst) return [exactFirst];
  ALIASES.forEach(([re, to]) => (s = s.replace(re, to)));
  const exact = P.m.rooms.find(r => r.id.toLowerCase() === s || r.label.toLowerCase() === s);
  if (exact) return [exact];
  const words = s.split(/\s+/).filter(Boolean);
  return P.m.rooms.filter(r => {
    const hay = (r.label + ' ' + typeName(r.type) + ' ' + r.id).toLowerCase();
    return words.every(w => hay.includes(w.replace(/s$/, '')));
  });
}

export function overview() {
  if (!state.P) return { plan: null, step: state.step };
  const P = state.P;
  const v = state.versions[state.vIndex];
  const types: Record<string, number> = {};
  P.m.rooms.forEach(r => (types[typeName(r.type)] = (types[typeName(r.type)] || 0) + 1));
  return {
    step: state.step,
    plan: {
      name: v ? v.name : P.m.name,
      version: v ? v.n : 1,
      blurb: P.m.blurb,
      size_m: `${r1(P.m.W)} × ${r1(P.m.D)}`,
      floor_area_m2: Math.round(P.m.W * P.m.D),
      rooms: P.m.rooms.length,
      room_types: types,
      exam_rooms: P.info.allExams.length,
      patient_path_m: Math.round(P.info.routes.journey.len), // door to the exam room and back out
      patient_path_exam: P.info.routes.journey.examLabel,
      nurse_walk_avg_m: r1(P.info.avgNurse),
      unreachable_rooms: P.info.unreachableRooms
    },
    checks: state.checks.length ? { passed: state.checks.filter(c => c.pass).length, total: state.checks.length } : undefined,
    selected_room: state.selectedRoom ?? undefined,
    day: state.scn ? { name: state.scn.name, preset: state.scn.preset, edited: !!state.scn.edited, ...dayCounts(state.scn) } : undefined,
    last_run: state.run ? resultsOf() : undefined
  };
}

function resultsOf() {
  const r = state.run;
  if (!r) return null;
  const a = r.sum.agg;
  return {
    scenario: r.name,
    plan: `${r.plan.name} v${r.plan.version}`,
    days: r.sum.n,
    verdict: r.v.title,
    level: r.v.level,
    busiest: `${r.v.bottleneck.name} at ${pct(r.v.bottleneck.util)}`,
    busy_share: Object.fromEntries(Object.entries(r.v.util).map(([k, u]) => [k, pct(u)])),
    patients_seen: Math.round(a.seen.mean),
    average_wait: fmtMin(a.avgWait.mean),
    average_wait_range: `${fmtMin(a.avgWait.lo)} to ${fmtMin(a.avgWait.hi)}`,
    one_in_ten_wait_over: fmtMin(a.p90Wait.mean),
    time_in_clinic: fmtMin(a.avgTime.mean),
    nurse_walk_km: r1(a.nurseKm.mean),
    last_patient_leaves: fmtClock(a.lastExit.mean),
    no_shows: Math.round(a.noShows.mean),
    turned_away: Math.round(a.turnedAway.mean),
    not_seen: Math.round(a.notSeen.mean),
    lobby_peak: r.v.peak && r.v.peak.lobby ? `${r.v.peak.lobby} waiting around ${fmtClock(r.v.peak.t)}` : 'never filled',
    range: r.sweep ? { field: r.sweep.field, rows: r.sweep.rows.map(x => ({ value: x.value, verdict: x.v.title, wait: fmtMin(x.agg.avgWait.mean) })) } : undefined
  };
}

const STEP_NAMES: StepName[] = ['import', 'review', 'simulate', 'export'];

export const TOOLS: Tool[] = [
  {
    name: 'get_overview',
    description: 'The open clinic plan (size, rooms by type, exam rooms, walking distances), its checks, the day set up in Simulate and the last run. Call this first for any question about the clinic.',
    parameters: { type: 'object', properties: {} },
    run: () => overview(),
    label: () => 'Read the plan'
  },
  {
    name: 'list_rooms',
    description: 'Rooms in the plan, optionally filtered by words like "exam", "lobby", "nurse". Returns ids for links and show_room.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    run: a => {
      const list = a.query ? roomsMatching(String(a.query)) : need().m.rooms;
      return list.slice(0, 30).map(r => ({ id: r.id, name: r.label, type: typeName(r.type), area_m2: area(r), purpose: PURPOSE[r.type] }));
    },
    label: a => (a.query ? `Found rooms: ${String(a.query)}` : 'Listed the rooms')
  },
  {
    name: 'show_room',
    description: 'Fly the 3D view to a room and open its card. Takes a room id or name.',
    parameters: { type: 'object', properties: { room: { type: 'string' } }, required: ['room'] },
    run: a => {
      const r = roomsMatching(String(a.room))[0];
      if (!r) throw new Error(`No room called “${String(a.room)}”.`);
      if (state.step !== 'review' && state.step !== 'simulate') setStep('review');
      if (state.step === 'simulate' && state.simTab !== 'results') setSimTab('results');
      onRoomTap(r);
      focusRoom(r);
      return { id: r.id, name: r.label, type: typeName(r.type), area_m2: area(r), size_m: `${r1(r.w)} × ${r1(r.h)}`, purpose: PURPOSE[r.type] };
    },
    label: (_a, r) => `Showed ${(r as { name?: string })?.name ?? 'the room'}`
  },
  {
    name: 'get_checks',
    description: 'The plan checks (accessibility, egress, room sizes and others) with pass or fail and the reason.',
    parameters: { type: 'object', properties: {} },
    run: () => state.checks.map(c => ({ check: c.label, pass: c.pass, detail: c.detail, source: c.source })),
    label: () => 'Read the plan checks'
  },
  {
    name: 'get_day',
    description: 'The day set up in Simulate: preset, staff on shift, patients per day, opening hours, days to run and any problems.',
    parameters: { type: 'object', properties: {} },
    run: () => {
      if (!state.scn) throw new Error('No day set up yet.');
      need();
      const sc = compileScenario(state.scn);
      return {
        name: state.scn.name,
        preset: state.scn.preset,
        edited: !!state.scn.edited,
        ...dayCounts(state.scn),
        opens: fmtClock(sc.opens),
        closes: fmtClock(sc.closes),
        days: sc.days,
        blocks: state.scn.blocks.filter(b => b.enabled !== false).map(b => b.type),
        problems: validateScenario(state.scn, state.P).map(p => `${p.level}: ${p.msg}`)
      };
    },
    label: () => 'Read the day'
  },
  {
    name: 'load_day',
    description: 'Start from a preset day: normal (Normal Tuesday), flu (Flu-season Monday), short (Short-staffed day) or custom.',
    parameters: { type: 'object', properties: { preset: { type: 'string', enum: ['normal', 'flu', 'short', 'custom'] } }, required: ['preset'] },
    run: a => {
      const k = String(a.preset);
      if (!SCENARIO_PRESETS[k]) throw new Error('Presets: normal, flu, short, custom.');
      need();
      loadPreset(k);
      if (state.step !== 'simulate') setStep('simulate');
      setSimTab('scenario');
      return { loaded: SCENARIO_PRESETS[k].label, ...dayCounts(state.scn!) };
    },
    label: a => `Loaded ${SCENARIO_PRESETS[String(a.preset)]?.label ?? 'a day'}`
  },
  {
    name: 'set_day',
    description: 'Change who works and how busy the day is. Any of providers, nurses, receptionists (1-10) and patients (per day, 5-200). Other fields stay.',
    parameters: {
      type: 'object',
      properties: { providers: { type: 'integer' }, nurses: { type: 'integer' }, receptionists: { type: 'integer' }, patients: { type: 'integer' } }
    },
    run: a => {
      need();
      const o: Record<string, number> = {};
      for (const k of ['providers', 'nurses', 'receptionists', 'patients']) {
        if (a[k] == null) continue;
        const v = Math.round(Number(a[k]));
        const [lo, hi] = k === 'patients' ? [5, 200] : [1, 10];
        if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be ${lo} to ${hi}.`);
        o[k] = v;
      }
      if (!Object.keys(o).length) throw new Error('Say what to change: providers, nurses, receptionists or patients.');
      setDay(o);
      if (state.step !== 'simulate') setStep('simulate');
      setSimTab('scenario');
      return { now: dayCounts(state.scn!) };
    },
    label: a =>
      'Set ' +
      Object.entries(a)
        .map(([k, v]) => `${k} ${String(v)}`)
        .join(', ')
  },
  {
    name: 'run_simulation',
    description: 'Run the day set up in Simulate for its number of days (usually 20) and return the results. The 3D then plays a typical day.',
    parameters: { type: 'object', properties: {} },
    run: async () => {
      need();
      if (state.step !== 'simulate') setStep('simulate');
      const r = await runScenario();
      if (!r) {
        const errs = state.probs.filter(p => p.level === 'error');
        throw new Error(errs.length ? `Fix this first: ${errs[0].msg}` : 'A run is already going.');
      }
      return resultsOf();
    },
    label: () => 'Ran the day'
  },
  {
    name: 'get_results',
    description: 'The last simulation run: verdict, busiest role, waits, patients seen, time in clinic, nurse walking, when the last patient leaves.',
    parameters: { type: 'object', properties: {} },
    run: () => resultsOf() ?? { none: 'Nothing has run yet. Use run_simulation.' },
    label: () => 'Read the results'
  },
  {
    name: 'compare_layouts',
    description: 'Run the same day on this plan and the other layouts, and open the comparison table.',
    parameters: { type: 'object', properties: {} },
    run: () => {
      need();
      const rows = compareRows(state.run?.sc);
      runCompare();
      return rows.map(r => ({
        layout: r.name,
        current: !!r.current,
        average_wait: fmtMin(r.m.avgWait ?? 0),
        one_in_ten_wait_over: fmtMin(r.m.p90Wait ?? 0),
        time_in_clinic: fmtMin(r.m.avgTime ?? 0),
        nurse_walk_km: r1(r.m.nurseKm ?? 0)
      }));
    },
    label: () => 'Compared the layouts'
  },
  {
    name: 'go_to_step',
    description: 'Switch screen: import, review, simulate or export.',
    parameters: { type: 'object', properties: { step: { type: 'string', enum: STEP_NAMES } }, required: ['step'] },
    run: a => {
      const s = String(a.step) as StepName;
      if (!STEP_NAMES.includes(s)) throw new Error('Steps: import, review, simulate, export.');
      if (s !== 'import') need();
      setStep(s);
      return { step: state.step };
    },
    label: a => `Opened ${String(a.step)}`
  },
  {
    name: 'set_camera',
    description: 'Change the 3D camera: overview, tour (a guided tour of the rooms), follow (follow a patient, during a played day) or walk.',
    parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['overview', 'tour', 'follow', 'walk'] } }, required: ['mode'] },
    run: a => {
      need();
      const m = String(a.mode) === 'overview' ? 'orbit' : String(a.mode);
      if (state.step !== 'review' && state.step !== 'simulate') setStep('review');
      if (state.step === 'simulate' && state.simTab !== 'results') setSimTab('results');
      const b = document.querySelector<HTMLButtonElement>(`[data-view="${m}"]`);
      if (!b) throw new Error('Modes: overview, tour, follow, walk.');
      b.click();
      return { camera: String(a.mode) };
    },
    label: a => `Camera: ${String(a.mode)}`
  }
];
