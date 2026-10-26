/* The stage shared by Design and Test: the 3D view (or the plan), the lens bar, the legend and the card
   that explains what was clicked. Screens move this one element into place and add their own actions. */
import { current, emit, on, state } from '../state';
import type { Viewer } from '../view3d/viewer';
import { h } from './dom';
import { renderInspector } from './inspector';
import { LENSES, colorFor, legendFor, lensData, toCss, type Lens, type LensData } from './lens';
import { createPlan } from './plan2d';

export interface Stage {
  el: HTMLElement;
  setActions(el: HTMLElement | null): void;
  setInspectorExtra(fn: (() => HTMLElement[]) | null): void;
  setBanner(el: HTMLElement | null): void;
  setView(v: '3d' | 'plan'): void;
  preset(p: 'overview' | 'inside' | 'top'): void;
  focus(id: string): void;
  live(): LensData | null;
  refresh(): void;
}

let stage: Stage | null = null;
export const getStage = (): Stage => (stage ??= createStage());

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

function createStage(): Stage {
  const pickFn = (kind: 'room' | 'equip', id: string | null) => {
    state.pick = id ? { kind, id } : null;
    emit('pick');
  };
  const plan = createPlan(pickFn);
  plan.setInsets({ left: 64, right: 330, top: 16, bottom: 120 });
  const viewHost = h('div', { class: 'view-host' });
  const loading = h('div', { class: 'loading3d' }, h('span', { class: 'spinner' }), 'Starting 3D…');
  const tip = h('div', { class: 'tip', role: 'status' });
  const inspector = h('div', { class: 'floating inspector', 'aria-live': 'polite' });
  const legend = h('div', { class: 'floating legend' });
  const actions = h('div', { class: 'floating next' });
  const badge = h('span', { class: 'renderer-badge' });
  const bannerSlot = h('div', { class: 'banner-slot' });
  let viewer: Viewer | null = null;
  let live: LensData | null = null;
  let liveKey = '';
  let extra: (() => HTMLElement[]) | null = null;

  // ---- view switch and camera presets (top left)
  const viewSeg = h('div', { class: 'seg pill', role: 'group', 'aria-label': 'View' });
  (['3d', 'plan'] as const).forEach((v) =>
    viewSeg.append(
      h('button', {
        type: 'button',
        'data-v': v,
        onclick: () => {
          state.view = v;
          paintView();
        }
      }, v === '3d' ? '3D' : 'Plan')
    )
  );
  const presets = h(
    'div',
    { class: 'presets' },
    h('button', { type: 'button', onclick: () => viewer?.preset('overview') }, 'Overview'),
    h('button', { type: 'button', onclick: () => viewer?.preset('inside') }, 'Step inside'),
    h('button', { type: 'button', onclick: () => viewer?.preset('top') }, 'From above')
  );
  const zoom = h(
    'div',
    { class: 'zoom' },
    h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => (state.view === '3d' ? viewer?.zoom(0.7) : plan.zoom(0.7)) }, '+'),
    h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => (state.view === '3d' ? viewer?.zoom(1.4) : plan.zoom(1.4)) }, '−')
  );
  const topLeft = h('div', { class: 'floating top-left' }, viewSeg, presets, zoom, badge);

  // ---- lens bar (bottom centre)
  const lensBar = h('div', { class: 'floating toolbar', role: 'group', 'aria-label': 'What to show' });
  const lensSeg = h('div', { class: 'seg' });
  LENSES.forEach((l) =>
    lensSeg.append(
      h('button', {
        type: 'button',
        'data-lens': l.id,
        title: l.question,
        onclick: () => {
          state.lens = l.id as Lens;
          emit('lens');
        }
      }, l.label)
    )
  );
  lensBar.append(lensSeg);

  const el = h('div', { class: 'stage' }, viewHost, loading, tip, topLeft, bannerSlot, inspector, legend, lensBar, actions);

  function paintView() {
    viewSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.view)));
    presets.style.display = state.view === '3d' ? '' : 'none';
    if (state.view === '3d') {
      if (viewer) viewHost.replaceChildren(viewer.el);
      else viewHost.replaceChildren();
      loading.style.display = viewer ? 'none' : '';
    } else {
      viewHost.replaceChildren(plan.el);
      loading.style.display = 'none';
      requestAnimationFrame(() => plan.fit());
    }
  }

  function compute(): LensData | null {
    const o = current();
    if (!o) return null;
    const key = `${o.design.id}|${state.selected}|${state.lens}|${JSON.stringify([...state.conditions.failed])}|${state.conditions.load}|${state.conditions.outdoorC}|${state.options.length}`;
    if (key !== liveKey || !live) {
      live = lensData(o.design, state.lens, state.conditions);
      liveKey = key;
    }
    return live;
  }

  function paintLegend() {
    const o = current();
    if (!o) return;
    const lg = legendFor(state.lens, o.design);
    legend.replaceChildren(
      h('p', {}, lg.text),
      h('div', { class: 'swatches' }, ...lg.items.map((it) => h('span', {}, h('i', { style: `background:${it.color}` }), it.label)))
    );
    lensSeg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lens === state.lens)));
  }

  function paintInspector() {
    const o = current();
    if (!o) return;
    renderInspector(inspector, o, compute(), extra?.() ?? []);
    viewer?.select(state.pick?.id ?? null);
    plan.select(state.pick?.id ?? null);
  }

  let shownDesign: unknown = null;
  function paintModel() {
    const o = current();
    if (!o) return;
    const data = compute()!;
    const tint = state.lens === 'layout' ? undefined : (e: Parameters<typeof colorFor>[0]) => {
      const c = colorFor(e, data);
      return c === null ? null : c === 'ghost' ? 'var(--ghost)' : toCss(c);
    };
    const fresh = shownDesign !== o.design;
    plan.render(o.design, tint);
    if (fresh && state.view === 'plan') requestAnimationFrame(() => plan.fit());
    if (viewer) {
      if (fresh) viewer.setDesign(o.design);
      viewer.setLens(data);
    }
    shownDesign = o.design;
  }

  // the 3D code (three.js) loads after the first screen is up
  import('../view3d/viewer').then(({ createViewer }) => {
    viewer = createViewer(pickFn, (label) => {
      tip.textContent = label ?? '';
      tip.style.opacity = label ? '1' : '0';
    });
    viewer.setTheme(isDark());
    viewer.setInsets({ left: 150, right: 340, top: 0, bottom: 110 });
    viewer.ready
      .then((kind) => {
        badge.textContent = kind === 'webgpu' ? 'WebGPU' : 'WebGL 2';
        shownDesign = null;
        paintModel();
        paintView();
        paintInspector();
      })
      .catch(() => {
        // no WebGL either: the plan still works
        viewer = null;
        state.view = 'plan';
        viewSeg.style.display = 'none';
        paintView();
      });
  });
  el.addEventListener('pointermove', (ev) => {
    const r = el.getBoundingClientRect();
    tip.style.transform = `translate(${ev.clientX - r.left + 14}px, ${ev.clientY - r.top + 14}px)`;
  });

  const refresh = () => {
    paintModel();
    paintLegend();
    paintInspector();
  };
  on('options', refresh);
  on('selected', refresh);
  on('lens', refresh);
  on('conditions', refresh);
  on('pick', paintInspector);
  on('theme', () => {
    viewer?.setTheme(isDark());
    paintModel();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => emit('theme'));
  paintView();

  return {
    el,
    setActions: (a) => actions.replaceChildren(...(a ? [a] : [])),
    setInspectorExtra: (fn) => {
      extra = fn;
      paintInspector();
    },
    setView: (v) => {
      state.view = v;
      paintView();
    },
    preset: (p) => {
      if (state.view === '3d') viewer?.preset(p);
    },
    setBanner: (b) => bannerSlot.replaceChildren(...(b ? [b] : [])),
    focus: (id) => {
      if (state.view === '3d') viewer?.focus(id);
    },
    live: compute,
    refresh: () => {
      refresh();
      if (state.view === 'plan') requestAnimationFrame(() => plan.fit());
      viewer?.invalidate();
    }
  };
}
