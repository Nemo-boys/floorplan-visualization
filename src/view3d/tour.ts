/* Guided tour state. The camera moves for it are ported in Phase 4. */
import type { TourStop } from '../engine';

export interface TourState {
  stops: TourStop[];
  i: number;
  phase: 'idle' | 'move' | 'dwell';
  t: number;
  from: unknown;
  to: unknown;
  playing: boolean;
  dwell: number;
  moveTime: number;
  look: unknown;
}
export const tour: TourState = {
  stops: [],
  i: 0,
  phase: 'idle',
  t: 0,
  from: null,
  to: null,
  playing: false,
  dwell: 6.5,
  moveTime: 2.4,
  look: null
};
