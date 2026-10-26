/* The app's actions, shared by the screens and the assistant. */
import { runChecks } from './engine/checks';
import { costOf } from './engine/cost';
import { generateOptions } from './engine/design';
import type { Basis } from './engine/types';
import { emit, state, type Step } from './state';

export function generate(brief: string, basis: Basis) {
  state.brief = brief;
  state.basis = basis;
  state.options = generateOptions(basis).map((design) => ({ design, cost: costOf(design, state.rates, basis), checks: runChecks(design) }));
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

export function go(step: Step) {
  if (step !== 'describe' && !state.options.length) return false;
  if (state.step !== step) {
    state.step = step;
    emit('step');
  }
  return true;
}
