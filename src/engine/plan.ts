/* Plan adapter (plan.json v0.1 to the internal model), the sample layouts and door helpers. */
import type { Door, LayoutSpec, Model, Orient, PlanJson, PlanJsonDoor, PlanJsonRoom, Room, Vec } from './types';

export const ZONE_OF: Record<string, string> = {
  waiting: 'public',
  reception: 'public',
  restroom: 'public',
  exam_room: 'clinical',
  procedure_room: 'clinical',
  nurse_station: 'clinical',
  lab: 'clinical',
  provider_office: 'staff',
  staff_lounge: 'staff',
  clean_utility: 'support',
  soiled_utility: 'support',
  storage: 'support',
  corridor: 'circulation'
};
export const TYPE_NAME: Record<string, string> = {
  exam_room: 'Exam',
  procedure_room: 'Procedure',
  nurse_station: 'Nurse station',
  provider_office: 'Provider office',
  staff_lounge: 'Staff lounge',
  clean_utility: 'Clean utility',
  soiled_utility: 'Soiled utility',
  restroom: 'Restroom',
  waiting: 'Waiting',
  reception: 'Reception',
  storage: 'Storage',
  lab: 'Lab',
  corridor: 'Corridor'
};
export function prettyLabel(id: string | undefined, type: string | undefined): string {
  const m = /_(\d+)$/.exec(id || '');
  const base = TYPE_NAME[type as string] || String(type || 'Room').replace(/_/g, ' ');
  return ['exam_room', 'restroom', 'procedure_room'].includes(type as string) && m ? base + ' ' + m[1] : base;
}

/* Three hand-made candidate layouts for a 24 m × 10.2 m clinic with a central corridor. */
export const SAMPLE_SPECS: Record<string, LayoutSpec> = {
  A: {
    name: 'Layout A',
    blurb: 'Lobby in the middle, nurse station across from the waiting room',
    facade: 'south',
    south: [
      ['exam_room_1', 'exam_room', 2.7],
      ['exam_room_2', 'exam_room', 2.7],
      ['exam_room_3', 'exam_room', 2.7],
      ['restroom_1', 'restroom', 2.1],
      ['waiting_1', 'waiting', 6.6],
      ['reception_1', 'reception', 3.0],
      ['lab_1', 'lab', 2.4],
      ['storage_1', 'storage', 1.8]
    ],
    north: [
      ['staff_lounge_1', 'staff_lounge', 3.6],
      ['provider_office_1', 'provider_office', 3.0],
      ['exam_room_4', 'exam_room', 2.7],
      ['exam_room_5', 'exam_room', 2.7],
      ['nurse_station_1', 'nurse_station', 3.0],
      ['clean_utility_1', 'clean_utility', 2.1],
      ['soiled_utility_1', 'soiled_utility', 2.1],
      ['restroom_2', 'restroom', 2.1],
      ['exam_room_6', 'exam_room', 2.7]
    ]
  },
  B: {
    name: 'Layout B',
    blurb: 'Lobby at the west end, exam rooms grouped at the far east end',
    facade: 'west',
    south: [
      ['waiting_1', 'waiting', 6.6],
      ['reception_1', 'reception', 3.0],
      ['restroom_1', 'restroom', 2.1],
      ['storage_1', 'storage', 1.8],
      ['exam_room_1', 'exam_room', 2.7],
      ['exam_room_2', 'exam_room', 2.7],
      ['exam_room_3', 'exam_room', 2.7],
      ['lab_1', 'lab', 2.4]
    ],
    north: [
      ['staff_lounge_1', 'staff_lounge', 3.6],
      ['provider_office_1', 'provider_office', 3.0],
      ['nurse_station_1', 'nurse_station', 3.0],
      ['clean_utility_1', 'clean_utility', 2.1],
      ['soiled_utility_1', 'soiled_utility', 2.1],
      ['restroom_2', 'restroom', 2.1],
      ['exam_room_4', 'exam_room', 2.7],
      ['exam_room_5', 'exam_room', 2.7],
      ['exam_room_6', 'exam_room', 2.7]
    ]
  },
  C: {
    name: 'Layout C',
    blurb: 'Lobby in the middle, nurse station surrounded by the exam rooms',
    facade: 'south',
    south: [
      ['lab_1', 'lab', 2.4],
      ['staff_lounge_1', 'staff_lounge', 3.6],
      ['provider_office_1', 'provider_office', 3.0],
      ['restroom_1', 'restroom', 2.1],
      ['waiting_1', 'waiting', 7.2],
      ['reception_1', 'reception', 3.0],
      ['exam_room_1', 'exam_room', 2.7]
    ],
    north: [
      ['storage_1', 'storage', 1.8],
      ['clean_utility_1', 'clean_utility', 2.1],
      ['soiled_utility_1', 'soiled_utility', 2.1],
      ['restroom_2', 'restroom', 2.1],
      ['exam_room_2', 'exam_room', 2.7],
      ['exam_room_3', 'exam_room', 2.7],
      ['nurse_station_1', 'nurse_station', 2.4],
      ['exam_room_4', 'exam_room', 2.7],
      ['exam_room_5', 'exam_room', 2.7],
      ['exam_room_6', 'exam_room', 2.7]
    ]
  }
};

