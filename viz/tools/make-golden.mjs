#!/usr/bin/env node
/*
 * Produces the golden data the TypeScript port is tested against, straight from the approved reference.
 *
 *   node tools/make-golden.mjs            writes samples/, contracts/scenario.v1.schema.json and tests/golden/
 *   node tools/make-golden.mjs --check    regenerates in memory and fails if anything differs from the files
 *
 * It loads reference-src/engine.js (and two small helpers from view.js and plan2d.js) as plain scripts.
 * The simulator is deterministic: the same plan, scenario and seed always give the same numbers, so the
 * port must reproduce these values exactly (tests compare with a tolerance of 1e-9).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = f => fs.readFileSync(path.join(root, 'reference-src', f), 'utf8');
const view = src('view.js');
const esc = view.match(/^const esc = .*$/m)[0];
const inward = view.match(/^function inwardDir\(d, m\) \{[\s\S]*?^\}/m)[0];
const R = new Function(
  src('engine.js') + '\n' + esc + '\n' + inward + '\nconst R3 = null;\n' + src('plan2d.js') +
  '\nreturn { makeSamplePlan, preparePlan, ClinicSim, SCENARIOS, makeScenario, SCENARIO_PRESETS, BLOCK_TYPES, BLOCK_GROUPS, validateScenario, compileScenario, runDay, summarizeDays, verdictOf, daySeed, applyOverrides, runChecks, tourStops, swapInSpec, makePlanFromSpec, SAMPLE_SPECS, planWindows, extractWalls, doorGaps, planSVG, makeBlock };'
)();

const r6 = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, r6(o[k])]));
const DAY_FIELDS = ['seed', 'seen', 'avgWait', 'p90Wait', 'avgTime', 'nurseKm', 'examUse', 'utilNurse', 'utilProvider', 'utilReception', 'noShows', 'notSeen', 'turnedAway', 'lastExit', 'maxWaiting', 'fires'];
const files = {};
const put = (rel, data) => { files[rel] = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'; };

/* Sample plans (plan.json v0.1), exactly as the reference builds them */
const plans = {};
for (const k of ['A', 'B', 'C']) { plans[k] = R.preparePlan(R.makeSamplePlan(k), []); put('samples/plans/layout-' + k.toLowerCase() + '.plan.json', R.makeSamplePlan(k)); }

/* Sample scenarios with stable block ids */
const stable = (scn, prefix) => { scn.blocks.forEach((b, i) => { b.id = prefix + (i + 1); }); delete scn.edited; return scn; };
const scenarios = {
  'normal-tuesday': stable(R.makeScenario('normal'), 'n'),
  'flu-season-monday': stable(R.makeScenario('flu'), 'f'),
  'short-staffed-day': stable(R.makeScenario('short'), 's'),
  'custom-starter': stable(R.makeScenario('custom'), 'c')
};
const everything = R.makeScenario('custom');
everything.name = 'Every block type';
everything.blocks.push(
  R.makeBlock('shift', { role: 'provider', count: 2 }), R.makeBlock('shift', { role: 'provider', count: 1, from: '12:00', to: '18:00' }),
  R.makeBlock('shift', { role: 'nurse', count: 2 }), R.makeBlock('shift', { role: 'reception', count: 2 }),
  R.makeBlock('appointments', { count: 60 }), R.makeBlock('walkins', { count: 20, pattern: 'lunch' }), R.makeBlock('group', { count: 10, at: '15:00' }),
  R.makeBlock('visit_type', { name: 'Standard visit', share: 70, provider_min: [15, 25] }), R.makeBlock('visit_type', { name: 'Long visit', share: 30, provider_min: [30, 40] }),
  R.makeBlock('break', { role: 'reception', minutes: 30, from: '12:00', to: '13:00' }), R.makeBlock('out', { role: 'nurse', count: 1, from: '10:00', to: '12:00' }),
  R.makeBlock('closed', { room: 'exam_room_3', from: '09:00', to: '11:00' }),
  R.makeBlock('rule', { metric: 'desk', op: 'gt', value: 4, hold: 5, from: '08:00', to: '17:00', action: 'pause_walkins', duration: 60 })
);
scenarios['every-block-type'] = stable(everything, 'e');
const broken = R.makeScenario('custom');
broken.name = 'Broken on purpose';
broken.blocks.push(R.makeBlock('shift', { role: 'nurse', count: 0, from: '19:00', to: '09:00' }), R.makeBlock('visit_type', { name: '', share: 40, provider_min: [30, 10] }), R.makeBlock('closed'));
scenarios['broken-on-purpose'] = stable(broken, 'x');
const late = R.makeScenario('normal');
late.name = 'Providers leave at 4 pm';
late.blocks.find(b => b.type === 'shift' && b.fields.role === 'provider').fields.to = '16:00';
scenarios['providers-leave-early'] = stable(late, 'l');
for (const [k, scn] of Object.entries(scenarios)) put('samples/scenarios/' + k + '.scenario.json', scn);

