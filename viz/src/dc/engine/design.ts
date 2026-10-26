/* Building program and layout: halls, power and support rooms, corridors, yards and doors.

   South to north:
     [generator yard] [support row: dock, staging, storage, NOC, office, MMR] [corridor 2]
     [power row: electrical, UPS, battery, mechanical, + a link to corridor 1] [corridor 1]
     [data halls] [cooling yard]
   Rack delivery runs dock -> staging -> corridor 2 -> link -> corridor 1 -> hall. */
import { CORRIDOR, HALL_DOOR, MAX_HALL_KW, MAX_RACKS_PER_HALL, RACK_PROFILES, UNITS } from './catalog';
import { fillHall, shapeHall, unitsFor } from './hall';
import type { Basis, Cooling, Design, Door, Equip, Room, RoomType } from './types';

const LANE = 6000; // two facing lines of UPS blocks, cabinets or switchgear with a 2.5 m aisle
const SUPPORT_ROW = 8000;
const SOUTH_YARD = 13000;
const NORTH_YARD = 11000;
const SITE_MARGIN = 3000;
const LINK = 3000;
const GRID = 100;
const snap = (v: number) => Math.round(v / GRID) * GRID;

/* Peak facility load per kW of IT, for sizing generators and heat rejection (design point, not average). */
export const PEAK_OVERHEAD: Record<Cooling, number> = { liquid: 1.2, hybrid: 1.3, air: 1.45 };

interface Strip {
  id: string;
  type: RoomType;
  name: string;
  w: number;
  grow?: number; // share of leftover width this room takes
}

const ROOM_NAMES: Record<RoomType, string> = {
  data_hall: 'Data hall',
  ups_room: 'Battery backup (UPS)',
  battery_room: 'Batteries',
  electrical_room: 'Switchgear',
  mechanical_room: 'Pumps & heat exchangers',
  mmr: 'Network entry (meet-me room)',
  noc: 'Operations centre',
  office: 'Offices',
  staging: 'Staging',
  loading_dock: 'Loading dock',
  storage: 'Spares store',
  corridor: 'Corridor',
  generator_yard: 'Generator yard',
  cooling_yard: 'Cooling yard'
};
export const roomName = (t: RoomType) => ROOM_NAMES[t];

const TITLES: Record<Cooling, string> = {
  liquid: 'Liquid-cooled',
  hybrid: 'Hybrid',
  air: 'Air-cooled'
};
const SUMMARIES: Record<Cooling, string> = {
  liquid: 'Few, very powerful AI racks cooled by water pipes to the chips. Smallest hall, lowest power bills.',
  hybrid: 'Mid-density racks with water-cooled rear doors. A middle ground that suits mixed hardware.',
  air: 'Many lower-power racks cooled by moving air. Familiar and flexible, but a big hall and higher bills.'
};

