/* Differential tests: the reference engine (reference-src/engine.js, loaded the way tools/make-golden.mjs loads it)
   and the TypeScript port get the same inputs, and their outputs must be deeply equal. This covers paths the golden
   files don't: uploaded plans with polygons and no doors, every swap, more scenarios and the formatting helpers. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as E from '../../src/engine';
import type { PlanJson, PreparedPlan, Scenario } from '../../src/engine';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f: string): string => fs.readFileSync(path.join(root, f), 'utf8');
const inward = (
  src('reference-src/view.js').match(/^function inwardDir\(d, m\) \{[\s\S]*?^\}/m) as RegExpMatchArray
)[0];
// The reference keeps everything in one scope; return whichever of the port's names it defines.
const R = new Function(
  src('reference-src/engine.js') +
    '\n' +
    inward +
    '\nconst out = {};\n' +
    Object.keys(E)
      .map(n => 'try { out.' + n + ' = ' + n + '; } catch (e) {}')
      .join('\n') +
    '\nreturn out;'
)() as typeof E;

/* Plain data for comparison: drops the pathfinder function, keeps typed arrays and sets. */
const data = (P: PreparedPlan): object => ({ m: P.m, furn: P.furn, g: P.g, info: P.info });
const both = (json: PlanJson): [PreparedPlan, PreparedPlan] => [
  R.preparePlan(JSON.parse(JSON.stringify(json)), []),
  E.preparePlan(JSON.parse(JSON.stringify(json)), [])
];

/* Layout A as an uploaded file: rooms as polygons, no doors, no footprint. */
function uploadedA(): PlanJson {
  const j = E.makeSamplePlan('A');
  return {
    name: 'Uploaded A',
    rooms: j.rooms.map(r => {
      const q = r.rect as NonNullable<typeof r.rect>;
      return {
        id: r.id,
        type: r.type,
        polygon_mm: [
          [q.x_mm, q.y_mm],
          [q.x_mm + q.w_mm, q.y_mm],
          [q.x_mm + q.w_mm, q.y_mm + q.h_mm],
          [q.x_mm, q.y_mm + q.h_mm]
        ]
      };
    })
  };
}

describe('plans', () => {
  const plans: Record<string, PlanJson> = {
    A: E.makeSamplePlan('A'),
    B: E.makeSamplePlan('B'),
    C: E.makeSamplePlan('C'),
    uploaded: uploadedA()
  };
  for (const [k, json] of Object.entries(plans))
    it(k + ': model, furniture, grid, analysis, walls, windows, checks and tour', () => {
      const [a, b] = both(json);
      expect(data(b)).toEqual(data(a));
      expect(E.extractWalls(b.m, b.g)).toEqual(R.extractWalls(a.m, a.g));
      expect(E.doorGaps(b.m)).toEqual(R.doorGaps(a.m));
      expect(E.planWindows(b.m)).toEqual(R.planWindows(a.m));
      expect(E.runChecks(b)).toEqual(R.runChecks(a));
      expect(E.tourStops(b).map(s => s.kind || s.room?.id)).toEqual(R.tourStops(a).map(s => s.kind || s.room?.id));
      for (const d of b.m.doors.filter(q => q.isEntrance)) expect(E.inwardDir(d, b.m)).toEqual(R.inwardDir(d, a.m));
    });
  it('the uploaded plan really has inferred doors and an added entrance', () => {
    const [, b] = both(plans.uploaded);
    expect(b.m.inferredDoors).toBe(true);
    expect(b.m.doors.some(d => d.id === 'entrance')).toBe(true);
  });
  it('adaptPlan errors', () => {
    const bad = [
      null,
      {},
      { rooms: [] },
      { rooms: [{ id: 'x' }] },
      { rooms: [{ id: 'y', rect: { x_mm: 0, y_mm: 0, w_mm: 0, h_mm: 10 } }] }
    ];
    for (const j of bad) {
      let ra = '',
        rb = '';
      try {
        R.adaptPlan(j as PlanJson);
      } catch (e) {
        ra = (e as Error).message;
      }
      try {
        E.adaptPlan(j as PlanJson);
      } catch (e) {
        rb = (e as Error).message;
      }
      expect(rb).toBe(ra);
      expect(rb).not.toBe('');
    }
  });
});

