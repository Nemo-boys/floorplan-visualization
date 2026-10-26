/* Step 4: what it costs to build and to run, where the money and the electricity go, and how the three
   options compare over the years. Every assumption is visible and editable. Planning estimates, not quotes. */
import { fmtPower } from '../engine/brief';
import { DEFAULT_RATES, RATES, costOf, fmtMoney, type CostLine, type CostReport, type RateKey } from '../engine/cost';
import { current, emit, on, state } from '../state';
import { ICONS, h, s } from './dom';
import { pueSentence } from './help';

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const GROUPS: { id: CostLine['group']; label: string; color: string }[] = [
  { id: 'building', label: 'Building', color: 'var(--s1)' },
  { id: 'power', label: 'Power', color: 'var(--s2)' },
  { id: 'cooling', label: 'Cooling', color: 'var(--s3)' },
  { id: 'other', label: 'Land, design and contingency', color: 'var(--s4)' },
  { id: 'it', label: 'Computers', color: 'var(--s5)' }
];
// one colour per option, by cooling type, so a colour always means the same option
const OPTION_COLOR: Record<string, string> = { liquid: 'var(--s1)', hybrid: 'var(--s2)', air: 'var(--s3)' };

/* Recompute every option's cost from the current money settings and rates. */
export function recost(): void {
  state.options.forEach((o) => (o.cost = costOf(o.design, state.rates, state.basis)));
  emit('cost');
}

/* A tooltip that follows the pointer inside a card. */
function tooltip(host: HTMLElement) {
  const tip = h('div', { class: 'chart-tip', role: 'tooltip' });
  host.append(tip);
  return {
    show(ev: PointerEvent | MouseEvent, ...lines: (string | HTMLElement)[]) {
      tip.replaceChildren(...lines.map((l) => (typeof l === 'string' ? h('div', {}, l) : l)));
      const r = host.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const flip = x > r.width - 200;
      tip.style.transform = `translate(${flip ? x - 14 : x + 14}px, ${ev.clientY - r.top + 14}px) translateX(${flip ? '-100%' : '0'})`;
      tip.style.opacity = '1';
    },
    hide() {
      tip.style.opacity = '0';
    }
  };
}

function kpi(label: string, value: string, sub: string): HTMLElement {
  return h('div', { class: 'kpi' }, h('span', {}, label), h('b', {}, value), h('small', {}, sub));
}

/* Where the build money goes: one stacked bar, then the lines it is made of. */
function buildCard(c: CostReport, withIt: boolean, setWithIt: (v: boolean) => void): HTMLElement {
  const card = h('div', { class: 'panel-card chart-card' });
  const tip = tooltip(card);
  const groups = GROUPS.filter((g) => withIt || g.id !== 'it')
    .map((g) => ({ ...g, amount: c.lines.filter((l) => l.group === g.id).reduce((a, l) => a + l.amount, 0) }))
    .filter((g) => g.amount > 0);
  const total = groups.reduce((a, g) => a + g.amount, 0);
  const bar = h('div', { class: 'stack' });
  groups.forEach((g) => {
    const seg = h('i', { style: `flex:${g.amount};background:${g.color}` });
    seg.addEventListener('pointermove', (ev) => tip.show(ev, h('b', {}, g.label), `${fmtMoney(g.amount)} · ${pct(g.amount / total)}`));
    seg.addEventListener('pointerleave', tip.hide);
    bar.append(seg);
  });
  const lines = c.lines.filter((l) => withIt || l.group !== 'it');
  card.prepend(
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, 'Where the build money goes'),
        h(
          'label',
          { class: 'switch' },
          h('input', { type: 'checkbox', checked: withIt, onchange: (ev: Event) => setWithIt((ev.target as HTMLInputElement).checked) }),
          h('span', {}, 'Include computers')
        )
      ),
      h('p', { class: 'big-line' }, h('b', {}, fmtMoney(total)), withIt ? ' for the site and the computers in it' : ' for the site, before the computers'),
      bar,
      h(
        'div',
        { class: 'legend-row' },
        ...groups.map((g) => h('span', {}, h('i', { style: `background:${g.color}` }), g.label, h('b', {}, pct(g.amount / total))))
      ),
      h(
        'details',
        { class: 'more' },
        h('summary', {}, 'Show every line'),
        h(
          'table',
          { class: 'lines' },
          h('tbody', {}, ...lines.map((l) => h('tr', {}, h('td', {}, l.label), h('td', {}, fmtMoney(l.amount)), h('td', {}, pct(l.amount / total)))))
        )
      ),
      c.it > c.facility ? h('p', { class: 'note' }, `The computers cost ${(c.it / c.facility).toFixed(1)}× more than the building they sit in.`) : ''
  );
  return card;
}

