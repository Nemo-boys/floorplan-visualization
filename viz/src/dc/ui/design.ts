/* Step 2: pick one of three designs and look around it. Left: the options. Centre: the site. Right: what
   you clicked, in plain words. */
import { fmtPower } from '../engine/brief';
import { fmtMoney } from '../engine/cost';
import { roomName } from '../engine/design';
import type { Design, Equip, Room } from '../engine/types';
import { current, emit, on, state, type Option } from '../state';
import { ICONS, h } from './dom';
import { EQUIP_HELP, ROOM_HELP, pueSentence } from './help';
import { EQUIP_FILL, createPlan } from './plan2d';

const m = (mm: number) => `${(mm / 1000).toFixed(1)} m`;
const area = (r: { w: number; h: number }) => `${Math.round((r.w * r.h) / 1e6).toLocaleString('en-US')} m²`;
const n = (v: number) => Math.round(v).toLocaleString('en-US');

function optionCard(o: Option, i: number): HTMLElement {
  const d = o.design;
  const passed = o.checks.filter((c) => c.pass).length;
  const allPass = passed === o.checks.length;
  const badges = [
    i === state.recommended ? h('span', { class: 'badge' }, 'Recommended') : null,
    state.basis.cooling === d.profile.key ? h('span', { class: 'badge blue' }, 'Matches your brief') : null
  ];
  return h(
    'button',
    {
      class: 'option',
      type: 'button',
      'aria-pressed': String(i === state.selected),
      onclick: () => {
        state.selected = i;
        state.pick = null;
        emit('selected');
      }
    },
    h('div', { class: 'option-head' }, h('span', { class: 'badges' }, ...badges), h('b', {}, d.title)),
    h('p', {}, d.summary),
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, n(d.racks)), h('span', {}, 'racks')),
      h('div', { class: 'stat' }, h('b', {}, fmtMoney(o.cost.facility)), h('span', {}, 'to build')),
      h('div', { class: 'stat' }, h('b', {}, `${fmtMoney(o.cost.energyYear)}`), h('span', {}, 'power / year'))
    ),
    h(
      'div',
      { class: 'checks-sum' },
      h('span', { class: `dot ${allPass ? '' : 'risk'}` }),
      `${passed} of ${o.checks.length} checks pass · ${area(d.building)} building`
    )
  );
}

function checksCard(o: Option): HTMLElement {
  const fails = o.checks.filter((c) => !c.pass);
  const list = (cs: typeof o.checks) =>
    cs.map((c) =>
      h(
        'div',
        { class: `check ${c.pass ? '' : 'fail'}`, title: `${c.required} — ${c.source}` },
        h('span', { class: 'ic', 'aria-hidden': 'true' }, c.pass ? '✓' : '!'),
        h('div', {}, c.title, h('small', {}, c.measured))
      )
    );
  return h(
    'div',
    { class: 'panel-card' },
    h('h3', {}, fails.length ? `${fails.length} thing${fails.length > 1 ? 's' : ''} to look at` : 'All checks pass'),
    ...list(fails),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, fails.length ? 'Show passing checks' : `Show all ${o.checks.length} checks`),
      ...list(o.checks.filter((c) => c.pass))
    ),
    h('p', { class: 'muted', style: 'font-size:12px;margin:10px 0 0' }, 'Screening checks only. Not an electrical, fire or structural sign-off.')
  );
}

function siteFacts(o: Option): HTMLElement[] {
  const d = o.design;
  const halls = d.rooms.filter((r) => r.type === 'data_hall' && r.id !== 'future_hall');
  const hallArea = halls.reduce((a, r) => a + (r.w * r.h) / 1e6, 0);
  const grow = d.rooms.find((r) => r.id === 'future_hall');
  return [
    h('div', { class: 'kicker' }, 'Your design'),
    h('h3', {}, `${d.title} · ${fmtPower(d.itKw)}`),
    h('p', {}, `${d.profile.hardware}. Click anything on the plan to see what it is and what it does.`),
    h(
      'dl',
      { class: 'facts' },
      h('dt', {}, 'Racks'),
      h('dd', {}, `${n(d.racks)} × ${d.profile.kw} kW`),
      h('dt', {}, 'GPUs'),
      h('dd', {}, n(o.cost.gpus)),
      h('dt', {}, 'Data halls'),
      h('dd', {}, `${halls.length} · ${n(hallArea)} m²`),
      h('dt', {}, 'Building'),
      h('dd', {}, `${m(d.building.w)} × ${m(d.building.h)}`),
      h('dt', {}, 'Energy overhead (PUE)'),
      h('dd', {}, o.cost.pue.toFixed(2)),
      h('dt', {}, 'Build cost'),
      h('dd', {}, fmtMoney(o.cost.facility)),
      ...(grow ? [h('dt', {}, 'Room to grow'), h('dd', {}, area(grow))] : [])
    ),
    h('p', { style: 'margin:10px 0 0;font-size:13px' }, pueSentence(o.cost.pue))
  ];
}

function roomFacts(d: Design, r: Room): HTMLElement[] {
  const inside = d.equipment.filter((e) => e.room === r.id);
  const counts = new Map<string, number>();
  inside.forEach((e) => counts.set(EQUIP_HELP[e.kind].name, (counts.get(EQUIP_HELP[e.kind].name) ?? 0) + 1));
  const rackKw = inside.filter((e) => e.kind === 'rack').reduce((a, e) => a + (e.kw ?? 0), 0);
  return [
    h('div', { class: 'kicker' }, r.outdoor ? 'Outdoor area' : roomName(r.type)),
    h('h3', {}, r.name),
    h('p', {}, r.id === 'future_hall' ? 'Empty space kept for a future data hall, so the site can grow without a new building.' : ROOM_HELP[r.type]),
    h(
      'dl',
      { class: 'facts' },
      h('dt', {}, 'Size'),
      h('dd', {}, `${m(r.w)} × ${m(r.h)} · ${area(r)}`),
      ...(rackKw ? [h('dt', {}, 'Computing'), h('dd', {}, fmtPower(rackKw))] : []),
      ...[...counts.entries()].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, n(v))])
    )
  ];
}

