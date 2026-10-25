/* ENGINE:BEGIN (plan adapter, furniture planner, walkable grid, routes, day simulation; no DOM, no three.js) */
const CELL = 0.3;
const ZONE_OF = {
  waiting: 'public', reception: 'public', restroom: 'public',
  exam_room: 'clinical', procedure_room: 'clinical', nurse_station: 'clinical', lab: 'clinical',
  provider_office: 'staff', staff_lounge: 'staff',
  clean_utility: 'support', soiled_utility: 'support', storage: 'support',
  corridor: 'circulation'
};
const TYPE_NAME = {
  exam_room: 'Exam', procedure_room: 'Procedure', nurse_station: 'Nurse station', provider_office: 'Provider office',
  staff_lounge: 'Staff lounge', clean_utility: 'Clean utility', soiled_utility: 'Soiled utility', restroom: 'Restroom',
  waiting: 'Waiting', reception: 'Reception', storage: 'Storage', lab: 'Lab', corridor: 'Corridor'
};
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function prettyLabel(id, type) {
  const m = /_(\d+)$/.exec(id || '');
  const base = TYPE_NAME[type] || String(type || 'Room').replace(/_/g, ' ');
  return ['exam_room', 'restroom', 'procedure_room'].includes(type) && m ? base + ' ' + m[1] : base;
}

/* Three hand-made candidate layouts for a 24 m × 10.2 m clinic with a central corridor. */
const SAMPLE_SPECS = {
  A: {
    name: 'Layout A', blurb: 'Lobby in the middle, nurse station across from the waiting room', facade: 'south',
    south: [['exam_room_1', 'exam_room', 2.7], ['exam_room_2', 'exam_room', 2.7], ['exam_room_3', 'exam_room', 2.7], ['restroom_1', 'restroom', 2.1], ['waiting_1', 'waiting', 6.6], ['reception_1', 'reception', 3.0], ['lab_1', 'lab', 2.4], ['storage_1', 'storage', 1.8]],
    north: [['staff_lounge_1', 'staff_lounge', 3.6], ['provider_office_1', 'provider_office', 3.0], ['exam_room_4', 'exam_room', 2.7], ['exam_room_5', 'exam_room', 2.7], ['nurse_station_1', 'nurse_station', 3.0], ['clean_utility_1', 'clean_utility', 2.1], ['soiled_utility_1', 'soiled_utility', 2.1], ['restroom_2', 'restroom', 2.1], ['exam_room_6', 'exam_room', 2.7]]
  },
  B: {
    name: 'Layout B', blurb: 'Lobby at the west end, exam rooms grouped at the far east end', facade: 'west',
    south: [['waiting_1', 'waiting', 6.6], ['reception_1', 'reception', 3.0], ['restroom_1', 'restroom', 2.1], ['storage_1', 'storage', 1.8], ['exam_room_1', 'exam_room', 2.7], ['exam_room_2', 'exam_room', 2.7], ['exam_room_3', 'exam_room', 2.7], ['lab_1', 'lab', 2.4]],
    north: [['staff_lounge_1', 'staff_lounge', 3.6], ['provider_office_1', 'provider_office', 3.0], ['nurse_station_1', 'nurse_station', 3.0], ['clean_utility_1', 'clean_utility', 2.1], ['soiled_utility_1', 'soiled_utility', 2.1], ['restroom_2', 'restroom', 2.1], ['exam_room_4', 'exam_room', 2.7], ['exam_room_5', 'exam_room', 2.7], ['exam_room_6', 'exam_room', 2.7]]
  },
  C: {
    name: 'Layout C', blurb: 'Lobby in the middle, nurse station surrounded by the exam rooms', facade: 'south',
    south: [['lab_1', 'lab', 2.4], ['staff_lounge_1', 'staff_lounge', 3.6], ['provider_office_1', 'provider_office', 3.0], ['restroom_1', 'restroom', 2.1], ['waiting_1', 'waiting', 7.2], ['reception_1', 'reception', 3.0], ['exam_room_1', 'exam_room', 2.7]],
    north: [['storage_1', 'storage', 1.8], ['clean_utility_1', 'clean_utility', 2.1], ['soiled_utility_1', 'soiled_utility', 2.1], ['restroom_2', 'restroom', 2.1], ['exam_room_2', 'exam_room', 2.7], ['exam_room_3', 'exam_room', 2.7], ['nurse_station_1', 'nurse_station', 2.4], ['exam_room_4', 'exam_room', 2.7], ['exam_room_5', 'exam_room', 2.7], ['exam_room_6', 'exam_room', 2.7]]
  }
};

/* Builds a plan.json v0.1 document (the format assumed from Module 1). */
function makeSamplePlan(key) { return makePlanFromSpec(SAMPLE_SPECS[key]); }
function makePlanFromSpec(s) {
  const W = 24.0, D = 10.2, ys = 4.2, yn = 6.0;
  const mm = v => Math.round(v * 1000);
  const rooms = [], doors = [];
  const place = (list, y0, y1) => {
    let x = 0;
    for (const [id, type, w] of list) {
      rooms.push({ id, type, label: prettyLabel(id, type), zone: ZONE_OF[type], rect: { x_mm: mm(x), y_mm: mm(y0), w_mm: mm(w), h_mm: mm(y1 - y0) } });
      x += w;
    }
  };
  place(s.south, 0, ys);
  place(s.north, yn, D);
  rooms.push({ id: 'corridor_1', type: 'corridor', label: 'Corridor', zone: 'circulation', rect: { x_mm: 0, y_mm: mm(ys), w_mm: mm(W), h_mm: mm(yn - ys) } });
  let n = 1;
  for (const r of rooms) {
    if (r.type === 'corridor') continue;
    const cx = r.rect.x_mm + r.rect.w_mm / 2, cy = r.rect.y_mm === 0 ? mm(ys) : mm(yn);
    doors.push({ id: 'door_' + n++, kind: 'door', connects: [r.id, 'corridor_1'], center_mm: [cx, cy], width_mm: 915, is_entrance: false });
  }
  const waiting = rooms.find(r => r.type === 'waiting'), rec = rooms.find(r => r.type === 'reception');
  const sharedX = rec.rect.x_mm === waiting.rect.x_mm + waiting.rect.w_mm ? rec.rect.x_mm : waiting.rect.x_mm;
  doors.push({ id: 'door_' + n++, kind: 'opening', connects: [rec.id, waiting.id], center_mm: [sharedX, mm(ys / 2)], width_mm: 1800, is_entrance: false });
  const ent = s.facade === 'west' ? [0, mm(ys / 2)] : [waiting.rect.x_mm + waiting.rect.w_mm / 2, 0];
  doors.push({ id: 'door_' + n++, kind: 'door', connects: [waiting.id, 'exterior'], center_mm: ent, width_mm: 1800, is_entrance: true });
  return {
    schema_version: '0.1', units: 'mm', origin: 'bottom-left; x = east, y = north', building_type: 'clinic',
    name: s.name, blurb: s.blurb, footprint: { width_mm: mm(W), depth_mm: mm(D) }, rooms, doors,
    provenance: { intent_source: 'hand-made sample for the preview' }
  };
}

/* Adapter: plan.json v0.1 to the internal model in metres. When the real Module 1 format arrives, only this changes. */
function adaptPlan(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.rooms) || !json.rooms.length) throw new Error('it has no "rooms" list');
  const rooms = json.rooms.map((r, k) => {
    let x, y, w, h;
    if (r.rect) { x = r.rect.x_mm / 1000; y = r.rect.y_mm / 1000; w = r.rect.w_mm / 1000; h = r.rect.h_mm / 1000; }
    else if (Array.isArray(r.polygon_mm) && r.polygon_mm.length >= 3) {
      const xs = r.polygon_mm.map(p => p[0] / 1000), ys = r.polygon_mm.map(p => p[1] / 1000);
      x = Math.min(...xs); y = Math.min(...ys); w = Math.max(...xs) - x; h = Math.max(...ys) - y;
    } else throw new Error('room ' + (r.id || k + 1) + ' has neither "rect" nor "polygon_mm"');
    if (!(w > 0 && h > 0)) throw new Error('room ' + (r.id || k + 1) + ' has no area');
    const type = r.type || 'room', id = String(r.id || 'room_' + (k + 1));
    return { id, type, label: r.label || prettyLabel(id, type), zone: r.zone || ZONE_OF[type] || 'support', x, y, w, h };
  });
  const W = json.footprint && json.footprint.width_mm ? json.footprint.width_mm / 1000 : Math.max(...rooms.map(r => r.x + r.w));
  const D = json.footprint && json.footprint.depth_mm ? json.footprint.depth_mm / 1000 : Math.max(...rooms.map(r => r.y + r.h));
  let doors = (json.doors || []).filter(d => Array.isArray(d.center_mm)).map((d, k) => {
    const c = d.connects || [];
    return {
      id: String(d.id || 'door_' + (k + 1)), a: c[0], b: c[1], kind: d.kind || 'door',
      cx: d.center_mm[0] / 1000, cy: d.center_mm[1] / 1000, width: (d.width_mm || 915) / 1000,
      isEntrance: !!d.is_entrance || c[0] === 'exterior' || c[1] === 'exterior'
    };
  });
  if (!doors.length) doors = inferDoors(rooms);
  const model = { name: json.name || 'Your plan', blurb: json.blurb || '', W, D, rooms, doors, inferredDoors: !(json.doors || []).length };
  for (const d of doors) d.orient = doorOrient(d, model);
  if (!doors.some(d => d.isEntrance)) doors.push(makeEntrance(model));
  return model;
}
function doorOrient(d, m) {
  const tol = 0.05;
  if (Math.abs(d.cy) < tol || Math.abs(d.cy - m.D) < tol) return 'h';
  if (Math.abs(d.cx) < tol || Math.abs(d.cx - m.W) < tol) return 'v';
  for (const r of m.rooms) {
    const inX = d.cx > r.x - tol && d.cx < r.x + r.w + tol, inY = d.cy > r.y - tol && d.cy < r.y + r.h + tol;
    if (inX && (Math.abs(d.cy - r.y) < tol || Math.abs(d.cy - (r.y + r.h)) < tol)) return 'h';
    if (inY && (Math.abs(d.cx - r.x) < tol || Math.abs(d.cx - (r.x + r.w)) < tol)) return 'v';
  }
  return 'h';
}
function sharedEdge(a, b) {
  const tol = 0.05;
  if (Math.abs(a.x + a.w - b.x) < tol || Math.abs(b.x + b.w - a.x) < tol) {
    const x = Math.abs(a.x + a.w - b.x) < tol ? b.x : a.x;
    const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (y1 - y0 > tol) return { cx: x, cy: (y0 + y1) / 2, len: y1 - y0 };
  }
  if (Math.abs(a.y + a.h - b.y) < tol || Math.abs(b.y + b.h - a.y) < tol) {
    const y = Math.abs(a.y + a.h - b.y) < tol ? b.y : a.y;
    const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
    if (x1 - x0 > tol) return { cx: (x0 + x1) / 2, cy: y, len: x1 - x0 };
  }
  return null;
}
function inferDoors(rooms) {
  const doors = [], corr = rooms.filter(r => r.type === 'corridor' || r.zone === 'circulation');
  let n = 1;
  for (const r of rooms) {
    if (corr.includes(r)) continue;
    let best = null;
    for (const c of corr) { const e = sharedEdge(r, c); if (e && e.len >= 1.2 && (!best || e.len > best.len)) best = Object.assign(e, { b: c.id }); }
    if (!best) for (const o of rooms) { if (o === r) continue; const e = sharedEdge(r, o); if (e && e.len >= 1.2 && (!best || e.len > best.len)) best = Object.assign(e, { b: o.id }); }
    if (best) doors.push({ id: 'door_' + n++, a: r.id, b: best.b, kind: 'door', cx: best.cx, cy: best.cy, width: 0.915, isEntrance: false });
  }
  return doors;
}
function makeEntrance(m) {
  const r = m.rooms.find(q => q.type === 'waiting') || m.rooms[0], tol = 0.05;
  let p;
  if (r.y < tol) p = { cx: r.x + r.w / 2, cy: 0, orient: 'h' };
  else if (Math.abs(r.y + r.h - m.D) < tol) p = { cx: r.x + r.w / 2, cy: m.D, orient: 'h' };
  else if (r.x < tol) p = { cx: 0, cy: r.y + r.h / 2, orient: 'v' };
  else p = { cx: m.W, cy: r.y + r.h / 2, orient: 'v' };
  return Object.assign({ id: 'entrance', a: r.id, b: 'exterior', kind: 'door', width: 1.8, isEntrance: true }, p);
}

