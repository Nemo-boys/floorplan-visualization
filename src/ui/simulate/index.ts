/* ---------- Simulate: scenario builder (typed blocks), results and history ---------- */
import { BLOCK_TYPES, SCENARIO_PRESETS, compileScenario, makeScenario, type Block, type Scenario } from '../../engine';
import { state, type SimTab } from '../../state';
import { $, esc } from '../dom';
import { drawTimeline } from '../transport';
import { resize } from '../resize';
import { toastAction } from '../toast';
import { renderBuilder, renderPalette, bindBuilder } from './builder';
import { bindHistory, loadHistory, renderHistory, renderHistoryCount } from './history';
import { bindScenarioFiles } from './files';
import { renderResults } from './results';
import { runScenario, runSweep } from './runner';
import { bindDayTimeline, renderDayTimeline } from './timeline';

/* ---------- Tabs inside Simulate ---------- */
export function setSimTab(t: SimTab): void {
  state.simTab = t;
  const app = $('#app');
  (['scenario', 'results', 'history'] as SimTab[]).forEach(k => app.classList.toggle('sim-' + k, k === t));
  document
    .querySelectorAll<HTMLElement>('[data-simtab]')
    .forEach(b => b.setAttribute('aria-selected', String(b.dataset.simtab === t)));
  if (t === 'scenario') renderDayTimeline();
  if (t === 'history') renderHistory();
  if (t === 'results') renderResults();
  requestAnimationFrame(() => {
    resize();
    drawTimeline();
  });
}
export function blockOf(id: string): Block | undefined {
  return (state.scn as Scenario).blocks.find(b => b.id === id);
}
export function safeSummary(b: Block): string {
  try {
    const T = BLOCK_TYPES[b.type];
    return T && T.summary ? T.summary(b.fields, state.P) : '';
  } catch {
    return '';
  }
}
export function markEdited(): void {
  if (state.scn) state.scn.edited = true;
  renderPresetChips();
}

/* ---------- Presets and the scenario header ---------- */
export function renderPresetChips(): void {
  const box = document.querySelector<HTMLElement>('#presetRow');
  if (!box || !state.scn) return;
  const scn = state.scn;
  box.innerHTML =
    '<span class="small muted">Start from</span>' +
    Object.entries(SCENARIO_PRESETS)
      .map(([k, p]) => {
        const on = scn.preset === k;
        return (
          '<button type="button" class="preset' +
          (on ? ' on' : '') +
          '" data-preset="' +
          k +
          '" aria-pressed="' +
          on +
          '" title="' +
          esc(p.desc) +
          '">' +
          esc(p.label) +
          (on && scn.edited ? '<em>edited</em>' : '') +
          '</button>'
        );
      })
      .join('');
  box
    .querySelectorAll<HTMLElement>('[data-preset]')
    .forEach(b => b.addEventListener('click', () => loadPreset(b.dataset.preset as string)));
}
export function fillRoomDefaults(scn: Scenario): Scenario {
  const ex = state.P && state.P.m.rooms.find(r => r.type === 'exam_room');
  for (const b of scn.blocks) if (b.type === 'closed' && !b.fields.room && ex) b.fields.room = ex.id;
  return scn;
}
export function loadPreset(key: string): void {
  const prev: Scenario | null = state.scn ? JSON.parse(JSON.stringify(state.scn)) : null;
  state.scn = fillRoomDefaults(makeScenario(key));
  state.folded = new Set();
  renderBuilder();
  if (prev && prev.edited)
    toastAction('Loaded “' + SCENARIO_PRESETS[key].label + '”. Your edits were replaced.', 'Undo', () => {
      state.scn = prev;
      renderBuilder();
    });
}
export function initSimulate(): void {
  state.history = loadHistory();
  state.scn = fillRoomDefaults(makeScenario('normal'));
  state.scenario = compileScenario(state.scn);
  renderPalette();
  bindBuilder();
  bindDayTimeline();
  bindHistory();
  bindScenarioFiles();
  document
    .querySelectorAll<HTMLElement>('[data-simtab]')
    .forEach(b => b.addEventListener('click', () => setSimTab(b.dataset.simtab as SimTab)));
  $('#runBtn').addEventListener('click', () => runScenario());
  $('#sweepBtn').addEventListener('click', runSweep);
  $<HTMLSelectElement>('#swField').addEventListener('change', e => {
    const v = (e.target as HTMLSelectElement).value;
    $<HTMLInputElement>('#swValues').value =
      v === 'patients' ? '40, 60, 80, 100' : v === 'receptionists' ? '1, 2' : '1, 2, 3';
  });
  renderBuilder();
  renderResults();
  renderHistoryCount();
  setSimTab('scenario');
}