describe('swaps', () => {
  for (const k of ['A', 'B', 'C']) {
    const spec = E.SAMPLE_SPECS[k];
    const ids = spec.south.concat(spec.north).map(e => e[0]);
    it('every pair on layout ' + k, () => {
      for (const x of ids)
        for (const y of ids) {
          const sa = R.swapInSpec(spec, x, y),
            sb = E.swapInSpec(spec, x, y);
          expect(sb).toEqual(sa);
        }
      expect(E.swapInSpec(null, 'a', 'b')).toEqual(R.swapInSpec(null, 'a', 'b'));
    });
  }
  it('a swapped plan runs a day the same way', () => {
    const s = E.swapInSpec(E.SAMPLE_SPECS.A, 'exam_room_1', 'restroom_1').spec as E.LayoutSpec;
    const [a, b] = both(E.makePlanFromSpec(s));
    expect(data(b)).toEqual(data(a));
    const scn = JSON.parse(src('samples/scenarios/normal-tuesday.scenario.json')) as Scenario;
    expect(E.runDay(b, E.compileScenario(scn), 99)).toEqual(R.runDay(a, R.compileScenario(scn), 99));
  });
});

describe('days', () => {
  const keys = fs.readdirSync(path.join(root, 'samples/scenarios')).map(f => f.replace('.scenario.json', ''));
  const plans: Record<string, PlanJson> = { B: E.makeSamplePlan('B'), C: E.makeSamplePlan('C'), uploaded: uploadedA() };
  for (const [pk, json] of Object.entries(plans))
    for (const key of keys)
      it(pk + '/' + key + ': three days, every metric, rule firing and lobby series', () => {
        const scn = JSON.parse(src('samples/scenarios/' + key + '.scenario.json')) as Scenario;
        const [a, b] = both(json);
        expect(E.validateScenario(scn, b)).toEqual(R.validateScenario(scn, a));
        const sa = R.compileScenario(scn),
          sb = E.compileScenario(scn);
        expect(sb).toEqual(sa);
        for (let d = 0; d < 3; d++)
          expect(E.runDay(b, sb, E.daySeed(sb.seed, d))).toEqual(R.runDay(a, sa, R.daySeed(sa.seed, d)));
      });
  it('the simulator state mid-day, with advanceTo and posAt', () => {
    const [a, b] = both(E.makeSamplePlan('A'));
    const scn = JSON.parse(src('samples/scenarios/flu-season-monday.scenario.json')) as Scenario;
    const ra = new R.ClinicSim(a.m, a.g, a.pf, a.info, R.compileScenario(scn), 5);
    const rb = new E.ClinicSim(b.m, b.g, b.pf, b.info, E.compileScenario(scn), 5);
    for (const t of [30, 90, 91.5, 240, 400]) {
      ra.advanceTo(t);
      rb.advanceTo(t);
      expect(rb.metrics()).toEqual(ra.metrics());
      expect(rb.agents.map(x => E.posAt(x, t))).toEqual(ra.agents.map(x => R.posAt(x, t)));
      expect(Array.from(rb.heat)).toEqual(Array.from(ra.heat));
    }
  });
});

describe('the older text stand-ins', () => {
  const texts = [
    '',
    'a busy flu monday with 4 providers and 3 nurses',
    '120 patients',
    'quiet day, 2 doctors, 9 nurses, 300 visits'
  ];
  it('parseScenario', () => {
    for (const t of texts) expect(E.parseScenario(t)).toEqual(R.parseScenario(t));
  });
  it('explainResults', () => {
    const [a, b] = both(E.makeSamplePlan('A'));
    for (const s of ['normal', 'flu', 'short']) {
      const ma = new R.ClinicSim(a.m, a.g, a.pf, a.info, R.SCENARIOS[s], 3),
        mb = new E.ClinicSim(b.m, b.g, b.pf, b.info, E.SCENARIOS[s], 3);
      ma.runAll();
      mb.runAll();
      const cmp = [
        { name: 'Layout A', m: mb.metrics() },
        { name: 'Layout B', m: { ...mb.metrics(), nurseKm: mb.metrics().nurseKm / 2 } }
      ];
      expect(E.explainResults(b.m, b.info, mb.metrics(), cmp)).toEqual(
        R.explainResults(a.m, a.info, ma.metrics(), cmp)
      );
    }
  });
});

