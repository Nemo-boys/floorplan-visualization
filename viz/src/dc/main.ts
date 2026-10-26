/* Data Center Studio: describe -> design -> test -> cost. Everything runs in the browser. */
import './styles.css';
import { generate, go } from './actions';
import { readBrief } from './engine/brief';
import { emit, on, state, type Step } from './state';
import { describeScreen } from './ui/describe';
import { mountAssistant } from './assistant';
import { costScreen } from './ui/cost';
import { testScreen } from './ui/test';
import { designScreen } from './ui/design';
import { ICONS, h } from './ui/dom';

const STEPS: { id: Step; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'design', label: 'Design' },
  { id: 'test', label: 'Test' },
  { id: 'cost', label: 'Cost' }
];

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
  const assistant = mountAssistant();
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
    h('div', { class: 'bar-actions' }, assistant.button, themeToggle())
  );
  const screens: Record<Step, HTMLElement> = {
    describe: describeScreen(generate),
    design: designScreen(() => go('test')),
    test: testScreen(),
    cost: costScreen()
  };
  const main = h('main', { style: 'min-height:0;min-width:0;display:grid;flex:1' });
  app.replaceChildren(bar, h('div', { class: 'body' }, main, assistant.panel.el));
  document.body.append(assistant.panel.peek);

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
