/* The stage shared by Design and Test: the 3D view (or the plan), the lens bar, the legend and the card
   that explains what was clicked. Screens move this one element into place and add their own actions. */
import { current, emit, on, state } from '../state';
import type { Viewer } from '../view3d/viewer';
import { ICONS, h } from './dom';
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
  /* The screen's side panel (the rail): the stage shows a button to hide it, for a full view of the model. */
  setRail(work: HTMLElement | null): void;
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
  // ---------- panels: hide the side rail, minimise the card, or clear everything for a full view
  const pref = (key: string, fallback: boolean) => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === '1';
    } catch {
      return fallback;
    }
  };
  const savePref = (key: string, v: boolean) => {
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* private mode */
    }
  };
  let work: HTMLElement | null = null;
  let railOpen = pref('dc.rail', true);
  let cardOpen = pref('dc.card', false); // starts as a title only; picking something opens it
  let bare = false;
  const railBtn = h('button', { type: 'button', class: 'tool-btn', html: ICONS.sidebar, onclick: () => setRailOpen(!railOpen) });
  const bareBtn = h('button', { type: 'button', class: 'tool-btn', html: ICONS.expand, onclick: () => setBare(!bare) });
  function setRailOpen(open: boolean) {
    railOpen = open;
    savePref('dc.rail', open);
    paintPanels();
  }
  function setBare(on: boolean) {
    bare = on;
    paintPanels();
  }
  function paintPanels() {
    work?.classList.toggle('rail-hidden', !railOpen || bare);
    el.classList.toggle('bare', bare);
    el.classList.toggle('card-min', !cardOpen);
    railBtn.style.display = work ? '' : 'none';
    railBtn.setAttribute('aria-pressed', String(railOpen && !bare));
    railBtn.setAttribute('aria-label', railOpen ? 'Hide the side panel' : 'Show the side panel');
    railBtn.title = `${railOpen ? 'Hide' : 'Show'} the side panel ( [ )`;
    bareBtn.setAttribute('aria-pressed', String(bare));
    bareBtn.setAttribute('aria-label', bare ? 'Show the panels' : 'Full view');
    bareBtn.title = bare ? 'Show the panels (F)' : 'Full view: hide every panel (F)';
    bareBtn.innerHTML = bare ? ICONS.collapse : ICONS.expand;
    // the model centres in whatever space the cards leave
    viewer?.setInsets({ left: bare ? 0 : 150, right: bare || !cardOpen ? 0 : 340, top: 0, bottom: bare ? 40 : 110 });
  }
  document.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement;
    if (ev.metaKey || ev.ctrlKey || ev.altKey || t.closest('input, textarea, select, [contenteditable]') || !el.isConnected) return;
    if (ev.key === '[' && work) setRailOpen(!railOpen);
    else if (ev.key.toLowerCase() === 'f') setBare(!bare);
    else if (ev.key === 'Escape' && bare) setBare(false);
  });
  const panelTools = h('div', { class: 'tool-row' }, railBtn, bareBtn);

  const topLeft = h('div', { class: 'floating top-left' }, panelTools, viewSeg, presets, zoom, badge);

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
    const min = h('button', {
      class: 'minimize',
      type: 'button',
      'aria-label': cardOpen ? 'Minimise this card' : 'Expand this card',
      title: cardOpen ? 'Minimise' : 'Expand',
      html: cardOpen ? ICONS.chevronUp : ICONS.chevronDown,
      onclick: () => {
        cardOpen = !cardOpen;
        savePref('dc.card', cardOpen);
        paintPanels();
        paintInspector();
      }
    });
    inspector.append(min);
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
    paintPanels();
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
  on('pick', () => {
    // picking something opens its card
    if (state.pick && !cardOpen) {
      cardOpen = true;
      paintPanels();
    }
    paintInspector();
  });
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
    setRail: (w) => {
      if (work && work !== w) work.classList.remove('rail-hidden');
      work = w;
      paintPanels();
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
