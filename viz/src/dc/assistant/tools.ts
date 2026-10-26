/* What the assistant can read and do in the data center studio. Every tool runs in the browser against the
   live state, so answers come from the same numbers the screen shows. Results are compact JSON. */
import type { Tool } from '../../assistant/types';
import { generate, go } from '../actions';
import { fmtPower, readBrief } from '../engine/brief';
import { RATES, fmtMoney, type RateKey } from '../engine/cost';
import { roomName } from '../engine/design';
import { evaluate } from '../engine/status';
import type { Cooling, Equip, EquipKind } from '../engine/types';
import { current, emit, state, type Step } from '../state';
import { EQUIP_HELP, ROOM_HELP } from '../ui/help';
import { LENSES, type Lens } from '../ui/lens';
import { getStage } from '../ui/stage';
import { recost } from '../ui/cost';
import { BREAKABLE, testControl } from '../ui/test';

const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const need = () => {
  const o = current();
  if (!o) throw new Error('No design yet. Describe the site first (use new_design).');
  return o;
};
const optionIndex = (cooling: unknown) => {
  const i = state.options.findIndex((o) => o.design.profile.key === cooling);
  if (i < 0) throw new Error(`No ${String(cooling)} option. Options: ${state.options.map((o) => o.design.profile.key).join(', ')}`);
  return i;
};

/* ---------- finding parts by what people call them ---------- */
const KIND_WORDS: [RegExp, EquipKind[]][] = [
  [/outdoor|dry ?cooler|roof/, ['drycooler']],
  [/liquid|cdu|coolant/, ['cdu']],
  [/air ?handler|crah|fan/, ['crah']],
  [/cool/, ['cdu', 'crah', 'drycooler']],
  [/ups|battery backup/, ['ups']],
  [/switch ?gear|breaker/, ['switchgear']],
  [/generator|genset|diesel|\bgen\b/, ['generator']],
  [/transformer/, ['transformer']],
  [/panel|pdu/, ['pdu']],
  [/rack|server/, ['rack']]
];

export function findParts(query: string, limit = 12): Equip[] {
  const d = need().design;
  const q = query.toLowerCase().trim();
  const exact = d.equipment.find((e) => e.id.toLowerCase() === q || e.label.toLowerCase() === q);
  if (exact) return [exact];
  const kinds = KIND_WORDS.find(([re]) => re.test(q))?.[1];
  const pool = kinds ? d.equipment.filter((e) => kinds.includes(e.kind)) : d.equipment;
  // "cooler 2", "ups b1", "generator 3", "1.2": match the number/code part against the end of the label
  const code = /([a-z]?\d+(?:[.-]\d+)?|[a-z]\d*)$/.exec(q.replace(/[^a-z0-9.\- ]/g, '').trim())?.[1];
  if (code && kinds) {
    const tail = pool.filter((e) => e.label.toLowerCase().endsWith(` ${code}`) || e.label.toLowerCase().endsWith(`.${code}`));
    if (tail.length) return tail.slice(0, limit);
    const n = Number(code);
    if (Number.isInteger(n) && n >= 1) {
      // "cooler 2": the second one of that kind, in hall order
      const kind = pool.find((e) => kinds.includes(e.kind))?.kind;
      const sameKind = pool.filter((e) => e.kind === kind);
      if (sameKind[n - 1]) return [sameKind[n - 1]];
    }
  }
  if (kinds) return pool.slice(0, limit);
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return d.equipment.filter((e) => words.every((w) => e.label.toLowerCase().includes(w))).slice(0, limit);
}

const partView = (e: Equip) => {
  const live = getStage().live();
  const health = live ? (e.kind === 'rack' ? live.report.racks.get(e.id) : live.report.equipment.get(e.id)) : undefined;
  return {
    id: e.id,
    label: e.label,
    kind: EQUIP_HELP[e.kind].name,
    room: need().design.rooms.find((r) => r.id === e.room)?.name ?? e.room,
    ...(e.capacityKw ? { capacity: fmtPower(e.capacityKw) } : {}),
    ...(e.kw ? { power: `${e.kw} kW` } : {}),
    ...(e.side ? { power_path: e.side } : {}),
    status: health ?? 'ok',
    breakable: BREAKABLE.has(e.kind),
    broken: state.conditions.failed.has(e.id)
  };
};