/* ---------- Furniture planner: what goes in each room, where people sit or stand, and what blocks walking ---------- */
const ITEM_SIZE = {
  chair: [0.5, 0.5, 1], examTable: [0.72, 1.9, 1], stool: [0.42, 0.42, 0], casework: [2.0, 0.6, 1], desk: [1.2, 0.6, 1],
  counter: [2.6, 0.65, 1], workstation: [2.6, 0.7, 1], sinkCounter: [1.8, 0.6, 1], shelf: [2.6, 0.42, 1], toilet: [0.42, 0.68, 1],
  basin: [0.55, 0.45, 1], table: [1.2, 0.8, 1], kitchenette: [2.2, 0.62, 1], fridge: [0.62, 0.66, 1], plant: [0.45, 0.45, 1],
  rug: [2.4, 1.5, 0], cabinet: [1.0, 0.45, 1], drawChair: [0.7, 0.85, 1], bin: [0.4, 0.4, 1], bed: [0.98, 2.12, 1],
  screen: [1.4, 0.35, 1], fileCabinet: [0.5, 0.6, 1], hamper: [0.5, 0.5, 1], procTable: [0.8, 2.0, 1], cart: [0.55, 0.85, 1]
};
const PLACEABLE = ['bed', 'chair', 'desk', 'plant', 'cabinet', 'screen'];
function itemRect(it) {
  const alongX = Math.abs(it.dir.x) > 0.5;
  const ex = (alongX ? it.d : it.w) / 2, ey = (alongX ? it.w : it.d) / 2;
  return { x0: it.x - ex, x1: it.x + ex, y0: it.y - ey, y1: it.y + ey };
}
function rectsOverlap(a, b, pad) { pad = pad || 0; return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad; }
function roomDoors(m, r) {
  const tol = 0.06;
  return m.doors.filter(d => {
    const onX = d.cx > r.x - tol && d.cx < r.x + r.w + tol, onY = d.cy > r.y - tol && d.cy < r.y + r.h + tol;
    if (d.orient === 'h') return onX && (Math.abs(d.cy - r.y) < tol || Math.abs(d.cy - (r.y + r.h)) < tol);
    return onY && (Math.abs(d.cx - r.x) < tol || Math.abs(d.cx - (r.x + r.w)) < tol);
  });
}
function doorZone(d, r) {
  const half = d.width / 2 + 0.38, depth = 1.15;
  if (d.orient === 'h') {
    const inside = Math.abs(d.cy - r.y) < 0.06 ? [r.y, r.y + depth] : [r.y + r.h - depth, r.y + r.h];
    return { x0: d.cx - half, x1: d.cx + half, y0: inside[0], y1: inside[1] };
  }
  const inside = Math.abs(d.cx - r.x) < 0.06 ? [r.x, r.x + depth] : [r.x + r.w - depth, r.x + r.w];
  return { x0: inside[0], x1: inside[1], y0: d.cy - half, y1: d.cy + half };
}
/* Room frame: u runs along the main door wall (to the right when looking in), v runs from that wall into the room. */
function roomFrame(r, door) {
  let side = 'S';
  if (door) {
    const t = 0.06;
    if (door.orient === 'h') side = Math.abs(door.cy - r.y) < t ? 'S' : 'N';
    else side = Math.abs(door.cx - r.x) < t ? 'W' : 'E';
  }
  const F = {
    S: { f: [0, 1], rt: [1, 0], o: [r.x, r.y], U: r.w, V: r.h },
    N: { f: [0, -1], rt: [-1, 0], o: [r.x + r.w, r.y + r.h], U: r.w, V: r.h },
    W: { f: [1, 0], rt: [0, -1], o: [r.x, r.y + r.h], U: r.h, V: r.w },
    E: { f: [-1, 0], rt: [0, 1], o: [r.x + r.w, r.y], U: r.h, V: r.w }
  }[side];
  const pt = (u, v) => ({ x: F.o[0] + F.rt[0] * u + F.f[0] * v, y: F.o[1] + F.rt[1] * u + F.f[1] * v });
  const dir = (du, dv) => { const x = F.rt[0] * du + F.f[0] * dv, y = F.rt[1] * du + F.f[1] * dv, L = Math.hypot(x, y) || 1; return { x: x / L, y: y / L }; };
  const doorU = door ? F.rt[0] * (door.cx - F.o[0]) + F.rt[1] * (door.cy - F.o[1]) : F.U / 2;
  return { side, U: F.U, V: F.V, pt, dir, doorU };
}
function snapDir(d) { return Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) || 1 }; }
function planFurniture(m) {
  const items = [], spots = { seats: [], exams: {}, nurseHomes: [], officeHomes: [] };
  m.rooms.forEach((r, k) => {
    const doors = roomDoors(m, r);
    const zones = doors.map(d => doorZone(d, r));
    const mainDoor = doors.find(d => d.a === 'corridor_1' || d.b === 'corridor_1' || (m.rooms.find(q => q.id === (d.a === r.id ? d.b : d.a)) || {}).type === 'corridor') || doors.find(d => !d.isEntrance) || doors[0];
    const F = roomFrame(r, mainDoor);
    const mine = [];
    const add = (kind, p, dir, opts) => {
      const sz = ITEM_SIZE[kind] || [0.5, 0.5, 1];
      const it = Object.assign({ kind, room: k, x: p.x, y: p.y, dir: snapDir(dir), look: dir, w: sz[0], d: sz[1], block: !!sz[2] }, opts || {});
      const R = itemRect(it);
      if (R.x0 < r.x - 0.01 || R.x1 > r.x + r.w + 0.01 || R.y0 < r.y - 0.01 || R.y1 > r.y + r.h + 0.01) return null;
      if (it.block && !it.allowDoorZone && zones.some(z => rectsOverlap(z, R))) return null;
      if (it.block && mine.some(o => o.block && rectsOverlap(itemRect(o), R, -0.02))) return null;
      mine.push(it); items.push(it);
      return it;
    };
    const place = (kind, u, v, du, dv, opts) => add(kind, F.pt(u, v), F.dir(du, dv), opts);
    const U = F.U, V = F.V;
    const spot = (u, v, du, dv, pose, h, au, av) => {
      const p = F.pt(u, v), a = F.pt(au == null ? u : au, av == null ? v : av);
      return { x: p.x, y: p.y, dir: F.dir(du, dv), pose, h: h || 0, ax: a.x, ay: a.y, room: k };
    };
    if (r.type === 'exam_room' && U >= 2.2 && V >= 3.2) {
      const right = F.doorU <= U / 2, s = right ? 1 : -1;
      const tU = right ? U - 0.5 : 0.5, tV = V - 1.2, aisle = tU - s * 0.95;
      const table = place('examTable', tU, tV, 0, 1);
      place('casework', right ? 0.32 : U - 0.32, V - 1.15, s, 0, { w: Math.min(2.0, V - 2.2), sink: true, monitor: true });
      place('chair', right ? 0.38 : U - 0.38, 1.5, s, 0, { tone: 'guest' });
      if (table) {
        place('stool', aisle - s * 0.05, tV + 0.55, s, -0.45);
        spots.exams[r.id] = {
          patient: spot(tU - s * 0.16, tV - 0.15, -s, 0, 'sit', 0.8, aisle + s * 0.05, tV - 0.15),
          nurse: spot(aisle - s * 0.05, tV - 0.85, s, 0.35, 'stand', 0),
          provider: spot(aisle - s * 0.05, tV + 0.55, s, -0.45, 'sit', 0.55)
        };
      }
    } else if (r.type === 'procedure_room' && U >= 3.0 && V >= 3.4) {
      place('procTable', U / 2, V / 2 + 0.2, 0, 1);
      place('sinkCounter', U / 2, V - 0.3, 0, -1, { w: Math.min(2.4, U - 0.4) });
      place('cart', 0.4, V / 2, 1, 0);
      place('stool', U / 2 - 0.85, V / 2, 1, 0);
    } else if (r.type === 'nurse_station' || r.type === 'provider_office') {
      const w = Math.min(U - 0.2, 2.9), n = clamp(Math.floor(w / 0.9), 1, 3);
      const desk = place('workstation', U / 2, V - 0.35, 0, -1, { w, seats: n });
      if (desk) for (let q = 0; q < n; q++) {
        const u = U / 2 + (q - (n - 1) / 2) * (w / n);
        place('chair', u, V - 1.0, 0, 1, { tone: 'task' });
        (r.type === 'nurse_station' ? spots.nurseHomes : spots.officeHomes).push(spot(u, V - 1.0, 0, 1, 'sit', 0.46, u, V - 1.55));
      }
      const far = F.doorU < U / 2 ? U - 0.23 : 0.23;
      place(r.type === 'nurse_station' ? 'cabinet' : 'shelf', far, 1.95, F.doorU < U / 2 ? -1 : 1, 0, { w: 1.2, tall: true });
      place('plant', F.doorU < U / 2 ? 0.3 : U - 0.3, V - 1.75, 0, 1);
    } else if (r.type === 'staff_lounge') {
      const kitchenRight = F.doorU < U / 2, kU = kitchenRight ? U - 0.31 : 0.31, kw = Math.min(2.4, V - 1.65);
      place('kitchenette', kU, V - 0.08 - kw / 2, kitchenRight ? -1 : 1, 0, { w: kw });
      place('fridge', kitchenRight ? U - 0.34 : 0.34, V - 0.12 - kw - 0.33, kitchenRight ? -1 : 1, 0);
      const tU = kitchenRight ? (U - 0.62) / 2 : 0.62 + (U - 0.62) / 2, tV = V - 1.45;
      place('table', tU, tV, 1, 0);
      for (const [du, dv] of [[-0.36, -0.62], [0.36, -0.62], [-0.36, 0.62], [0.36, 0.62]]) place('chair', tU + du, tV + dv, 0, dv < 0 ? 1 : -1, { tone: 'cafe', block: false });
      place('plant', kitchenRight ? 0.3 : U - 0.3, 1.45, 0, 1);
    } else if (r.type === 'restroom') {
      place('toilet', U / 2, V - 0.36, 0, -1);
      place('basin', 0.25, Math.max(1.4, V - 1.6), 1, 0);
      place('bin', U - 0.25, Math.max(1.3, V - 1.9), -1, 0, { block: false });
    } else if (r.type === 'clean_utility' || r.type === 'storage') {
      const len = V - 1.3;
      if (len > 1) {
        place('shelf', 0.21, 1.25 + len / 2, 1, 0, { w: len, tall: true });
        place('shelf', U - 0.21, 1.25 + len / 2, -1, 0, { w: len, tall: true });
      }
    } else if (r.type === 'soiled_utility') {
      place('sinkCounter', U / 2, V - 0.3, 0, -1, { w: Math.min(U - 0.2, 2.0) });
      place('hamper', 0.3, V - 1.4, 1, 0);
      place('hamper', 0.3, V - 2.0, 1, 0);
      place('bin', U - 0.27, V - 1.5, -1, 0);
    } else if (r.type === 'lab') {
      place('sinkCounter', U / 2, V - 0.31, 0, -1, { w: U - 0.1, lab: true });
      const sideRight = F.doorU < U / 2, sU = sideRight ? U - 0.31 : 0.31, sl = Math.max(0.8, V - 2.2);
      place('sinkCounter', sU, V - 0.62 - sl / 2, sideRight ? -1 : 1, 0, { w: sl, lab: true, noSink: true });
      place('drawChair', sideRight ? 0.45 : U - 0.45, 1.85, sideRight ? 1 : -1, 0);
      place('stool', sideRight ? 1.15 : U - 1.15, 1.85, sideRight ? -1 : 1, 0);
    } else if (r.type === 'waiting') {
      layoutWaiting(m, r, k, doors, add, spots);
    } else if (r.type === 'reception') {
      layoutReception(m, r, k, doors, add, spots);
    }
  });
  const blocks = items.filter(it => it.block).map(itemRect);
  return { items, spots, blocks };
}
function layoutWaiting(m, r, k, doors, add, spots) {
  const walls = [
    { a: [r.x, r.y], b: [r.x + r.w, r.y], n: [0, 1] },
    { a: [r.x + r.w, r.y + r.h], b: [r.x, r.y + r.h], n: [0, -1] },
    { a: [r.x, r.y + r.h], b: [r.x, r.y], n: [1, 0] },
    { a: [r.x + r.w, r.y], b: [r.x + r.w, r.y + r.h], n: [-1, 0] }
  ];
  let seatCount = 0;
  for (const w of walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), tx = (w.b[0] - w.a[0]) / L, ty = (w.b[1] - w.a[1]) / L;
    const blocked = [[0, 0.5], [L - 0.5, L]];
    for (const d of doors) {
      const onWall = Math.abs((d.cx - w.a[0]) * w.n[0] + (d.cy - w.a[1]) * w.n[1]) < 0.06;
      if (!onWall) continue;
      const t = (d.cx - w.a[0]) * tx + (d.cy - w.a[1]) * ty, margin = d.kind === 'opening' ? 1.5 : d.isEntrance ? 1.0 : 0.75;
      blocked.push([t - d.width / 2 - margin, t + d.width / 2 + margin]);
    }
    blocked.sort((p, q) => p[0] - q[0]);
    let cur = 0;
    const free = [];
    for (const [s0, s1] of blocked) { if (s0 > cur) free.push([cur, s0]); cur = Math.max(cur, s1); }
    if (cur < L) free.push([cur, L]);
    for (const [f0, f1] of free) {
      const n = Math.floor((f1 - f0) / 0.56);
      for (let q = 0; q < n && seatCount < 28; q++) {
        const t = f0 + (f1 - f0) * (q + 0.5) / n;
        const p = { x: w.a[0] + tx * t + w.n[0] * 0.33, y: w.a[1] + ty * t + w.n[1] * 0.33 };
        const it = add('chair', p, { x: w.n[0], y: w.n[1] }, { tone: 'waiting' });
        if (it) { seatCount++; spots.seats.push({ x: p.x, y: p.y, dir: { x: w.n[0], y: w.n[1] }, pose: 'sit', h: 0.46, ax: p.x + w.n[0] * 0.5, ay: p.y + w.n[1] * 0.5, room: k }); }
      }
    }
  }
  if (r.w >= 4.5 && r.h >= 3.6) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    add('rug', { x: cx, y: cy }, { x: 0, y: 1 }, { w: Math.min(2.8, r.w - 2.4), d: Math.min(1.7, r.h - 2.3) });
    if (r.w >= 5.5) for (const side of [-1, 1]) for (let q = -1; q <= 1; q++) {
      const p = { x: cx + q * 0.56, y: cy + side * 0.27 }, dir = { x: 0, y: side };
      if (add('chair', p, dir, { tone: 'waiting' })) spots.seats.push({ x: p.x, y: p.y, dir, pose: 'sit', h: 0.46, ax: p.x, ay: p.y + side * 0.5, room: k });
    }
  }
  for (const [cx, cy] of [[r.x + 0.3, r.y + 0.3], [r.x + r.w - 0.3, r.y + 0.3], [r.x + 0.3, r.y + r.h - 0.3], [r.x + r.w - 0.3, r.y + r.h - 0.3]]) add('plant', { x: cx, y: cy }, { x: 0, y: 1 }, { w: 0.42, d: 0.42 });
}
function layoutReception(m, r, k, doors, add, spots) {
  const wr = m.rooms.find(q => q.type === 'waiting');
  const opening = wr && doors.find(d => (d.a === wr.id || d.b === wr.id));
  if (!opening) return;
  let n;
  if (opening.orient === 'v') n = Math.abs(opening.cx - r.x) < 0.06 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  else n = Math.abs(opening.cy - r.y) < 0.06 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  const along = opening.orient === 'v' ? r.h : r.w, len = Math.min(along - 0.5, opening.width + 0.9);
  const base = { x: opening.cx, y: opening.cy };
  const face = { x: -n.x, y: -n.y };
  add('counter', { x: base.x + n.x * 0.5, y: base.y + n.y * 0.5 }, face, { w: len, allowDoorZone: true });
  add('chair', { x: base.x + n.x * 1.25, y: base.y + n.y * 1.25 }, face, { tone: 'task', allowDoorZone: true });
  spots.receptionist = { x: base.x + n.x * 1.25, y: base.y + n.y * 1.25, dir: face, pose: 'sit', h: 0.46, ax: base.x + n.x * 1.8, ay: base.y + n.y * 1.8, room: k };
  spots.counter = { x: base.x - n.x * 0.5, y: base.y - n.y * 0.5, dir: n, pose: 'stand', h: 0, ax: base.x - n.x * 0.5, ay: base.y - n.y * 0.5 };
  const back = { x: base.x + n.x * (opening.orient === 'v' ? r.w : r.h), y: base.y + n.y * (opening.orient === 'v' ? r.w : r.h) };
  const side = opening.orient === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 };
  add('fileCabinet', { x: back.x - n.x * 0.32 + side.x * (along / 2 - 0.45), y: back.y - n.y * 0.32 + side.y * (along / 2 - 0.45) }, n.x || n.y ? { x: -n.x, y: -n.y } : n);
  add('plant', { x: back.x - n.x * 0.3 - side.x * (along / 2 - 0.3), y: back.y - n.y * 0.3 - side.y * (along / 2 - 0.3) }, face, { w: 0.42, d: 0.42 });
}

