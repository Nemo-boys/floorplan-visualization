/* Data Center Studio: describe -> design -> test -> cost. Everything runs in the browser. */
import './styles.css';
import { readBrief } from './engine/brief';
import { runChecks } from './engine/checks';
import { costOf } from './engine/cost';
import { generateOptions } from './engine/design';
import type { Basis } from './engine/types';
import { emit, on, state, type Step } from './state';
import { describeScreen } from './ui/describe';
import { designScreen } from './ui/design';
import { ICONS, h } from './ui/dom';

const STEPS: { id: Step; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'design', label: 'Design' },
  { id: 'test', label: 'Test' },
  { id: 'cost', label: 'Cost' }
];

function generate(brief: string, basis: Basis) {
  state.brief = brief;
  state.basis = basis;
  state.options = generateOptions(basis).map((design) => ({ design, cost: costOf(design), checks: runChecks(design) }));
  // Recommend what the brief asked for; otherwise the cheapest to build and run among those passing every check.
  const match = state.options.findIndex((o) => o.design.profile.key === basis.cooling);
  const total = (i: number) => state.options[i].cost.facility + state.options[i].cost.opexYear * basis.years;
  const passing = state.options.map((_, i) => i).filter((i) => state.options[i].checks.every((c) => c.pass));
  const pool = passing.length ? passing : state.options.map((_, i) => i);
  state.recommended = match >= 0 ? match : pool.reduce((a, b) => (total(b) < total(a) ? b : a));
  state.selected = state.recommended;
  state.pick = null;
  emit('options');
  go('design');
}

function go(step: Step) {
  if (step !== 'describe' && !state.options.length) return;
  state.step = step;
  emit('step');
}

function soon(title: string, text: string): HTMLElement {
  return h('section', { class: 'soon' }, h('div', {}, h('h2', {}, title), h('p', {}, text)));
}

function themeToggle(): HTMLElement {
  const root = document.documentElement;
  const saved = (() => {
    try {
      return localStorage.getItem('dc.theme');
    } catch {
      return null;
    }
  })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  const isDark = () =>
    root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const btn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Switch light or dark' });
  const paint = () => (btn.innerHTML = isDark() ? ICONS.sun : ICONS.moon);
  btn.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try {
      localStorage.setItem('dc.theme', root.dataset.theme);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
    paint();
    emit('theme');
  });
  paint();
  return btn;
}

function mount() {
  const app = document.getElementById('app')!;
  const tabs = h('nav', { class: 'steps', role: 'tablist', 'aria-label': 'Steps' });
  STEPS.forEach((s, i) =>
    tabs.append(
      h(
        'button',
        { type: 'button', role: 'tab', 'data-step': s.id, onclick: () => go(s.id) },
        h('span', { class: 'n' }, i + 1),
        h('span', { class: 'label' }, s.label)
      )
    )
  );
  const bar = h(
    'header',
    { class: 'bar' },
    h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'Data Center Studio', h('small', {}, 'by Floorplan Intelligence')),
    tabs,
    h('div', { class: 'bar-actions' }, themeToggle())
  );
  const screens: Record<Step, HTMLElement> = {
    describe: describeScreen(generate),
    design: designScreen(() => go('test')),
    test: soon('Test', 'Break a cooler, lose a power train, run a heat wave. Coming in the next step.'),
    cost: soon('Cost', 'Build cost, running cost and five-year total. Coming soon.')
  };
  const main = h('main', { style: 'min-height:0;display:grid' });
  app.replaceChildren(bar, main);

  const paint = () => {
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const id = b.dataset.step as Step;
      b.setAttribute('aria-selected', String(id === state.step));
      b.disabled = id !== 'describe' && !state.options.length;
    });
    main.replaceChildren(screens[state.step]);
    if (state.step === 'describe') (screens.describe.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
  };
  on('step', paint);
  paint();

  // deep link: #design generates from the default brief, handy for demos and tests
  if (location.hash === '#design') generate(state.brief, readBrief(state.brief).basis);
}

mount();