/* ---------- read ---------- */
export function overview() {
  const o = state.options.length ? current() : undefined;
  if (!o) return { step: state.step, brief: state.brief, design: null, note: 'Nothing designed yet.' };
  const d = o.design;
  const halls = d.rooms.filter((r) => r.type === 'data_hall' && r.id !== 'future_hall');
  return {
    step: state.step,
    brief: state.brief,
    asked_for: {
      computing: fmtPower(state.basis.itKw),
      cooling: state.basis.cooling ?? 'compare all',
      cooling_redundancy: state.basis.coolingRedundancy,
      power_redundancy: state.basis.powerRedundancy
    },
    showing: {
      option: d.profile.key,
      title: d.title,
      recommended: state.selected === state.recommended,
      hardware: d.profile.hardware,
      racks: d.racks,
      rack_kw: d.profile.kw,
      gpus: o.cost.gpus,
      halls: halls.length,
      building_m: `${round(d.building.w / 1000)} × ${round(d.building.h / 1000)}`,
      checks_passed: `${o.checks.filter((c) => c.pass).length} of ${o.checks.length}`,
      pue: round(o.cost.pue, 2),
      build_cost: fmtMoney(o.cost.facility)
    },
    recommended_option: state.options[state.recommended]?.design.profile.key,
    view: { mode: state.view, lens: state.lens, picked: state.pick?.id ?? null }
  };
}

export function options() {
  return state.options.map((o, i) => ({
    option: o.design.profile.key,
    title: o.design.title,
    summary: o.design.summary,
    selected: i === state.selected,
    recommended: i === state.recommended,
    racks: o.design.racks,
    rack_kw: o.design.profile.kw,
    gpus: o.cost.gpus,
    build: fmtMoney(o.cost.facility),
    computers: fmtMoney(o.cost.it),
    run_per_year: fmtMoney(o.cost.opexYear),
    total: `${fmtMoney(o.cost.tco)} over ${o.cost.years} years`,
    per_kw_month: `$${Math.round(o.cost.perKwMonth)}`,
    pue: round(o.cost.pue, 2),
    co2_t_per_year: Math.round(o.cost.co2Tonnes),
    checks_passed: `${o.checks.filter((c) => c.pass).length} of ${o.checks.length}`
  }));
}

export function costs(option?: unknown) {
  const o = option ? state.options[optionIndex(option)] : need();
  const c = o.cost;
  return {
    option: o.design.profile.key,
    build_site: fmtMoney(c.facility),
    build_per_mw: fmtMoney(c.perMw),
    computers: fmtMoney(c.it),
    run_per_year: fmtMoney(c.opexYear),
    of_which: { electricity: fmtMoney(c.energyYear), maintenance: fmtMoney(c.maintenanceYear), staff: `${fmtMoney(c.staffYear)} (${c.staff} people)` },
    total: fmtMoney(c.tco),
    years: c.years,
    per_gpu_hour: `$${c.perGpuHour.toFixed(2)}`,
    per_kw_month: `$${Math.round(c.perKwMonth)}`,
    pue: round(c.pue, 2),
    energy_split: { computers: `${Math.round(c.pueParts.it * 100)}%`, cooling: `${Math.round(c.pueParts.cooling * 100)}%`, power_losses: `${Math.round(c.pueParts.power * 100)}%`, other: `${Math.round(c.pueParts.other * 100)}%` },
    energy_gwh_per_year: round(c.energyMwhYear / 1000, 1),
    co2_t_per_year: Math.round(c.co2Tonnes),
    build_lines: c.lines.map((l) => ({ item: l.label, cost: fmtMoney(l.amount) })),
    money_settings: { electricity_per_kwh: `$${state.basis.priceKwh}`, utilization: state.basis.utilization, years: state.basis.years }
  };
}