export function generateDesign(basis: Basis, cooling: Cooling): Design {
  const profile = RACK_PROFILES[cooling];
  const racks = Math.max(1, Math.ceil(basis.itKw / profile.kw - 1e-9));
  const itKw = racks * profile.kw;

  // Halls: split evenly so none exceeds the rack or power limit.
  const halls = Math.max(Math.ceil(racks / MAX_RACKS_PER_HALL), Math.ceil(itKw / MAX_HALL_KW));
  const perHall = Array.from({ length: halls }, (_, i) => Math.floor(racks / halls) + (i < racks % halls ? 1 : 0));
  const shapes = perHall.map((n) => shapeHall(n, profile, basis.coolingRedundancy));
  const hallH = Math.max(...shapes.map((s) => s.h));

  // Power plant counts.
  const facilityKw = itKw * PEAK_OVERHEAD[cooling];
  const twoN = basis.powerRedundancy === '2N';
  const upsPerSide = twoN
    ? unitsFor(itKw, UNITS.ups.capacityKw, 'N')
    : unitsFor(itKw, UNITS.ups.capacityKw, basis.powerRedundancy);
  const sides: ('A' | 'B')[] = twoN ? ['A', 'B'] : ['A'];
  const gens = unitsFor(facilityKw, UNITS.generator.capacityKw, twoN ? '2N' : 'N+1');
  const lineups = Math.ceil(facilityKw / 3000);
  const dryCoolers = unitsFor(itKw * 1.1, UNITS.drycooler.capacityKw, basis.coolingRedundancy);

  const mw = itKw / 1000;
  const hallsW = shapes.reduce((a, s) => a + s.w, 0);
  // Deeper power rooms (more lanes) keep the power row from outgrowing the halls on big sites.
  const powerWidths = (lanes: number) => {
    const depth = 1500 + lanes * LANE;
    const perLine = (n: number) => Math.ceil(n / (2 * lanes));
    return {
      depth,
      ups: snap(perLine(upsPerSide) * (UNITS.ups.w + 300) + 2400),
      bat: snap(perLine(upsPerSide) * (UNITS.battery.w + 300) + 2400),
      elec: snap(perLine(lineups) * (UNITS.switchgear.w + 300) + 2400),
      mech: snap(Math.max(6000, (((cooling === 'air' ? 30 : 45) + (cooling === 'air' ? 12 : 28) * mw) * 1e6) / depth))
    };
  };
  const rowWidth = (p: ReturnType<typeof powerWidths>) => LINK + sides.length * (p.ups + p.bat + p.elec) + p.mech;
  let lanes = 1;
  while (lanes < 4 && rowWidth(powerWidths(lanes)) > Math.max(hallsW, 45000)) lanes++;
  const pw = powerWidths(lanes);
  const POWER_ROW = pw.depth;

  const power: Strip[] = [{ id: 'link_1', type: 'corridor', name: 'Link corridor', w: LINK }];
  sides.forEach((s) => {
    const suffix = twoN ? ` ${s}` : '';
    power.push(
      { id: `electrical_${s}`, type: 'electrical_room', name: `Switchgear${suffix}`, w: pw.elec },
      { id: `ups_${s}`, type: 'ups_room', name: `UPS${suffix}`, w: pw.ups },
      { id: `battery_${s}`, type: 'battery_room', name: `Batteries${suffix}`, w: pw.bat }
    );
    if (s === 'A') power.push({ id: 'mechanical_1', type: 'mechanical_room', name: roomName('mechanical_room'), w: pw.mech, grow: 1 });
  });
  if (twoN) {
    // mirror side B so the two power trains sit apart, with the mechanical room between them
    const b = power.splice(5, 3).reverse();
    power.push(...b);
  }
  const support: Strip[] = [
    { id: 'loading_dock_1', type: 'loading_dock', name: roomName('loading_dock'), w: 7000 },
    { id: 'staging_1', type: 'staging', name: roomName('staging'), w: snap(Math.max(6000, 6000 + 300 * mw)), grow: 2 },
    { id: 'storage_1', type: 'storage', name: roomName('storage'), w: 4500, grow: 1 },
    { id: 'noc_1', type: 'noc', name: roomName('noc'), w: 6500 },
    { id: 'office_1', type: 'office', name: roomName('office'), w: 6000, grow: 1 },
    { id: 'mmr_1', type: 'mmr', name: 'Network entry', w: 4000 }
  ];

  const x0Const = SITE_MARGIN;
  const sum = (s: Strip[]) => s.reduce((a, r) => a + r.w, 0);
  const W = snap(Math.max(hallsW, sum(power), sum(support)));

  const spread = (strips: Strip[]) => {
    const extra = W - sum(strips);
    const weights = strips.reduce((a, s) => a + (s.grow ?? 0), 0);
    let used = 0;
    strips.forEach((s) => {
      if (s.grow) {
        const add = snap((extra * s.grow) / weights);
        s.w += add;
        used += add;
      }
    });
    const last = [...strips].reverse().find((s) => s.grow)!;
    last.w += extra - used;
  };
  spread(power);
  spread(support);

  // Yard lines: generators and transformers fill lines across the site width.
  const yardItems: { kind: 'generator' | 'transformer'; side: 'A' | 'B'; n: number }[] = [];
  sides.forEach((s) => yardItems.push({ kind: 'transformer', side: s, n: 1 }));
  for (let g = 0; g < gens; g++) yardItems.push({ kind: 'generator', side: twoN ? (g % 2 ? 'B' : 'A') : 'A', n: g + 1 });
  const yardSlots: { x: number; line: number }[] = [];
  let gx = x0Const + 1500;
  let line = 0;
  yardItems.forEach((it) => {
    const u = it.kind === 'generator' ? UNITS.generator : UNITS.transformer;
    if (gx + u.w > x0Const + W - 1000) {
      gx = x0Const + 1500;
      line++;
    }
    yardSlots.push({ x: gx, line });
    gx += u.w + 1000;
  });
  const southYard = Math.max(SOUTH_YARD, (line + 1) * (UNITS.generator.d + 1000) + 3000);

  // y bands
  const yBuilding = SITE_MARGIN + southYard;
  const ySupport = yBuilding;
  const yCor2 = ySupport + SUPPORT_ROW;
  const yPower = yCor2 + CORRIDOR;
  const yCor1 = yPower + POWER_ROW;
  const yHalls = yCor1 + CORRIDOR;
  const yTop = yHalls + hallH;
  const x0 = x0Const;

  const rooms: Room[] = [];
  const doors: Door[] = [];
  const equipment: Equip[] = [];
  const rows: Design['rows'] = [];
  const aisles: Design['aisles'] = [];
  const room = (id: string, type: RoomType, name: string, x: number, y: number, w: number, h: number, outdoor = false) =>
    rooms.push({ id, type, name, x, y, w, h, outdoor });
  const door = (id: string, a: string, b: string, x: number, y: number, width: number, axis: 'x' | 'y') =>
    doors.push({ id, rooms: [a, b], x, y, width, axis });

  room('corridor_1', 'corridor', 'Main corridor', x0, yCor1, W, CORRIDOR);
  room('corridor_2', 'corridor', 'Front corridor', x0, yCor2, W, CORRIDOR);
  door('door_entrance', 'corridor_2', 'outside', x0 + W, yCor2 + CORRIDOR / 2, 1800, 'y');

  // Halls, left to right; leftover width becomes room to grow.
  let hx = x0;
  shapes.forEach((shape, i) => {
    const id = `data_hall_${i + 1}`;
    const extra = i === shapes.length - 1 ? W - hallsW : 0;
    const grow = extra > 0 && extra < 9000 ? extra : 0;
    const w = shape.w + grow;
    room(id, 'data_hall', halls > 1 ? `Data hall ${i + 1}` : 'Data hall', hx, yHalls, w, hallH);
    door(`door_${id}`, id, 'corridor_1', hx + w - 2400, yHalls, HALL_DOOR, 'x');
    const fill = fillHall(id, i + 1, hx, yHalls, w, hallH, shape, profile, basis.powerRedundancy);
    equipment.push(...fill.equipment);
    rows.push(...fill.rows);
    aisles.push(...fill.aisles);
    hx += w;
    if (i === shapes.length - 1 && extra >= 9000) {
      room('future_hall', 'data_hall', 'Room to grow', hx, yHalls, extra, hallH);
      door('door_future_hall', 'future_hall', 'corridor_1', hx + extra / 2, yHalls, HALL_DOOR, 'x');
    }
  });

  // Power row.
  let px = x0;
  power.forEach((s) => {
    room(s.id, s.type, s.name, px, yPower, s.w, POWER_ROW);
    if (s.type === 'corridor') {
      door(`door_${s.id}_n`, s.id, 'corridor_1', px + s.w / 2, yCor1, LINK, 'x');
      door(`door_${s.id}_s`, s.id, 'corridor_2', px + s.w / 2, yPower, LINK, 'x');
    } else {
      door(`door_${s.id}`, s.id, 'corridor_1', px + s.w / 2, yCor1, s.type === 'battery_room' ? 1200 : 1800, 'x');
    }
    const side = s.id.endsWith('_B') ? 'B' : 'A';
    if (s.type === 'ups_room') placeLines(equipment, 'ups', s.id, side, upsPerSide, lanes, px, yPower, s.w);
    if (s.type === 'battery_room') placeLines(equipment, 'battery', s.id, side, upsPerSide, lanes, px, yPower, s.w);
    if (s.type === 'electrical_room') placeLines(equipment, 'switchgear', s.id, side, lineups, lanes, px, yPower, s.w);
    px += s.w;
  });

  // Support row.
  let sx = x0;
  support.forEach((s) => {
    room(s.id, s.type, s.name, sx, ySupport, s.w, SUPPORT_ROW);
    if (s.type === 'loading_dock') {
      door('door_dock_truck', s.id, 'outside', sx + s.w / 2, ySupport, 3600, 'x');
      door('door_dock_staging', s.id, 'staging_1', sx + s.w, ySupport + SUPPORT_ROW / 2, 3000, 'y');
    } else {
      door(`door_${s.id}`, s.id, 'corridor_2', sx + s.w / 2, yCor2, s.type === 'staging' ? HALL_DOOR : 1000, 'x');
    }
    sx += s.w;
  });

  // Yards: generators and transformers to the south, dry coolers to the north.
  room('generator_yard', 'generator_yard', roomName('generator_yard'), x0, SITE_MARGIN, W, southYard - 1000, true);
  room('cooling_yard', 'cooling_yard', roomName('cooling_yard'), x0, yTop + 1000, W, NORTH_YARD - 1000, true);
  yardItems.forEach((it, i) => {
    const u = it.kind === 'generator' ? UNITS.generator : UNITS.transformer;
    const ly = SITE_MARGIN + 1000 + yardSlots[i].line * (UNITS.generator.d + 1000);
    equipment.push({
      id: it.kind === 'generator' ? `gen_${it.n}` : `tx_${it.side}`,
      kind: it.kind,
      room: 'generator_yard',
      x: yardSlots[i].x,
      y: ly + (it.kind === 'transformer' ? UNITS.generator.d - u.d : 0),
      w: u.w,
      h: u.d,
      height: u.h,
      facing: 'N',
      label: it.kind === 'generator' ? `Generator ${it.n}` : `Utility transformer ${it.side}`,
      capacityKw: it.kind === 'generator' ? UNITS.generator.capacityKw : Math.ceil(facilityKw / 100) * 100,
      side: it.side
    });
  });
  let cx = x0 + 1500;
  let cy = yTop + 2000;
  for (let i = 0; i < dryCoolers; i++) {
    if (cx + UNITS.drycooler.w > x0 + W - 1000) {
      cx = x0 + 1500;
      cy += UNITS.drycooler.d + 800;
    }
    equipment.push({
      id: `dry_${i + 1}`,
      kind: 'drycooler',
      room: 'cooling_yard',
      x: cx,
      y: cy,
      w: UNITS.drycooler.w,
      h: UNITS.drycooler.d,
      height: UNITS.drycooler.h,
      facing: 'N',
      label: `Outdoor cooler ${i + 1}`,
      capacityKw: UNITS.drycooler.capacityKw
    });
    cx += UNITS.drycooler.w + 600;
  }
  const yardTop = Math.max(yTop + NORTH_YARD, cy + UNITS.drycooler.d + 1000);
  const cool = rooms.find((r) => r.id === 'cooling_yard')!;
  cool.h = yardTop - cool.y;

  const building = { x: x0, y: yBuilding, w: W, h: yTop - yBuilding };
  const site = { x: 0, y: 0, w: W + 2 * SITE_MARGIN, h: yardTop + SITE_MARGIN };
  return {
    id: cooling,
    title: TITLES[cooling],
    summary: SUMMARIES[cooling],
    basis,
    profile,
    site,
    building,
    rooms,
    doors,
    equipment,
    rows,
    aisles,
    itKw,
    racks
  };
}

