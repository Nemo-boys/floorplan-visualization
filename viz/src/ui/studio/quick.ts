/* Quick setup for Simulate (studio look): the Scenario tab opens on what most people want to change (which kind
   of day, who works, how many patients) with the block builder one click away. It edits the same scenario
   through the engine's own applyOverrides, the function “Try a range of values” uses, so a quick change and a
   block edit are the same thing and every number stays the simulator's. */
import { SCENARIO_PRESETS, applyOverrides, type Overrides, type Scenario } from '../../engine';
import { state } from '../../state';
import { $, esc } from '../dom';
import { loadPreset, markEdited } from '../simulate';
import { renderBuilder } from '../simulate/builder';

type Dial = { key: keyof Overrides & string; label: string; color: string; hint: string; min: number; max: number; step: number };
const DIALS: Dial[] = [
  { key: 'providers', label: 'Providers', color: 'var(--r-provider)', hint: 'Doctors and nurse practitioners', min: 1, max: 10, step: 1 },
  { key: 'nurses', label: 'Nurses', color: 'var(--r-nurse)', hint: 'Intake, vitals and rooming', min: 1, max: 10, step: 1 },
  { key: 'receptionists', label: 'Front desk', color: 'var(--r-reception)', hint: 'Check-in and checkout', min: 1, max: 10, step: 1 },
  { key: 'patients', label: 'Patients per day', color: 'var(--r-patient)', hint: 'Appointments and walk-ins', min: 5, max: 200, step: 5 }
];

/* The numbers applyOverrides works on: shift counts per role, and patients across appointments, walk-ins and groups. */
export function dayCounts(scn: Scenario): Record<string, number> {
  const on = scn.blocks.filter(b => b.enabled !== false);
  const sum = (pick: (b: (typeof on)[number]) => boolean) =>
    on.filter(pick).reduce((t, b) => t + (Number(b.fields.count) || 0), 0);
  return {
    providers: sum(b => b.type === 'shift' && b.fields.role === 'provider'),
    nurses: sum(b => b.type === 'shift' && b.fields.role === 'nurse'),
    receptionists: sum(b => b.type === 'shift' && b.fields.role === 'reception'),
    patients: sum(b => ['appointments', 'walkins', 'group'].includes(b.type))
  };
}

export function setDay(o: Overrides): void {
  if (!state.scn) return;
  const keep = { name: state.scn.name, preset: state.scn.preset };
  state.scn = Object.assign(applyOverrides(state.scn, o), keep);
  markEdited();
  renderBuilder();
}

export function initQuick(): void {
  const app = $('#app');
  const canvas = $('#scnCanvas');
  const box = document.createElement('div');
  box.className = 'quick';
  const mode = document.createElement('div');
  mode.className = 'q-mode';
  mode.innerHTML = '<button type="button" class="btn small" id="qSimple">Back to the simple setup</button>';
  canvas.prepend(mode);
  canvas.prepend(box);
  app.classList.add('sim-quick');

  const paint = () => {
    const scn = state.scn;
    if (!scn) return;
    const c = dayCounts(scn);
    const tiles = (['normal', 'flu', 'short'] as const)
      .map(k => {
        const p = SCENARIO_PRESETS[k],
          on = scn.preset === k;
        return `<button type="button" class="q-tile" data-qpreset="${k}" aria-pressed="${on}"><b>${esc(p.label)}${on && scn.edited ? '<em>changed</em>' : ''}</b><span>${esc(p.desc)}</span></button>`;
      })
      .join('');
    const dials = DIALS.map(d => {
      const v = c[d.key];
      return `<div class="q-dial" style="--c:${d.color}"><label id="ql_${d.key}"><i></i>${d.label}</label><div class="q-step" role="group" aria-labelledby="ql_${d.key}"><button type="button" data-q="${d.key}" data-d="-1" aria-label="Fewer ${d.label.toLowerCase()}" ${v <= d.min ? 'disabled' : ''}>−</button><output aria-live="polite">${v}</output><button type="button" data-q="${d.key}" data-d="1" aria-label="More ${d.label.toLowerCase()}" ${v >= d.max ? 'disabled' : ''}>+</button></div><small>${d.hint}</small></div>`;
    }).join('');
    box.innerHTML =
      `<h2>What kind of day?</h2><p>Pick a day, set who is working and how many patients come, then run it on the right.</p>` +
      `<div class="q-tiles">${tiles}</div>` +
      `<div class="q-head"><h3>Who works, and how busy</h3><span>Changes apply to the whole day</span></div>` +
      `<div class="q-dials">${dials}</div>` +
      `<div class="q-foot"><p>Breaks, staff out, closed rooms, visit types and rules are in the full builder.</p><button type="button" class="btn small" data-qdetail>Edit every detail</button></div>` +
      `<div class="q-head"><h3>The day at a glance</h3><span>Staff, arrivals, breaks and changes</span></div>`;
    // the day timeline (the reference's own) sits right under the quick card
  };

  box.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-qdetail]')) {
      app.classList.remove('sim-quick');
      relayout();
      return;
    }
    const tile = t.closest<HTMLElement>('[data-qpreset]');
    if (tile) {
      loadPreset(tile.dataset.qpreset as string);
      return;
    }
    const b = t.closest<HTMLButtonElement>('[data-q]');
    if (!b || !state.scn) return;
    const d = DIALS.find(x => x.key === b.dataset.q) as Dial;
    const v = dayCounts(state.scn)[d.key] + Number(b.dataset.d) * d.step;
    setDay({ [d.key]: Math.max(d.min, Math.min(d.max, v)) });
  });

  // the full builder, and the way back
  const relayout = () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  $('#qSimple').addEventListener('click', () => {
    app.classList.add('sim-quick');
    relayout();
  });

  // every scenario change re-draws the day timeline, so watching it keeps the quick card in step
  new MutationObserver(paint).observe($('#dayTimeline'), { childList: true });
  paint();
}