export function status() {
  const o = need();
  const r = evaluate(o.design, state.conditions);
  return {
    headline: r.headline,
    sentence: r.sentence,
    rows: { total: o.design.rows.length, no_backup: r.rowsAtRisk, down: r.rowsDown },
    broken: [...state.conditions.failed].map((id) => o.design.equipment.find((e) => e.id === id)?.label ?? id),
    outdoor_c: round(state.conditions.outdoorC, 1),
    load_pct: Math.round(state.conditions.load * 100),
    systems: r.pools.filter((p) => p.loadKw > 0).map((p) => ({ name: p.label, health: p.health, explain: p.sentence }))
  };
}

/* ---------- the tool list ---------- */
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required });
const COOLING = { type: 'string', enum: ['liquid', 'hybrid', 'air'] };

/* Act on the Test step, switching to it first. */
const onTest = () => {
  need();
  go('test');
  if (!testControl) throw new Error('The Test screen is not ready.');
  return testControl;
};

export const TOOLS: Tool[] = [
  {
    name: 'get_overview',
    description: 'What is on screen now: the brief, which design option is shown, its size, hardware, checks, PUE and build cost, the step and the view.',
    parameters: obj({}),
    run: overview,
    label: () => 'Looked at the design'
  },
  {
    name: 'list_options',
    description: 'All three design options (liquid, hybrid, air) with their key numbers, which is selected and which is recommended.',
    parameters: obj({}),
    run: options,
    label: () => 'Compared the three options'
  },
  {
    name: 'get_costs',
    description: 'Build cost, computers, running cost per year, total cost of ownership, $/GPU-hour, $/kW-month, PUE and where the energy goes. Defaults to the shown option.',
    parameters: obj({ option: { ...COOLING, description: 'Which option; omit for the one on screen' } }),
    run: (a) => costs(a.option),
    label: () => 'Read the costs'
  },
  {
    name: 'get_checks',
    description: 'The design checks (aisles, cooling and power redundancy, clearances, fire, delivery route...) with pass/fail, measured value and requirement.',
    parameters: obj({ option: COOLING }),
    run: (a) => (a.option ? state.options[optionIndex(a.option)] : need()).checks.map(({ id, title, pass, measured, required }) => ({ id, title, pass, measured, required })),
    label: () => 'Read the checks'
  },
  {
    name: 'get_status',
    description: 'What is running right now given broken parts, outdoor temperature and load: overall health, rows with no backup or down, and a sentence per power and cooling system.',
    parameters: obj({}),
    run: status,
    label: () => 'Checked what’s running'
  },
  {
    name: 'find_parts',
    description: 'Find equipment by plain words or id, e.g. "cooler 2", "UPS B1", "generator 3", "outdoor cooler". Returns ids, labels, capacity and live status.',
    parameters: obj({ query: { type: 'string' } }, ['query']),
    run: (a) => {
      const found = findParts(String(a.query ?? ''));
      return found.length ? found.map(partView) : { found: 0, hint: 'Try a kind: liquid cooler, air handler, outdoor cooler, UPS, switchgear, generator, transformer, power panel, rack.' };
    },
    label: (a) => `Looked for “${String(a.query ?? '')}”`
  },
  {
    name: 'explain',
    description: 'Plain-language explanation of a kind of room or equipment (e.g. "CDU", "UPS", "hot aisle", "PUE").',
    parameters: obj({ topic: { type: 'string' } }, ['topic']),
    run: (a) => {
      const t = String(a.topic ?? '').toLowerCase();
      const eq = Object.entries(EQUIP_HELP).find(([k, v]) => t.includes(k) || v.name.toLowerCase().includes(t) || t.includes(v.name.toLowerCase().split(' (')[0]));
      if (eq) return { topic: eq[1].name, text: eq[1].text };
      const room = Object.entries(ROOM_HELP).find(([k]) => t.includes(k.replace('_', ' ')) || roomName(k as never).toLowerCase().includes(t));
      if (room) return { topic: roomName(room[0] as never), text: room[1] };
      return { topic: a.topic, text: null, note: 'Not in the glossary; explain from general knowledge, briefly.' };
    },
    label: (a) => `Looked up ${String(a.topic ?? '')}`
  },
  {
    name: 'select_option',
    description: 'Show a different design option on screen.',
    parameters: obj({ option: COOLING }, ['option']),
    run: (a) => {
      state.selected = optionIndex(a.option);
      state.pick = null;
      emit('selected');
      return overview().showing;
    },
    label: (a) => `Switched to ${String(a.option)}`
  },
  {
    name: 'go_to_step',
    description: 'Open a step: describe (the brief), design (look around), test (break things), cost.',
    parameters: obj({ step: { type: 'string', enum: ['describe', 'design', 'test', 'cost'] } }, ['step']),
    run: (a) => ({ ok: go(a.step as Step), step: state.step }),
    label: (a) => `Opened ${String(a.step)}`
  },
  {
    name: 'set_view',
    description: 'Change what the 3D view shows: lens layout|power|heat|backup, 3d or plan, a camera preset, or fly to a part or room by id.',
    parameters: obj({
      lens: { type: 'string', enum: LENSES.map((l) => l.id) },
      mode: { type: 'string', enum: ['3d', 'plan'] },
      camera: { type: 'string', enum: ['overview', 'inside', 'top'] },
      focus_id: { type: 'string', description: 'An equipment or room id to fly to and select' }
    }),
    run: (a) => {
      need();
      if (state.step === 'describe' || state.step === 'cost') go('design');
      if (a.lens) {
        state.lens = a.lens as Lens;
        emit('lens');
      }
      if (a.mode === '3d' || a.mode === 'plan') getStage().setView(a.mode);
      if (a.camera) getStage().preset(a.camera as 'overview');
      if (a.focus_id) {
        const id = String(a.focus_id);
        const d = need().design;
        const isEquip = d.equipment.some((e) => e.id === id);
        if (!isEquip && !d.rooms.some((r) => r.id === id)) throw new Error(`No part or room ${id}`);
        state.pick = { kind: isEquip ? 'equip' : 'room', id };
        emit('pick');
        getStage().focus(id);
      }
      return { lens: state.lens, mode: state.view, picked: state.pick?.id ?? null };
    },
    label: (a) => (a.focus_id ? 'Flew to it' : a.lens ? `Showed the ${String(a.lens)} lens` : 'Changed the view')
  },
  {
    name: 'break_parts',
    description: 'Break (or repair) parts on the Test step and report what still runs. Ids come from find_parts; "utility_A"/"utility_B" are the grid feeds.',
    parameters: obj({ ids: { type: 'array', items: { type: 'string' } }, repair: { type: 'boolean' } }, ['ids']),
    run: (a) => {
      const t = onTest();
      const ids = (Array.isArray(a.ids) ? a.ids : [a.ids]).map(String);
      const done = t.setBroken(ids, !a.repair);
      if (!done.length) throw new Error('None of those ids can be broken. Use find_parts first.');
      if (done.length === 1 && !done[0].startsWith('utility_')) {
        state.pick = { kind: 'equip', id: done[0] };
        emit('pick');
        getStage().focus(done[0]);
      }
      return { [a.repair ? 'repaired' : 'broken']: done, now: status() };
    },
    label: (a, r) => {
      const ids = (r as { broken?: string[]; repaired?: string[] } | undefined)?.broken ?? (r as { repaired?: string[] } | undefined)?.repaired ?? (Array.isArray(a.ids) ? a.ids : []);
      const names = (ids as string[]).map((id) => current()?.design.equipment.find((e) => e.id === id)?.label ?? id.replace('utility_', 'grid feed '));
      return `${a.repair ? 'Repaired' : 'Broke'} ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
    }
  },
  {
    name: 'run_scenario',
    description: 'Run a ready-made what-if on the Test step: cooler (a cooler breaks), path (power path A fails), grid (grid down, generators take over), heat (40 °C heat wave), busy (+5% load), storm (worst day). Replaces what was set before.',
    parameters: obj({ scenario: { type: 'string', enum: ['cooler', 'path', 'grid', 'heat', 'busy', 'storm'] } }, ['scenario']),
    run: (a) => {
      const t = onTest();
      if (!t.runScenario(String(a.scenario))) throw new Error('Unknown scenario');
      return { scenario: t.scenarios.find((s) => s.id === a.scenario), now: status() };
    },
    label: (a) => `Ran “${testControl?.scenarios.find((s) => s.id === a.scenario)?.label ?? String(a.scenario)}”`
  },
  {
    name: 'set_conditions',
    description: 'On the Test step, set the outdoor temperature (°C) and/or how hard the computers work (load, 1 = 100% of design).',
    parameters: obj({ outdoor_c: { type: 'number' }, load: { type: 'number' } }),
    run: (a) => {
      const t = onTest();
      t.setStress({ outdoorC: typeof a.outdoor_c === 'number' ? a.outdoor_c : undefined, load: typeof a.load === 'number' ? a.load : undefined });
      return status();
    },
    label: (a) => [a.outdoor_c !== undefined ? `${String(a.outdoor_c)} °C outside` : '', a.load !== undefined ? `${Math.round(Number(a.load) * 100)}% load` : ''].filter(Boolean).join(', ') || 'Set conditions'
  },
  {
    name: 'fix_everything',
    description: 'Repair every broken part and return to normal weather and load.',
    parameters: obj({}),
    run: () => {
      onTest().fixEverything();
      return status();
    },
    label: () => 'Fixed everything'
  },
  {
    name: 'test_single_failures',
    description: 'Break every part one at a time (from the current conditions) and report which kinds can fail alone without taking rows down.',
    parameters: obj({}),
    run: () =>
      onTest()
        .sweep()
        .map((r) => ({ kind: EQUIP_HELP[r.kind].name, count: r.count, survives_any_one: !r.worst, weak_spot: r.worst })),
    label: () => 'Tested every part, one at a time'
  },
  {
    name: 'set_money',
    description: 'Change the cost settings for all options: electricity price ($/kWh), years counted, average utilization (0–1).',
    parameters: obj({ price_kwh: { type: 'number' }, years: { type: 'number' }, utilization: { type: 'number' } }),
    run: (a) => {
      need();
      if (typeof a.price_kwh === 'number' && a.price_kwh > 0 && a.price_kwh < 2) state.basis.priceKwh = a.price_kwh;
      if (typeof a.years === 'number' && a.years >= 1 && a.years <= 40) state.basis.years = Math.round(a.years);
      if (typeof a.utilization === 'number' && a.utilization > 0 && a.utilization <= 1) state.basis.utilization = a.utilization;
      recost();
      return costs();
    },
    label: () => 'Changed the cost settings'
  },
  {
    name: 'set_rate',
    description: `Change one cost assumption. Keys: ${RATES.map((r) => `${r.key} (${r.unit})`).join(', ')}.`,
    parameters: obj({ key: { type: 'string', enum: RATES.map((r) => r.key) }, value: { type: 'number' } }, ['key', 'value']),
    run: (a) => {
      need();
      const rate = RATES.find((r) => r.key === a.key);
      if (!rate || typeof a.value !== 'number' || a.value < 0) throw new Error('Unknown key or bad value');
      state.rates[rate.key as RateKey] = a.value;
      recost();
      return { [rate.label]: `${a.value} ${rate.unit}`, now: costs() };
    },
    label: (a) => `Set ${RATES.find((r) => r.key === a.key)?.label.toLowerCase() ?? String(a.key)}`
  },
  {
    name: 'new_design',
    description: 'Design a new site from a one-line brief, e.g. "5 MW inference site, air cooled, N+1". Replaces the current options.',
    parameters: obj({ brief: { type: 'string' } }, ['brief']),
    run: (a) => {
      const brief = String(a.brief ?? '').trim();
      if (!brief) throw new Error('Empty brief');
      const read = readBrief(brief);
      generate(brief, read.basis);
      return { understood: read.understood, ...overview() };
    },
    label: (a) => `Designed “${String(a.brief ?? '').slice(0, 40)}”`
  }
];

export const coolingName = (c: Cooling) => state.options.find((o) => o.design.profile.key === c)?.design.title ?? c;
