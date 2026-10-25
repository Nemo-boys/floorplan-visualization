/* ---------- Scenario builder: typed blocks, presets, checks, compiler and multi-day runs (no DOM) ---------- */
import { BASE_SCENARIO, ClinicSim } from './sim';
import { RULE_METRICS, fmtClock, fmtHM, hm, roleName, ruleText } from './format';
import type {
  ArrivalStream,
  Block,
  BlockFields,
  CompiledScenario,
  DayKey,
  DayResult,
  DaysSummary,
  FieldValue,
  PreparedPlan,
  Problem,
  Role,
  Scenario,
  SeriesPoint,
  Shift,
  SimScenario,
  Spread,
  Verdict,
  VerdictLevel,
  VisitType
} from './types';

export const ROLE_OPTIONS: Record<Role, string> = { provider: 'Provider', nurse: 'Nurse', reception: 'Receptionist' };
export interface BlockGroup {
  key: string;
  label: string;
  hint: string;
}
export const BLOCK_GROUPS: BlockGroup[] = [
  { key: 'day', label: 'Day', hint: 'Opening hours and how many days to run' },
  { key: 'people', label: 'People', hint: 'Who works, and when' },
  { key: 'patients', label: 'Patients', hint: 'Who comes in, and when' },
  { key: 'visits', label: 'Visits', hint: 'What a visit involves' },
  { key: 'timeline', label: 'Timeline', hint: 'Breaks and changes during the day' },
  { key: 'rules', label: 'Rules', hint: 'React when something happens' }
];
export type FieldType = 'int' | 'percent' | 'time' | 'enum' | 'text' | 'range' | 'bool' | 'room';
export interface FieldDef {
  type: FieldType;
  label: string;
  default: FieldValue;
  min?: number | string;
  max?: number | string;
  help?: string;
  options?: Record<string, string>;
  roomTypes?: string[];
  showIf?: (f: BlockFields) => boolean;
}
export interface TimelineDef {
  lane: string;
  from?: string;
  to?: string;
  at?: string;
  soft?: boolean;
}
export interface BlockType {
  group: string;
  label: string;
  single?: boolean;
  required?: boolean;
  icon: string;
  desc: string;
  fields: Record<string, FieldDef>;
  timeline?: TimelineDef;
  summary: (f: BlockFields, P?: PreparedPlan | null) => string;
}
/* Field values are typed loosely in the block registry; these read them back. */
const num = (v: FieldValue): number => v as number;
const pair = (v: FieldValue): number[] => v as number[];

/* Each block type is defined once: fields (type, range, default), how it reads, and where it sits on the timeline.
   Adding a block type means adding an entry here and, if it needs new behavior, a case in compileScenario. */