interface SpecJsonRoom extends PlanJsonRoom {
  id: string;
  type: string;
  rect: { x_mm: number; y_mm: number; w_mm: number; h_mm: number };
}

/* Builds a plan.json v0.1 document (the format assumed from Module 1). */
export function makeSamplePlan(key: string): PlanJson {
  return makePlanFromSpec(SAMPLE_SPECS[key]);
}
export function makePlanFromSpec(s: LayoutSpec): PlanJson {
  const W = 24.0,
    D = 10.2,
    ys = 4.2,
    yn = 6.0;
  const mm = (v: number): number => Math.round(v * 1000);
  const rooms: SpecJsonRoom[] = [],
    doors: PlanJsonDoor[] = [];
  const place = (list: LayoutSpec['south'], y0: number, y1: number): void => {
    let x = 0;
    for (const [id, type, w] of list) {
      rooms.push({
        id,
        type,
        label: prettyLabel(id, type),
        zone: ZONE_OF[type],
        rect: { x_mm: mm(x), y_mm: mm(y0), w_mm: mm(w), h_mm: mm(y1 - y0) }
      });
      x += w;
    }
  };
  place(s.south, 0, ys);
  place(s.north, yn, D);
  rooms.push({
    id: 'corridor_1',
    type: 'corridor',
    label: 'Corridor',
    zone: 'circulation',
    rect: { x_mm: 0, y_mm: mm(ys), w_mm: mm(W), h_mm: mm(yn - ys) }
  });
  let n = 1;
  for (const r of rooms) {
    if (r.type === 'corridor') continue;
    const cx = r.rect.x_mm + r.rect.w_mm / 2,
      cy = r.rect.y_mm === 0 ? mm(ys) : mm(yn);
    doors.push({
      id: 'door_' + n++,
      kind: 'door',
      connects: [r.id, 'corridor_1'],
      center_mm: [cx, cy],
      width_mm: 915,
      is_entrance: false
    });
  }
  const waiting = rooms.find(r => r.type === 'waiting') as SpecJsonRoom,
    rec = rooms.find(r => r.type === 'reception') as SpecJsonRoom;
  const sharedX = rec.rect.x_mm === waiting.rect.x_mm + waiting.rect.w_mm ? rec.rect.x_mm : waiting.rect.x_mm;
  doors.push({
    id: 'door_' + n++,
    kind: 'opening',
    connects: [rec.id, waiting.id],
    center_mm: [sharedX, mm(ys / 2)],
    width_mm: 1800,
    is_entrance: false
  });
  const ent = s.facade === 'west' ? [0, mm(ys / 2)] : [waiting.rect.x_mm + waiting.rect.w_mm / 2, 0];
  doors.push({
    // eslint-disable-next-line no-useless-assignment -- kept as in the reference
    id: 'door_' + n++,
    kind: 'door',
    connects: [waiting.id, 'exterior'],
    center_mm: ent,
    width_mm: 1800,
    is_entrance: true
  });
  return {
    schema_version: '0.1',
    units: 'mm',
    origin: 'bottom-left; x = east, y = north',
    building_type: 'clinic',
    name: s.name,
    blurb: s.blurb,
    footprint: { width_mm: mm(W), depth_mm: mm(D) },
    rooms,
    doors,
    provenance: { intent_source: 'hand-made sample for the preview' }
  };
}