class Heap {
  constructor(less) { this.a = []; this.less = less; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

/* 0.3 m walkable grid. Furniture footprints block cells; door thresholds always stay open. */
function buildGrid(m, blocks) {
  const nx = Math.round(m.W / CELL), ny = Math.round(m.D / CELL);
  const room = new Int16Array(nx * ny).fill(-1), blocked = new Uint8Array(nx * ny);
  m.rooms.forEach((r, k) => {
    const i0 = Math.round(r.x / CELL), i1 = Math.round((r.x + r.w) / CELL);
    const j0 = Math.round(r.y / CELL), j1 = Math.round((r.y + r.h) / CELL);
    for (let j = Math.max(0, j0); j < Math.min(ny, j1); j++)
      for (let i = Math.max(0, i0); i < Math.min(nx, i1); i++) room[j * nx + i] = k;
  });
  for (const b of blocks || []) {
    for (let j = Math.max(0, Math.floor(b.y0 / CELL)); j < Math.min(ny, Math.ceil(b.y1 / CELL)); j++)
      for (let i = Math.max(0, Math.floor(b.x0 / CELL)); i < Math.min(nx, Math.ceil(b.x1 / CELL)); i++) {
        const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
        if (cx > b.x0 - 0.04 && cx < b.x1 + 0.04 && cy > b.y0 - 0.04 && cy < b.y1 + 0.04) blocked[j * nx + i] = 1;
      }
  }
  const vDoor = new Set(), hDoor = new Set();
  for (const d of m.doors) {
    const half = d.width / 2 + 1e-6;
    d.cov = [];
    if (d.orient === 'v') {
      d.line = Math.round(d.cx / CELL);
      for (let j = 0; j < ny; j++) if (Math.abs((j + 0.5) * CELL - d.cy) <= half) {
        vDoor.add(d.line * 4096 + j); d.cov.push(j);
        for (let q = -2; q <= 1; q++) { const i = d.line + q; if (i >= 0 && i < nx) blocked[j * nx + i] = 0; }
      }
    } else {
      d.line = Math.round(d.cy / CELL);
      for (let i = 0; i < nx; i++) if (Math.abs((i + 0.5) * CELL - d.cx) <= half) {
        hDoor.add(i * 4096 + d.line); d.cov.push(i);
        for (let q = -2; q <= 1; q++) { const j = d.line + q; if (j >= 0 && j < ny) blocked[j * nx + i] = 0; }
      }
    }
  }
  const passE = new Uint8Array(nx * ny), passN = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, r = room[c];
    if (r < 0 || blocked[c]) continue;
    if (i + 1 < nx) { const r2 = room[c + 1]; if (r2 >= 0 && !blocked[c + 1] && (r2 === r || vDoor.has((i + 1) * 4096 + j))) passE[c] = 1; }
    if (j + 1 < ny) { const r2 = room[c + nx]; if (r2 >= 0 && !blocked[c + nx] && (r2 === r || hDoor.has(i * 4096 + j + 1))) passN[c] = 1; }
  }
  return { nx, ny, room, blocked, passE, passN, vDoor, hDoor };
}
function isFree(g, c) { return c >= 0 && g.room[c] >= 0 && !g.blocked[c]; }
/* Wall segments wherever two different rooms (or a room and the outside) meet, minus door openings. */
function extractWalls(m, g) {
  const out = [];
  const R = (i, j) => (i < 0 || j < 0 || i >= g.nx || j >= g.ny) ? -1 : g.room[j * g.nx + i];
  for (let i = 0; i <= g.nx; i++) {
    let run = null;
    for (let j = 0; j <= g.ny; j++) {
      let wall = false, ext = false;
      if (j < g.ny) {
        const a = R(i - 1, j), b = R(i, j);
        if (a !== b && (a >= 0 || b >= 0) && !g.vDoor.has(i * 4096 + j)) { wall = true; ext = a < 0 || b < 0; }
      }
      if (run && wall && run.ext === ext) { run.to = j + 1; continue; }
      if (run) { out.push({ orient: 'v', at: i * CELL, from: run.from * CELL, to: run.to * CELL, ext: run.ext }); run = null; }
      if (wall) run = { from: j, to: j + 1, ext };
    }
  }
  for (let j = 0; j <= g.ny; j++) {
    let run = null;
    for (let i = 0; i <= g.nx; i++) {
      let wall = false, ext = false;
      if (i < g.nx) {
        const a = R(i, j - 1), b = R(i, j);
        if (a !== b && (a >= 0 || b >= 0) && !g.hDoor.has(i * 4096 + j)) { wall = true; ext = a < 0 || b < 0; }
      }
      if (run && wall && run.ext === ext) { run.to = i + 1; continue; }
      if (run) { out.push({ orient: 'h', at: j * CELL, from: run.from * CELL, to: run.to * CELL, ext: run.ext }); run = null; }
      if (wall) run = { from: i, to: i + 1, ext };
    }
  }
  return out;
}
function doorGaps(m) {
  return m.doors.filter(d => d.cov && d.cov.length).map(d => ({
    id: d.id, a: d.a, b: d.b, orient: d.orient, at: d.line * CELL, from: Math.min(...d.cov) * CELL, to: (Math.max(...d.cov) + 1) * CELL,
    kind: d.kind, isEntrance: d.isEntrance
  }));
}
/* Window openings on exterior walls of rooms that would have them. */
const WINDOW_TYPES = new Set(['exam_room', 'staff_lounge', 'provider_office', 'waiting', 'nurse_station', 'lab', 'procedure_room', 'reception']);
function planWindows(m) {
  const out = [], tol = 0.05, ent = m.doors.filter(d => d.isEntrance);
  for (const r of m.rooms) {
    if (!WINDOW_TYPES.has(r.type)) continue;
    const sides = [];
    if (r.y < tol) sides.push({ orient: 'h', at: 0, a: r.x, b: r.x + r.w });
    if (Math.abs(r.y + r.h - m.D) < tol) sides.push({ orient: 'h', at: m.D, a: r.x, b: r.x + r.w });
    if (r.x < tol) sides.push({ orient: 'v', at: 0, a: r.y, b: r.y + r.h });
    if (Math.abs(r.x + r.w - m.W) < tol) sides.push({ orient: 'v', at: m.W, a: r.y, b: r.y + r.h });
    for (const s of sides) {
      const L = s.b - s.a;
      if (L < 2.0) continue;
      const n = L > 5.6 ? 2 : 1, ww = Math.min(1.6, (L - 0.9 * (n + 1)) / n);
      if (ww < 0.8) continue;
      for (let q = 0; q < n; q++) {
        const c = s.a + L * (q + 0.5) / n, from = c - ww / 2, to = c + ww / 2;
        const clash = ent.some(d => d.orient === s.orient && Math.abs((s.orient === 'h' ? d.cy : d.cx) - s.at) < tol && Math.abs((s.orient === 'h' ? d.cx : d.cy) - c) < ww / 2 + d.width / 2 + 0.3);
        if (!clash) out.push({ orient: s.orient, at: s.at, from, to, room: r.id });
      }
    }
  }
  return out;
}
function cellXY(g, c) { return { x: (c % g.nx + 0.5) * CELL, y: (((c / g.nx) | 0) + 0.5) * CELL }; }
function cellAt(g, x, y) {
  const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return -1;
  const c = j * g.nx + i;
  return isFree(g, c) ? c : -1;
}
function stepOK(g, a, b) {
  const ai = a % g.nx, aj = (a / g.nx) | 0, bi = b % g.nx, bj = (b / g.nx) | 0;
  if (bj === aj && bi === ai + 1) return !!g.passE[a];
  if (bj === aj && bi === ai - 1) return !!g.passE[b];
  if (bi === ai && bj === aj + 1) return !!g.passN[a];
  if (bi === ai && bj === aj - 1) return !!g.passN[b];
  return false;
}
/* A straight segment is walkable if every cell it crosses is free and each crossing is an open step. */
function segmentClear(g, a, b, pad) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L / 0.08));
  const nxv = L ? -(b.y - a.y) / L : 0, nyv = L ? (b.x - a.x) / L : 0;
  for (const off of pad ? [-pad, 0, pad] : [0]) {
    let prev = cellAt(g, a.x + nxv * off, a.y + nyv * off);
    if (prev < 0) return false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, c = cellAt(g, a.x + (b.x - a.x) * t + nxv * off, a.y + (b.y - a.y) * t + nyv * off);
      if (c < 0) return false;
      if (c !== prev) {
        const pi = prev % g.nx, pj = (prev / g.nx) | 0, ci = c % g.nx, cj = (c / g.nx) | 0;
        if (pi !== ci && pj !== cj) {
          const m1 = pj * g.nx + ci, m2 = cj * g.nx + pi;
          if (!((isFree(g, m1) && stepOK(g, prev, m1) && stepOK(g, m1, c)) && (isFree(g, m2) && stepOK(g, prev, m2) && stepOK(g, m2, c)))) return false;
        } else if (!stepOK(g, prev, c)) return false;
        prev = c;
      }
    }
  }
  return true;
}
function astar(g, s, t) {
  if (s === t) return [s];
  const N = g.nx * g.ny, cost = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx = t % g.nx, ty = (t / g.nx) | 0;
  const h = c => { const dx = Math.abs(c % g.nx - tx), dy = Math.abs(((c / g.nx) | 0) - ty); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  const open = new Heap((a, b) => a[1] < b[1]);
  cost[s] = 0; open.push([s, h(s)]);
  while (open.size) {
    const c = open.pop()[0];
    if (c === t) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const i = c % g.nx, j = (c / g.nx) | 0, nx = g.nx;
    const E = i + 1 < nx && g.passE[c], Wst = i > 0 && g.passE[c - 1], Nn = j + 1 < g.ny && g.passN[c], S = j > 0 && g.passN[c - nx];
    const relax = (n, w) => { const v = cost[c] + w; if (v < cost[n]) { cost[n] = v; came[n] = c; open.push([n, v + h(n)]); } };
    if (E) relax(c + 1, 1);
    if (Wst) relax(c - 1, 1);
    if (Nn) relax(c + nx, 1);
    if (S) relax(c - nx, 1);
    if (E && Nn && g.passN[c + 1] && g.passE[c + nx]) relax(c + 1 + nx, Math.SQRT2);
    if (Wst && Nn && g.passN[c - 1] && g.passE[c + nx - 1]) relax(c - 1 + nx, Math.SQRT2);
    if (E && S && g.passN[c + 1 - nx] && g.passE[c - nx]) relax(c + 1 - nx, Math.SQRT2);
    if (Wst && S && g.passN[c - 1 - nx] && g.passE[c - nx - 1]) relax(c - 1 - nx, Math.SQRT2);
  }
  if (came[t] < 0) return null;
  const out = [t];
  let c = t;
  while (c !== s) { c = came[c]; out.push(c); }
  return out.reverse();
}
/* Shortest paths, then "string pulling" so people walk in straight lines instead of grid zig-zags. */
function makePathfinder(g) {
  const cache = new Map();
  return function path(s, t) {
    if (s < 0 || t < 0) return null;
    const key = s * 100003 + t;
    if (cache.has(key)) return cache.get(key);
    const cells = astar(g, s, t);
    let r = null;
    if (cells) {
      const P = cells.map(c => cellXY(g, c)), pts = [P[0]];
      let i = 0;
      while (i < P.length - 1) {
        let j = P.length - 1;
        while (j > i + 1 && !segmentClear(g, P[i], P[j], 0.16)) j--;
        pts.push(P[j]);
        i = j;
      }
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      r = { cells, pts, cum, len: cum[cum.length - 1] };
    }
    cache.set(key, r);
    return r;
  };
}

/* Key spots and the three routes drawn on the floor. Seats and workstations come from the furniture plan. */
function analyzePlan(m, g, pf, furn) {
  const N = g.nx * g.ny;
  const cellsOf = k => { const a = []; for (let c = 0; c < N; c++) if (g.room[c] === k && !g.blocked[c]) a.push(c); return a; };
  const nearestIn = (k, x, y) => {
    let best = -1, bd = Infinity;
    for (let c = 0; c < N; c++) { if (g.room[c] !== k || g.blocked[c]) continue; const p = cellXY(g, c), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = c; } }
    return best;
  };
  const centerOf = k => { const r = m.rooms[k]; return nearestIn(k, r.x + r.w / 2, r.y + r.h / 2); };
  const firstOf = t => m.rooms.findIndex(r => r.type === t);
  const idx = id => m.rooms.findIndex(r => r.id === id);
  const roomOf = (x, y) => m.rooms.findIndex(r => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6);
  const toward = (d, k, dist) => {
    const r = m.rooms[k], vx = r.x + r.w / 2 - d.cx, vy = r.y + r.h / 2 - d.cy, L = Math.hypot(vx, vy) || 1;
    return nearestIn(k, d.cx + vx / L * dist, d.cy + vy / L * dist);
  };
  const withCell = s => { if (!s) return null; const k = s.room != null ? s.room : roomOf(s.ax, s.ay); const c = k >= 0 ? nearestIn(k, s.ax, s.ay) : -1; return c >= 0 ? Object.assign({}, s, { cell: c }) : null; };
  const ent = m.doors.find(d => d.isEntrance);
  let entK = ent ? idx(ent.a !== 'exterior' ? ent.a : ent.b) : -1;
  if (entK < 0) entK = Math.max(0, firstOf('waiting'));
  const waitingK = firstOf('waiting') >= 0 ? firstOf('waiting') : entK;
  const recK = firstOf('reception') >= 0 ? firstOf('reception') : waitingK;
  const entranceCell = ent ? toward(ent, entK, 0.55) : centerOf(entK);
  const sp = furn ? furn.spots : { seats: [], exams: {}, nurseHomes: [], officeHomes: [] };
  const counter = withCell(sp.counter && Object.assign({}, sp.counter, { room: waitingK })) || { cell: centerOf(waitingK), pose: 'stand' };
  const receptionist = withCell(sp.receptionist) || { cell: centerOf(recK), pose: 'stand' };
  const waitCell = centerOf(waitingK);
  const homeFallback = (k, n) => {
    const r = m.rooms[k], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    return cellsOf(k).map(c => { const p = cellXY(g, c); return [c, (p.x - cx) ** 2 + (p.y - cy) ** 2]; })
      .sort((a, b) => a[1] - b[1]).filter((_, q) => q % 3 === 0).slice(0, n).map(a => ({ cell: a[0], pose: 'stand' }));
  };
  let seats = sp.seats.map(withCell).filter(s => s && pf(waitCell, s.cell));
  if (!seats.length) seats = cellsOf(waitingK).filter((c, q) => q % 5 === 0).slice(0, 16).map(c => ({ cell: c, pose: 'stand' }));
  const corrK = firstOf('corridor');
  let nurseK = firstOf('nurse_station'); if (nurseK < 0) nurseK = corrK >= 0 ? corrK : waitingK;
  let officeK = firstOf('provider_office'); if (officeK < 0) officeK = firstOf('staff_lounge'); if (officeK < 0) officeK = corrK >= 0 ? corrK : waitingK;
  let nurseHomes = sp.nurseHomes.map(withCell).filter(Boolean);
  if (!nurseHomes.length) nurseHomes = homeFallback(nurseK, 4);
  let officeHomes = sp.officeHomes.map(withCell).filter(Boolean);
  if (!officeHomes.length) officeHomes = homeFallback(officeK, 4);
  const allExams = [];
  m.rooms.forEach((r, k) => {
    if (r.type !== 'exam_room') return;
    const fs = sp.exams[r.id];
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const e = { k, id: r.id, label: r.label };
    e.patient = (fs && withCell(fs.patient)) || { cell: nearestIn(k, cx, cy), pose: 'stand' };
    e.nurse = (fs && withCell(fs.nurse)) || { cell: nearestIn(k, cx + 0.5, cy - 0.7), pose: 'stand' };
    e.provider = (fs && withCell(fs.provider)) || { cell: nearestIn(k, cx - 0.5, cy - 0.7), pose: 'stand' };
    const pw = pf(waitCell, e.patient.cell), pn = pf(nurseHomes[0].cell, e.nurse.cell), po = pf(officeHomes[0].cell, e.provider.cell);
    e.reachable = !!(pw && pn && po);
    e.distWait = pw ? pw.len : Infinity; e.distNurse = pn ? pn.len : Infinity; e.distOffice = po ? po.len : Infinity;
    allExams.push(e);
  });
  const exams = allExams.filter(e => e.reachable);
  const farthest = exams.slice().sort((a, b) => b.distWait - a.distWait)[0];
  const seatMid = seats[Math.floor(seats.length / 2)].cell;
  const legs = farthest
    ? [[entranceCell, counter.cell], [counter.cell, seatMid], [seatMid, farthest.patient.cell], [farthest.patient.cell, counter.cell], [counter.cell, entranceCell]].map(([a, b]) => pf(a, b)).filter(Boolean)
    : [];
  const journey = { legs: legs.map(l => l.pts), len: legs.reduce((s, l) => s + l.len, 0), examLabel: farthest ? farthest.label : null };
  const staff = exams.map(e => { const p = pf(nurseHomes[0].cell, e.nurse.cell); return { pts: p.pts, len: p.len, label: e.label }; });
  let egress = null;
  const unreachableRooms = [];
  m.rooms.forEach((r, k) => {
    if (r.type === 'corridor') return;
    const c = centerOf(k);
    const p = c >= 0 ? pf(c, entranceCell) : null;
    if (!p) { unreachableRooms.push(r.label); return; }
    if (!egress || p.len > egress.len) egress = { pts: p.pts, len: p.len, fromLabel: r.label };
  });
  const avgNurse = exams.length ? exams.reduce((s, e) => s + e.distNurse, 0) / exams.length : 0;
  return {
    entranceCell, counter, receptionist, seats, waitCell, nurseHomes, officeHomes, exams, allExams,
    routes: { journey, staff, egress }, avgNurse, unreachableRooms, nurseLabel: m.rooms[nurseK].label, entK, waitingK,
    loungeSpots: firstOf('staff_lounge') >= 0 ? homeFallback(firstOf('staff_lounge'), 6) : nurseHomes.slice(),
    receptionSpots: [receptionist].concat(homeFallback(recK, 4).filter(h => h.cell !== receptionist.cell)).slice(0, 4)
  };
}

