/* The floor-plan panel's saved position and size (fi.planDock.v1). Moving and resizing it is ported in Phase 4. */
import { state, type Corner, type Dock } from '../state';

export const DOCK_KEY = 'fi.planDock.v1';
export function loadDock(): Dock | null {
  try {
    const v = JSON.parse(localStorage.getItem(DOCK_KEY) || 'null');
    if (v && ['tl', 'tr', 'bl', 'br'].includes(v.corner))
      return { open: !!v.open, corner: v.corner as Corner, w: +v.w || 440, h: +v.h || 300 };
  } catch {
    /* storage unavailable */
  }
  return null;
}
export function saveDock(): void {
  try {
    localStorage.setItem(DOCK_KEY, JSON.stringify(state.dock));
  } catch {
    /* storage unavailable */
  }
}