export const BLOCK_TYPES: Record<string, BlockType> = {
  hours: {
    group: 'day',
    label: 'Opening hours',
    single: true,
    required: true,
    icon: 'clock',
    desc: 'When the doors open and close',
    fields: {
      opens: { type: 'time', label: 'Opens', default: '08:00', min: '06:00', max: '12:00' },
      closes: { type: 'time', label: 'Closes', default: '18:00', min: '12:00', max: '22:00' }
    },
    summary: f => fmtHM(f.opens) + ' to ' + fmtHM(f.closes)
  },
  run: {
    group: 'day',
    label: 'Run settings',
    single: true,
    required: true,
    icon: 'repeat',
    desc: 'How many days to simulate',
    fields: {
      days: {
        type: 'int',
        label: 'Days to simulate',
        default: 20,
        min: 1,
        max: 50,
        help: 'More days give a steadier range'
      },
      seed: { type: 'int', label: 'Random seed', default: 42, min: 1, max: 99999, help: 'Same seed, same results' }
    },
    summary: f => f.days + (f.days === 1 ? ' day' : ' days') + ', seed ' + f.seed
  },
  shift: {
    group: 'people',
    label: 'Staff shift',
    icon: 'person',
    desc: 'A group of staff and their hours',
    fields: {
      role: { type: 'enum', label: 'Role', options: ROLE_OPTIONS, default: 'nurse' },
      count: { type: 'int', label: 'How many', default: 1, min: 1, max: 10 },
      from: { type: 'time', label: 'From', default: '08:00' },
      to: { type: 'time', label: 'To', default: '18:00' }
    },
    timeline: { lane: 'staff', from: 'from', to: 'to' },
    summary: f => f.count + ' ' + roleName(f.role as string, num(f.count)) + ', ' + fmtHM(f.from) + ' to ' + fmtHM(f.to)
  },
  appointments: {
    group: 'patients',
    label: 'Appointments',
    icon: 'calendar',
    desc: 'Booked visits, spread evenly',
    fields: {
      count: { type: 'int', label: 'Booked visits', default: 50, min: 0, max: 200 },
      from: { type: 'time', label: 'First slot', default: '08:00' },
      to: { type: 'time', label: 'Last slot', default: '16:30' },
      no_show: { type: 'percent', label: 'No-shows', default: 5, min: 0, max: 50 }
    },
    timeline: { lane: 'arrivals', from: 'from', to: 'to' },
    summary: f => f.count + ' booked, ' + fmtHM(f.from) + ' to ' + fmtHM(f.to) + ', ' + f.no_show + '% no-shows'
  },
  walkins: {
    group: 'patients',
    label: 'Walk-ins',
    icon: 'door',
    desc: 'Patients without a booking',
    fields: {
      count: { type: 'int', label: 'Walk-ins', default: 10, min: 0, max: 200 },
      pattern: {
        type: 'enum',
        label: 'When they come',
        options: {
          steady: 'Spread through the day',
          morning: 'Morning rush',
          lunch: 'Lunch peak',
          afternoon: 'After-school peak'
        },
        default: 'steady'
      },
      from: { type: 'time', label: 'From', default: '08:00' },
      to: { type: 'time', label: 'To', default: '17:00' }
    },
    timeline: { lane: 'arrivals', from: 'from', to: 'to' },
    summary: f =>
      f.count +
      ' walk-ins, ' +
      (
        {
          steady: 'spread out',
          morning: 'mostly in the morning',
          lunch: 'mostly at lunch',
          afternoon: 'mostly after school'
        } as Record<string, string>
      )[f.pattern as string]
  },
  visit_type: {
    group: 'visits',
    label: 'Visit type',
    icon: 'stethoscope',
    desc: 'A kind of visit and the provider’s time',
    fields: {
      name: { type: 'text', label: 'Name', default: 'Standard visit', max: 32 },
      share: { type: 'percent', label: 'Share of patients', default: 60, min: 1, max: 100 },
      provider_min: { type: 'range', label: 'Provider time (min)', default: [15, 25], min: 3, max: 120 }
    },
    summary: f => f.name + ': ' + f.share + '%, ' + pair(f.provider_min)[0] + '–' + pair(f.provider_min)[1] + ' min'
  },
  steps: {
    group: 'visits',
    label: 'Visit steps',
    single: true,
    required: true,
    icon: 'steps',
    desc: 'Check-in, nurse intake and checkout',
    fields: {
      checkin: { type: 'range', label: 'Check-in (min)', default: [2, 4], min: 1, max: 20 },
      intake: { type: 'range', label: 'Nurse intake (min)', default: [5, 9], min: 1, max: 40 },
      checkout: { type: 'range', label: 'Checkout (min)', default: [1, 3], min: 1, max: 20 }
    },
    summary: f =>
      'Check-in ' +
      pair(f.checkin).join('–') +
      ', intake ' +
      pair(f.intake).join('–') +
      ', checkout ' +
      pair(f.checkout).join('–') +
      ' min'
  },
  break: {
    group: 'timeline',
    label: 'Break',
    icon: 'coffee',
    desc: 'Staff step away for a while',
    fields: {
      role: { type: 'enum', label: 'Who', options: ROLE_OPTIONS, default: 'nurse' },
      minutes: { type: 'int', label: 'Length (min)', default: 30, min: 5, max: 120 },
      from: { type: 'time', label: 'Between', default: '12:00' },
      to: { type: 'time', label: 'And', default: '14:00' },
      stagger: { type: 'bool', label: 'One at a time', default: true }
    },
    timeline: { lane: 'staff', from: 'from', to: 'to', soft: true },
    summary: f =>
      roleName(f.role as string, 2).replace(/^./, c => c.toUpperCase()) +
      ' take ' +
      f.minutes +
      ' min between ' +
      fmtHM(f.from) +
      ' and ' +
      fmtHM(f.to) +
      (f.stagger ? ', one at a time' : ', together')
  },
  out: {
    group: 'timeline',
    label: 'Staff out',
    icon: 'person-off',
    desc: 'Someone is away for part of the day',
    fields: {
      role: { type: 'enum', label: 'Who', options: ROLE_OPTIONS, default: 'provider' },
      count: { type: 'int', label: 'How many', default: 1, min: 1, max: 10 },
      from: { type: 'time', label: 'From', default: '13:00' },
      to: { type: 'time', label: 'To', default: '15:00' }
    },
    timeline: { lane: 'events', from: 'from', to: 'to' },
    summary: f =>
      f.count + ' ' + roleName(f.role as string, num(f.count)) + ' out, ' + fmtHM(f.from) + ' to ' + fmtHM(f.to)
  },
  closed: {
    group: 'timeline',
    label: 'Room closed',
    icon: 'lock',
    desc: 'A room can’t be used for a while',
    fields: {
      room: { type: 'room', label: 'Room', roomTypes: ['exam_room'], default: '' },
      from: { type: 'time', label: 'From', default: '09:00' },
      to: { type: 'time', label: 'To', default: '11:00' }
    },
    timeline: { lane: 'events', from: 'from', to: 'to' },
    summary: (f, P) =>
      (roomLabel(P, f.room as string) || 'No room picked') + ' closed, ' + fmtHM(f.from) + ' to ' + fmtHM(f.to)
  },
  group: {
    group: 'timeline',
    label: 'Group arrival',
    icon: 'group',
    desc: 'Several patients arrive at once',
    fields: {
      count: { type: 'int', label: 'Patients', default: 6, min: 1, max: 40 },
      at: { type: 'time', label: 'At', default: '15:30' }
    },
    timeline: { lane: 'events', at: 'at' },
    summary: f => f.count + ' patients at ' + fmtHM(f.at)
  },
  rule: {
    group: 'rules',
    label: 'When / Then',
    icon: 'bolt',
    desc: 'If something happens, do something',
    fields: {
      metric: { type: 'enum', label: 'When', options: RULE_METRICS, default: 'waiting' },
      op: { type: 'enum', label: 'is', options: { gt: 'more than', lt: 'less than' }, default: 'gt' },
      value: { type: 'int', label: 'Value', default: 8, min: 0, max: 200 },
      hold: { type: 'int', label: 'For at least (min)', default: 15, min: 0, max: 180 },
      from: { type: 'time', label: 'Between', default: '08:00' },
      to: { type: 'time', label: 'And', default: '14:00' },
      action: {
        type: 'enum',
        label: 'Then',
        options: { call_in: 'call in extra staff', pause_walkins: 'stop taking walk-ins' },
        default: 'call_in'
      },
      role: {
        type: 'enum',
        label: 'Who',
        options: ROLE_OPTIONS,
        default: 'nurse',
        showIf: f => f.action === 'call_in'
      },
      count: {
        type: 'int',
        label: 'How many',
        default: 1,
        min: 1,
        max: 5,
        showIf: f => f.action === 'call_in'
      },
      delay: {
        type: 'int',
        label: 'Arrives after (min)',
        default: 20,
        min: 0,
        max: 120,
        showIf: f => f.action === 'call_in'
      },
      duration: { type: 'int', label: 'For (min)', default: 120, min: 10, max: 600 }
    },
    timeline: { lane: 'rules', from: 'from', to: 'to' },
    summary: f => ruleText(f)
  }
};
export function roomLabel(P: PreparedPlan | null | undefined, id: string): string {
  const r = P && P.m.rooms.find(q => q.id === id);
  return r ? r.label : '';
}
/* The counter behind new block ids. The UI only reads it through makeBlock. */
export let blockSeq = 0;
export function makeBlock(type: string, over?: Partial<BlockFields>): Block {
  const T = BLOCK_TYPES[type],
    fields: BlockFields = {};
  for (const [k, f] of Object.entries(T.fields)) fields[k] = Array.isArray(f.default) ? f.default.slice() : f.default;
  return {
    id: 'b' + Date.now().toString(36) + (++blockSeq).toString(36),
    type,
    enabled: true,
    fields: Object.assign(fields, over || {}) as BlockFields
  };
}
export interface ScenarioPreset {
  label: string;
  desc: string;
  make: () => Block[];
}
export const SCENARIO_PRESETS: Record<string, ScenarioPreset> = {
  normal: {
    label: 'Normal Tuesday',
    desc: '3 providers, 2 nurses, about 60 patients',
    make: () => [
      makeBlock('hours'),
      makeBlock('run'),
      makeBlock('shift', { role: 'provider', count: 3 }),
      makeBlock('shift', { role: 'nurse', count: 2 }),
      makeBlock('shift', { role: 'reception', count: 1 }),
      makeBlock('appointments', { count: 50 }),
      makeBlock('walkins', { count: 9 }),
      makeBlock('visit_type', { name: 'Quick follow-up', share: 25, provider_min: [8, 12] }),
      makeBlock('visit_type', { name: 'Standard visit', share: 60, provider_min: [15, 25] }),
      makeBlock('visit_type', { name: 'Long visit', share: 15, provider_min: [30, 40] }),
      makeBlock('steps'),
      makeBlock('break', { role: 'nurse', minutes: 30, from: '12:00', to: '14:00', stagger: true }),
      makeBlock('break', { role: 'provider', minutes: 30, from: '12:00', to: '14:00', stagger: true })
    ]
  },
  flu: {
    label: 'Flu-season Monday',
    desc: '90 patients, a morning rush, a rule that calls in help',
    make: () => [
      makeBlock('hours'),
      makeBlock('run'),
      makeBlock('shift', { role: 'provider', count: 3 }),
      makeBlock('shift', { role: 'nurse', count: 2 }),
      makeBlock('shift', { role: 'reception', count: 1 }),
      makeBlock('appointments', { count: 53, no_show: 5 }),
      makeBlock('walkins', { count: 40, pattern: 'morning' }),
      makeBlock('visit_type', { name: 'Flu check', share: 45, provider_min: [6, 12] }),
      makeBlock('visit_type', { name: 'Standard visit', share: 45, provider_min: [12, 20] }),
      makeBlock('visit_type', { name: 'Long visit', share: 10, provider_min: [25, 35] }),
      makeBlock('steps', { intake: [4, 8] }),
      makeBlock('break', { role: 'nurse', minutes: 30, from: '12:30', to: '14:30', stagger: true }),
      makeBlock('rule', {
        metric: 'desk',
        op: 'gt',
        value: 3,
        hold: 10,
        from: '08:00',
        to: '13:00',
        action: 'call_in',
        role: 'reception',
        count: 1,
        delay: 15,
        duration: 240
      })
    ]
  },
  short: {
    label: 'Short-staffed day',
    desc: '2 providers, 1 nurse, a provider out after lunch',
    make: () => [
      makeBlock('hours'),
      makeBlock('run'),
      makeBlock('shift', { role: 'provider', count: 2 }),
      makeBlock('shift', { role: 'nurse', count: 1 }),
      makeBlock('shift', { role: 'reception', count: 1 }),
      makeBlock('appointments', { count: 44 }),
      makeBlock('walkins', { count: 6 }),
      makeBlock('visit_type', { name: 'Standard visit', share: 80, provider_min: [15, 25] }),
      makeBlock('visit_type', { name: 'Long visit', share: 20, provider_min: [30, 40] }),
      makeBlock('steps'),
      makeBlock('break', { role: 'nurse', minutes: 30, from: '12:00', to: '13:00', stagger: true }),
      makeBlock('out', { role: 'provider', count: 1, from: '13:00', to: '15:00' })
    ]
  },
  custom: {
    label: 'Custom',
    desc: 'Start from the basics and add your own blocks',
    make: () => [makeBlock('hours'), makeBlock('run'), makeBlock('steps')]
  }
};
export function makeScenario(preset: string): Scenario {
  const P = SCENARIO_PRESETS[preset] || SCENARIO_PRESETS.custom;
  return { schema: 'fi.scenario.v1', name: preset === 'custom' ? 'My scenario' : P.label, preset, blocks: P.make() };
}
export function checkField(f: FieldDef, v: unknown, P?: PreparedPlan | null): string | null {
  if (f.type === 'int' || f.type === 'percent') {
    if (typeof v !== 'number' || !isFinite(v)) return 'enter a number';
    if (f.type === 'int' && !Number.isInteger(v)) return 'use a whole number';
    if (f.min != null && v < (f.min as number)) return 'at least ' + f.min;
    if (f.max != null && v > (f.max as number)) return 'at most ' + f.max;
  } else if (f.type === 'time') {
    if (isNaN(hm(v))) return 'enter a time';
    if (f.min && hm(v) < hm(f.min)) return 'no earlier than ' + fmtHM(f.min);
    if (f.max && hm(v) > hm(f.max)) return 'no later than ' + fmtHM(f.max);
  } else if (f.type === 'enum') {
    if (!Object.prototype.hasOwnProperty.call(f.options, v as PropertyKey)) return 'pick an option';
  } else if (f.type === 'text') {
    if (!String(v || '').trim()) return 'enter a name';
    if (String(v).length > ((f.max as number) || 40))
      return 'keep it under ' + ((f.max as number) || 40) + ' characters';
  } else if (f.type === 'range') {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(x => typeof x === 'number' && isFinite(x)))
      return 'enter two numbers';
    if (v[0] > v[1]) return 'the first number should be the smaller one';
    if (v[0] < (f.min as number) || v[1] > (f.max as number)) return 'keep it between ' + f.min + ' and ' + f.max;
  } else if (f.type === 'bool') {
    if (typeof v !== 'boolean') return 'turn it on or off';
  } else if (f.type === 'room') {
    if (v && P && !P.m.rooms.some(r => r.id === v)) return 'this plan has no such room';
  }
  return null;
}
/* Problems: errors stop a run, warnings don't. Each points at a block (and field) where it can. */
export function validateScenario(scn: Scenario, P?: PreparedPlan | null): Problem[] {
  const out: Problem[] = [],
    on = scn.blocks.filter(b => b.enabled !== false);
  const add = (level: Problem['level'], b: Block | null | undefined, msg: string, field?: string): number =>
    out.push({ level, block: b ? b.id : null, field: field || null, msg });
  for (const b of scn.blocks) {
    const T = BLOCK_TYPES[b.type];
    if (!T) {
      add('error', b, 'Unknown block type “' + b.type + '”.');
      continue;
    }
    if (b.enabled === false) continue;
    for (const [k, f] of Object.entries(T.fields)) {
      if (f.showIf && !f.showIf(b.fields)) continue;
      const e = checkField(f, b.fields[k], P);
      if (e) add('error', b, T.label + ', ' + f.label.toLowerCase() + ': ' + e + '.', k);
    }
  }
  for (const [t, T] of Object.entries(BLOCK_TYPES)) {
    if (!T.single) continue;
    const list = on.filter(b => b.type === t);
    if (T.required && !list.length) add('error', null, 'Add an “' + T.label + '” block.');
    if (list.length > 1)
      add('error', list[1], 'Only one “' + T.label + '” block can be on. Switch off or remove the extra one.');
  }
  const hb = on.find(b => b.type === 'hours'),
    opens = hb ? hm(hb.fields.opens) : 0,
    closes = hb ? hm(hb.fields.closes) : 600;
  if (hb && closes <= opens) add('error', hb, 'Opening hours: closing time must be after opening time.', 'closes');
  for (const b of on) {
    const f = b.fields,
      T = BLOCK_TYPES[b.type];
    if (!T || b.type === 'hours' || b.type === 'run') continue;
    if (f.from != null && f.to != null && !isNaN(hm(f.from)) && !isNaN(hm(f.to)) && hm(f.to) <= hm(f.from))
      add('error', b, T.label + ': the end time must be after the start time.', 'to');
    const ts = ['from', 'to', 'at'].filter(k => f[k] != null && !isNaN(hm(f[k]))).map(k => hm(f[k]));
    if (hb && ts.some(t => t < opens || t > closes)) add('warning', b, T.label + ' goes outside opening hours.');
  }
  const staff: Record<string, number> = { provider: 0, nurse: 0, reception: 0 };
  for (const b of on.filter(b => b.type === 'shift'))
    if (staff[b.fields.role as string] != null && typeof b.fields.count === 'number')
      staff[b.fields.role as string] += b.fields.count;
  for (const [r, n] of Object.entries(staff))
    if (!n)
      add('error', null, 'No ' + roleName(r, 1) + ' is on shift. Add a “Staff shift” for ' + roleName(r, 2) + '.');
  const patients = on.reduce(
    (s, b) =>
      s +
      (['appointments', 'walkins', 'group'].includes(b.type) && typeof b.fields.count === 'number'
        ? b.fields.count
        : 0),
    0
  );
  if (!patients) add('error', null, 'No patients arrive. Add appointments, walk-ins or a group arrival.');
  const vts = on.filter(b => b.type === 'visit_type');
  if (!vts.length) add('warning', null, 'No visit types, so every visit takes 12–26 minutes with the provider.');
  else {
    const sum = vts.reduce((s, b) => s + (+b.fields.share || 0), 0);
    if (Math.abs(sum - 100) > 0.5)
      add('warning', vts[0], 'Visit type shares add up to ' + sum + '%. They’ll be scaled to 100%.');
  }
  for (const b of on.filter(b => b.type === 'break')) {
    const n = staff[b.fields.role as string] || 0,
      win = hm(b.fields.to) - hm(b.fields.from);
    if (b.fields.stagger && n * num(b.fields.minutes) > win)
      add(
        'warning',
        b,
        'Break: ' +
          n +
          ' ' +
          roleName(b.fields.role as string, n) +
          ' × ' +
          b.fields.minutes +
          ' min don’t fit between ' +
          fmtHM(b.fields.from) +
          ' and ' +
          fmtHM(b.fields.to) +
          ' one at a time. Later breaks will run past the window.'
      );
  }
  for (const b of on.filter(b => b.type === 'out')) {
    const n = staff[b.fields.role as string] || 0;
    if (num(b.fields.count) >= n && n)
      add('warning', b, 'Staff out: that’s every ' + roleName(b.fields.role as string, 1) + ' on shift.');
  }
  for (const b of on.filter(b => b.type === 'closed'))
    if (!b.fields.room) add('error', b, 'Room closed: pick a room.', 'room');
  const lastArrival = Math.max(
    -Infinity,
    ...on.filter(b => ['appointments', 'walkins'].includes(b.type)).map(b => hm(b.fields.to)),
    ...on.filter(b => b.type === 'group').map(b => hm(b.fields.at))
  );
  if (isFinite(lastArrival))
    for (const r of ['provider', 'nurse', 'reception']) {
      const ends = on
        .filter(b => b.type === 'shift' && b.fields.role === r)
        .map(b => hm(b.fields.to))
        .filter(t => !isNaN(t));
      if (ends.length && Math.max(...ends) < lastArrival)
        add(
          'warning',
          on.find(b => b.type === 'shift' && b.fields.role === r && hm(b.fields.to) === Math.max(...ends)),
          'Patients keep arriving until ' +
            fmtClock(lastArrival) +
            ', but the last ' +
            roleName(r, 1) +
            ' leaves at ' +
            fmtClock(Math.max(...ends)) +
            '. Anyone still waiting then won’t be seen.'
        );
    }
  return out;
}
export function compileScenario(scn: Scenario): CompiledScenario {
  const on = scn.blocks.filter(b => b.enabled !== false && BLOCK_TYPES[b.type]),
    F = (b: Block): BlockFields => b.fields,
    all = (t: string): Block[] => on.filter(b => b.type === t);
  const hb = all('hours')[0],
    rb = all('run')[0],
    st = all('steps')[0];
  const opens = hb ? hm(F(hb).opens) : 0,
    closes = hb ? hm(F(hb).closes) : 600;
  const staffPlan: Record<Role, Shift[]> = { provider: [], nurse: [], reception: [] };
  for (const b of all('shift'))
    for (let k = 0; k < num(F(b).count); k++)
      staffPlan[F(b).role as Role].push({ from: hm(F(b).from), to: hm(F(b).to) });
  const arrivalsPlan: ArrivalStream[] = [];
  for (const b of all('appointments'))
    arrivalsPlan.push({
      kind: 'appt',
      count: num(F(b).count),
      from: hm(F(b).from),
      to: hm(F(b).to),
      noShow: num(F(b).no_show) / 100
    });
  for (const b of all('walkins'))
    arrivalsPlan.push({
      kind: 'walkin',
      count: num(F(b).count),
      pattern: F(b).pattern as string,
      from: hm(F(b).from),
      to: hm(F(b).to)
    });
  for (const b of all('group')) arrivalsPlan.push({ kind: 'group', count: num(F(b).count), at: hm(F(b).at) });
  const visitTypes: VisitType[] = all('visit_type').map(b => ({
    name: F(b).name as string,
    share: num(F(b).share),
    prov: pair(F(b).provider_min).slice()
  }));
  const tot = visitTypes.reduce((s2, v) => s2 + v.share, 0) || 1;
  visitTypes.forEach(v => {
    v.p = v.share / tot;
  });
  const steps = st ? F(st) : { checkin: [2, 4], intake: [5, 9], checkout: [1, 3] };
  const expected = arrivalsPlan.reduce(
    (s2, a) => s2 + (a.kind === 'appt' ? a.count * (1 - (a.noShow as number)) : a.count),
    0
  );
  return Object.assign({}, BASE_SCENARIO, {
    key: scn.preset || 'custom',
    label: scn.name || 'Custom day',
    opens,
    closes,
    staffPlan,
    arrivalsPlan,
    visitTypes,
    breaks: all('break').map(b => ({
      role: F(b).role as Role,
      minutes: num(F(b).minutes),
      from: hm(F(b).from),
      to: hm(F(b).to),
      stagger: !!F(b).stagger
    })),
    outs: all('out').map(b => ({
      role: F(b).role as Role,
      count: num(F(b).count),
      from: hm(F(b).from),
      to: hm(F(b).to)
    })),
    closures: all('closed')
      .filter(b => F(b).room)
      .map(b => ({ room: F(b).room as string, from: hm(F(b).from), to: hm(F(b).to) })),
    rules: all('rule').map(b => ({
      id: b.id,
      label: ruleText(F(b)),
      metric: F(b).metric as string,
      op: F(b).op as string,
      value: num(F(b).value),
      hold: num(F(b).hold),
      from: hm(F(b).from),
      to: hm(F(b).to),
      action: F(b).action as string,
      role: F(b).role as Role,
      count: num(F(b).count),
      delay: num(F(b).delay),
      duration: num(F(b).duration)
    })),
    checkInMin: pair(steps.checkin).slice(),
    intakeMin: pair(steps.intake).slice(),
    checkoutMin: pair(steps.checkout).slice(),
    providers: staffPlan.provider.length,
    nurses: staffPlan.nurse.length,
    receptionists: staffPlan.reception.length,
    patients: Math.round(expected),
    days: rb ? num(F(rb).days) : 20,
    seed: rb ? num(F(rb).seed) : 42,
    firstArrival: opens,
    lastArrival: closes
  });
}
/* Runs the same scenario on several days with different random arrivals, and summarizes the range. */
export const DAY_KEYS: DayKey[] = [
  'seen',
  'avgWait',
  'p90Wait',
  'avgTime',
  'nurseKm',
  'examUse',
  'turnedAway',
  'noShows',
  'notSeen',
  'utilNurse',
  'utilProvider',
  'utilReception',
  'lastExit',
  'maxWaiting',
  'fires'
];
export function daySeed(seed: number, d: number): number {
  return (seed * 7919 + d * 104729) % 2147483647 || 1;
}
export function runDay(P: PreparedPlan, sc: SimScenario, seed: number): DayResult {
  const sim = new ClinicSim(P.m, P.g, P.pf, P.info, sc, seed);
  sim.runAll();
  return Object.assign(sim.metrics(), {
    seed,
    fireList: sim.fires.slice(),
    series: sim.series,
    opens: sim.opens,
    closes: sim.closes
  });
}
export function summarizeDays(days: DayResult[]): DaysSummary {
  const agg = {} as Record<DayKey, Spread>;
  for (const k of DAY_KEYS) {
    const v = days.map(d => d[k] || 0).sort((a, b) => a - b);
    agg[k] = {
      mean: v.reduce((s2, x) => s2 + x, 0) / v.length,
      lo: v[Math.floor(0.1 * (v.length - 1))],
      hi: v[Math.ceil(0.9 * (v.length - 1))]
    };
  }
  const waits = days.map(d => d.avgWait).sort((a, b) => a - b),
    med = waits[Math.floor((waits.length - 1) / 2)];
  const typical = days.reduce(
    (best, d) => (Math.abs(d.avgWait - med) < Math.abs(best.avgWait - med) ? d : best),
    days[0]
  );
  const fireDays: Record<string, number> = {};
  for (const d of days) for (const f of d.fireList) fireDays[f.id] = (fireDays[f.id] || 0) + 1;
  return { n: days.length, agg, typical, fireDays };
}
export function verdictOf(sum: DaysSummary): Verdict {
  const a = sum.agg,
    p90 = a.p90Wait.mean,
    util: Record<string, number> = {
      nurses: a.utilNurse.mean,
      providers: a.utilProvider.mean,
      reception: a.utilReception.mean,
      'exam rooms': a.examUse.mean
    };
  const [bk, bv] = Object.entries(util).sort((x, y) => y[1] - x[1])[0];
  let level: VerdictLevel = p90 <= 15 && a.turnedAway.mean < 0.5 ? 'good' : p90 <= 40 ? 'busy' : 'bad';
  if (a.notSeen.mean >= 3) level = 'bad';
  else if (a.notSeen.mean >= 0.5 && level === 'good') level = 'busy';
  const title = level === 'good' ? 'Handles it' : level === 'busy' ? 'Busy, but it copes' : 'Struggles';
  const peak = ((): SeriesPoint => {
    const s2 = sum.typical.series;
    let best = s2[0];
    for (const x of s2) if (x.lobby > best.lobby) best = x;
    return best;
  })();
  return { level, title, bottleneck: { name: bk, util: bv }, util, peak };
}
export interface Overrides {
  patients?: number | null;
  providers?: number | null;
  nurses?: number | null;
  receptionists?: number | null;
}
/* Changes a scenario for "what if" questions and ranges: patients scales every arrival block, staff roles set the first shift's count. */
export function applyOverrides(scn: Scenario, o: Overrides): Scenario {
  const s2 = JSON.parse(JSON.stringify(scn)) as Scenario;
  const on = s2.blocks.filter(b => b.enabled !== false);
  if (o.patients != null) {
    const patients = o.patients;
    const arr = on.filter(b => ['appointments', 'walkins', 'group'].includes(b.type)),
      cur = arr.reduce((t, b) => t + num(b.fields.count), 0);
    if (cur > 0)
      arr.forEach(b => {
        b.fields.count = Math.max(0, Math.round((num(b.fields.count) * patients) / cur));
      });
    else s2.blocks.push(makeBlock('appointments', { count: patients }));
  }
  for (const role of ['provider', 'nurse', 'reception'] as Role[]) {
    const v = o[role === 'reception' ? 'receptionists' : ((role + 's') as 'providers' | 'nurses')];
    if (v == null) continue;
    const shifts = on.filter(b => b.type === 'shift' && b.fields.role === role);
    if (shifts.length) {
      const rest = shifts.slice(1).reduce((t, b) => t + num(b.fields.count), 0);
      shifts[0].fields.count = Math.max(1, v - rest);
    } else s2.blocks.push(makeBlock('shift', { role, count: v }));
  }
  return s2;
}