const BASE_SCENARIO = {
  checkInMin: [2, 4], checkoutMin: [1, 3], intakeMin: [5, 9], visitMin: [12, 26], turnoverMin: 2,
  patientSpeed: 66, staffSpeed: 78, firstArrival: 0, lastArrival: 480, walkInShare: 0.15
};
const SCENARIOS = {
  normal: Object.assign({}, BASE_SCENARIO, { key: 'normal', label: 'Normal Tuesday', providers: 3, nurses: 2, patients: 60 }),
  flu: Object.assign({}, BASE_SCENARIO, { key: 'flu', label: 'Flu-season Monday', providers: 3, nurses: 2, patients: 90, walkInShare: 0.45, visitMin: [10, 20], intakeMin: [4, 8] }),
  short: Object.assign({}, BASE_SCENARIO, { key: 'short', label: 'Short-staffed day', providers: 2, nurses: 1, patients: 48 })
};

/* Discrete-event simulation of one clinic day (minutes from 8:00 am). Walking times come from real path lengths.
   A scenario is either the simple form (providers, nurses, patients, walkInShare) or one compiled by the scenario
   builder (staff shifts, arrival streams, visit types, breaks, staff out, closed rooms and When/Then rules). */
const WALKIN_PATTERNS = {
  steady: () => 1,
  morning: t => (t < 150 ? 1 : 0.3),
  lunch: t => (t >= 240 && t <= 330 ? 1 : 0.3),
  afternoon: t => (t >= 420 ? 1 : 0.3)
};
class ClinicSim {
  constructor(m, g, pf, info, sc, seed) {
    this.m = m; this.g = g; this.pf = pf; this.info = info; this.sc = sc;
    this.rng = mulberry32(seed);
    this.q = new Heap((a, b) => a.t < b.t || (a.t === b.t && a.s < b.s));
    this.seq = 0;
    this.opens = sc.opens != null ? sc.opens : 0; this.closes = sc.closes != null ? sc.closes : 600;
    this.now = this.opens;
    this.agents = []; this.heat = new Float32Array(g.nx * g.ny);
    this.deskQueue = []; this.waiting = []; this.ready = [];
    this.freeRooms = info.exams.map(e => Object.assign({}, e));
    this.roomById = new Map(this.freeRooms.map(r => [r.id, r]));
    this.freeNurses = []; this.freeProviders = []; this.deskFree = []; this.seatsTaken = new Set();
    this.waits = []; this.lobbyWaits = []; this.times = []; this.walks = []; this.roomBusy = 0; this.maxWaiting = 0;
    this.inClinic = 0; this.seen = 0; this.lastExit = this.opens; this.unreachable = 0; this.busyRooms = new Set();
    this.turnedAway = 0; this.noShows = 0; this.fires = []; this.walkinsPausedUntil = -Infinity; this.breaksTaken = 0; this.loungeIdx = 0;
    this.series = [{ t: this.now, lobby: 0, inClinic: 0 }];
    this.nurses = []; this.providers = []; this.receptionists = [];
    const allDay = n => Array.from({ length: n }, () => ({ from: this.opens, to: Infinity }));
    const plan = sc.staffPlan || { provider: allDay(sc.providers), nurse: allDay(sc.nurses), reception: allDay(sc.receptionists || 1) };
    for (const role of ['reception', 'nurse', 'provider']) (plan[role] || []).forEach((s, k) => this.addStaff(role, s, k));
    for (const b of sc.breaks || []) {
      const staff = this.listFor(b.role).filter(a => a.shift.from < b.to && a.shift.to > b.from);
      staff.forEach((a, k) => {
        const t = Math.max(b.from, a.shift.from) + (b.stagger ? k * b.minutes : 0);
        if (t < a.shift.to) this.at(t, () => this.requestAway(a, { kind: 'break', minutes: b.minutes }));
      });
    }
    for (const o of sc.outs || []) this.at(o.from, () => this.sendOut(o));
    for (const c of sc.closures || []) {
      const room = this.roomById.get(c.room);
      if (!room) continue;
      this.at(c.from, () => { room.closed = true; const i = this.freeRooms.indexOf(room); if (i >= 0) this.freeRooms.splice(i, 1); });
      this.at(c.to, () => { room.closed = false; if (!this.busyRooms.has(room) && !this.freeRooms.includes(room)) this.freeRooms.push(room); this.callNext(); });
    }
    if (sc.rules && sc.rules.length) {
      this.rules = sc.rules.map(r => Object.assign({ since: null, fired: false }, r));
      this.tickEnd = Math.min(this.closes, Math.max(...this.rules.map(r => r.to)));
      this.at(Math.max(this.opens, Math.min(...this.rules.map(r => r.from))), () => this.tick());
    }
    if (sc.arrivalsPlan) this.genArrivals(sc.arrivalsPlan);
    else {
      const span = sc.lastArrival - sc.firstArrival;
      for (let k = 0; k < sc.patients; k++) {
        const walkIn = this.rng() < sc.walkInShare;
        const t = walkIn ? sc.firstArrival + this.rng() * span : sc.firstArrival + (k + 0.5) * span / sc.patients + (this.rng() * 2 - 1) * 6;
        this.at(clamp(t, sc.firstArrival, sc.lastArrival), () => this.arrive(walkIn ? 'walkin' : 'appt'));
      }
    }
  }
  at(t, fn) { this.q.push({ t, s: this.seq++, fn }); }
  u(r) { return r[0] + this.rng() * (r[1] - r[0]); }
  mark() { const s = this.series, last = s[s.length - 1]; if (last.lobby !== this.waiting.length || last.inClinic !== this.inClinic) s.push({ t: this.now, lobby: this.waiting.length, inClinic: this.inClinic }); }
  spawn(role, cell) {
    const p = cellXY(this.g, cell);
    const a = { id: this.agents.length, role, active: true, cell, x: p.x, y: p.y, move: null, walked: 0, rest: null, lane: (this.rng() - 0.5) * 0.34, look: this.rng() };
    this.agents.push(a);
    return a;
  }
  listFor(role) { return role === 'nurse' ? this.nurses : role === 'provider' ? this.providers : this.receptionists; }
  poolFor(role) { return role === 'nurse' ? this.freeNurses : role === 'provider' ? this.freeProviders : this.deskFree; }
  homesFor(role) { const i = this.info; return role === 'nurse' ? i.nurseHomes : role === 'provider' ? i.officeHomes : (i.receptionSpots && i.receptionSpots.length ? i.receptionSpots : [i.receptionist]); }
  addStaff(role, shift, k, walkIn) {
    const homes = this.homesFor(role), h = homes[k % homes.length];
    const a = this.spawn(role, walkIn ? this.info.entranceCell : h.cell);
    a.home = h; a.shift = { from: shift.from, to: shift.to }; a.busyTime = 0; a.awayTime = 0; a.busySince = null; a.away = null; a.pendingAway = null; a.offAt = isFinite(shift.to) ? shift.to : null;
    this.listFor(role).push(a);
    if (walkIn) this.walk(a, h, () => this.addFree(a), h);
    else if (shift.from <= this.now) { a.rest = h.x != null ? h : null; this.addFree(a); }
    else { a.active = false; this.at(shift.from, () => { const p = cellXY(this.g, this.info.entranceCell); a.active = true; a.cell = this.info.entranceCell; a.x = p.x; a.y = p.y; this.walk(a, h, () => this.addFree(a), h); }); }
    if (a.offAt != null) this.at(a.offAt, () => { const pool = this.poolFor(role), i = pool.indexOf(a); if (i >= 0) { pool.splice(i, 1); this.goHome(a); } });
    return a;
  }
  addFree(a) {
    if (a.offAt != null && this.now >= a.offAt) { this.goHome(a); return; }
    if (a.pendingAway) { const pa = a.pendingAway; a.pendingAway = null; this.startAway(a, pa); return; }
    this.poolFor(a.role).push(a);
    if (a.role === 'nurse') this.callNext(); else if (a.role === 'provider') this.sendProvider(); else this.serveDesk();
  }
  take(a) { a.busySince = this.now; }
  release(a) { if (a.busySince != null) { a.busyTime += this.now - a.busySince; a.busySince = null; } this.addFree(a); }
  wantsToStop(a) { return !!a.pendingAway || (a.offAt != null && this.now >= a.offAt); }
  goHome(a) { a.gone = true; this.walk(a, this.info.entranceCell, () => { a.active = false; a.rest = null; }); }
  requestAway(a, pa) {
    if (a.gone || a.away || !a.active) return;
    const pool = this.poolFor(a.role), i = pool.indexOf(a);
    if (i >= 0) { pool.splice(i, 1); this.startAway(a, pa); } else a.pendingAway = pa;
  }
  startAway(a, pa) {
    const t0 = this.now, end = pa.until != null ? pa.until : t0 + pa.minutes;
    if (end <= t0 + 0.5) { this.addFree(a); return; }
    a.away = pa;
    if (pa.kind === 'break') this.breaksTaken++;
    const back = () => { a.awayTime += this.now - t0; a.away = null; this.walk(a, a.home, () => this.addFree(a), a.home); };
    if (pa.kind === 'break') {
      const spots = this.info.loungeSpots && this.info.loungeSpots.length ? this.info.loungeSpots : [a.home], spot = spots[this.loungeIdx++ % spots.length];
      this.walk(a, spot, () => this.at(Math.max(this.now, end), back), spot);
    } else {
      this.walk(a, this.info.entranceCell, () => {
        a.active = false;
        this.at(Math.max(this.now, end), () => { const p = cellXY(this.g, this.info.entranceCell); a.active = true; a.cell = this.info.entranceCell; a.x = p.x; a.y = p.y; back(); });
      });
    }
  }
  sendOut(o) {
    const list = this.listFor(o.role).filter(a => a.active && !a.gone && !a.away && !a.pendingAway), pool = this.poolFor(o.role);
    list.sort((x, y) => (pool.includes(y) ? 1 : 0) - (pool.includes(x) ? 1 : 0));
    list.slice(0, o.count).forEach(a => this.requestAway(a, { kind: 'out', until: o.to }));
  }
  callIn(role, minutes) {
    const a = this.addStaff(role, { from: this.now, to: this.now + minutes }, this.listFor(role).length, true);
    a.callIn = true;
  }
  tick() {
    for (const r of this.rules) {
      if (r.fired) continue;
      if (this.now < r.from || this.now > r.to) { r.since = null; continue; }
      const v = this.metricValue(r.metric), ok = r.op === 'lt' ? v < r.value : v > r.value;
      if (!ok) { r.since = null; continue; }
      if (r.since == null) r.since = this.now;
      if (this.now - r.since >= r.hold) this.fire(r);
    }
    if (this.now + 1 <= this.tickEnd && this.rules.some(r => !r.fired)) this.at(this.now + 1, () => this.tick());
  }
  metricValue(k) {
    if (k === 'waiting') return this.waiting.length;
    if (k === 'longest') return this.waiting.reduce((mx, p) => Math.max(mx, this.now - p.tWait), 0);
    if (k === 'desk') return this.deskQueue.length;
    if (k === 'free_rooms') return this.freeRooms.length;
    return 0;
  }
  fire(r) {
    r.fired = true;
    this.fires.push({ t: this.now, id: r.id, label: r.label });
    if (r.action === 'call_in') this.at(this.now + (r.delay || 0), () => { for (let k = 0; k < r.count; k++) this.callIn(r.role, r.duration); });
    else if (r.action === 'pause_walkins') this.walkinsPausedUntil = this.now + r.duration;
  }
  genArrivals(list) {
    for (const s of list) {
      if (s.kind === 'appt') {
        const span = Math.max(1, s.to - s.from);
        for (let k = 0; k < s.count; k++) {
          if (this.rng() < s.noShow) { this.noShows++; continue; }
          const t = s.from + (k + 0.5) * span / s.count + (this.rng() * 2 - 1) * 6;
          this.at(clamp(t, this.opens, this.closes), () => this.arrive('appt'));
        }
      } else if (s.kind === 'walkin') {
        const w = WALKIN_PATTERNS[s.pattern] || WALKIN_PATTERNS.steady;
        let n = 0, guard = 0;
        while (n < s.count && guard++ < s.count * 80) { const t = s.from + this.rng() * Math.max(1, s.to - s.from); if (this.rng() <= w(t)) { n++; this.at(t, () => this.arrive('walkin')); } }
      } else if (s.kind === 'group') {
        for (let k = 0; k < s.count; k++) this.at(s.at + this.rng() * 4, () => this.arrive('group'));
      }
    }
  }
  pickVisit() {
    const vt = this.sc.visitTypes;
    if (!vt || !vt.length) return null;
    let x = this.rng();
    for (const v of vt) { x -= v.p; if (x <= 0) return v; }
    return vt[vt.length - 1];
  }
  walk(a, to, cb, rest) {
    const target = typeof to === 'number' ? to : to.cell;
    const p = this.pf(a.cell, target);
    a.rest = null;
    const arrive = () => { a.move = null; a.cell = target; const q = cellXY(this.g, target); a.x = q.x; a.y = q.y; a.rest = rest && rest.x != null ? rest : null; cb(); };
    if (!p) { this.unreachable++; this.at(this.now, arrive); return; }
    if (p.len < 1e-6) { this.at(this.now, arrive); return; }
    a.walked += p.len;
    for (const c of p.cells) this.heat[c] += 1;
    const t1 = this.now + p.len / (a.role === 'patient' ? this.sc.patientSpeed : this.sc.staffSpeed);
    a.move = { pts: p.pts, cum: p.cum, len: p.len, t0: this.now, t1 };
    this.at(t1, arrive);
  }
  arrive(kind) {
    if (kind === 'walkin' && this.now < this.walkinsPausedUntil) { this.turnedAway++; return; }
    const p = this.spawn('patient', this.info.entranceCell);
    p.kind = kind || 'appt'; p.visit = this.pickVisit();
    p.tArrive = this.now; p.phase = 'in'; p.justArrived = true; this.inClinic++; this.mark();
    this.walk(p, this.info.counter, () => this.joinDesk(p), this.info.counter);
  }
  joinDesk(p) { p.tQueue = this.now; this.deskQueue.push(p); this.serveDesk(); }
  serveDesk() {
    while (this.deskQueue.length && this.deskFree.length) {
      const r = this.deskFree.shift(), p = this.deskQueue.shift();
      p.deskWait = (p.deskWait || 0) + (this.now - p.tQueue);
      this.take(r);
      this.at(this.now + this.u(p.phase === 'in' ? this.sc.checkInMin : this.sc.checkoutMin), () => {
        if (p.phase === 'in') { p.seat = this.takeSeat(); this.walk(p, p.seat, () => this.joinWaiting(p), p.seat); }
        else { p.leaving = true; this.walk(p, this.info.entranceCell, () => this.leave(p)); }
        this.release(r);
      });
    }
  }
  takeSeat() {
    const s = this.info.seats;
    const free = s.filter(x => !this.seatsTaken.has(x));
    const pick = free.length ? free[(this.rng() * free.length) | 0] : s[(this.rng() * s.length) | 0];
    this.seatsTaken.add(pick);
    return pick;
  }
  joinWaiting(p) { p.tWait = this.now; p.waitingSince = this.now; this.waiting.push(p); this.maxWaiting = Math.max(this.maxWaiting, this.waiting.length); this.mark(); this.callNext(); }
  callNext() {
    while (this.waiting.length && this.freeRooms.length && this.freeNurses.length) {
      const p = this.waiting.shift();
      let bi = 0;
      for (let q = 1; q < this.freeRooms.length; q++) if (this.freeRooms[q].distWait < this.freeRooms[bi].distWait) bi = q;
      const room = this.freeRooms.splice(bi, 1)[0], nurse = this.freeNurses.shift();
      this.take(nurse);
      p.waitLobby = this.now - p.tWait; p.waitingSince = null; this.seatsTaken.delete(p.seat); room.since = this.now; this.busyRooms.add(room);
      p.room = room.id;
      this.mark();
      let n = 0;
      const both = () => { if (++n === 2) this.intake(p, room, nurse); };
      this.walk(p, room.patient, both, room.patient);
      this.walk(nurse, room.nurse, both, room.nurse);
    }
  }
  intake(p, room, nurse) {
    this.at(this.now + this.u(this.sc.intakeMin), () => {
      this.walk(nurse, nurse.home, () => this.release(nurse), nurse.home);
      p.tReady = this.now; p.waitingSince = this.now;
      this.ready.push({ p, room });
      this.sendProvider();
    });
  }
  sendProvider() {
    while (this.ready.length && this.freeProviders.length) {
      const job = this.ready.shift(), dr = this.freeProviders.shift();
      this.take(dr);
      this.walk(dr, job.room.provider, () => this.visit(job, dr), job.room.provider);
    }
  }
  visit(job, dr) {
    job.p.waitRoom = this.now - job.p.tReady; job.p.waitingSince = null;
    const span = job.p.visit ? job.p.visit.prov : this.sc.visitMin;
    this.at(this.now + this.u(span), () => {
      const { p, room } = job;
      p.phase = 'out'; p.room = null;
      this.walk(p, this.info.counter, () => this.joinDesk(p), this.info.counter);
      this.at(this.now + this.sc.turnoverMin, () => { this.roomBusy += this.now - room.since; this.busyRooms.delete(room); if (!room.closed) this.freeRooms.push(room); this.callNext(); });
      if (this.ready.length && !this.wantsToStop(dr)) { const next = this.ready.shift(); this.walk(dr, next.room.provider, () => this.visit(next, dr), next.room.provider); }
      else this.walk(dr, dr.home, () => this.release(dr), dr.home);
    });
  }
  leave(p) {
    p.active = false; p.leftAt = this.now; this.inClinic--; this.seen++;
    this.waits.push((p.deskWait || 0) + (p.waitLobby || 0) + (p.waitRoom || 0)); this.lobbyWaits.push(p.waitLobby || 0);
    this.times.push(this.now - p.tArrive); this.walks.push(p.walked); this.lastExit = this.now; this.mark();
  }
  advanceTo(t) { while (this.q.size && this.q.peek().t <= t) { const e = this.q.pop(); this.now = e.t; e.fn(); } if (t > this.now) this.now = t; }
  runAll() { while (this.q.size) { const e = this.q.pop(); this.now = e.t; e.fn(); } }
  get done() { return this.q.size === 0; }
  metrics() {
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const p90 = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(0.9 * (s.length - 1))]; };
    const perHead = list => list.reduce((s, a) => s + a.walked, 0) / Math.max(1, list.length) / 1000;
    const end = this.done ? Math.max(this.lastExit, this.opens + 60) : Math.max(this.now, this.opens + 1);
    const util = list => {
      let busy = 0, duty = 0;
      for (const a of list) {
        const from = Math.max(a.shift.from, this.opens), to = Math.min(a.shift.to, end);
        duty += Math.max(0, to - from - a.awayTime);
        busy += a.busyTime + (a.busySince != null ? this.now - a.busySince : 0);
      }
      return duty > 0 ? Math.min(1, busy / duty) : 0;
    };
    const span = Math.max(30, end - this.opens);
    return {
      seen: this.seen, avgWait: avg(this.waits), p90Wait: p90(this.waits), lobbyWait: avg(this.lobbyWaits), avgTime: avg(this.times), avgWalk: avg(this.walks),
      nurseKm: perHead(this.nurses), providerKm: perHead(this.providers),
      examUse: this.info.exams.length ? Math.min(1, (this.roomBusy + [...this.busyRooms].reduce((s, r) => s + this.now - r.since, 0)) / (this.info.exams.length * span)) : 0,
      maxWaiting: this.maxWaiting, lastExit: this.lastExit, unreachable: this.unreachable,
      turnedAway: this.turnedAway, noShows: this.noShows, breaks: this.breaksTaken, fires: this.fires.length, notSeen: this.inClinic,
      utilNurse: util(this.nurses), utilProvider: util(this.providers), utilReception: util(this.receptionists)
    };
  }
}
function posAt(a, t) {
  const mv = a.move;
  if (!mv) return { x: a.x, y: a.y, dx: 0, dy: 0, moving: false };
  const d = clamp((t - mv.t0) / (mv.t1 - mv.t0 || 1), 0, 1) * mv.len, cum = mv.cum, pts = mv.pts;
  let k = 1;
  while (k < cum.length - 1 && cum[k] < d) k++;
  const seg = cum[k] - cum[k - 1] || 1, u = clamp((d - cum[k - 1]) / seg, 0, 1);
  const dx = pts[k].x - pts[k - 1].x, dy = pts[k].y - pts[k - 1].y, L = Math.hypot(dx, dy) || 1;
  return { x: pts[k - 1].x + dx * u, y: pts[k - 1].y + dy * u, dx: dx / L, dy: dy / L, moving: true };
}