/* JSON Schema for scenario.v1, generated from the block registry so they can't drift apart */
const fieldSchema = f => {
  const d = f.label + (f.help ? '. ' + f.help : '');
  switch (f.type) {
    case 'int': return { type: 'integer', minimum: f.min, maximum: f.max, default: f.default, description: d };
    case 'percent': return { type: 'number', minimum: f.min, maximum: f.max, default: f.default, description: d + ' (percent)' };
    case 'time': return Object.assign({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', default: f.default, description: d + ' (24-hour HH:MM)' }, f.min ? { 'x-min': f.min, 'x-max': f.max } : {});
    case 'enum': return { type: 'string', enum: Object.keys(f.options), default: f.default, description: d + '. ' + Object.entries(f.options).map(([k, v]) => k + ': ' + v).join('; ') };
    case 'text': return { type: 'string', minLength: 1, maxLength: f.max || 40, default: f.default, description: d };
    case 'range': return { type: 'array', items: { type: 'number', minimum: f.min, maximum: f.max }, minItems: 2, maxItems: 2, default: f.default, description: d + ' as [shortest, longest]' };
    case 'bool': return { type: 'boolean', default: f.default, description: d };
    case 'room': return { type: 'string', default: f.default, description: d + ': the id of a room in the plan' + (f.roomTypes ? ' (' + f.roomTypes.join(', ') + ')' : '') };
    default: throw new Error('unknown field type ' + f.type);
  }
};
put('contracts/scenario.v1.schema.json', {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'fi.scenario.v1',
  title: 'Simulation scenario (fi.scenario.v1)',
  description: 'Generated by tools/make-golden.mjs from BLOCK_TYPES in reference-src/engine.js. Cross-field and plan-aware rules (end after start, one block of each single type, staff coverage, arrivals after the last shift, rooms that exist) are in validateScenario.',
  type: 'object',
  required: ['schema', 'name', 'blocks'],
  properties: {
    schema: { const: 'fi.scenario.v1' },
    name: { type: 'string', maxLength: 60 },
    preset: { enum: Object.keys(R.SCENARIO_PRESETS) },
    blocks: {
      type: 'array',
      items: {
        oneOf: Object.entries(R.BLOCK_TYPES).map(([t, T]) => ({
          title: T.label,
          description: T.desc,
          'x-group': T.group, 'x-single': !!T.single, 'x-required': !!T.required, 'x-icon': T.icon,
          type: 'object',
          required: ['id', 'type', 'fields'],
          properties: {
            id: { type: 'string' },
            type: { const: t },
            enabled: { type: 'boolean', default: true },
            fields: { type: 'object', required: Object.keys(T.fields), additionalProperties: false, properties: Object.fromEntries(Object.entries(T.fields).map(([k, f]) => [k, fieldSchema(f)])) }
          }
        }))
      }
    }
  }
});

/* Golden numbers for the engine */
const furnByKind = P => { const out = {}; for (const it of P.furn.items) out[it.kind] = (out[it.kind] || 0) + 1; return out; };
const layouts = {};
for (const [k, P] of Object.entries(plans)) {
  const info = P.info, m = P.m;
  layouts[k] = {
    name: m.name, rooms: m.rooms.length, doors: m.doors.length, exam_rooms: info.exams.length, seats: info.seats.length,
    walls: R.extractWalls(m, P.g).length, door_gaps: R.doorGaps(m).length, windows: R.planWindows(m).length,
    furniture_items: P.furn.items.length, furniture_by_kind: furnByKind(P),
    avg_nurse_m: r6(info.avgNurse), journey_m: r6(info.routes.journey.len), journey_exam: info.routes.journey.examLabel,
    egress_m: r6(info.routes.egress.len), egress_from: info.routes.egress.fromLabel, unreachable: info.unreachableRooms,
    tour: R.tourStops(P).map(s => s.kind || s.room.label),
    checks: R.runChecks(P).map(c => ({ id: c.id, pass: c.pass, detail: c.detail }))
  };
}
const swap = R.swapInSpec(R.SAMPLE_SPECS.A, 'nurse_station_1', 'exam_room_5');
const PA2 = R.preparePlan(R.makePlanFromSpec(swap.spec), []);
const runs = {};
for (const L of ['A', 'B', 'C']) for (const key of ['normal-tuesday', 'flu-season-monday', 'short-staffed-day']) {
  const sc = R.compileScenario(scenarios[key]), days = [];
  for (let d = 0; d < sc.days; d++) days.push(R.runDay(plans[L], sc, R.daySeed(sc.seed, d)));
  const sum = R.summarizeDays(days), v = R.verdictOf(sum);
  runs[L + '/' + key] = {
    days: days.map(x => pick(x, DAY_FIELDS)),
    summary: Object.fromEntries(Object.entries(sum.agg).map(([k2, x]) => [k2, { mean: r6(x.mean), lo: r6(x.lo), hi: r6(x.hi) }])),
    typical_seed: sum.typical.seed, fire_days: sum.fireDays,
    verdict: { level: v.level, title: v.title, bottleneck: v.bottleneck.name, bottleneck_util: r6(v.bottleneck.util), peak_lobby: v.peak.lobby, peak_t: r6(v.peak.t) }
  };
}
const extra = {};
for (const key of ['every-block-type', 'providers-leave-early']) {
  const sc = R.compileScenario(scenarios[key]), days = [];
  for (let d = 0; d < Math.min(10, sc.days); d++) days.push(R.runDay(plans.A, sc, R.daySeed(sc.seed, d)));
  const sum = R.summarizeDays(days), v = R.verdictOf(sum);
  extra['A/' + key] = { days: days.length, summary: Object.fromEntries(Object.entries(sum.agg).map(([k2, x]) => [k2, r6(x.mean)])), verdict: v.title, fire_days: sum.fireDays };
}
const legacy = {};
for (const L of ['A', 'B', 'C']) for (const s of ['normal', 'flu', 'short']) {
  const P = plans[L], sim = new R.ClinicSim(P.m, P.g, P.pf, P.info, R.SCENARIOS[s], 7);
  sim.runAll();
  legacy[L + '/' + s + '/seed7'] = pick(sim.metrics(), DAY_FIELDS.filter(f => f !== 'seed'));
}
put('tests/golden/engine-golden.json', {
  about: 'Generated by tools/make-golden.mjs from reference-src. Numbers are rounded to 6 decimals; compare with Math.abs(a - b) < 1e-6.',
  layouts,
  swap_A_nurse_station_with_exam_5: { avg_nurse_before_m: r6(plans.A.info.avgNurse), avg_nurse_after_m: r6(PA2.info.avgNurse), journey_after_m: r6(PA2.info.routes.journey.len) },
  scenario_runs: runs,
  scenario_runs_10_days: extra,
  legacy_single_day: legacy
});
const validation = {};
for (const [k, scn] of Object.entries(scenarios)) {
  const probs = R.validateScenario(scn, plans.A).map(p => ({ level: p.level, block: p.block, field: p.field, msg: p.msg }));
  let compiled = null;
  if (!probs.some(p => p.level === 'error')) { const c = R.compileScenario(scn); compiled = { opens: c.opens, closes: c.closes, patients: c.patients, providers: c.providers, nurses: c.nurses, receptionists: c.receptionists, breaks: c.breaks.length, outs: c.outs.length, closures: c.closures.length, rules: c.rules.map(r => r.label), visit_types: c.visitTypes.map(v => v.name + ' ' + r6(v.p)), days: c.days, seed: c.seed }; }
  validation[k] = { problems: probs, compiled };
}
const ov = R.compileScenario(R.applyOverrides(scenarios['normal-tuesday'], { patients: 90, nurses: 3 }));
put('tests/golden/scenario-golden.json', { about: 'validateScenario on layout A for every sample scenario, and compileScenario when there are no errors.', scenarios: validation, overrides_normal_patients90_nurses3: { patients: ov.patients, nurses: ov.nurses, providers: ov.providers } });
const svg = R.planSVG(plans.A, {});
put('tests/golden/plan2d-layout-a.svg', svg);
put('tests/golden/plan2d-layout-a.sha256', crypto.createHash('sha256').update(svg).digest('hex') + '\n');

/* Write, or check */
const check = process.argv.includes('--check');
let diffs = 0;
for (const [rel, data] of Object.entries(files)) {
  const p = path.join(root, rel);
  if (check) { const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; if (cur !== data) { diffs++; console.log('differs: ' + rel); } }
  else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }
}
if (check) { console.log(diffs ? diffs + ' file(s) differ from the reference' : 'All golden files match the reference.'); process.exit(diffs ? 1 : 0); }
console.log('Wrote ' + Object.keys(files).length + ' files.');