/* Where the electricity goes: a Sankey from the grid to computing, cooling, power losses and the rest. */
function energyCard(c: CostReport): HTMLElement {
  const card = h('div', { class: 'panel-card chart-card' });
  const tip = tooltip(card);
  const parts = [
    { label: 'Computers', share: c.pueParts.it, color: 'var(--s1)', text: 'Does the useful work' },
    { label: 'Cooling', share: c.pueParts.cooling, color: 'var(--s3)', text: 'Fans, pumps and outdoor coolers' },
    { label: 'Power losses', share: c.pueParts.power, color: 'var(--s2)', text: 'Lost as heat in UPS units and transformers' },
    { label: 'Lights and offices', share: c.pueParts.other, color: 'var(--s4)', text: 'Everything else in the building' }
  ];
  const W = 520;
  const H = 210;
  const GAP = 10;
  const nodeW = 12;
  const left = { x: 0, y: 10, h: H - 20 };
  const usable = H - 20 - GAP * (parts.length - 1);
  // small flows get a minimum height so they stay visible and hoverable
  const heights = parts.map((p) => Math.max(5, p.share * usable));
  const scale = usable / heights.reduce((a, b) => a + b, 0);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sankey', role: 'img', 'aria-label': 'Where the electricity goes' });
  svg.append(s('rect', { x: left.x, y: left.y, width: nodeW, height: left.h, rx: 3, class: 'grid-node' }));
  let ly = left.y;
  let ry = left.y;
  const rx = 300;
  parts.forEach((p, i) => {
    const hgt = heights[i] * scale;
    const lh = p.share * left.h;
    const path = s('path', {
      d: `M${nodeW},${ly} C${(nodeW + rx) / 2},${ly} ${(nodeW + rx) / 2},${ry} ${rx},${ry} L${rx},${ry + hgt} C${(nodeW + rx) / 2},${ry + hgt} ${(nodeW + rx) / 2},${ly + lh} ${nodeW},${ly + lh} Z`,
      fill: p.color,
      class: 'flow'
    });
    const mwh = c.energyMwhYear * p.share;
    path.addEventListener('pointermove', (ev) => tip.show(ev, h('b', {}, p.label), `${pct(p.share)} · ${n(mwh)} MWh a year`, p.text));
    path.addEventListener('pointerleave', tip.hide);
    svg.append(path);
    svg.append(s('rect', { x: rx, y: ry, width: nodeW, height: hgt, rx: 3, fill: p.color }));
    const label = s('text', { x: rx + nodeW + 10, y: ry + hgt / 2 + 4, class: 'lbl' });
    label.textContent = p.label;
    const val = s('text', { x: W, y: ry + hgt / 2 + 4, class: 'val', 'text-anchor': 'end' });
    val.textContent = pct(p.share);
    svg.append(label, val);
    ly += lh;
    ry += hgt + GAP;
  });
  card.prepend(
      h('div', { class: 'card-head' }, h('h3', {}, 'Where the electricity goes'), h('span', { class: 'pue', title: 'Power usage effectiveness: total energy ÷ computing energy' }, 'PUE ', h('b', {}, c.pue.toFixed(2)))),
      h('p', { class: 'big-line' }, h('b', {}, `${n(c.energyMwhYear / 1000)} GWh`), ` a year from the grid, ${fmtMoney(c.energyYear)} at today’s price`),
      svg,
      h('p', { class: 'note' }, pueSentence(c.pue), ` About ${n(c.co2Tonnes)} t of CO₂ a year on an average US grid.`)
  );
  return card;
}

