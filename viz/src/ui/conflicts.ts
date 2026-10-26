/* Rooms that make a requested edit impossible. They're marked in red until the plan changes. */
import type { PlanJson } from '../engine';
import { state } from '../state';
import type { RoomMark } from '../view3d/marks';

export const CONFLICT_COLOR = '#d64545';
export const conflict = { ids: [] as string[], json: null as PlanJson | null };

export function setConflict(ids: string[]): void {
  conflict.ids = ids;
  conflict.json = state.json;
}
export function conflictMarks(): RoomMark[] {
  if (!conflict.ids.length || conflict.json !== state.json || !state.P) return [];
  const rooms = state.P.m.rooms;
  return conflict.ids
    .map(id => rooms.find(r => r.id === id))
    .filter(r => !!r)
    .map(r => ({ id: r.id, color: CONFLICT_COLOR, num: null, text: r.label + ' is in the way' }));
}
