/* Step 2: pick one of three designs and look around it. Left: the options. Centre: the site. Right: what
   you clicked, in plain words. */
import { fmtPower } from '../engine/brief';
import { fmtMoney } from '../engine/cost';
import { current, emit, on, state, type Option } from '../state';
import { ICONS, h } from './dom';
import { getStage } from './stage';

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

export function designScreen(onNext: () => void): HTMLElement {
  const rail = h('aside', { class: 'rail', 'aria-label': 'Options' });
  const slot = h('div', { class: 'stage-slot' });
  const next = h('button', { class: 'btn dark', type: 'button', onclick: onNext, html: `Test this design ${ICONS.arrowRight}` });

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
  on('options', paintRail);
  on('selected', paintRail);
  on('step', () => {
    if (state.step !== 'design') return;
    const stage = getStage();
    slot.replaceChildren(stage.el);
    stage.setActions(next);
    stage.setInspectorExtra(null);
    stage.refresh();
  });

  return h('section', { class: 'work', id: 'design' }, rail, slot);
}