/* Total spent over the years, one line per option: build and computers on day one, then running costs. */
function timeCard(): HTMLElement {
  const card = h('div', { class: 'panel-card chart-card wide' });
  const tip = tooltip(card);
  const years = state.basis.years;
  const series = state.options.map((o, i) => ({
    i,
    name: o.design.title,
    key: o.design.profile.key,
    at: (y: number) => o.cost.facility + o.cost.it + o.cost.opexYear * y
  }));
  const W = 760;
  const H = 240;
  const pad = { l: 56, r: 120, t: 12, b: 26 };
  const max = Math.max(...series.map((sr) => sr.at(years)));
  const min = Math.min(...series.map((sr) => sr.at(0)));
  const step = niceStep((max - min * 0.9) / 4);
  const y0 = Math.floor((min * 0.9) / step) * step;
  const y1 = Math.ceil(max / step) * step;
  const X = (y: number) => pad.l + (y / years) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linechart', role: 'img', 'aria-label': 'Total spent over the years for each option' });
  for (let v = y0; v <= y1 + 1; v += step) {
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'grid' }));
    const t = s('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' });
    t.textContent = fmtMoney(v);
    svg.append(t);
  }
  for (let y = 0; y <= years; y += years > 10 ? 5 : years > 5 ? 2 : 1) {
    const t = s('text', { x: X(y), y: H - 6, 'text-anchor': 'middle', class: 'tick' });
    t.textContent = y === 0 ? 'Day one' : `Year ${y}`;
    svg.append(t);
  }
  // direct labels at the line ends, nudged apart so they never overlap
  const ends = series.map((sr) => ({ sr, y: Y(sr.at(years)) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 16) ends[k].y = ends[k - 1].y + 16;
  series.forEach((sr) => {
    const sel = sr.i === state.selected;
    svg.append(s('line', { x1: X(0), y1: Y(sr.at(0)), x2: X(years), y2: Y(sr.at(years)), stroke: OPTION_COLOR[sr.key], class: sel ? 'series sel' : 'series' }));
    svg.append(s('circle', { cx: X(years), cy: Y(sr.at(years)), r: 4, fill: OPTION_COLOR[sr.key], class: 'end' }));
    const e = ends.find((x) => x.sr === sr)!;
    const t = s('text', { x: X(years) + 10, y: e.y + 4, class: sel ? 'end-lbl sel' : 'end-lbl' });
    t.textContent = `${sr.name.replace(/-cooled$/, '')} ${fmtMoney(sr.at(years))}`;
    svg.append(t);
  });
  // crosshair
  const cross = s('line', { y1: pad.t, y2: H - pad.b, class: 'cross' });
  cross.style.opacity = '0';
  svg.append(cross);
  const hitArea = s('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  hitArea.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * W;
    const y = Math.max(0, Math.min(years, Math.round(((vx - pad.l) / (W - pad.l - pad.r)) * years)));
    cross.setAttribute('x1', String(X(y)));
    cross.setAttribute('x2', String(X(y)));
    cross.style.opacity = '1';
    const rows = [...series]
      .sort((a, b) => a.at(y) - b.at(y))
      .map((sr) => h('div', { class: 'tip-row' }, h('i', { style: `background:${OPTION_COLOR[sr.key]}` }), sr.name, h('b', {}, fmtMoney(sr.at(y)))));
    tip.show(ev, h('b', {}, y === 0 ? 'Day one' : `After ${y} year${y > 1 ? 's' : ''}`), ...rows);
  });
  hitArea.addEventListener('pointerleave', () => {
    cross.style.opacity = '0';
    tip.hide();
  });
  svg.append(hitArea);
  const cheapest = [...series].sort((a, b) => a.at(years) - b.at(years))[0];
  card.prepend(
      h('div', { class: 'card-head' }, h('h3', {}, `Total spent over ${years} years`)),
      h(
        'p',
        { class: 'muted small' },
        `Building and computers on day one, then electricity, maintenance and staff every year. ${cheapest.name} costs least over ${years} years.`
      ),
      svg,
      h('div', { class: 'legend-row' }, ...series.map((sr) => h('span', {}, h('i', { style: `background:${OPTION_COLOR[sr.key]}` }), sr.name)))
  );
  return card;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/* The three options side by side. Lower is better on every row; the best gets a mark. */
function compareCard(): HTMLElement {
  const rows: { label: string; get: (c: CostReport) => number; fmt: (v: number) => string; hint?: string }[] = [
    { label: 'Build the site', get: (c) => c.facility, fmt: fmtMoney },
    { label: 'Computers', get: (c) => c.it, fmt: fmtMoney },
    { label: 'Run it, per year', get: (c) => c.opexYear, fmt: fmtMoney },
    { label: `Total over ${state.basis.years} years`, get: (c) => c.tco, fmt: fmtMoney },
    { label: 'Energy overhead (PUE)', get: (c) => c.pue, fmt: (v) => v.toFixed(2) },
    { label: 'Per kW of computing, per month', get: (c) => c.perKwMonth, fmt: (v) => `$${n(v)}`, hint: 'Fair across options: they use different GPUs' },
    { label: 'CO₂ per year', get: (c) => c.co2Tonnes, fmt: (v) => `${n(v)} t` }
  ];
  const head = h(
    'tr',
    {},
    h('th', {}, ''),
    ...state.options.map((o, i) =>
      h(
        'th',
        {},
        h(
          'button',
          {
            type: 'button',
            class: 'col-pick',
            'aria-pressed': String(i === state.selected),
            onclick: () => {
              state.selected = i;
              state.pick = null;
              emit('selected');
            }
          },
          h('i', { style: `background:${OPTION_COLOR[o.design.profile.key]}` }),
          o.design.title,
          i === state.recommended ? h('span', { class: 'badge' }, 'Recommended') : ''
        )
      )
    )
  );
  const body = rows.map((r) => {
    const vals = state.options.map((o) => r.get(o.cost));
    const best = Math.min(...vals);
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, r.label, r.hint ? h('small', {}, r.hint) : ''),
      ...vals.map((v, i) => h('td', { class: i === state.selected ? 'sel' : '' }, r.fmt(v), v === best ? h('span', { class: 'best' }, 'Lowest') : ''))
    );
  });
  const gpuRow = h(
    'tr',
    {},
    h('th', { scope: 'row' }, 'Per GPU-hour', h('small', {}, 'Different GPUs, so not a like-for-like price')),
    ...state.options.map((o, i) => h('td', { class: i === state.selected ? 'sel' : '' }, `$${o.cost.perGpuHour.toFixed(2)}`, h('small', {}, `${n(o.cost.gpus)} × ${o.design.profile.hardware.split(' ')[0]}`)))
  );
  return h(
    'div',
    { class: 'panel-card wide' },
    h('h3', {}, 'The three options side by side'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'compare' }, h('thead', {}, head), h('tbody', {}, ...body, gpuRow)))
  );
}