/* Adapter: plan.json v0.1 to the internal model in metres. When the real Module 1 format arrives, only this changes. */
export function adaptPlan(json: PlanJson): Model {
  if (!json || typeof json !== 'object' || !Array.isArray(json.rooms) || !json.rooms.length)
    throw new Error('it has no "rooms" list');
  const rooms: Room[] = json.rooms.map((r, k) => {
    let x: number, y: number, w: number, h: number;
    if (r.rect) {
      x = r.rect.x_mm / 1000;
      y = r.rect.y_mm / 1000;
      w = r.rect.w_mm / 1000;
      h = r.rect.h_mm / 1000;
    } else if (Array.isArray(r.polygon_mm) && r.polygon_mm.length >= 3) {
      const xs = r.polygon_mm.map(p => p[0] / 1000),
        ys = r.polygon_mm.map(p => p[1] / 1000);
      x = Math.min(...xs);
      y = Math.min(...ys);
      w = Math.max(...xs) - x;
      h = Math.max(...ys) - y;
    } else throw new Error('room ' + (r.id || k + 1) + ' has neither "rect" nor "polygon_mm"');
    if (!(w > 0 && h > 0)) throw new Error('room ' + (r.id || k + 1) + ' has no area');
    const type = r.type || 'room',
      id = String(r.id || 'room_' + (k + 1));
    return {
      id,
      type,
      label: r.label || prettyLabel(id, type),
      zone: r.zone || ZONE_OF[type] || 'support',
      x,
      y,
      w,
      h
    };
  });
  const W =
    json.footprint && json.footprint.width_mm ? json.footprint.width_mm / 1000 : Math.max(...rooms.map(r => r.x + r.w));
  const D =
    json.footprint && json.footprint.depth_mm ? json.footprint.depth_mm / 1000 : Math.max(...rooms.map(r => r.y + r.h));
  let doors: Door[] = (json.doors || [])
    .filter(d => Array.isArray(d.center_mm))
    .map((d, k) => {
      const c = d.connects || [];
      const center = d.center_mm as number[];
      return {
        id: String(d.id || 'door_' + (k + 1)),
        a: c[0],
        b: c[1],
        kind: d.kind || 'door',
        cx: center[0] / 1000,
        cy: center[1] / 1000,
        width: (d.width_mm || 915) / 1000,
        isEntrance: !!d.is_entrance || c[0] === 'exterior' || c[1] === 'exterior'
      };
    });
  if (!doors.length) doors = inferDoors(rooms);
  const model: Model = {
    name: json.name || 'Your plan',
    blurb: json.blurb || '',
    W,
    D,
    rooms,
    doors,
    inferredDoors: !(json.doors || []).length
  };
  for (const d of doors) d.orient = doorOrient(d, model);
  if (!doors.some(d => d.isEntrance)) doors.push(makeEntrance(model));
  return model;
}
export function doorOrient(d: { cx: number; cy: number }, m: Model): Orient {
  const tol = 0.05;
  if (Math.abs(d.cy) < tol || Math.abs(d.cy - m.D) < tol) return 'h';
  if (Math.abs(d.cx) < tol || Math.abs(d.cx - m.W) < tol) return 'v';
  for (const r of m.rooms) {
    const inX = d.cx > r.x - tol && d.cx < r.x + r.w + tol,
      inY = d.cy > r.y - tol && d.cy < r.y + r.h + tol;
    if (inX && (Math.abs(d.cy - r.y) < tol || Math.abs(d.cy - (r.y + r.h)) < tol)) return 'h';
    if (inY && (Math.abs(d.cx - r.x) < tol || Math.abs(d.cx - (r.x + r.w)) < tol)) return 'v';
  }
  return 'h';
}
interface Edge {
  cx: number;
  cy: number;
  len: number;
  b?: string;
}
export function sharedEdge(a: Room, b: Room): Edge | null {
  const tol = 0.05;
  if (Math.abs(a.x + a.w - b.x) < tol || Math.abs(b.x + b.w - a.x) < tol) {
    const x = Math.abs(a.x + a.w - b.x) < tol ? b.x : a.x;
    const y0 = Math.max(a.y, b.y),
      y1 = Math.min(a.y + a.h, b.y + b.h);
    if (y1 - y0 > tol) return { cx: x, cy: (y0 + y1) / 2, len: y1 - y0 };
  }
  if (Math.abs(a.y + a.h - b.y) < tol || Math.abs(b.y + b.h - a.y) < tol) {
    const y = Math.abs(a.y + a.h - b.y) < tol ? b.y : a.y;
    const x0 = Math.max(a.x, b.x),
      x1 = Math.min(a.x + a.w, b.x + b.w);
    if (x1 - x0 > tol) return { cx: (x0 + x1) / 2, cy: y, len: x1 - x0 };
  }
  return null;
}
export function inferDoors(rooms: Room[]): Door[] {
  const doors: Door[] = [],
    corr = rooms.filter(r => r.type === 'corridor' || r.zone === 'circulation');
  let n = 1;
  for (const r of rooms) {
    if (corr.includes(r)) continue;
    let best: Edge | null = null;
    for (const c of corr) {
      const e = sharedEdge(r, c);
      if (e && e.len >= 1.2 && (!best || e.len > best.len)) best = Object.assign(e, { b: c.id });
    }
    if (!best)
      for (const o of rooms) {
        if (o === r) continue;
        const e = sharedEdge(r, o);
        if (e && e.len >= 1.2 && (!best || e.len > best.len)) best = Object.assign(e, { b: o.id });
      }
    if (best)
      doors.push({
        id: 'door_' + n++,
        a: r.id,
        b: best.b as string,
        kind: 'door',
        cx: best.cx,
        cy: best.cy,
        width: 0.915,
        isEntrance: false
      });
  }
  return doors;
}
export function makeEntrance(m: Model): Door {
  const r = m.rooms.find(q => q.type === 'waiting') || m.rooms[0],
    tol = 0.05;
  let p: { cx: number; cy: number; orient: Orient };
  if (r.y < tol) p = { cx: r.x + r.w / 2, cy: 0, orient: 'h' };
  else if (Math.abs(r.y + r.h - m.D) < tol) p = { cx: r.x + r.w / 2, cy: m.D, orient: 'h' };
  else if (r.x < tol) p = { cx: 0, cy: r.y + r.h / 2, orient: 'v' };
  else p = { cx: m.W, cy: r.y + r.h / 2, orient: 'v' };
  return Object.assign({ id: 'entrance', a: r.id, b: 'exterior', kind: 'door', width: 1.8, isEntrance: true }, p);
}
/* The direction from an outside door into the building. Moved here from view.js: used by the 2D plan and the 3D view. */
export function inwardDir(d: { cx: number; cy: number }, m: Model): Vec {
  if (Math.abs(d.cy) < 0.05) return { x: 0, y: 1 };
  if (Math.abs(d.cy - m.D) < 0.05) return { x: 0, y: -1 };
  if (Math.abs(d.cx) < 0.05) return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}
