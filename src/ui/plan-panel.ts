/* ---------- 2D plan (Review and Edit) ---------- */
import { planOverlay, type Outline } from '../plan2d/overlay';
import { planSVG } from '../plan2d/plan-svg';
import { state } from '../state';
import { tour } from '../view3d/tour';
import { $ } from './dom';
import { MARK } from './icons';
import { endTour, focusRoom, renderEditTools, renderReviewInfo } from './pending';

export function renderPlan2D(): void {
  if (!state.P) return;
  const host = $('#plan2d');
  host.innerHTML = planSVG(state.P, { live: true });
  host
    .querySelectorAll<SVGElement>('.room')
    .forEach(el => el.addEventListener('click', () => onPlanRoomClick(el.dataset.id as string)));
  refreshPlanOverlay();
}
export function refreshPlanOverlay(): void {
  const svg = document.querySelector('#plan2d svg');
  if (!svg || !state.P) return;
  const outlines: Outline[] = [];
  if (state.editing) {
    if (state.editTool === 'swap')
      state.swapSel.forEach((id, i) => outlines.push([id, i ? MARK.second : MARK.first, false, String(i + 1)]));
    if (state.editTool === 'rename' && state.renameSel) outlines.push([state.renameSel, MARK.rename, false, '✎']);
  } else {
    const stop = tour.stops[tour.i];
    if (state.view === 'tour' && stop && stop.room) outlines.push([stop.room.id, '#2453d6', false]);
    else if (state.selectedRoom) outlines.push([state.selectedRoom, '#2453d6', false]);
  }
  planOverlay(svg, state.P, {
    outlines,
    journey: state.planRoutes.journey,
    staff: state.planRoutes.staff,
    egress: state.planRoutes.egress
  });
}
export function onPlanRoomClick(id: string): void {
  if (!state.P) return;
  const r = state.P.m.rooms.find(q => q.id === id);
  if (!r) return;
  if (state.editing) {
    if (state.editTool === 'swap') {
      if (state.swapSel.includes(id)) state.swapSel = state.swapSel.filter(x => x !== id);
      else state.swapSel = state.swapSel.length >= 2 ? [id] : state.swapSel.concat([id]);
    } else if (state.editTool === 'rename') {
      state.renameSel = id;
      $<HTMLInputElement>('#renameInput').value = r.label;
      setTimeout(() => $('#renameInput').focus(), 0);
    }
    renderEditTools();
    refreshPlanOverlay();
    return;
  }
  state.selectedRoom = id;
  if (state.view === 'tour') endTour();
  focusRoom(r);
  renderReviewInfo();
  refreshPlanOverlay();
}
