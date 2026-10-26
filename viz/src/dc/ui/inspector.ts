/* The floating card that explains whatever was clicked, in plain words. */
import { fmtPower } from '../engine/brief';
import { fmtMoney } from '../engine/cost';
import { roomName } from '../engine/design';
import type { Health } from '../engine/status';
import type { Design, Equip, Room } from '../engine/types';
import { emit, state, type Option } from '../state';
import { ICONS, h } from './dom';
import { EQUIP_HELP, ROOM_HELP, pueSentence } from './help';
import { healthCss, type LensData } from './lens';

const m = (mm: number) => `${(mm / 1000).toFixed(1)} m`;
const area = (r: { w: number; h: number }) => `${Math.round((r.w * r.h) / 1e6).toLocaleString('en-US')} m²`;
const n = (v: number) => Math.round(v).toLocaleString('en-US');
const HEALTH_WORD: Record<Health, string> = { ok: 'Running, with backup', risk: 'Running, no backup left', down: 'Off or overheating' };

function facts(rows: [string, string | HTMLElement][]): HTMLElement {
  return h('dl', { class: 'facts' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}
const pill = (hl: Health) => h('span', { class: 'health', style: `--c:${healthCss[hl]}` }, HEALTH_WORD[hl]);

function siteFacts(o: Option): HTMLElement[] {
  const d = o.design;
  const halls = d.rooms.filter((r) => r.type === 'data_hall' && r.id !== 'future_hall');
  const hallArea = halls.reduce((a, r) => a + (r.w * r.h) / 1e6, 0);
  const grow = d.rooms.find((r) => r.id === 'future_hall');
  return [
    h('div', { class: 'kicker' }, 'Your design'),
    h('h3', {}, `${d.title} · ${fmtPower(d.itKw)}`),
    h('p', {}, `${d.profile.hardware}. Click anything to see what it is and what it does.`),
    facts([
      ['Racks', `${n(d.racks)} × ${d.profile.kw} kW`],
      ['GPUs', n(o.cost.gpus)],
      ['Data halls', `${halls.length} · ${n(hallArea)} m²`],
      ['Building', `${m(d.building.w)} × ${m(d.building.h)}`],
      ['Energy overhead (PUE)', o.cost.pue.toFixed(2)],
      ['Build cost', fmtMoney(o.cost.facility)],
      ...(grow ? ([['Room to grow', area(grow)]] as [string, string][]) : [])
    ]),
    h('p', { class: 'note' }, pueSentence(o.cost.pue))
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
    facts([
      ['Size', `${m(r.w)} × ${m(r.h)} · ${area(r)}`],
      ...(rackKw ? ([['Computing', fmtPower(rackKw)]] as [string, string][]) : []),
      ...[...counts.entries()].map(([k, v]) => [k, n(v)] as [string, string])
    ])
  ];
}

function equipFacts(d: Design, e: Equip, live: LensData | null): HTMLElement[] {
  const help = EQUIP_HELP[e.kind];
  const room = d.rooms.find((r) => r.id === e.room);
  const row = e.row ? d.rows.find((r) => r.id === e.row) : null;
  const rows: [string, string | HTMLElement][] = [];
  const health = live ? (e.kind === 'rack' ? live.report.racks.get(e.id) : live.report.equipment.get(e.id)) : undefined;
  if (health) rows.push(['Status', pill(health)]);
  if (e.kind === 'rack') {
    const t = live?.thermal?.rackInlet.get(e.id);
    if (t !== undefined) rows.push(['Air in front', `${t.toFixed(1)} °C (estimate)`]);
    rows.push(['Power', `${e.kw} kW`], ['Hardware', d.profile.hardware], ['GPUs', String(d.profile.gpus)]);
    rows.push(['Cooling', d.profile.liquidShare ? `${Math.round(d.profile.liquidShare * 100)}% liquid, rest air` : 'Air']);
    if (row) rows.push(['Fed by', row.pdus.map((p) => d.equipment.find((x) => x.id === p)?.label ?? p).join(', ')]);
    rows.push(['Weight', `${n(d.profile.weightKg)} kg`]);
  } else {
    if (e.capacityKw) rows.push(['Capacity', fmtPower(e.capacityKw)]);
    if (e.side) rows.push(['Power path', e.side]);
    if (row) rows.push(['Serves', `Row ${row.id.slice(-1)} · ${row.racks.length} racks`]);
  }
  rows.push(['Where', room?.name ?? e.room], ['Footprint', `${m(e.w)} × ${m(e.h)}`]);
  return [h('div', { class: 'kicker' }, help.name), h('h3', {}, e.label), h('p', {}, help.text), facts(rows)];
}

export function renderInspector(el: HTMLElement, o: Option, live: LensData | null, extra: HTMLElement[] = []): void {
  const d = o.design;
  const p = state.pick;
  const e = p?.kind === 'equip' ? d.equipment.find((x) => x.id === p.id) : undefined;
  const r = p?.kind === 'room' ? d.rooms.find((x) => x.id === p.id) : undefined;
  const body = e ? equipFacts(d, e, live) : r ? roomFacts(d, r) : siteFacts(o);
  const close =
    e || r
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
  el.replaceChildren(...body, ...(e || r ? extra : []), ...(close ? [close] : []));
}
