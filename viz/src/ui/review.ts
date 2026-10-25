/* Review: what a click on a room shows, the room card, route texts, tour captions and camera-mode changes. */
import { PURPOSE, posAt, type Room, type TourStop } from '../engine';
import { state, type ViewMode } from '../state';
import { highlightRoom, setHoverMark } from '../view3d/marks';
import { tour } from '../view3d/tour';
import { setDockOpen } from './dock';
import { $, esc } from './dom';
import { ICON } from './icons';
import { onPlanRoomClick, refreshPlanOverlay } from './plan-panel';

/* A click on a room in the 3D view: details while reviewing, the edit tools while editing. */
export function onRoomTap(r: Room | null): void {
  if (!state.P || (state.step !== 'review' && state.step !== 'simulate')) return;
  if (state.editing) {
    if (r && r.type !== 'corridor' && (state.editTool === 'swap' || state.editTool === 'rename')) {
      onPlanRoomClick(r.id);
      setHoverMark(null);
    }
    return;
  }
  state.selectedRoom = r ? r.id : null;
  highlightRoom(r || null);
  renderReviewInfo();
  refreshPlanOverlay();
}
export function roomFacts(r: Room): string[] {
  const info = (state.P as NonNullable<typeof state.P>).info,
    f = [(r.w * r.h).toFixed(1) + ' m², ' + r.w.toFixed(1) + ' × ' + r.h.toFixed(1) + ' m'];
  if (r.type === 'exam_room') {
    const e = info.allExams.find(x => x.id === r.id);
    if (e && isFinite(e.distNurse)) f.push(Math.round(e.distNurse) + ' m from the nurse station');
    if (e && isFinite(e.distWait)) f.push(Math.round(e.distWait) + ' m from the waiting room');
  }
  if (r.type === 'waiting') f.push(info.seats.length + ' seats');
  if (r.type === 'nurse_station') f.push(Math.round(info.avgNurse) + ' m to the average exam room');
  return f;
}
export function roomNow(r: Room): string {
  const sim = state.sim;
  if (!sim) return '';
  const c: Record<string, number> = { patient: 0, nurse: 0, provider: 0, reception: 0 };
  for (const a of sim.agents) {
    if (!a.active) continue;
    const p = a.rest && !a.move ? (a.rest as { x: number; y: number }) : posAt(a, sim.now);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) c[a.role]++;
  }
  if (r.type === 'exam_room')
    return c.patient && c.nurse
      ? 'A nurse is taking a patient’s vitals.'
      : c.patient && c.provider
        ? 'The provider is seeing a patient.'
        : c.patient
          ? 'A patient is waiting for the provider.'
          : 'Empty and ready for the next patient.';
  if (r.type === 'waiting') {
    const n = sim.waiting.length;
    return n
      ? n + (n === 1 ? ' patient is' : ' patients are') + ' waiting to be called.'
      : 'No one is waiting to be called right now.';
  }
  if (r.type === 'reception')
    return sim.deskQueue.length
      ? sim.deskQueue.length + ' in line at the counter.'
      : 'The receptionist is at the counter.';
  if (r.type === 'nurse_station')
    return c.nurse
      ? c.nurse + (c.nurse === 1 ? ' nurse is' : ' nurses are') + ' here between patients.'
      : 'All nurses are out with patients.';
  if (r.type === 'provider_office')
    return c.provider
      ? c.provider + (c.provider === 1 ? ' provider is' : ' providers are') + ' working here between visits.'
      : 'All providers are with patients.';
  const t = c.patient + c.nurse + c.provider + c.reception;
  return t ? t + (t === 1 ? ' person is' : ' people are') + ' here now.' : 'Empty right now.';
}
export function renderReviewInfo(): void {
  const card = document.querySelector<HTMLElement>('#roomCard'),
    box = document.querySelector<HTMLElement>('#roomInfo');
  if (!card || !box || !state.P) return;
  const r = state.selectedRoom && state.P.m.rooms.find(q => q.id === state.selectedRoom);
  const show = !!r && !state.editing && state.view !== 'tour' && (state.step === 'review' || state.step === 'simulate');
  card.hidden = !show;
  if (!show || !r) return;
  box.innerHTML =
    '<h3>' +
    esc(r.label) +
    '</h3><p>' +
    esc(PURPOSE[r.type] || '') +
    '</p><ul class="facts">' +
    roomFacts(r)
      .map(f => '<li>' + esc(f) + '</li>')
      .join('') +
    '</ul><p class="now" id="roomNow">' +
    esc(roomNow(r)) +
    '</p>';
}
export function updateRouteText(): void {
  if (!state.P) return;
  const info = state.P.info,
    r = info.routes,
    set = (id: string, t: string): void => {
      const el = document.querySelector(id);
      if (el) el.textContent = t;
    };
  set(
    '#tJourney',
    r.journey.examLabel
      ? Math.round(r.journey.len) + ' m, to ' + r.journey.examLabel + ' and back'
      : 'No exam room can be reached'
  );
  set('#tStaff', r.staff.length ? Math.round(info.avgNurse) + ' m on average' : 'No exam room can be reached');
  set('#tEgress', r.egress ? Math.round(r.egress.len) + ' m, from ' + r.egress.fromLabel : '');
}

