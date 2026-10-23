/* ---------- The day being shown: reset, seek and end of day. The transport bar itself is ported in Phase 5. ---------- */
import { ClinicSim, fmtClock } from '../engine';
import { state } from '../state';
import { paintHeat } from '../view3d/scene';
import { R3 } from '../view3d/r3';
import { $ } from './dom';
import { updateLive, updateTransport } from './pending';

export function resetSim(startAt: number): void {
  if (!state.P) return;
  state.sim = new ClinicSim(state.P.m, state.P.g, state.P.pf, state.P.info, state.scenario, state.seed);
  if (startAt) state.sim.advanceTo(startAt);
  if (R3) {
    for (const p of R3.people.values()) R3.root.remove(p.root);
    R3.people.clear();
  }
  $('#dayMsg').textContent = '';
  if (state.layers.traffic) paintHeat();
  updateLive(true);
}
export function seek(min: number): void {
  if (!state.sim) return;
  if (min >= state.sim.now) state.sim.advanceTo(min);
  else resetSim(min);
  if (R3) {
    for (const p of R3.people.values()) R3.root.remove(p.root);
    R3.people.clear();
  }
  if (state.layers.traffic) paintHeat();
  if ((state.sim as ClinicSim).done) dayDone();
  else updateLive(true);
}
export function dayDone(): void {
  state.playing = false;
  const mt = (state.sim as ClinicSim).metrics();
  $('#dayMsg').textContent = 'Day finished at ' + fmtClock(mt.lastExit) + ' with ' + mt.seen + ' patients seen.';
  if (state.layers.traffic) paintHeat();
  updateTransport();
  updateLive(true);
}