/* UPS blocks, battery cabinets or switchgear lineups in lanes of two facing lines with a shared aisle. */
function placeLines(
  out: Equip[],
  kind: 'ups' | 'battery' | 'switchgear',
  room: string,
  side: 'A' | 'B',
  n: number,
  lanes: number,
  rx: number,
  ry: number,
  rw: number
) {
  const u = UNITS[kind];
  const lines = Math.min(2 * lanes, n);
  const perLine = Math.ceil(n / lines);
  const pitch = u.w + 300;
  const start = rx + (rw - perLine * pitch + 300) / 2;
  const names = { ups: 'UPS block', battery: 'Battery string', switchgear: 'Switchgear' };
  for (let i = 0; i < n; i++) {
    const line = Math.floor(i / perLine);
    const k = i % perLine;
    const lane = Math.floor(line / 2);
    const upper = line % 2 === 1;
    const laneY = ry + 1500 + lane * LANE;
    out.push({
      id: kind === 'switchgear' ? `swg_${side}${i + 1}` : `${kind}_${side}${i + 1}`,
      kind,
      room,
      x: Math.round(start + k * pitch),
      y: upper ? laneY + 3500 : laneY,
      w: u.w,
      h: u.d,
      height: u.h,
      facing: upper ? 'S' : 'N',
      label: `${names[kind]} ${side}${i + 1}`,
      capacityKw: kind === 'ups' ? UNITS.ups.capacityKw : kind === 'switchgear' ? 3000 : undefined,
      side
    });
  }
}

/* The three options shown after a brief: the same IT load, three ways to cool it. */
export function generateOptions(basis: Basis): Design[] {
  const order: Cooling[] = ['liquid', 'hybrid', 'air'];
  return order.map((c) => generateDesign(basis, c));
}
