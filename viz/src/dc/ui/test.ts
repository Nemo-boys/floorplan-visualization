/* Step 3: break things and see what keeps running. Left: what to try and the answer in one sentence.
   Centre: the same stage as Design, recoloured by what still works. Click any part to break or repair it. */
import { fmtPower } from '../engine/brief';
import { DESIGN_AMBIENT_C, NORMAL, evaluate, type Conditions, type Health, type Report } from '../engine/status';
import type { Design, EquipKind } from '../engine/types';
import { current, emit, on, state } from '../state';
import { ICONS, h, s } from './dom';
import { EQUIP_HELP } from './help';
import { healthCss } from './lens';
import { getStage } from './stage';

/* Parts a person can break by clicking them. Racks and batteries are not modelled as single points of failure. */
export const BREAKABLE: ReadonlySet<EquipKind> = new Set(['cdu', 'crah', 'drycooler', 'ups', 'pdu', 'switchgear', 'generator', 'transformer']);

const HEADLINE: Record<Health, string> = { ok: 'All good', risk: 'Running, no backup left', down: 'Something goes down' };
const HOURS = 24;
const clock = (hr: number) => (hr % 12 === 0 ? 12 : hr % 12) + (hr < 12 ? ' am' : ' pm');
const kw = (v: number) => fmtPower(Math.round(v));

/* A day: the outside air peaks mid-afternoon, 9 °C above the night low; AI work runs near flat out, a little
   busier in the working day. */
export const dayTemp = (peak: number, hr: number) => peak - 9 + 9 * ((Math.cos(((hr - 15) / 24) * 2 * Math.PI) + 1) / 2);
export const dayLoad = (hr: number) => 0.9 + 0.1 * ((Math.cos(((hr - 14) / 24) * 2 * Math.PI) + 1) / 2);

interface Scenario {
  id: string;
  label: string;
  hint: string;
  icon: string;
  apply(d: Design): { failed?: string[]; load?: number; outdoorC?: number; focus?: string };
}

const firstOf = (d: Design, kind: EquipKind) => d.equipment.find((e) => e.kind === kind)?.id;
const SCENARIOS: Scenario[] = [
  {
    id: 'cooler',
    label: 'A cooler breaks',
    hint: 'One cooling unit in the first hall stops.',
    icon: ICONS.fan,
    apply: (d) => {
      const id = firstOf(d, d.profile.liquidShare > 0.5 ? 'cdu' : 'crah') ?? firstOf(d, 'crah');
      return { failed: id ? [id] : [], focus: id };
    }
  },
  {
    id: 'path',
    label: 'A power path fails',
    hint: 'All of path A’s switchgear trips.',
    icon: ICONS.bolt,
    apply: (d) => ({ failed: d.equipment.filter((e) => e.kind === 'switchgear' && e.side === 'A').map((e) => e.id) })
  },
  {
    id: 'grid',
    label: 'The grid goes down',
    hint: 'No power from outside. The generators take over.',
    icon: ICONS.plug,
    apply: () => ({ failed: ['utility_A', 'utility_B'] })
  },
  {
    id: 'heat',
    label: 'Heat wave',
    hint: `40 °C outside. Outdoor coolers are rated for ${DESIGN_AMBIENT_C} °C.`,
    icon: ICONS.thermo,
    apply: () => ({ outdoorC: 40 })
  },
  {
    id: 'busy',
    label: 'Busier than planned',
    hint: 'Every rack draws 5% more than it was designed for.',
    icon: ICONS.gauge,
    apply: () => ({ load: 1.05 })
  },
  {
    id: 'storm',
    label: 'Worst day',
    hint: 'Grid down in a heat wave, and one generator won’t start.',
    icon: ICONS.storm,
    apply: () => ({ failed: ['utility_A', 'utility_B', 'gen_1'], outdoorC: 42 })
  }
];

/* What the assistant (and anything else outside this screen) can do on the Test step. */
export interface TestControl {
  scenarios: { id: string; label: string; hint: string }[];
  runScenario(id: string): boolean;
  setBroken(ids: string[], broken: boolean): string[]; // returns the ids that exist
  fixEverything(): void;
  setStress(c: { outdoorC?: number; load?: number }): void;
  sweep(): { kind: EquipKind; count: number; worst: string | null }[];
  broken(): string[];
}
export let testControl: TestControl | null = null;

