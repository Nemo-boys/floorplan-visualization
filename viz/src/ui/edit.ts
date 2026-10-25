/* ---------- Optional editing, opened from Review: tools, picks, swaps, renames and versions ---------- */
import { preparePlan, swapInSpec, type LayoutSpec, type Room } from '../engine';
import { state } from '../state';
import { highlightRoom, setHoverMark, setRoomMarks, type RoomMark } from '../view3d/marks';
import { selectItem, stopPlacing } from '../view3d/placement';
import { R3 } from '../view3d/r3';
import { endTour } from '../view3d/tour';
import { setView } from '../view3d/cameras';
import { applyDock } from './dock';
import { $, esc } from './dom';
import { MARK } from './icons';
import { refreshPlanOverlay } from './plan-panel';
import { renderReviewInfo } from './review';
import { setStep } from './stepper';
import { toast } from './toast';
import { applyVersion, commitVersion, planJsonFromVersion } from './versions';

export const labelOf = (id: string): string => {
  const r = state.P && state.P.m.rooms.find(q => q.id === id);
  return r ? r.label : id;
};
export const norm = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .replace(/rooms?/g, '')
    .replace(/[^a-z0-9]/g, '');
export function findRoom(text: string): Room | null {
  if (!state.P) return null;
  const n = norm(text),
    rooms = state.P.m.rooms;
  return (
    rooms.find(r => norm(r.label) === n) ||
    rooms.find(r => norm(r.id) === n) ||
    rooms.find(r => n && norm(r.label).startsWith(n)) ||
    rooms.find(r => n && n.includes(norm(r.label)) && norm(r.label).length > 3) ||
    null
  );
}
export function enterEdit(): void {
  if (!state.P) return;
  if (state.step !== 'review') setStep('review');
  if (state.view === 'tour') endTour();
  if (state.view === 'walk' || state.view === 'follow') setView('orbit');
  state.editing = true;
  highlightRoom(null);
  state.selectedRoom = null;
  $('#app').classList.add('editing');
  $('#editToggle').textContent = 'Done editing';
  $('#editToggle').setAttribute('aria-pressed', 'true');
  $('#rbTitle').textContent = 'Editing the plan';
  $('#rbHint').textContent = 'Click rooms on the floor plan or in the 3D view. Every change is saved as a new version.';
  if (state.editTool !== 'furniture' && state.dock) state.dock.open = true;
  applyDock();
  renderEditTools();
  renderPlanHint();
  refreshPlanOverlay();
  renderReviewInfo();
}
export function exitEdit(silent?: boolean): void {
  if (!state.editing) return;
  state.editing = false;
  stopPlacing();
  selectItem(null);
  state.swapSel = [];
  state.renameSel = null;
  $('#app').classList.remove('editing');
  syncEditMarks();
  $('#editToggle').textContent = 'Edit plan';
  $('#editToggle').setAttribute('aria-pressed', 'false');
  $('#rbTitle').textContent = 'Review the plan';
  $('#rbHint').textContent =
    'Open the floor plan from the corner of the 3D view. Drag it to any corner, and drag its edge to resize it.';
  applyDock();
  refreshPlanOverlay();
  renderPlanHint();
  renderReviewInfo();
  if (!silent && state.versions.length)
    toast('Editing closed. The plan is now at version ' + state.versions[state.vIndex].n + '.');
}
export function renderPlanHint(): void {
  const el = document.querySelector('#planHint');
  if (!el) return;
  el.textContent = !state.editing
    ? 'Click a room to fly there'
    : state.editTool === 'swap'
      ? 'Click two rooms to swap them'
      : state.editTool === 'rename'
        ? 'Click a room to rename it'
        : 'Place furniture in the 3D view';
}
export function renderEditTools(): void {
  if (!state.P) return;
  document
    .querySelectorAll<HTMLElement>('[data-tool]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === state.editTool)));
  $('#toolSwap').hidden = state.editTool !== 'swap';
  $('#toolRename').hidden = state.editTool !== 'rename';
  $('#toolFurniture').hidden = state.editTool !== 'furniture';
  const can = !!state.spec,
    sel = state.swapSel;
  $('#swapNote').hidden = can;
  const chip = (id: string, i: number): string =>
    '<span class="selchip" style="--c:' +
    (i ? MARK.second : MARK.first) +
    '"><b>' +
    (i + 1) +
    '</b>' +
    esc(labelOf(id)) +
    '</span>';
  $('#swapStatus').innerHTML = !can
    ? ''
    : !sel.length
      ? 'Click the first room, on the floor plan or in the 3D view.'
      : sel.length === 1
        ? chip(sel[0], 0) + '<span class="selnext">Now click the room to swap it with.</span>'
        : chip(sel[0], 0) + chip(sel[1], 1);
  let preview = '';
  if (can && sel.length === 2) {
    const r = swapInSpec(state.spec, sel[0], sel[1]);
    if (r.error) preview = '<p class="warn">' + esc(r.error) + '</p>';
    else {
      const v = state.versions[state.vIndex],
        P2 = preparePlan(planJsonFromVersion(Object.assign({}, v, { spec: r.spec })), []);
      const a = Math.round(state.P.info.avgNurse),
        b = Math.round(P2.info.avgNurse),
        ja = Math.round(state.P.info.routes.journey.len),
        jb = Math.round(P2.info.routes.journey.len);
      preview =
        '<p class="preview">If you swap them:</p><ul class="facts"><li>Nurse walk to the average exam room: ' +
        a +
        ' m to ' +
        b +
        ' m</li><li>Longest patient journey: ' +
        ja +
        ' m to ' +
        jb +
        ' m</li></ul>';
    }
  }
  $('#swapPreview').innerHTML = preview;
  $<HTMLButtonElement>('#swapApply').disabled = !can || sel.length !== 2 || /class="warn"/.test(preview);
  $('#renameRow').hidden = !state.renameSel;
  $('#renameHint').hidden = !!state.renameSel;
  document
    .querySelectorAll<HTMLElement>('[data-place]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === state.placing)));
  syncEditMarks();
}
/* Rooms picked while editing are highlighted in 3D with the same colors and numbers as on the plan. */
export function syncEditMarks(): void {
  if (!R3 || !state.P) return;
  const marks: RoomMark[] = [];
  if (state.editing) {
    if (state.editTool === 'swap')
      state.swapSel.forEach((id, i) =>
        marks.push({ id, color: i ? MARK.second : MARK.first, num: String(i + 1), text: labelOf(id) })
      );
    if (state.editTool === 'rename' && state.renameSel)
      marks.push({ id: state.renameSel, color: MARK.rename, num: null, text: 'Renaming ' + labelOf(state.renameSel) });
  }
  setRoomMarks(marks);
  if (!state.editing) setHoverMark(null);
}
/* While editing, the room under the pointer lights up in the color it would get if clicked. */
export function onRoomHover(r: Room | null): string | null {
  if (!state.editing || (state.editTool !== 'swap' && state.editTool !== 'rename')) {
    setHoverMark(null);
    return null;
  }
  if (!r) {
    setHoverMark(null);
    return null;
  }
  if (r.type === 'corridor') {
    setHoverMark(null);
    return 'Pick a room, not the corridor';
  }
  if (state.editTool === 'rename') {
    setHoverMark(r, MARK.rename);
    return 'Click to rename this room';
  }
  const sel = state.swapSel;
  if (sel.includes(r.id)) {
    setHoverMark(null);
    return 'Click again to unselect';
  }
  if (sel.length === 1) {
    const err = state.spec ? swapInSpec(state.spec, sel[0], r.id).error : 'Swapping works on the sample layouts';
    setHoverMark(r, err ? '#8a96a3' : MARK.second);
    return err ? 'Can’t swap: ' + err.charAt(0).toLowerCase() + err.slice(1) : 'Click to swap with ' + labelOf(sel[0]);
  }
  setHoverMark(r, MARK.first);
  return sel.length === 2 ? 'Click to start a new pair' : 'Click to pick this room first';
}
export interface SwapResult {
  error?: string;
  swapped?: string[];
  nurse_walk_avg_m_before?: number;
  nurse_walk_avg_m_after?: number;
  version?: number;
}
export function applySwap(): SwapResult {
  const [a, b] = state.swapSel,
    r = swapInSpec(state.spec, a, b);
  if (r.error) {
    toast(r.error);
    return { error: r.error };
  }
  const P = state.P as NonNullable<typeof state.P>;
  const la = labelOf(a),
    lb = labelOf(b),
    before = Math.round(P.info.avgNurse),
    hadFurniture = state.placed.length > 0;
  commitVersion('Swapped ' + la + ' and ' + lb, nv => {
    nv.spec = r.spec as LayoutSpec;
    nv.placed = [];
  });
  state.swapSel = [];
  renderEditTools();
  refreshPlanOverlay();
  const after = Math.round((state.P as NonNullable<typeof state.P>).info.avgNurse);
  toast(
    'Swapped ' +
      la +
      ' and ' +
      lb +
      ', saved as version ' +
      state.versions[state.vIndex].n +
      '.' +
      (hadFurniture ? ' Added furniture was cleared because the rooms moved.' : '')
  );
  return {
    swapped: [la, lb],
    nurse_walk_avg_m_before: before,
    nurse_walk_avg_m_after: after,
    version: state.versions[state.vIndex].n
  };
}
export function applyRename(): void {
  const id = state.renameSel,
    name = $<HTMLInputElement>('#renameInput').value.trim();
  if (!id || !name || name === labelOf(id)) return;
  const old = labelOf(id);
  commitVersion('Renamed ' + old + ' to ' + name, nv => {
    nv.renames[id] = name;
  });
  state.renameSel = null;
  renderEditTools();
  refreshPlanOverlay();
  toast('Renamed ' + old + ' to ' + name + '.');
}
export function renderVersions(): void {
  const box = document.querySelector<HTMLElement>('#versions');
  if (!box) return;
  box.innerHTML = state.versions
    .slice()
    .reverse()
    .map(v => {
      const i = v.n - 1,
        cur = i === state.vIndex;
      return (
        '<li class="' +
        (cur ? 'current' : '') +
        '"><span class="vn">v' +
        v.n +
        '</span><span class="vc">' +
        esc(v.change) +
        '<small>' +
        v.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
        '</small></span>' +
        (cur
          ? '<span class="tag">Current</span>'
          : '<button type="button" class="btn small" data-restore="' + i + '">Restore</button>') +
        '</li>'
      );
    })
    .join('');
  box.querySelectorAll<HTMLElement>('[data-restore]').forEach(b =>
    b.addEventListener('click', () => {
      state.vIndex = +(b.dataset.restore as string);
      applyVersion(state.versions[state.vIndex], true);
      toast('Restored version ' + (state.vIndex + 1) + '.');
    })
  );
}