/* Stand-in for the two Nemotron calls: text to settings, numbers to advice. */
function parseScenario(text) {
  const t = String(text || '').toLowerCase();
  const grab = re => { const m = t.match(re); return m ? parseInt(m[1], 10) : null; };
  const busy = /(busy|flu|surge|rush|crowd|packed|monday|walk-in|walk in)/.test(t);
  const base = busy ? SCENARIOS.flu : SCENARIOS.normal;
  const providers = grab(/(\d+)\s*(?:providers?|doctors?|physicians?|clinicians?)/);
  const nurses = grab(/(\d+)\s*(?:nurses?|medical assistants?)/);
  const patients = grab(/(\d+)\s*(?:patients?|visits?|appointments?)/);
  return Object.assign({}, base, {
    key: 'custom', label: 'Your scenario',
    providers: clamp(providers == null ? base.providers : providers, 1, 8),
    nurses: clamp(nurses == null ? base.nurses : nurses, 1, 8),
    patients: clamp(patients == null ? base.patients : patients, 1, 160)
  });
}
function fmtMin(v) { return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' min'; }
function explainResults(model, info, mt, cmp) {
  if (!mt.seen) return ['No visits have finished yet. Play the day or run the whole day first.'];
  const out = [];
  out.push('Patients waited ' + fmtMin(mt.avgWait) + ' on average, ' + fmtMin(mt.lobbyWait) + ' of it in the lobby and the rest in the exam room before the provider arrived. 1 in 10 waited more than ' + fmtMin(mt.p90Wait) + '.');
  if (info.exams.length) {
    const far = info.exams.slice().sort((a, b) => b.distNurse - a.distNurse)[0];
    out.push('Each nurse walked ' + mt.nurseKm.toFixed(1) + ' km. The ' + info.nurseLabel.toLowerCase() + ' is ' + Math.round(info.avgNurse) + ' m from the average exam room, and ' + far.label + ' is farthest at ' + Math.round(far.distNurse) + ' m.');
    if (info.avgNurse > 9) out.push('Suggested change: move the ' + info.nurseLabel.toLowerCase() + ' closer to ' + far.label + ', for example by swapping it with a room next to it. Nurses repeat that walk for every patient.');
    else out.push('The ' + info.nurseLabel.toLowerCase() + ' already sits close to the exam rooms, so the next gain is more likely to come from staffing than from layout.');
  }
  if (mt.p90Wait > 15) {
    const use = Math.round(mt.examUse * 100);
    out.push(use >= 80
      ? 'Exam rooms were in use ' + use + '% of the day, so rooms are the limit at peak times. One more exam room would help more than more staff.'
      : 'Exam rooms sat empty ' + (100 - use) + '% of the day while patients waited, so staff are the limit. Try the same day with one more nurse.');
  }
  if (cmp && cmp.length > 1) {
    const best = cmp.slice().sort((a, b) => a.m.nurseKm - b.m.nurseKm)[0];
    const cur = cmp.find(r => r.name === model.name);
    if (best && cur && best.name !== model.name && cur.m.nurseKm > 0) {
      const pct = Math.round((1 - best.m.nurseKm / cur.m.nurseKm) * 100);
      if (pct > 0) out.push(best.name + ' cuts nurse walking by about ' + pct + '% on the same day.');
    }
  }
  return out;
}
/* Everything the view needs for one plan, built in one place. */
function preparePlan(json, extraItems) {
  const m = adaptPlan(json);
  const furn = planFurniture(m);
  if (extraItems && extraItems.length) { for (const it of extraItems) { furn.items.push(it); furn.blocks.push(itemRect(it)); } }
  const g = buildGrid(m, furn.blocks), pf = makePathfinder(g), info = analyzePlan(m, g, pf, furn);
  return { m, furn, g, pf, info };
}
/* ---------- Editing, checks and the guided tour (pure functions) ---------- */
const LOCKED_TYPES = new Set(['waiting', 'reception', 'corridor']);
function swapInSpec(spec, idA, idB) {
  if (!spec) return { error: 'Swapping rooms works on the sample layouts. For your own plans, layout changes go to Module 1.' };
  if (idA === idB) return { error: 'Pick two different rooms.' };
  for (const row of ['south', 'north']) {
    const list = spec[row], ia = list.findIndex(e => e[0] === idA), ib = list.findIndex(e => e[0] === idB);
    if (ia < 0 && ib < 0) continue;
    if (ia < 0 || ib < 0) return { error: 'Pick two rooms on the same side of the corridor.' };
    if (LOCKED_TYPES.has(list[ia][1]) || LOCKED_TYPES.has(list[ib][1])) return { error: 'The waiting room and reception stay where they are, because the entrance and check-in counter depend on them.' };
    const out = JSON.parse(JSON.stringify(spec));
    [out[row][ia], out[row][ib]] = [out[row][ib], out[row][ia]];
    return { spec: out };
  }
  return { error: 'Pick two rooms on the same side of the corridor.' };
}
/* Example U.S. checks computed from the plan. Module 2 will supply the real, complete rule set. */
function runChecks(P) {
  const m = P.m, info = P.info, out = [];
  out.push({ id: 'reach', label: 'Every room can be reached through doors', pass: info.unreachableRooms.length === 0,
    detail: info.unreachableRooms.length ? 'Not reachable: ' + info.unreachableRooms.join(', ') : 'All ' + m.rooms.length + ' rooms connect to the entrance', source: 'Computed from the plan' });
  const doors = m.doors.filter(d => d.kind === 'door' && !d.isEntrance);
  const clear = doors.length ? Math.min(...doors.map(d => d.width * 1000 - 85)) : 0;
  out.push({ id: 'door', label: 'Doors give at least 32 in (815 mm) clear width', pass: clear >= 815,
    detail: 'Narrowest door: about ' + Math.round(clear) + ' mm clear', source: 'Example rule: ADA 404.2.3' });
  const corr = m.rooms.filter(r => r.type === 'corridor'), cw = corr.length ? Math.min(...corr.map(r => Math.min(r.w, r.h))) : 0;
  out.push({ id: 'route', label: 'Corridors are at least 36 in (915 mm) wide', pass: cw >= 0.915,
    detail: 'Narrowest corridor: ' + cw.toFixed(2) + ' m', source: 'Example rule: ADA 403.5.1' });
  const rr = m.rooms.filter(r => r.type === 'restroom'), rmin = rr.length ? Math.min(...rr.map(r => Math.min(r.w, r.h))) : null;
  out.push({ id: 'turn', label: 'Restrooms fit a 60 in (1.525 m) turning circle', pass: rmin === null || rmin >= 1.525,
    detail: rmin === null ? 'No restrooms in this plan' : 'Smallest restroom side: ' + rmin.toFixed(2) + ' m (room size only, fixtures not counted)', source: 'Example rule: ADA 304.3.1' });
  const eg = info.routes.egress;
  out.push({ id: 'egress', label: 'Longest way out is under 61 m (200 ft)', pass: !!eg && eg.len <= 61,
    detail: eg ? Math.round(eg.len) + ' m, from ' + eg.fromLabel : 'No exit found', source: 'Example rule: IBC exit travel distance' });
  return out;
}
const PURPOSE = {
  waiting: 'Where patients sit after checking in, until a nurse calls them.',
  reception: 'Check-in and checkout. Staff see the waiting room through the counter.',
  exam_room: 'A nurse takes vitals first, then the provider sees the patient here.',
  procedure_room: 'Minor procedures that need more space than an exam room.',
  nurse_station: 'The nurses’ base. They walk from here to every exam room.',
  lab: 'Blood draws and sample handling.',
  provider_office: 'Providers chart and work here between visits.',
  staff_lounge: 'Break room for staff, with a kitchenette.',
  restroom: 'Accessible single-user restroom.',
  clean_utility: 'Clean supplies and linens.',
  soiled_utility: 'Used linens and waste, kept away from patients.',
  storage: 'General storage.',
  corridor: 'Connects every room to the lobby.'
};
/* Tour order follows a visit: entrance, lobby, exam rooms nearest first, then staff and support rooms, then out. */
function tourStops(P) {
  const m = P.m, info = P.info, stops = [{ kind: 'entrance' }];
  const add = r => { if (r && r.type !== 'corridor' && !stops.some(s => s.room === r)) stops.push({ room: r }); };
  m.rooms.filter(r => r.type === 'waiting').forEach(add);
  m.rooms.filter(r => r.type === 'reception').forEach(add);
  info.allExams.slice().sort((a, b) => a.distWait - b.distWait).forEach(e => add(m.rooms[e.k]));
  for (const t of ['nurse_station', 'procedure_room', 'lab', 'provider_office', 'staff_lounge', 'clean_utility', 'soiled_utility', 'storage', 'restroom']) m.rooms.filter(r => r.type === t).forEach(add);
  m.rooms.forEach(add);
  stops.push({ kind: 'exit' });
  return stops;
}
/* ---------- Scenario builder: typed blocks, presets, checks, compiler and multi-day runs (no DOM) ---------- */
/* Minutes from 8:00 am to a clock time like 9:30 am. */
function fmtClock(min) {
  const total = Math.round(480 + min), h24 = Math.floor(total / 60) % 24, mm = total % 60, h = ((h24 + 11) % 12) + 1;
  return h + ':' + String(mm).padStart(2, '0') + (h24 < 12 ? ' am' : ' pm');
}
const ROLE_NAMES = { provider: ['provider', 'providers'], nurse: ['nurse', 'nurses'], reception: ['receptionist', 'receptionists'] };
const ROLE_OPTIONS = { provider: 'Provider', nurse: 'Nurse', reception: 'Receptionist' };
const roleName = (r, n) => ROLE_NAMES[r] ? ROLE_NAMES[r][n === 1 ? 0 : 1] : r;
const hm = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return m ? +m[1] * 60 + +m[2] - 480 : NaN; };
const hmStr = t => { const v = clamp(Math.round(t + 480), 0, 1439); return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
const BLOCK_GROUPS = [
  { key: 'day', label: 'Day', hint: 'Opening hours and how many days to run' },
  { key: 'people', label: 'People', hint: 'Who works, and when' },
  { key: 'patients', label: 'Patients', hint: 'Who comes in, and when' },
  { key: 'visits', label: 'Visits', hint: 'What a visit involves' },
  { key: 'timeline', label: 'Timeline', hint: 'Breaks and changes during the day' },
  { key: 'rules', label: 'Rules', hint: 'React when something happens' }
];
/* Each block type is defined once: fields (type, range, default), how it reads, and where it sits on the timeline.
   Adding a block type means adding an entry here and, if it needs new behavior, a case in compileScenario. */
const BLOCK_TYPES = {
  hours: { group: 'day', label: 'Opening hours', single: true, required: true, icon: 'clock', desc: 'When the doors open and close',
    fields: { opens: { type: 'time', label: 'Opens', default: '08:00', min: '06:00', max: '12:00' }, closes: { type: 'time', label: 'Closes', default: '18:00', min: '12:00', max: '22:00' } },
    summary: f => fmtHM(f.opens) + ' to ' + fmtHM(f.closes) },
  run: { group: 'day', label: 'Run settings', single: true, required: true, icon: 'repeat', desc: 'How many days to simulate',
    fields: { days: { type: 'int', label: 'Days to simulate', default: 20, min: 1, max: 50, help: 'More days give a steadier range' }, seed: { type: 'int', label: 'Random seed', default: 42, min: 1, max: 99999, help: 'Same seed, same results' } },
    summary: f => f.days + (f.days === 1 ? ' day' : ' days') + ', seed ' + f.seed },
  shift: { group: 'people', label: 'Staff shift', icon: 'person', desc: 'A group of staff and their hours',
    fields: { role: { type: 'enum', label: 'Role', options: ROLE_OPTIONS, default: 'nurse' }, count: { type: 'int', label: 'How many', default: 1, min: 1, max: 10 }, from: { type: 'time', label: 'From', default: '08:00' }, to: { type: 'time', label: 'To', default: '18:00' } },
    timeline: { lane: 'staff', from: 'from', to: 'to' }, summary: f => f.count + ' ' + roleName(f.role, f.count) + ', ' + fmtHM(f.from) + ' to ' + fmtHM(f.to) },
  appointments: { group: 'patients', label: 'Appointments', icon: 'calendar', desc: 'Booked visits, spread evenly',
    fields: { count: { type: 'int', label: 'Booked visits', default: 50, min: 0, max: 200 }, from: { type: 'time', label: 'First slot', default: '08:00' }, to: { type: 'time', label: 'Last slot', default: '16:30' }, no_show: { type: 'percent', label: 'No-shows', default: 5, min: 0, max: 50 } },
    timeline: { lane: 'arrivals', from: 'from', to: 'to' }, summary: f => f.count + ' booked, ' + fmtHM(f.from) + ' to ' + fmtHM(f.to) + ', ' + f.no_show + '% no-shows' },
  walkins: { group: 'patients', label: 'Walk-ins', icon: 'door', desc: 'Patients without a booking',
    fields: { count: { type: 'int', label: 'Walk-ins', default: 10, min: 0, max: 200 }, pattern: { type: 'enum', label: 'When they come', options: { steady: 'Spread through the day', morning: 'Morning rush', lunch: 'Lunch peak', afternoon: 'After-school peak' }, default: 'steady' }, from: { type: 'time', label: 'From', default: '08:00' }, to: { type: 'time', label: 'To', default: '17:00' } },
    timeline: { lane: 'arrivals', from: 'from', to: 'to' }, summary: f => f.count + ' walk-ins, ' + ({ steady: 'spread out', morning: 'mostly in the morning', lunch: 'mostly at lunch', afternoon: 'mostly after school' })[f.pattern] },
  visit_type: { group: 'visits', label: 'Visit type', icon: 'stethoscope', desc: 'A kind of visit and the provider’s time',
    fields: { name: { type: 'text', label: 'Name', default: 'Standard visit', max: 32 }, share: { type: 'percent', label: 'Share of patients', default: 60, min: 1, max: 100 }, provider_min: { type: 'range', label: 'Provider time (min)', default: [15, 25], min: 3, max: 120 } },
    summary: f => f.name + ': ' + f.share + '%, ' + f.provider_min[0] + '–' + f.provider_min[1] + ' min' },
  steps: { group: 'visits', label: 'Visit steps', single: true, required: true, icon: 'steps', desc: 'Check-in, nurse intake and checkout',
    fields: { checkin: { type: 'range', label: 'Check-in (min)', default: [2, 4], min: 1, max: 20 }, intake: { type: 'range', label: 'Nurse intake (min)', default: [5, 9], min: 1, max: 40 }, checkout: { type: 'range', label: 'Checkout (min)', default: [1, 3], min: 1, max: 20 } },
    summary: f => 'Check-in ' + f.checkin.join('–') + ', intake ' + f.intake.join('–') + ', checkout ' + f.checkout.join('–') + ' min' },
  break: { group: 'timeline', label: 'Break', icon: 'coffee', desc: 'Staff step away for a while',
    fields: { role: { type: 'enum', label: 'Who', options: ROLE_OPTIONS, default: 'nurse' }, minutes: { type: 'int', label: 'Length (min)', default: 30, min: 5, max: 120 }, from: { type: 'time', label: 'Between', default: '12:00' }, to: { type: 'time', label: 'And', default: '14:00' }, stagger: { type: 'bool', label: 'One at a time', default: true } },
    timeline: { lane: 'staff', from: 'from', to: 'to', soft: true }, summary: f => roleName(f.role, 2).replace(/^./, c => c.toUpperCase()) + ' take ' + f.minutes + ' min between ' + fmtHM(f.from) + ' and ' + fmtHM(f.to) + (f.stagger ? ', one at a time' : ', together') },
  out: { group: 'timeline', label: 'Staff out', icon: 'person-off', desc: 'Someone is away for part of the day',
    fields: { role: { type: 'enum', label: 'Who', options: ROLE_OPTIONS, default: 'provider' }, count: { type: 'int', label: 'How many', default: 1, min: 1, max: 10 }, from: { type: 'time', label: 'From', default: '13:00' }, to: { type: 'time', label: 'To', default: '15:00' } },
    timeline: { lane: 'events', from: 'from', to: 'to' }, summary: f => f.count + ' ' + roleName(f.role, f.count) + ' out, ' + fmtHM(f.from) + ' to ' + fmtHM(f.to) },
  closed: { group: 'timeline', label: 'Room closed', icon: 'lock', desc: 'A room can’t be used for a while',
    fields: { room: { type: 'room', label: 'Room', roomTypes: ['exam_room'], default: '' }, from: { type: 'time', label: 'From', default: '09:00' }, to: { type: 'time', label: 'To', default: '11:00' } },
    timeline: { lane: 'events', from: 'from', to: 'to' }, summary: (f, P) => (roomLabel(P, f.room) || 'No room picked') + ' closed, ' + fmtHM(f.from) + ' to ' + fmtHM(f.to) },
  group: { group: 'timeline', label: 'Group arrival', icon: 'group', desc: 'Several patients arrive at once',
    fields: { count: { type: 'int', label: 'Patients', default: 6, min: 1, max: 40 }, at: { type: 'time', label: 'At', default: '15:30' } },
    timeline: { lane: 'events', at: 'at' }, summary: f => f.count + ' patients at ' + fmtHM(f.at) },
  rule: { group: 'rules', label: 'When / Then', icon: 'bolt', desc: 'If something happens, do something',
    fields: {
      metric: { type: 'enum', label: 'When', options: { waiting: 'patients waiting in the lobby', longest: 'the longest current wait (min)', desk: 'the line at reception', free_rooms: 'free exam rooms' }, default: 'waiting' },
      op: { type: 'enum', label: 'is', options: { gt: 'more than', lt: 'less than' }, default: 'gt' },
      value: { type: 'int', label: 'Value', default: 8, min: 0, max: 200 },
      hold: { type: 'int', label: 'For at least (min)', default: 15, min: 0, max: 180 },
      from: { type: 'time', label: 'Between', default: '08:00' }, to: { type: 'time', label: 'And', default: '14:00' },
      action: { type: 'enum', label: 'Then', options: { call_in: 'call in extra staff', pause_walkins: 'stop taking walk-ins' }, default: 'call_in' },
      role: { type: 'enum', label: 'Who', options: ROLE_OPTIONS, default: 'nurse', showIf: f => f.action === 'call_in' },
      count: { type: 'int', label: 'How many', default: 1, min: 1, max: 5, showIf: f => f.action === 'call_in' },
      delay: { type: 'int', label: 'Arrives after (min)', default: 20, min: 0, max: 120, showIf: f => f.action === 'call_in' },
      duration: { type: 'int', label: 'For (min)', default: 120, min: 10, max: 600 }
    },
    timeline: { lane: 'rules', from: 'from', to: 'to' }, summary: f => ruleText(f) }
};
function fmtHM(v) { const t = hm(v); return isNaN(t) ? '?' : fmtClock(t); }
function roomLabel(P, id) { const r = P && P.m.rooms.find(q => q.id === id); return r ? r.label : ''; }
function ruleText(f) {
  const what = BLOCK_TYPES.rule.fields.metric.options[f.metric], op = f.op === 'lt' ? 'less than' : 'more than';
  const act = f.action === 'call_in' ? 'call in ' + f.count + ' ' + roleName(f.role, f.count) + ' for ' + f.duration + ' min' : 'stop taking walk-ins for ' + f.duration + ' min';
  return 'When ' + what + ' is ' + op + ' ' + f.value + (f.hold ? ' for ' + f.hold + ' min' : '') + ', ' + act;
}
let blockSeq = 0;
function makeBlock(type, over) {
  const T = BLOCK_TYPES[type], fields = {};
  for (const [k, f] of Object.entries(T.fields)) fields[k] = Array.isArray(f.default) ? f.default.slice() : f.default;
  return { id: 'b' + Date.now().toString(36) + (++blockSeq).toString(36), type, enabled: true, fields: Object.assign(fields, over || {}) };
}
const SCENARIO_PRESETS = {
  normal: { label: 'Normal Tuesday', desc: '3 providers, 2 nurses, about 60 patients', make: () => [
    makeBlock('hours'), makeBlock('run'),
    makeBlock('shift', { role: 'provider', count: 3 }), makeBlock('shift', { role: 'nurse', count: 2 }), makeBlock('shift', { role: 'reception', count: 1 }),
    makeBlock('appointments', { count: 50 }), makeBlock('walkins', { count: 9 }),
    makeBlock('visit_type', { name: 'Quick follow-up', share: 25, provider_min: [8, 12] }), makeBlock('visit_type', { name: 'Standard visit', share: 60, provider_min: [15, 25] }), makeBlock('visit_type', { name: 'Long visit', share: 15, provider_min: [30, 40] }),
    makeBlock('steps'),
    makeBlock('break', { role: 'nurse', minutes: 30, from: '12:00', to: '14:00', stagger: true }), makeBlock('break', { role: 'provider', minutes: 30, from: '12:00', to: '14:00', stagger: true })
  ] },
  flu: { label: 'Flu-season Monday', desc: '90 patients, a morning rush, a rule that calls in help', make: () => [
    makeBlock('hours'), makeBlock('run'),
    makeBlock('shift', { role: 'provider', count: 3 }), makeBlock('shift', { role: 'nurse', count: 2 }), makeBlock('shift', { role: 'reception', count: 1 }),
    makeBlock('appointments', { count: 53, no_show: 5 }), makeBlock('walkins', { count: 40, pattern: 'morning' }),
    makeBlock('visit_type', { name: 'Flu check', share: 45, provider_min: [6, 12] }), makeBlock('visit_type', { name: 'Standard visit', share: 45, provider_min: [12, 20] }), makeBlock('visit_type', { name: 'Long visit', share: 10, provider_min: [25, 35] }),
    makeBlock('steps', { intake: [4, 8] }),
    makeBlock('break', { role: 'nurse', minutes: 30, from: '12:30', to: '14:30', stagger: true }),
    makeBlock('rule', { metric: 'desk', op: 'gt', value: 3, hold: 10, from: '08:00', to: '13:00', action: 'call_in', role: 'reception', count: 1, delay: 15, duration: 240 })
  ] },
  short: { label: 'Short-staffed day', desc: '2 providers, 1 nurse, a provider out after lunch', make: () => [
    makeBlock('hours'), makeBlock('run'),
    makeBlock('shift', { role: 'provider', count: 2 }), makeBlock('shift', { role: 'nurse', count: 1 }), makeBlock('shift', { role: 'reception', count: 1 }),
    makeBlock('appointments', { count: 44 }), makeBlock('walkins', { count: 6 }),
    makeBlock('visit_type', { name: 'Standard visit', share: 80, provider_min: [15, 25] }), makeBlock('visit_type', { name: 'Long visit', share: 20, provider_min: [30, 40] }),
    makeBlock('steps'),
    makeBlock('break', { role: 'nurse', minutes: 30, from: '12:00', to: '13:00', stagger: true }),
    makeBlock('out', { role: 'provider', count: 1, from: '13:00', to: '15:00' })
  ] },
  custom: { label: 'Custom', desc: 'Start from the basics and add your own blocks', make: () => [makeBlock('hours'), makeBlock('run'), makeBlock('steps')] }
};
function makeScenario(preset) {
  const P = SCENARIO_PRESETS[preset] || SCENARIO_PRESETS.custom;
  return { schema: 'fi.scenario.v1', name: preset === 'custom' ? 'My scenario' : P.label, preset, blocks: P.make() };
}
function checkField(f, v, P) {
  if (f.type === 'int' || f.type === 'percent') {
    if (typeof v !== 'number' || !isFinite(v)) return 'enter a number';
    if (f.type === 'int' && !Number.isInteger(v)) return 'use a whole number';
    if (f.min != null && v < f.min) return 'at least ' + f.min;
    if (f.max != null && v > f.max) return 'at most ' + f.max;
  } else if (f.type === 'time') {
    if (isNaN(hm(v))) return 'enter a time';
    if (f.min && hm(v) < hm(f.min)) return 'no earlier than ' + fmtHM(f.min);
    if (f.max && hm(v) > hm(f.max)) return 'no later than ' + fmtHM(f.max);
  } else if (f.type === 'enum') { if (!Object.prototype.hasOwnProperty.call(f.options, v)) return 'pick an option'; }
  else if (f.type === 'text') { if (!String(v || '').trim()) return 'enter a name'; if (String(v).length > (f.max || 40)) return 'keep it under ' + (f.max || 40) + ' characters'; }
  else if (f.type === 'range') {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(x => typeof x === 'number' && isFinite(x))) return 'enter two numbers';
    if (v[0] > v[1]) return 'the first number should be the smaller one';
    if (v[0] < f.min || v[1] > f.max) return 'keep it between ' + f.min + ' and ' + f.max;
  } else if (f.type === 'bool') { if (typeof v !== 'boolean') return 'turn it on or off'; }
  else if (f.type === 'room') { if (v && P && !P.m.rooms.some(r => r.id === v)) return 'this plan has no such room'; }
  return null;
}
/* Problems: errors stop a run, warnings don't. Each points at a block (and field) where it can. */
function validateScenario(scn, P) {
  const out = [], on = scn.blocks.filter(b => b.enabled !== false);
  const add = (level, b, msg, field) => out.push({ level, block: b ? b.id : null, field: field || null, msg });
  for (const b of scn.blocks) {
    const T = BLOCK_TYPES[b.type];
    if (!T) { add('error', b, 'Unknown block type “' + b.type + '”.'); continue; }
    if (b.enabled === false) continue;
    for (const [k, f] of Object.entries(T.fields)) { if (f.showIf && !f.showIf(b.fields)) continue; const e = checkField(f, b.fields[k], P); if (e) add('error', b, T.label + ', ' + f.label.toLowerCase() + ': ' + e + '.', k); }
  }
  for (const [t, T] of Object.entries(BLOCK_TYPES)) {
    if (!T.single) continue;
    const list = on.filter(b => b.type === t);
    if (T.required && !list.length) add('error', null, 'Add an “' + T.label + '” block.');
    if (list.length > 1) add('error', list[1], 'Only one “' + T.label + '” block can be on. Switch off or remove the extra one.');
  }
  const hb = on.find(b => b.type === 'hours'), opens = hb ? hm(hb.fields.opens) : 0, closes = hb ? hm(hb.fields.closes) : 600;
  if (hb && closes <= opens) add('error', hb, 'Opening hours: closing time must be after opening time.', 'closes');
  for (const b of on) {
    const f = b.fields, T = BLOCK_TYPES[b.type];
    if (!T || b.type === 'hours' || b.type === 'run') continue;
    if (f.from != null && f.to != null && !isNaN(hm(f.from)) && !isNaN(hm(f.to)) && hm(f.to) <= hm(f.from)) add('error', b, T.label + ': the end time must be after the start time.', 'to');
    const ts = ['from', 'to', 'at'].filter(k => f[k] != null && !isNaN(hm(f[k]))).map(k => hm(f[k]));
    if (hb && ts.some(t => t < opens || t > closes)) add('warning', b, T.label + ' goes outside opening hours.');
  }
  const staff = { provider: 0, nurse: 0, reception: 0 };
  for (const b of on.filter(b => b.type === 'shift')) if (staff[b.fields.role] != null && typeof b.fields.count === 'number') staff[b.fields.role] += b.fields.count;
  for (const [r, n] of Object.entries(staff)) if (!n) add('error', null, 'No ' + roleName(r, 1) + ' is on shift. Add a “Staff shift” for ' + roleName(r, 2) + '.');
  const patients = on.reduce((s, b) => s + (['appointments', 'walkins', 'group'].includes(b.type) && typeof b.fields.count === 'number' ? b.fields.count : 0), 0);
  if (!patients) add('error', null, 'No patients arrive. Add appointments, walk-ins or a group arrival.');
  const vts = on.filter(b => b.type === 'visit_type');
  if (!vts.length) add('warning', null, 'No visit types, so every visit takes 12–26 minutes with the provider.');
  else { const sum = vts.reduce((s, b) => s + (+b.fields.share || 0), 0); if (Math.abs(sum - 100) > 0.5) add('warning', vts[0], 'Visit type shares add up to ' + sum + '%. They’ll be scaled to 100%.'); }
  for (const b of on.filter(b => b.type === 'break')) {
    const n = staff[b.fields.role] || 0, win = hm(b.fields.to) - hm(b.fields.from);
    if (b.fields.stagger && n * b.fields.minutes > win) add('warning', b, 'Break: ' + n + ' ' + roleName(b.fields.role, n) + ' × ' + b.fields.minutes + ' min don’t fit between ' + fmtHM(b.fields.from) + ' and ' + fmtHM(b.fields.to) + ' one at a time. Later breaks will run past the window.');
  }
  for (const b of on.filter(b => b.type === 'out')) { const n = staff[b.fields.role] || 0; if (b.fields.count >= n && n) add('warning', b, 'Staff out: that’s every ' + roleName(b.fields.role, 1) + ' on shift.'); }
  for (const b of on.filter(b => b.type === 'closed')) if (!b.fields.room) add('error', b, 'Room closed: pick a room.', 'room');
  const lastArrival = Math.max(-Infinity, ...on.filter(b => ['appointments', 'walkins'].includes(b.type)).map(b => hm(b.fields.to)), ...on.filter(b => b.type === 'group').map(b => hm(b.fields.at)));
  if (isFinite(lastArrival)) for (const r of ['provider', 'nurse', 'reception']) {
    const ends = on.filter(b => b.type === 'shift' && b.fields.role === r).map(b => hm(b.fields.to)).filter(t => !isNaN(t));
    if (ends.length && Math.max(...ends) < lastArrival) add('warning', on.find(b => b.type === 'shift' && b.fields.role === r && hm(b.fields.to) === Math.max(...ends)), 'Patients keep arriving until ' + fmtClock(lastArrival) + ', but the last ' + roleName(r, 1) + ' leaves at ' + fmtClock(Math.max(...ends)) + '. Anyone still waiting then won’t be seen.');
  }
  return out;
}
function compileScenario(scn) {
  const on = scn.blocks.filter(b => b.enabled !== false && BLOCK_TYPES[b.type]), F = b => b.fields, all = t => on.filter(b => b.type === t);
  const hb = all('hours')[0], rb = all('run')[0], st = all('steps')[0];
  const opens = hb ? hm(F(hb).opens) : 0, closes = hb ? hm(F(hb).closes) : 600;
  const staffPlan = { provider: [], nurse: [], reception: [] };
  for (const b of all('shift')) for (let k = 0; k < F(b).count; k++) staffPlan[F(b).role].push({ from: hm(F(b).from), to: hm(F(b).to) });
  const arrivalsPlan = [];
  for (const b of all('appointments')) arrivalsPlan.push({ kind: 'appt', count: F(b).count, from: hm(F(b).from), to: hm(F(b).to), noShow: F(b).no_show / 100 });
  for (const b of all('walkins')) arrivalsPlan.push({ kind: 'walkin', count: F(b).count, pattern: F(b).pattern, from: hm(F(b).from), to: hm(F(b).to) });
  for (const b of all('group')) arrivalsPlan.push({ kind: 'group', count: F(b).count, at: hm(F(b).at) });
  const visitTypes = all('visit_type').map(b => ({ name: F(b).name, share: F(b).share, prov: F(b).provider_min.slice() }));
  const tot = visitTypes.reduce((s2, v) => s2 + v.share, 0) || 1;
  visitTypes.forEach(v => { v.p = v.share / tot; });
  const steps = st ? F(st) : { checkin: [2, 4], intake: [5, 9], checkout: [1, 3] };
  const expected = arrivalsPlan.reduce((s2, a) => s2 + (a.kind === 'appt' ? a.count * (1 - a.noShow) : a.count), 0);
  return Object.assign({}, BASE_SCENARIO, {
    key: scn.preset || 'custom', label: scn.name || 'Custom day', opens, closes, staffPlan, arrivalsPlan, visitTypes,
    breaks: all('break').map(b => ({ role: F(b).role, minutes: F(b).minutes, from: hm(F(b).from), to: hm(F(b).to), stagger: !!F(b).stagger })),
    outs: all('out').map(b => ({ role: F(b).role, count: F(b).count, from: hm(F(b).from), to: hm(F(b).to) })),
    closures: all('closed').filter(b => F(b).room).map(b => ({ room: F(b).room, from: hm(F(b).from), to: hm(F(b).to) })),
    rules: all('rule').map(b => ({ id: b.id, label: ruleText(F(b)), metric: F(b).metric, op: F(b).op, value: F(b).value, hold: F(b).hold, from: hm(F(b).from), to: hm(F(b).to), action: F(b).action, role: F(b).role, count: F(b).count, delay: F(b).delay, duration: F(b).duration })),
    checkInMin: steps.checkin.slice(), intakeMin: steps.intake.slice(), checkoutMin: steps.checkout.slice(),
    providers: staffPlan.provider.length, nurses: staffPlan.nurse.length, receptionists: staffPlan.reception.length,
    patients: Math.round(expected), days: rb ? F(rb).days : 20, seed: rb ? F(rb).seed : 42, firstArrival: opens, lastArrival: closes
  });
}
/* Runs the same scenario on several days with different random arrivals, and summarizes the range. */
const DAY_KEYS = ['seen', 'avgWait', 'p90Wait', 'avgTime', 'nurseKm', 'examUse', 'turnedAway', 'noShows', 'notSeen', 'utilNurse', 'utilProvider', 'utilReception', 'lastExit', 'maxWaiting', 'fires'];
function daySeed(seed, d) { return (seed * 7919 + d * 104729) % 2147483647 || 1; }
function runDay(P, sc, seed) { const sim = new ClinicSim(P.m, P.g, P.pf, P.info, sc, seed); sim.runAll(); return Object.assign(sim.metrics(), { seed, fireList: sim.fires.slice(), series: sim.series, opens: sim.opens, closes: sim.closes }); }
function summarizeDays(days) {
  const agg = {};
  for (const k of DAY_KEYS) {
    const v = days.map(d => d[k] || 0).sort((a, b) => a - b);
    agg[k] = { mean: v.reduce((s2, x) => s2 + x, 0) / v.length, lo: v[Math.floor(0.1 * (v.length - 1))], hi: v[Math.ceil(0.9 * (v.length - 1))] };
  }
  const waits = days.map(d => d.avgWait).sort((a, b) => a - b), med = waits[Math.floor((waits.length - 1) / 2)];
  const typical = days.reduce((best, d) => (Math.abs(d.avgWait - med) < Math.abs(best.avgWait - med) ? d : best), days[0]);
  const fireDays = {};
  for (const d of days) for (const f of d.fireList) fireDays[f.id] = (fireDays[f.id] || 0) + 1;
  return { n: days.length, agg, typical, fireDays };
}
function verdictOf(sum) {
  const a = sum.agg, p90 = a.p90Wait.mean, util = { nurses: a.utilNurse.mean, providers: a.utilProvider.mean, reception: a.utilReception.mean, 'exam rooms': a.examUse.mean };
  const [bk, bv] = Object.entries(util).sort((x, y) => y[1] - x[1])[0];
  let level = p90 <= 15 && a.turnedAway.mean < 0.5 ? 'good' : p90 <= 40 ? 'busy' : 'bad';
  if (a.notSeen.mean >= 3) level = 'bad'; else if (a.notSeen.mean >= 0.5 && level === 'good') level = 'busy';
  const title = level === 'good' ? 'Handles it' : level === 'busy' ? 'Busy, but it copes' : 'Struggles';
  const peak = (() => { const s2 = sum.typical.series; let best = s2[0]; for (const x of s2) if (x.lobby > best.lobby) best = x; return best; })();
  return { level, title, bottleneck: { name: bk, util: bv }, util, peak };
}
/* Changes a scenario for "what if" questions and ranges: patients scales every arrival block, staff roles set the first shift's count. */
function applyOverrides(scn, o) {
  const s2 = JSON.parse(JSON.stringify(scn));
  const on = s2.blocks.filter(b => b.enabled !== false);
  if (o.patients != null) {
    const arr = on.filter(b => ['appointments', 'walkins', 'group'].includes(b.type)), cur = arr.reduce((t, b) => t + b.fields.count, 0);
    if (cur > 0) arr.forEach(b => { b.fields.count = Math.max(0, Math.round(b.fields.count * o.patients / cur)); });
    else s2.blocks.push(makeBlock('appointments', { count: o.patients }));
  }
  for (const role of ['provider', 'nurse', 'reception']) {
    const v = o[role === 'reception' ? 'receptionists' : role + 's'];
    if (v == null) continue;
    const shifts = on.filter(b => b.type === 'shift' && b.fields.role === role);
    if (shifts.length) { const rest = shifts.slice(1).reduce((t, b) => t + b.fields.count, 0); shifts[0].fields.count = Math.max(1, v - rest); }
    else s2.blocks.push(makeBlock('shift', { role, count: v }));
  }
  return s2;
}
/* ENGINE:END */
