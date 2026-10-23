/* The TypeScript engine against tests/golden/engine-golden.json, computed the same way tools/make-golden.mjs does. */
import { describe, expect, it } from 'vitest';
import {
  ClinicSim,
  SAMPLE_SPECS,
  SCENARIOS,
  compileScenario,
  daySeed,
  doorGaps,
  extractWalls,
  makePlanFromSpec,
  makeSamplePlan,
  planWindows,
  preparePlan,
  runChecks,
  runDay,
  summarizeDays,
  swapInSpec,
  tourStops,
  verdictOf,
  type DayResult,
  type LayoutSpec
} from '../../src/engine';
import { LAYOUTS, expectGolden, pick, plan, r6, readJson, scenario } from './helpers';

interface Golden {
  layouts: Record<string, unknown>;
  swap_A_nurse_station_with_exam_5: unknown;
  scenario_runs: Record<string, unknown>;
  scenario_runs_10_days: Record<string, unknown>;
  legacy_single_day: Record<string, unknown>;
}
const G = readJson<Golden>('tests/golden/engine-golden.json');
const DAY_FIELDS = [
  'seed',
  'seen',
  'avgWait',
  'p90Wait',
  'avgTime',
  'nurseKm',
  'examUse',
  'utilNurse',
  'utilProvider',
  'utilReception',
  'noShows',
  'notSeen',
  'turnedAway',
  'lastExit',
  'maxWaiting',
  'fires'
];
const summaryOf = (days: DayResult[]) => {
  const sum = summarizeDays(days),
    v = verdictOf(sum);
  return { sum, v };
};

describe('sample plans', () => {
  for (const k of LAYOUTS)
    it('layout ' + k + ' matches samples/plans', () => {
      expect(makeSamplePlan(k)).toEqual(readJson('samples/plans/layout-' + k.toLowerCase() + '.plan.json'));
    });
});

describe('layouts', () => {
  for (const k of LAYOUTS)
    it('layout ' + k, () => {
      const P = plan(k),
        info = P.info,
        m = P.m;
      const byKind: Record<string, number> = {};
      for (const it of P.furn.items) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
      const actual = {
        name: m.name,
        rooms: m.rooms.length,
        doors: m.doors.length,
        exam_rooms: info.exams.length,
        seats: info.seats.length,
        walls: extractWalls(m, P.g).length,
        door_gaps: doorGaps(m).length,
        windows: planWindows(m).length,
        furniture_items: P.furn.items.length,
        furniture_by_kind: byKind,
        avg_nurse_m: info.avgNurse,
        journey_m: info.routes.journey.len,
        journey_exam: info.routes.journey.examLabel,
        egress_m: info.routes.egress?.len,
        egress_from: info.routes.egress?.fromLabel,
        unreachable: info.unreachableRooms,
        tour: tourStops(P).map(s => s.kind || s.room?.label),
        checks: runChecks(P).map(c => ({ id: c.id, pass: c.pass, detail: c.detail }))
      };
      expectGolden(actual, G.layouts[k], 'layouts.' + k);
    });
});

it('swap: nurse station with Exam 5 on layout A', () => {
  const swap = swapInSpec(SAMPLE_SPECS.A, 'nurse_station_1', 'exam_room_5');
  const PA2 = preparePlan(makePlanFromSpec(swap.spec as LayoutSpec), []);
  expectGolden(
    {
      avg_nurse_before_m: plan('A').info.avgNurse,
      avg_nurse_after_m: PA2.info.avgNurse,
      journey_after_m: PA2.info.routes.journey.len
    },
    G.swap_A_nurse_station_with_exam_5,
    'swap'
  );
});

describe('scenario runs, 20 days each', () => {
  for (const L of LAYOUTS)
    for (const key of ['normal-tuesday', 'flu-season-monday', 'short-staffed-day'])
      it(L + '/' + key, () => {
        const sc = compileScenario(scenario(key)),
          days: DayResult[] = [];
        for (let d = 0; d < sc.days; d++) days.push(runDay(plan(L), sc, daySeed(sc.seed, d)));
        const { sum, v } = summaryOf(days);
        const actual = {
          days: days.map(x => pick(x, DAY_FIELDS)),
          summary: Object.fromEntries(
            Object.entries(sum.agg).map(([k2, x]) => [k2, { mean: x.mean, lo: x.lo, hi: x.hi }])
          ),
          typical_seed: sum.typical.seed,
          fire_days: sum.fireDays,
          verdict: {
            level: v.level,
            title: v.title,
            bottleneck: v.bottleneck.name,
            bottleneck_util: v.bottleneck.util,
            peak_lobby: v.peak.lobby,
            peak_t: r6(v.peak.t)
          }
        };
        expectGolden(actual, G.scenario_runs[L + '/' + key], L + '/' + key);
      });
});

describe('scenario runs, 10 days', () => {
  for (const key of ['every-block-type', 'providers-leave-early'])
    it('A/' + key, () => {
      const sc = compileScenario(scenario(key)),
        days: DayResult[] = [];
      for (let d = 0; d < Math.min(10, sc.days); d++) days.push(runDay(plan('A'), sc, daySeed(sc.seed, d)));
      const { sum, v } = summaryOf(days);
      const actual = {
        days: days.length,
        summary: Object.fromEntries(Object.entries(sum.agg).map(([k2, x]) => [k2, x.mean])),
        verdict: v.title,
        fire_days: sum.fireDays
      };
      expectGolden(actual, G.scenario_runs_10_days['A/' + key], 'A/' + key);
    });
});

describe('legacy single-day runs, seed 7', () => {
  for (const L of LAYOUTS)
    for (const s of ['normal', 'flu', 'short'])
      it(L + '/' + s, () => {
        const P = plan(L),
          sim = new ClinicSim(P.m, P.g, P.pf, P.info, SCENARIOS[s], 7);
        sim.runAll();
        expectGolden(
          pick(
            sim.metrics(),
            DAY_FIELDS.filter(f => f !== 'seed')
          ),
          G.legacy_single_day[L + '/' + s + '/seed7'],
          L + '/' + s
        );
      });
});
