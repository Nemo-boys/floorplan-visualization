/* ---------- Bindings, the render loop and startup ---------- */
import type { PlanJson } from '../engine';
import { state } from '../state';
import { R3 } from '../view3d/r3';
import { tour } from '../view3d/tour';
import { toggleChat } from './assistant';
import { loadDock } from './dock';
import { $, reduceMotion } from './dom';
import { renderSampleThumbs, updatePlanHeader } from './import';
import { ROLE_DOTS } from './icons';
import { refreshPlanOverlay } from './plan-panel';
import { planPeople } from '../plan2d/overlay';
import {
  applyDock,
  bindDock,
  buildLabels,
  dayDone,
  drawTimeline,
  enterEdit,
  initSimulate,
  initThree,
  paintHeat,
  renderExport,
  roomNow,
  updateLive,
  updateTransport
} from './pending';
import { resize } from './resize';
import { STEPS, is2DVisible, moveGlider, setStep } from './stepper';
import { applyTheme } from './theme';
import { importPlan } from './versions';

export function bindUI(): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-step]')
    .forEach(b => b.addEventListener('click', () => setStep(b.dataset.step as string)));
  $('#stepper').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-step]')].filter(b => !b.disabled),
      i = tabs.findIndex(b => b.dataset.step === state.step);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (n) {
      setStep(n.dataset.step as string);
      n.focus();
    }
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-next]')
    .forEach(b => b.addEventListener('click', () => setStep(b.dataset.next as string)));
  $('#openPipeline').addEventListener('click', () => importPlan({ kind: 'pipeline', key: 'A' }));
  document
    .querySelectorAll<HTMLButtonElement>('[data-sample]')
    .forEach(b => b.addEventListener('click', () => importPlan({ kind: 'sample', key: b.dataset.sample as string })));
  $<HTMLInputElement>('#fileInput').addEventListener('change', e => {
    const input = e.target as HTMLInputElement,
      f = input.files && input.files[0],
      msg = $('#fileMsg');
    if (!f) return;
    f.text()
      .then(t => {
        const json = JSON.parse(t) as PlanJson;
        importPlan({ kind: 'file', json, file: f.name });
        state.uploaded = json;
        msg.hidden = true;
      })
      .catch((err: Error) => {
        msg.hidden = false;
        msg.textContent =
          'Couldn’t read ' +
          f.name +
          ': ' +
          err.message +
          '. The page expects plan.json v0.1: rooms with "rect" or "polygon_mm", and doors with "center_mm".';
      });
  });
  const route = (id: string, key: 'journey' | 'staff' | 'egress'): void =>
    $(id).addEventListener('change', e => {
      const on = (e.target as HTMLInputElement).checked;
      state.planRoutes[key] = on;
      state.routes[key] = on;
      if (R3 && R3.routeMeshes) R3.routeMeshes[key].visible = on;
      refreshPlanOverlay();
    });
  route('#rJourney', 'journey');
  route('#rStaff', 'staff');
  route('#rEgress', 'egress');
  bindDock();
  $('#assistantBtn').addEventListener('click', () => toggleChat());
  $('#chatClose').addEventListener('click', () => toggleChat(false));
}
export function rendererNote(): void {
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator,
    badge = $('#rendererBadge');
  if (!R3) {
    badge.textContent = '3D off';
    badge.title = 'The 3D renderer didn’t start in this browser.';
    return;
  }
  badge.textContent = R3.gl2 ? 'WebGL2' : 'WebGL1';
  badge.title = gpu
    ? 'This preview renders with WebGL2. WebGPU is available here, so the real build will use it with WebGL2 as the fallback.'
    : 'This preview renders with WebGL2. WebGPU isn’t available here, which is when the real build falls back to WebGL2.';
}
let last = performance.now(),
  lastPeople2d = 0,
  lastCaption = 0,
  lastHeat = 0;
/* The render loop. The 3D part (camera, people, sun and the render itself) is ported with the 3D view in Phase 4. */
export function loop(ts: number): void {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
  last = ts;
  const sim = state.sim;
  if (state.P && sim && state.playing && !sim.done) {
    sim.advanceTo(sim.now + dt * state.speed);
    if (sim.done) dayDone();
  }
  if (state.P) {
    updateLive(false);
    if (is2DVisible() && ts - lastPeople2d > 140) {
      planPeople(document.querySelector('#plan2d svg'), state.P, sim, ROLE_DOTS);
      lastPeople2d = ts;
    }
    if (ts - lastCaption > 700) {
      if (state.view === 'tour') {
        const el = $('#capNow'),
          st = tour.stops[tour.i];
        if (el && st && st.room) el.textContent = roomNow(st.room);
      }
      const rn = document.querySelector<HTMLElement>('#roomNow'),
        sr = state.selectedRoom && state.P.m.rooms.find(q => q.id === state.selectedRoom);
      if (rn && sr) rn.textContent = roomNow(sr);
      lastCaption = ts;
    }
    if (state.layers.traffic && state.step === 'simulate' && ts - lastHeat > 700) {
      paintHeat();
      lastHeat = ts;
    }
  }
  requestAnimationFrame(loop);
}
/* In the reference this also asked the artifact viewer for the assistant and for downloads. In this build the
   assistant is a placeholder and downloads are the browser's own (PLAN.md, planned differences 1, 2 and 4). */
export function initCapabilities(): void {
  renderExport();
}
export function init(): void {
  const want = (location.hash || '').replace('#', '');
  state.dock = loadDock() || { open: false, corner: 'br', w: 440, h: 300 };
  initThree();
  renderSampleThumbs();
  bindUI();
  initSimulate();
  rendererNote();
  updatePlanHeader();
  setStep('import');
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => {
    if (b.dataset.step !== 'import') b.disabled = true;
  });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      resize();
      applyDock();
      moveGlider();
      drawTimeline();
    });
    ['#workspace', '#view3dBody'].forEach(s => ro.observe($(s)));
  }
  window.addEventListener('resize', () => {
    resize();
    moveGlider();
  });
  if (window.matchMedia) {
    const q = window.matchMedia('(prefers-color-scheme: dark)');
    if (q.addEventListener) q.addEventListener('change', applyTheme);
  }
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => {
      moveGlider();
      if (R3 && state.P) buildLabels();
    });
  if ((STEPS.includes(want as never) && want !== 'import') || want === 'edit') {
    importPlan({ kind: 'pipeline', key: 'A' });
    setStep(want === 'edit' ? 'review' : want);
    if (want === 'edit') enterEdit();
  }
  state.playing = !reduceMotion;
  updateTransport();
  applyTheme();
  initCapabilities();
  requestAnimationFrame(loop);
}