/* ---------- Guided tour captions ---------- */
export function onTourStop(i: number, n: number, _st?: TourStop, ended?: boolean): void {
  $('#tourCount').textContent = 'Stop ' + (i + 1) + ' of ' + n;
  $('#tourPlay').innerHTML = tour.playing ? ICON.pause : ICON.play;
  $('#tourPlay').setAttribute('aria-label', tour.playing ? 'Pause the tour' : 'Resume the tour');
  $<HTMLButtonElement>('#tourPrev').disabled = i === 0;
  $<HTMLButtonElement>('#tourNext').disabled = i === n - 1;
  renderTourCaption(ended);
  refreshPlanOverlay();
}
export function renderTourCaption(ended?: boolean): void {
  const st = tour.stops[tour.i];
  if (!st) return;
  const info = (state.P as NonNullable<typeof state.P>).info;
  let title: string,
    purpose: string,
    // eslint-disable-next-line no-useless-assignment -- kept as in the reference
    now = '',
    facts: string[] = [];
  if (st.kind === 'entrance') {
    title = 'Entrance';
    purpose = 'Patients come in here and head to the reception counter to check in.';
    now = state.sim ? state.sim.inClinic + ' patients are inside right now.' : '';
  } else if (st.kind === 'exit') {
    title = ended ? 'That’s the whole clinic' : 'Back outside';
    purpose =
      'Every room connects to the entrance. The farthest room is ' +
      (info.routes.egress
        ? Math.round(info.routes.egress.len) + ' m from the exit (' + info.routes.egress.fromLabel + ').'
        : 'not reachable.');
    now = state.sim ? state.sim.seen + ' patients seen so far today.' : '';
  } else {
    const room = st.room as Room;
    title = room.label;
    purpose = PURPOSE[room.type] || '';
    now = roomNow(room);
    facts = roomFacts(room);
  }
  $('#capTitle').textContent = title;
  $('#capPurpose').textContent = purpose;
  $('#capNow').textContent = now;
  $('#capFacts').innerHTML = facts.map(f => '<li>' + esc(f) + '</li>').join('');
}
export function onViewChange(v: ViewMode): void {
  document
    .querySelectorAll<HTMLElement>('[data-view]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  const touring = v === 'tour';
  $('#tourBar').hidden = !touring;
  $('#caption').hidden = !touring;
  if (touring && state.dock && state.dock.open && $('#view3dBody').clientWidth < 760) setDockOpen(false);
  renderReviewInfo();
  refreshPlanOverlay();
}