/* Every rate behind the numbers, editable, with where it comes from. */
function assumptionsCard(): HTMLElement {
  const changed = RATES.filter((r) => state.rates[r.key] !== DEFAULT_RATES[r.key]).length;
  const display = (key: RateKey, v: number) => (RATES.find((r) => r.key === key)!.unit.startsWith('share') ? +(v * 100).toFixed(2) : v);
  const fromDisplay = (key: RateKey, v: number) => (RATES.find((r) => r.key === key)!.unit.startsWith('share') ? v / 100 : v);
  return h(
    'details',
    { class: 'panel-card wide assumptions', ...(changed ? { open: true } : {}) },
    h('summary', {}, h('h3', {}, 'Change the assumptions'), h('span', { class: 'muted small' }, changed ? `${changed} changed` : 'Planning estimates, not quotes')),
    h(
      'div',
      { class: 'rates' },
      ...RATES.map((r) => {
        const input = h('input', {
          type: 'number',
          min: 0,
          step: 'any',
          value: display(r.key, state.rates[r.key]),
          'aria-label': r.label
        });
        input.addEventListener('change', () => {
          const v = Number(input.value);
          if (!Number.isFinite(v) || v < 0) return;
          state.rates[r.key] = fromDisplay(r.key, v);
          recost();
        });
        return h(
          'label',
          { class: `rate ${state.rates[r.key] !== DEFAULT_RATES[r.key] ? 'changed' : ''}`, title: r.source },
          h('span', {}, r.label),
          h('div', { class: 'rate-in' }, input, h('small', {}, r.unit.startsWith('share') ? `% ${r.unit.replace('share of', 'of')}` : r.unit))
        );
      })
    ),
    changed
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn soft',
            html: `${ICONS.reset} Back to the defaults`,
            onclick: () => {
              state.rates = { ...DEFAULT_RATES };
              recost();
            }
          }
        )
      : ''
  );
}