function equipFacts(d: Design, e: Equip): HTMLElement[] {
  const help = EQUIP_HELP[e.kind];
  const room = d.rooms.find((r) => r.id === e.room);
  const row = e.row ? d.rows.find((r) => r.id === e.row) : null;
  const facts: [string, string][] = [];
  if (e.kind === 'rack') {
    facts.push(['Power', `${e.kw} kW`], ['Hardware', d.profile.hardware], ['GPUs', String(d.profile.gpus)]);
    facts.push(['Cooling', d.profile.liquidShare ? `${Math.round(d.profile.liquidShare * 100)}% by liquid, rest by air` : 'Air']);
    if (row) facts.push(['Fed by', row.pdus.map((p) => d.equipment.find((x) => x.id === p)?.label ?? p).join(', ')]);
    facts.push(['Weight', `${n(d.profile.weightKg)} kg`]);
  } else {
    if (e.capacityKw) facts.push(['Capacity', fmtPower(e.capacityKw)]);
    if (e.side) facts.push(['Power train', e.side]);
    if (row) facts.push(['Serves', `Row ${row.id.slice(-1)} (${row.racks.length} racks)`]);
  }
  facts.push(['Where', room?.name ?? e.room], ['Footprint', `${m(e.w)} × ${m(e.h)}`]);
  return [
    h('div', { class: 'kicker' }, help.name),
    h('h3', {}, e.label),
    h('p', {}, help.text),
    h('dl', { class: 'facts' }, ...facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))
  ];
}

export function designScreen(onNext: () => void): HTMLElement {
  const rail = h('aside', { class: 'rail', 'aria-label': 'Options' });
  const inspector = h('div', { class: 'floating inspector', 'aria-live': 'polite' });
  const plan = createPlan((kind, id) => {
    state.pick = id ? { kind, id } : null;
    emit('pick');
  });
  plan.setInsets({ left: 64, right: 330, top: 16, bottom: 90 });
  const legendItems: [string, string][] = [
    ['Rack', EQUIP_FILL.rack],
    ['Liquid cooler', EQUIP_FILL.cdu],
    ['Air handler', EQUIP_FILL.crah],
    ['Power panel', EQUIP_FILL.pdu],
    ['Cold aisle', 'rgba(61,139,253,0.35)'],
    ['Hot aisle', 'rgba(255,107,74,0.35)'],
    ['UPS', EQUIP_FILL.ups],
    ['Generator', EQUIP_FILL.generator],
    ['Outdoor cooler', EQUIP_FILL.drycooler]
  ];
  const legend = h(
    'div',
    { class: 'floating legend', 'aria-label': 'Legend' },
    ...legendItems.map(([t, c]) => h('span', {}, h('i', { style: `background:${c}` }), t))
  );
  const zoom = h(
    'div',
    { class: 'floating zoom' },
    h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => plan.zoom(0.7) }, '+'),
    h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => plan.zoom(1.4) }, '−'),
    h('button', { type: 'button', 'aria-label': 'Fit to screen', onclick: () => plan.fit(), style: 'font-size:13px' }, '⤢')
  );
  const next = h(
    'div',
    { class: 'floating next' },
    h('button', { class: 'btn dark', type: 'button', onclick: onNext, html: `Test this design ${ICONS.arrowRight}` })
  );
  const stage = h('div', { class: 'stage' }, plan.el, zoom, inspector, legend, next);

  const paintRail = () => {
    const o = current();
    if (!o) return;
    rail.replaceChildren(
      h('h2', {}, 'Three ways to build it'),
      h('p', { class: 'hint' }, `Same ${fmtPower(state.basis.itKw)} of computing, cooled three ways. Pick one to look around.`),
      ...state.options.map(optionCard),
      checksCard(o)
    );
  };
  const paintInspector = () => {
    const o = current();
    if (!o) return;
    const d = o.design;
    const p = state.pick;
    const body =
      p?.kind === 'equip'
        ? equipFacts(d, d.equipment.find((e) => e.id === p.id)!)
        : p?.kind === 'room'
          ? roomFacts(d, d.rooms.find((r) => r.id === p.id)!)
          : siteFacts(o);
    const close = p
      ? h('button', {
          class: 'close',
          type: 'button',
          'aria-label': 'Back to the overview',
          html: ICONS.close,
          onclick: () => {
            state.pick = null;
            emit('pick');
          }
        })
      : null;
    inspector.replaceChildren(...body, ...(close ? [close] : []));
    plan.select(p?.id ?? null);
  };
  const paintPlan = (refit: boolean) => {
    const o = current();
    if (!o) return;
    plan.render(o.design);
    if (refit) requestAnimationFrame(() => plan.fit());
  };

  on('options', () => {
    paintRail();
    paintPlan(true);
    paintInspector();
  });
  on('selected', () => {
    paintRail();
    paintPlan(true);
    paintInspector();
  });
  on('pick', paintInspector);
  on('step', () => {
    if (state.step === 'design') requestAnimationFrame(() => plan.fit());
  });
  window.addEventListener('resize', () => plan.fit());

  return h('section', { class: 'work', id: 'design' }, rail, stage);
}
