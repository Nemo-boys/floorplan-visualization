/* ---------- Steps and the sliding tab highlight ---------- */
import { state, type StepName } from '../state';
import { R3 } from '../view3d/r3';
import { $, reduceMotion } from './dom';
import { refreshPlanOverlay } from './plan-panel';
import { resize } from './resize';
import { setView } from '../view3d/cameras';
import { endTour } from '../view3d/tour';
import { applyDock } from './dock';
import { exitEdit, renderEditTools } from './edit';
import { renderExport } from './pending';
import { setSimTab } from './simulate';
import { updateLive, updateTransport } from './transport';
import { renderReviewInfo } from './review';

export const STEPS: StepName[] = ['import', 'review', 'simulate', 'export'];
export function moveGlider(): void {
  const b = document.querySelector<HTMLElement>('[data-step][aria-selected="true"]'),
    g = $('#glider');
  if (!b || !g) return;
  g.style.width = b.offsetWidth + 'px';
  g.style.transform = 'translateX(' + b.offsetLeft + 'px)';
}
export function setStep(name: string): void {
  if (!STEPS.includes(name as StepName) || (!state.P && name !== 'import')) return;
  const step = name as StepName;
  state.step = step;
  const app = $('#app');
  STEPS.forEach(s => app.classList.toggle('step-' + s, s === step));
  const idx = STEPS.indexOf(step);
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => {
    const i = STEPS.indexOf(b.dataset.step as StepName),
      on = i === idx;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle('done', !!state.P && i < idx);
  });
  moveGlider();
  if (step !== 'review' && state.view === 'tour') endTour();
  if (step !== 'simulate' && state.view === 'follow') setView('orbit');
  if (step !== 'review') exitEdit(true);
  applyDock();
  renderReviewInfo();
  if ((step === 'review' || step === 'simulate') && state.sim && !state.sim.done && !state.playing && !reduceMotion) {
    state.playing = true;
    updateTransport();
  }
  if (step === 'export') renderExport();
  if (step === 'simulate') {
    setSimTab(state.simTab);
    updateLive(true);
  }
  requestAnimationFrame(() => {
    resize();
    refreshPlanOverlay();
  });
  renderEditTools();
  try {
    history.replaceState(null, '', '#' + step);
  } catch {
    /* not allowed in some frames */
  }
}
export function is3DVisible(): boolean {
  return !!R3 && (state.step === 'review' || (state.step === 'simulate' && state.simTab === 'results'));
}
export function is2DVisible(): boolean {
  return (
    (state.step === 'review' || (state.step === 'simulate' && state.simTab === 'results')) &&
    !!state.dock &&
    state.dock.open
  );
}