export function testScreen(): HTMLElement {
  const rail = h('aside', { class: 'rail test-rail', 'aria-label': 'What to try' });
  const slot = h('div', { class: 'stage-slot' });
  const banner = h('div', { class: 'floating status-banner', role: 'status', 'aria-live': 'polite' });

  // what the person has set, composed into state.conditions
  let failed = new Set<string>();
  let load = 1;
  let outdoorC = NORMAL.outdoorC;
  let hour: number | null = null;
  let active: string | null = null; // the scenario tile last pressed
  let playing = 0;

  const conditionsAt = (hr: number | null, extra?: string): Conditions => ({
    failed: extra ? new Set([...failed, extra]) : new Set(failed),
    load: hr === null ? load : load * dayLoad(hr),
    outdoorC: hr === null ? outdoorC : dayTemp(outdoorC, hr)
  });
  const apply = () => {
    if (state.step !== 'test') return;
    state.conditions = conditionsAt(hour);
    emit('conditions');
  };
  const reset = () => {
    failed = new Set();
    load = 1;
    outdoorC = NORMAL.outdoorC;
    hour = null;
    active = null;
    stopPlay();
    sweep = null;
    apply();
  };

  const toggle = (id: string) => {
    if (failed.has(id)) failed.delete(id);
    else failed.add(id);
    active = null;
    sweep = null;
    apply();
  };

  // ---------- the day ----------
  let dayCache: { key: string; hours: Health[] } | null = null;
  function dayStatus(d: Design): Health[] {
    const key = `${d.id}|${[...failed].join()}|${load}|${outdoorC}`;
    if (dayCache?.key !== key) dayCache = { key, hours: Array.from({ length: HOURS }, (_, hr) => evaluate(d, conditionsAt(hr)).headline) };
    return dayCache.hours;
  }
  function stopPlay() {
    if (playing) clearInterval(playing);
    playing = 0;
  }
  function play() {
    if (playing) {
      stopPlay();
      paint();
      return;
    }
    if (hour === null || hour >= HOURS - 1) hour = 0;
    apply();
    playing = window.setInterval(() => {
      if (hour === null || hour >= HOURS - 1) {
        stopPlay();
        paint();
        return;
      }
      hour++;
      apply();
    }, 650);
  }

  // ---------- "survive any one failure" sweep ----------
  type SweepRow = { kind: EquipKind; count: number; worst: string | null; done: boolean };
  let sweep: { design: string; rows: SweepRow[] } | null = null;
  function runSweep() {
    const d = current()?.design;
    if (!d) return;
    const kinds = [...BREAKABLE].filter((k) => d.equipment.some((e) => e.kind === k));
    sweep = { design: d.id, rows: kinds.map((kind) => ({ kind, count: d.equipment.filter((e) => e.kind === kind).length, worst: null, done: false })) };
    const base = evaluate(d, conditionsAt(hour)).rowsDown;
    const mine = sweep;
    let i = 0;
    const next = () => {
      if (sweep !== mine || i >= mine.rows.length) return;
      const row = mine.rows[i++];
      for (const e of d.equipment) {
        if (e.kind !== row.kind || failed.has(e.id)) continue;
        if (evaluate(d, conditionsAt(hour, e.id)).rowsDown > base) {
          row.worst = e.id;
          break;
        }
      }
      row.done = true;
      paint();
      setTimeout(next, 30); // one kind per frame or so, so the list fills in visibly
    };
    paint();
    setTimeout(next, 30);
  }

  // ---------- painting ----------
  function statusCard(r: Report): HTMLElement {
    const d = current()!.design;
    const ok = d.rows.length - r.rowsAtRisk - r.rowsDown;
    const where = hour !== null ? ` at ${clock(hour)}` : '';
    return h(
      'div',
      { class: `status-card ${r.headline}`, style: `--c:${healthCss[r.headline]}` },
      h('div', { class: 'status-head' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }), h('b', {}, HEADLINE[r.headline] + where)),
      h('p', {}, r.sentence),
      h(
        'div',
        { class: 'row-counts' },
        h('span', {}, h('i', { style: 'background:var(--ok)' }), h('b', {}, ok), ' rows safe'),
        h('span', {}, h('i', { style: 'background:var(--risk)' }), h('b', {}, r.rowsAtRisk), ' no backup'),
        h('span', {}, h('i', { style: 'background:var(--down)' }), h('b', {}, r.rowsDown), ' down')
      )
    );
  }

  function runScenario(sc: Scenario, d: Design) {
    reset();
    const a = sc.apply(d);
    failed = new Set(a.failed ?? []);
    load = a.load ?? 1;
    outdoorC = a.outdoorC ?? NORMAL.outdoorC;
    active = sc.id;
    if (a.focus) {
      pickUnit(a.focus);
      getStage().focus(a.focus);
    }
    apply();
  }

  /* Every part of each kind failed one at a time, all at once (well under a second even for air halls). */
  function sweepNow(d: Design): SweepRow[] {
    const base = evaluate(d, conditionsAt(hour)).rowsDown;
    return [...BREAKABLE]
      .filter((k) => d.equipment.some((e) => e.kind === k))
      .map((kind) => {
        const units = d.equipment.filter((e) => e.kind === kind);
        const worst = units.find((e) => !failed.has(e.id) && evaluate(d, conditionsAt(hour, e.id)).rowsDown > base)?.id ?? null;
        return { kind, count: units.length, worst, done: true };
      });
  }

  testControl = {
    scenarios: SCENARIOS.map(({ id, label, hint }) => ({ id, label, hint })),
    runScenario: (id) => {
      const sc = SCENARIOS.find((x) => x.id === id);
      const d = current()?.design;
      if (!sc || !d) return false;
      runScenario(sc, d);
      return true;
    },
    setBroken: (ids, broken) => {
      const d = current()?.design;
      const ok = ids.filter((id) => id === 'utility_A' || id === 'utility_B' || d?.equipment.some((e) => e.id === id && BREAKABLE.has(e.kind)));
      ok.forEach((id) => (broken ? failed.add(id) : failed.delete(id)));
      active = null;
      sweep = null;
      apply();
      return ok;
    },
    fixEverything: () => reset(),
    setStress: (c) => {
      if (c.outdoorC !== undefined) outdoorC = Math.max(-10, Math.min(55, c.outdoorC));
      if (c.load !== undefined) load = Math.max(0.1, Math.min(1.5, c.load));
      active = null;
      apply();
    },
    sweep: () => {
      const d = current()?.design;
      if (!d) return [];
      const rows = sweepNow(d);
      sweep = { design: d.id, rows };
      paint();
      return rows.map(({ kind, count, worst }) => ({ kind, count, worst }));
    },
    broken: () => [...failed]
  };

  function scenarioTiles(): HTMLElement {
    const d = current()!.design;
    return h(
      'div',
      { class: 'whatifs' },
      ...SCENARIOS.map((sc) =>
        h(
          'button',
          {
            type: 'button',
            class: 'tile',
            'aria-pressed': String(active === sc.id),
            title: sc.hint,
            onclick: () => {
              if (active === sc.id) reset();
              else runScenario(sc, d);
            }
          },
          h('span', { class: 'tile-ic', html: sc.icon }),
          h('b', {}, sc.label),
          h('small', {}, sc.hint)
        )
      )
    );
  }

  function brokenList(d: Design): HTMLElement | null {
    if (!failed.size) return null;
    const name = (id: string) =>
      id === 'utility_A' ? 'Grid feed A' : id === 'utility_B' ? 'Grid feed B' : (d.equipment.find((e) => e.id === id)?.label ?? id);
    return h(
      'div',
      { class: 'panel-card' },
      h('h3', {}, `Broken (${failed.size})`),
      h(
        'div',
        { class: 'chips' },
        ...[...failed].map((id) =>
          h(
            'button',
            { type: 'button', class: 'chip down', title: 'Repair', onclick: () => toggle(id) },
            name(id),
            h('span', { html: ICONS.close, 'aria-label': 'Repair' })
          )
        )
      )
    );
  }

  function sliders(): HTMLElement {
    const tOut = h('output', {}, `${Math.round(outdoorC)} °C`);
    const lOut = h('output', {}, `${Math.round(load * 100)}%`);
    const t = h('input', { type: 'range', min: 10, max: 50, step: 1, value: outdoorC, 'aria-label': 'Outside temperature' });
    const l = h('input', { type: 'range', min: 50, max: 120, step: 1, value: Math.round(load * 100), 'aria-label': 'How hard the computers work' });
    t.addEventListener('input', () => {
      outdoorC = Number(t.value);
      tOut.textContent = `${outdoorC} °C`;
      active = null;
      apply();
    });
    l.addEventListener('input', () => {
      load = Number(l.value) / 100;
      lOut.textContent = `${l.value}%`;
      active = null;
      apply();
    });
    return h(
      'div',
      { class: 'dials two' },
      h('div', { class: 'dial' }, h('label', {}, hour === null ? 'Outside air' : 'Hottest hour today'), tOut, t),
      h('div', { class: 'dial' }, h('label', {}, 'How hard the computers work'), lOut, l)
    );
  }

  function dayCard(d: Design): HTMLElement {
    const hours = dayStatus(d);
    const W = 288;
    const H = 64;
    const cw = W / HOURS;
    const temps = Array.from({ length: HOURS }, (_, hr) => dayTemp(outdoorC, hr));
    const tMin = Math.min(...temps, DESIGN_AMBIENT_C) - 2;
    const tMax = Math.max(...temps, DESIGN_AMBIENT_C) + 2;
    const ty = (t: number) => 4 + (1 - (t - tMin) / (tMax - tMin)) * (H - 30);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'day', role: 'img', 'aria-label': 'Status hour by hour over one day' });
    // the coolers' rated temperature, as a dashed line
    svg.append(s('line', { x1: 0, x2: W, y1: ty(DESIGN_AMBIENT_C), y2: ty(DESIGN_AMBIENT_C), class: 'rated' }));
    svg.append(s('path', { d: temps.map((t, i) => `${i ? 'L' : 'M'}${(i + 0.5) * cw},${ty(t)}`).join(''), class: 'temp' }));
    hours.forEach((hl, i) => {
      const r = s('rect', { x: i * cw + 0.75, y: H - 20, width: cw - 1.5, height: 14, rx: 3, fill: healthCss[hl], class: i === hour ? 'cell on' : 'cell' });
      r.addEventListener('click', () => {
        stopPlay();
        hour = i;
        apply();
      });
      const title = s('title');
      title.textContent = `${clock(i)}: ${HEADLINE[hl]}, ${Math.round(temps[i])} °C outside`;
      r.append(title);
      svg.append(r);
    });
    if (hour !== null) svg.append(s('line', { x1: (hour + 0.5) * cw, x2: (hour + 0.5) * cw, y1: 0, y2: H - 4, class: 'head' }));
    const worst = hours.includes('down') ? 'down' : hours.includes('risk') ? 'risk' : 'ok';
    const summary =
      worst === 'ok'
        ? 'Safe all day, with backup to spare.'
        : `${worst === 'down' ? 'Goes down' : 'Loses its backup'} from ${clock(hours.indexOf(worst))}, the hottest part of the day.`;
    return h(
      'div',
      { class: 'panel-card day-card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, 'Play a day'),
        h('button', { type: 'button', class: 'round', 'aria-label': playing ? 'Pause' : 'Play the day', html: playing ? ICONS.pause : ICONS.play, onclick: play })
      ),
      h('p', { class: 'muted small' }, summary),
      svg,
      h('div', { class: 'day-axis' }, h('span', {}, '12 am'), h('span', {}, '6 am'), h('span', {}, 'noon'), h('span', {}, '6 pm'), h('span', {}, '12 am')),
      h(
        'div',
        { class: 'day-key' },
        h('span', {}, h('i', { class: 'line' }), 'Outside air'),
        h('span', {}, h('i', { class: 'dash' }), `Coolers rated ${DESIGN_AMBIENT_C} °C`),
        hour !== null
          ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => ((hour = null), stopPlay(), apply()) }, 'Back to now')
          : null
      )
    );
  }

  function sweepCard(d: Design): HTMLElement {
    const mine = sweep?.design === d.id ? sweep : null;
    const body = mine
      ? mine.rows.map((r) => {
          const name = EQUIP_HELP[r.kind].name.replace(/ \(.*\)/, '');
          const state_ = !r.done ? 'wait' : r.worst ? 'fail' : 'pass';
          return h(
            'div',
            { class: `check ${state_ === 'fail' ? 'fail' : ''} ${state_ === 'wait' ? 'wait' : ''}` },
            h('span', { class: 'ic', 'aria-hidden': 'true' }, state_ === 'wait' ? '' : state_ === 'pass' ? '✓' : '!'),
            h(
              'div',
              {},
              `Any one ${name.toLowerCase()} (${r.count})`,
              h('small', {}, state_ === 'wait' ? 'Testing…' : state_ === 'pass' ? 'Can fail without anything going down' : 'Losing one takes rows down'),
              r.worst ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => (toggle(r.worst!), pickUnit(r.worst!), getStage().focus(r.worst!)) }, 'Show me') : null
            )
          );
        })
      : [];
    const done = mine?.rows.every((r) => r.done);
    const fails = mine?.rows.filter((r) => r.worst).length ?? 0;
    return h(
      'div',
      { class: 'panel-card' },
      h('h3', {}, 'Can it survive any one failure?'),
      h('p', { class: 'muted small' }, done ? (fails ? `${fails} kind${fails > 1 ? 's' : ''} of part can’t fail alone safely.` : 'Yes. Any single part can fail and every rack keeps running.') : 'Breaks every part one at a time, from the way things are now.'),
      ...body,
      !mine ? h('button', { type: 'button', class: 'btn soft', style: 'margin-top:4px', onclick: runSweep }, 'Test every part') : null
    );
  }

  function numbersCard(r: Report): HTMLElement {
    return h(
      'details',
      { class: 'panel-card numbers' },
      h('summary', {}, 'Show the numbers'),
      ...r.pools
        .filter((p) => p.loadKw > 0)
        .map((p) => {
          const pct = p.capacityKw > 0 ? Math.min(1, p.loadKw / p.capacityKw) : 1;
          return h(
            'div',
            { class: 'pool', title: p.sentence },
            h('div', { class: 'pool-head' }, h('span', {}, p.label), h('b', {}, `${kw(p.loadKw)} of ${kw(p.capacityKw)}`)),
            h('div', { class: 'meter' }, h('i', { style: `width:${pct * 100}%;background:${healthCss[p.health]}` }))
          );
        })
    );
  }

  const pickUnit = (id: string) => {
    state.pick = { kind: 'equip', id };
    emit('pick');
  };

  let open = false; // keep <details> open across repaints
  function paint() {
    const o = current();
    if (!o || state.step !== 'test') return;
    const d = o.design;
    const r = evaluate(d, state.conditions);
    const scroll = rail.scrollTop;
    const details = rail.querySelector('details.numbers') as HTMLDetailsElement | null;
    if (details) open = details.open;
    const numbers = numbersCard(r);
    (numbers as HTMLDetailsElement).open = open;
    rail.replaceChildren(
      h('h2', {}, 'What if something breaks?'),
      h('p', { class: 'hint' }, 'Try one of these, or click any part in the view and break it yourself.'),
      statusCard(r),
      scenarioTiles(),
      brokenList(d) ?? '',
      sliders(),
      dayCard(d),
      sweepCard(d),
      numbers,
      failed.size || load !== 1 || outdoorC !== NORMAL.outdoorC || hour !== null
        ? h('button', { type: 'button', class: 'btn soft', html: `${ICONS.reset} Fix everything`, onclick: reset })
        : ''
    );
    rail.scrollTop = scroll;
    banner.style.setProperty('--c', healthCss[r.headline]);
    banner.className = `floating status-banner ${r.headline}`;
    banner.replaceChildren(h('span', { class: 'pulse', 'aria-hidden': 'true' }), r.sentence);
    getStage().setBanner(banner);
  }

  // the card for a clicked part gets a Break / Repair button
  const inspectorExtra = (): HTMLElement[] => {
    const id = state.pick?.kind === 'equip' ? state.pick.id : null;
    const e = id ? current()?.design.equipment.find((x) => x.id === id) : undefined;
    if (!e || !BREAKABLE.has(e.kind)) return [];
    const broken = failed.has(e.id);
    return [
      h(
        'button',
        {
          type: 'button',
          class: `btn ${broken ? 'primary' : 'danger'} wide`,
          html: broken ? `${ICONS.wrench} Repair it` : `${ICONS.bolt} Break it`,
          onclick: () => toggle(e.id)
        }
      )
    ];
  };

  on('conditions', paint);
  const forget = () => {
    // a different design has different parts
    reset();
  };
  on('selected', forget);
  on('options', forget);
  on('step', () => {
    const stage = getStage();
    if (state.step !== 'test') {
      stopPlay();
      if (state.conditions !== NORMAL) {
        state.conditions = NORMAL;
        emit('conditions');
      }
      stage.setBanner(null);
      return;
    }
    slot.replaceChildren(stage.el);
    stage.setActions(h('button', { class: 'btn dark', type: 'button', onclick: () => ((state.step = 'cost'), emit('step')), html: `See the cost ${ICONS.arrowRight}` }));
    stage.setRail(slot.parentElement);
    stage.setInspectorExtra(inspectorExtra);
    if (state.lens === 'layout') {
      state.lens = 'backup';
      emit('lens');
    }
    apply();
    stage.refresh();
  });

  return h('section', { class: 'work', id: 'test' }, rail, slot);
}