export function costScreen(): HTMLElement {
  const page = h('section', { class: 'cost-page', id: 'cost' });
  let withIt = false;

  function controls(): HTMLElement {
    const opt = h('div', { class: 'seg pill', role: 'group', 'aria-label': 'Option' });
    state.options.forEach((o, i) =>
      opt.append(
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(i === state.selected),
            onclick: () => {
              state.selected = i;
              state.pick = null;
              emit('selected');
            }
          },
          o.design.title
        )
      )
    );
    const priceOut = h('output', {}, `${(state.basis.priceKwh * 100).toFixed(1)}¢`);
    const price = h('input', { type: 'range', min: 3, max: 30, step: 0.5, value: state.basis.priceKwh * 100, 'aria-label': 'Electricity price, cents per kWh' });
    price.addEventListener('input', () => {
      state.basis.priceKwh = Number(price.value) / 100;
      priceOut.textContent = `${Number(price.value).toFixed(1)}¢`;
      recost();
    });
    const busyOut = h('output', {}, pct(state.basis.utilization));
    const busy = h('input', { type: 'range', min: 30, max: 100, step: 5, value: state.basis.utilization * 100, 'aria-label': 'How busy on average' });
    busy.addEventListener('input', () => {
      state.basis.utilization = Number(busy.value) / 100;
      busyOut.textContent = `${busy.value}%`;
      recost();
    });
    const yrs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Years' });
    [5, 10, 15, 20].forEach((y) =>
      yrs.append(
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(state.basis.years === y),
            onclick: () => {
              state.basis.years = y;
              recost();
            }
          },
          `${y} yrs`
        )
      )
    );
    return h(
      'div',
      { class: 'cost-controls' },
      opt,
      h(
        'div',
        { class: 'dials' },
        h('div', { class: 'dial' }, h('label', {}, 'Electricity, per kWh'), priceOut, price),
        h('div', { class: 'dial' }, h('label', {}, 'How busy, on average'), busyOut, busy),
        h('div', { class: 'dial' }, h('label', {}, 'Count the cost over'), yrs)
      )
    );
  }

  function paint() {
    const o = current();
    if (!o || state.step !== 'cost') return;
    const c = o.cost;
    const d = o.design;
    const scroll = page.scrollTop;
    page.replaceChildren(
      h(
        'div',
        { class: 'cost-inner fade-in' },
        h('div', { class: 'cost-title' }, h('h1', {}, 'What it costs'), h('p', {}, `${d.title}, ${fmtPower(d.itKw)} of computing. Change anything below and every number updates.`)),
        controls(),
        h(
          'div',
          { class: 'kpis' },
          kpi('Build the site', fmtMoney(c.facility), `${fmtMoney(c.perMw)} per MW`),
          kpi('Computers', fmtMoney(c.it), `${n(d.racks)} racks · ${n(c.gpus)} GPUs`),
          kpi('Run it, per year', fmtMoney(c.opexYear), `${fmtMoney(c.energyYear)} of it is electricity`),
          kpi(`Total over ${c.years} years`, fmtMoney(c.tco), `$${c.perGpuHour.toFixed(2)} per GPU-hour`)
        ),
        h('div', { class: 'cost-grid' }, buildCard(c, withIt, (v) => ((withIt = v), paint())), energyCard(c), timeCard(), compareCard(), assumptionsCard()),
        h('p', { class: 'muted small foot' }, 'Planning estimates for comparing options, not quotes. Hover any chart for its numbers; every rate and its source is under “Change the assumptions”.')
      )
    );
    page.scrollTop = scroll;
  }
  on('step', paint);
  on('cost', paint);
  on('selected', paint);
  on('options', paint);
  on('theme', paint);
  return page;
}
