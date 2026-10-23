/* Placing furniture: preview follows the cursor, click to place, drag to move, R to rotate, Delete to remove. */
import * as THREE from 'three';
import {
  ITEM_SIZE,
  doorZone,
  itemRect,
  preparePlan,
  rectsOverlap,
  roomDoors,
  type FurnItem,
  type PlanJson,
  type PreparedPlan,
  type Vec
} from '../engine';
import { state } from '../state';
import { $ } from '../ui/dom';
import { resetSim } from '../ui/transport';
import { updateRouteText } from '../ui/review';
import { toast } from '../ui/toast';
import { afterFurnitureChange } from '../ui/versions';
import { setView } from './cameras';
import { buildItem } from './furniture';
import { floorPoint, roomAt } from './pointer';
import { R3, r3 } from './r3';
import { buildFurniture, buildRoutes } from './scene';
import { wx, wz, yawOf } from './coords';

const plan = (): PreparedPlan => state.P as PreparedPlan;
export const DIRS: Vec[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 }
];
export function startPlacing(kind: string): void {
  if (!R3) return;
  const R = R3;
  if (state.view !== 'orbit') setView('orbit');
  state.placing = kind;
  state.ghostRot = 0;
  document
    .querySelectorAll<HTMLElement>('[data-place]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === kind)));
  if (R.ghost) R.root.remove(R.ghost);
  const it = Object.assign(
    { kind, x: 0, y: 0, dir: DIRS[0], w: ITEM_SIZE[kind][0], d: ITEM_SIZE[kind][1] },
    kind === 'cabinet' ? { w: 1.0 } : {}
  ) as FurnItem;
  const g = buildItem(it) as THREE.Group;
  g.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = (mesh.material as THREE.Material).clone();
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthWrite = false;
      mesh.material = mat;
    }
  });
  g.visible = false;
  R.ghost = g;
  R.ghostItem = it;
  R.root.add(g);
  $('#placeHint').hidden = false;
}
export function stopPlacing(): void {
  state.placing = null;
  document.querySelectorAll('[data-place]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  if (R3 && R3.ghost) {
    R3.root.remove(R3.ghost);
    R3.ghost = null;
  }
  $('#placeHint').hidden = true;
}
export function moveGhost(e: PointerEvent): void {
  const fp = floorPoint(e),
    R = r3();
  if (!fp || !R.ghost) return;
  const it = R.ghostItem as FurnItem;
  it.x = Math.round(fp.x * 10) / 10;
  it.y = Math.round(fp.y * 10) / 10;
  it.dir = DIRS[state.ghostRot];
  R.ghost.position.set(wx(it.x), 0, wz(it.y));
  R.ghost.rotation.y = yawOf(it.dir.x, it.dir.y);
  R.ghost.visible = !!roomAt(it.x, it.y);
}
export function placeAt(e: PointerEvent): void {
  moveGhost(e);
  const g = r3().ghostItem as FurnItem;
  const r = roomAt(g.x, g.y);
  if (!r) {
    toast('Place furniture inside a room.');
    return;
  }
  const it = {
    kind: g.kind,
    x: g.x,
    y: g.y,
    dir: g.dir,
    w: g.w,
    d: g.d,
    block: true,
    placed: true,
    room: plan().m.rooms.indexOf(r)
  } as FurnItem;
  const R = itemRect(it);
  if (R.x0 < r.x - 0.02 || R.x1 > r.x + r.w + 0.02 || R.y0 < r.y - 0.02 || R.y1 > r.y + r.h + 0.02) {
    toast('That doesn’t fit inside ' + r.label + '. Try rotating it with R.');
    return;
  }
  state.placed.push(it);
  stopPlacing();
  commitPlaced(it, 'added');
}
export function positionPlaced(it: FurnItem): void {
  const obj = it.obj as THREE.Object3D | undefined;
  if (!obj) return;
  obj.position.set(wx(it.x), 0, wz(it.y));
  obj.rotation.y = yawOf(it.dir.x, it.dir.y);
  const R = r3();
  if (state.selected === it && R.selRing) R.selRing.position.set(wx(it.x), 0.03, wz(it.y));
}
export function selectItem(it: FurnItem | null): void {
  state.selected = it;
  if (!R3) return;
  if (R3.selRing) {
    R3.selRing.visible = !!it;
    if (it) {
      const s = Math.max(it.w, it.d) / 1.1;
      R3.selRing.scale.set(s, s, s);
      R3.selRing.position.set(wx(it.x), 0.03, wz(it.y));
    }
  }
  $('#selectionTools').hidden = !it;
  if (it) $('#selectionName').textContent = PLACE_NAMES[it.kind] || it.kind;
}
export const PLACE_NAMES: Record<string, string> = {
  bed: 'Hospital bed',
  chair: 'Chair',
  desk: 'Desk',
  plant: 'Plant',
  cabinet: 'Cabinet',
  screen: 'Privacy screen'
};
/* Re-run the walkable grid with the placed furniture; refuse changes that would block a doorway or an exam room. */
export function blocksDoor(it: FurnItem): boolean {
  if (it.kind === 'plant' || it.kind === 'chair') return false;
  const R = itemRect(it),
    m = plan().m;
  return m.rooms.some(
    r =>
      R.x0 < r.x + r.w &&
      R.x1 > r.x &&
      R.y0 < r.y + r.h &&
      R.y1 > r.y &&
      roomDoors(m, r).some(d => rectsOverlap(doorZone(d, r), R, -0.05))
  );
}
export type PlaceHow = 'added' | 'moved' | 'rotated' | 'removed';
export function commitPlaced(it: FurnItem, how: PlaceHow): void {
  const prevInfo = plan().info;
  if (how !== 'removed' && blocksDoor(it)) {
    if (how === 'added') {
      state.placed = state.placed.filter(x => x !== it);
      buildFurniture();
      selectItem(null);
    } else {
      if (it._prev) Object.assign(it, it._prev);
      buildFurniture();
      selectItem(it);
    }
    toast('Keep doorways clear: that spot is right in front of a door.');
    return;
  }
  let P2: PreparedPlan | null;
  try {
    P2 = preparePlan(state.json as PlanJson, state.placed);
  } catch {
    P2 = null;
  }
  const ok =
    P2 &&
    P2.info.exams.length >= prevInfo.exams.length &&
    P2.info.unreachableRooms.length <= prevInfo.unreachableRooms.length &&
    P2.info.seats.length > 0;
  if (!ok || !P2) {
    if (how === 'added') state.placed = state.placed.filter(x => x !== it);
    else if (how === 'removed') state.placed.push(it);
    else if (it._prev) Object.assign(it, it._prev);
    buildFurniture();
    selectItem(how === 'added' ? null : it);
    toast('That spot would block the way through a door or into a room, so it was put back.');
    return;
  }
  it._prev = { x: it.x, y: it.y, dir: it.dir };
  state.P = P2;
  buildFurniture();
  buildRoutes();
  updateRouteText();
  if (how !== 'removed') {
    const fresh = state.placed.find(x => x === it);
    if (fresh) selectItem(fresh);
  } else selectItem(null);
  resetSim(state.sim ? Math.min(state.sim.now, 90) : 0);
  toast(PLACE_NAMES[it.kind] + ' ' + how + '. Walking routes now go around it, and the day restarted.');
  afterFurnitureChange(it, how);
}
export function rotateSelected(): void {
  const it = state.selected;
  if (state.placing) {
    state.ghostRot = (state.ghostRot + 1) % 4;
    const R = r3();
    if (R.ghostItem) {
      R.ghostItem.dir = DIRS[state.ghostRot];
      (R.ghost as THREE.Group).rotation.y = yawOf(R.ghostItem.dir.x, R.ghostItem.dir.y);
    }
    return;
  }
  if (!it) return;
  it._prev = { x: it.x, y: it.y, dir: it.dir };
  const i = DIRS.findIndex(d => d.x === it.dir.x && d.y === it.dir.y);
  it.dir = DIRS[(i + 1) % 4];
  positionPlaced(it);
  commitPlaced(it, 'rotated');
}
export function removeSelected(): void {
  const it = state.selected;
  if (!it) return;
  state.placed = state.placed.filter(x => x !== it);
  selectItem(null);
  commitPlaced(it, 'removed');
}