describe('formatting and scenario helpers', () => {
  it('times, durations and role names', () => {
    for (let t = -500; t <= 1500; t += 7.25) {
      expect(E.fmtClock(t)).toBe(R.fmtClock(t));
      expect(E.hmStr(t)).toBe(R.hmStr(t));
    }
    for (const v of [0, 0.04, 3.333, 9.95, 9.99, 10, 10.5, 125.4]) expect(E.fmtMin(v)).toBe(R.fmtMin(v));
    for (const v of ['08:00', '7:05', '23:59', '24:00', '8', '', null, undefined, 'x:yz', 830]) {
      expect(E.hm(v)).toEqual(R.hm(v));
      expect(E.fmtHM(v)).toBe(R.fmtHM(v));
    }
    for (const r of ['provider', 'nurse', 'reception', 'janitor'])
      for (const n of [0, 1, 2]) expect(E.roleName(r, n)).toBe(R.roleName(r, n));
  });
  it('block registry, presets and summaries', () => {
    expect(Object.keys(E.BLOCK_TYPES)).toEqual(Object.keys(R.BLOCK_TYPES));
    expect(E.BLOCK_GROUPS).toEqual(R.BLOCK_GROUPS);
    const P = E.preparePlan(E.makeSamplePlan('A'), []);
    for (const [t, T] of Object.entries(E.BLOCK_TYPES)) {
      const RT = R.BLOCK_TYPES[t];
      const strip = (fields: Record<string, E.FieldDef>) =>
        Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { ...f, showIf: f.showIf ? 'fn' : undefined }]));
      expect({ ...T, fields: strip(T.fields), summary: null }).toEqual({
        ...RT,
        fields: strip(RT.fields),
        summary: null
      });
      const b = E.makeBlock(t);
      if (t === 'closed') b.fields.room = 'exam_room_2';
      expect(T.summary(b.fields, P)).toBe(RT.summary(b.fields, P));
    }
    for (const k of Object.keys(R.SCENARIO_PRESETS)) {
      const strip = (s: Scenario) => ({ ...s, blocks: s.blocks.map(b => ({ ...b, id: '' })) });
      expect(strip(E.makeScenario(k))).toEqual(strip(R.makeScenario(k)));
    }
  });
  it('checkField on edge values', () => {
    const P = E.preparePlan(E.makeSamplePlan('A'), []);
    const values = [
      undefined,
      null,
      '',
      ' ',
      'x',
      'nurse',
      '08:00',
      '05:00',
      '23:00',
      0,
      -1,
      1.5,
      3,
      200,
      999,
      NaN,
      Infinity,
      true,
      [1],
      [3, 2],
      [2, 3],
      [0, 500],
      'exam_room_2',
      'nowhere'
    ];
    for (const T of Object.values(E.BLOCK_TYPES))
      for (const f of Object.values(T.fields))
        for (const v of values) expect(E.checkField(f, v, P)).toBe(R.checkField(f, v, P));
  });
  it('applyOverrides', () => {
    const scn = JSON.parse(src('samples/scenarios/short-staffed-day.scenario.json')) as Scenario;
    const custom = JSON.parse(src('samples/scenarios/custom-starter.scenario.json')) as Scenario;
    for (const o of [{ patients: 10 }, { providers: 5, nurses: 1 }, { receptionists: 3 }, { patients: 0 }])
      for (const s of [scn, custom]) {
        const strip = (x: Scenario) => ({
          ...x,
          blocks: x.blocks.map(b => ({ ...b, id: b.id.startsWith('b') ? '' : b.id }))
        });
        expect(strip(E.applyOverrides(s, o))).toEqual(strip(R.applyOverrides(s, o)));
      }
  });
});
