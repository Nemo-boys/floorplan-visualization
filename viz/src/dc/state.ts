/* The app's single state object and a minimal change feed. */
import { DEFAULT_BASIS } from './engine/brief';
import type { Check } from './engine/checks';
import { DEFAULT_RATES, type CostReport, type Rates } from './engine/cost';
import { NORMAL, type Conditions } from './engine/status';
import type { Basis, Design } from './engine/types';
import type { Lens } from './ui/lens';

export type Step = 'describe' | 'design' | 'test' | 'cost';
export type Pick = { kind: 'room' | 'equip'; id: string } | null;

export interface Option {
  design: Design;
  cost: CostReport;
  checks: Check[];
}

export interface State {
  step: Step;
  brief: string;
  basis: Basis;
  options: Option[];
  selected: number;
  recommended: number;
  pick: Pick;
  lens: Lens;
  view: '3d' | 'plan';
  conditions: Conditions; // failures and stresses applied in the Test step
  rates: Rates; // cost assumptions, editable in the Cost step
}

export const DEFAULT_BRIEF = '20 MW AI factory, liquid-cooled GB200 racks, N+1 cooling, 2N power';

export const state: State = {
  step: 'describe',
  brief: DEFAULT_BRIEF,
  basis: { ...DEFAULT_BASIS },
  options: [],
  selected: 0,
  recommended: 0,
  pick: null,
  lens: 'layout',
  view: '3d',
  conditions: NORMAL,
  rates: { ...DEFAULT_RATES }
};

type Topic = 'step' | 'options' | 'selected' | 'pick' | 'lens' | 'conditions' | 'theme' | 'cost';
const subs = new Map<Topic, Set<() => void>>();
export function on(topic: Topic, fn: () => void): void {
  if (!subs.has(topic)) subs.set(topic, new Set());
  subs.get(topic)!.add(fn);
}
export function emit(topic: Topic): void {
  subs.get(topic)?.forEach((fn) => fn());
}
export const current = (): Option | undefined => state.options[state.selected];
