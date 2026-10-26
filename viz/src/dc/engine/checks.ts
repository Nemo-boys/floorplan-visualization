/* Design checks. Each one says what was measured, what it was compared with and where that rule comes from.
   They are screening checks: passing them is not an electrical, fire or structural sign-off. */
import { COLD_AISLE, HOT_AISLE } from './catalog';
import { NORMAL, evaluate, survivesEach } from './status';
import type { Design, Equip, Rect, Room } from './types';

export interface Check {
  id: string;
  title: string; // plain question, e.g. "Does every rack breathe cold air?"
  pass: boolean;
  measured: string;
  required: string;
  source: string;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* The strip just in front of a piece of equipment, `depth` deep. */
function frontStrip(e: Equip, depth: number): Rect {
  switch (e.facing) {
    case 'N':
      return { x: e.x, y: e.y + e.h, w: e.w, h: depth };
    case 'S':
      return { x: e.x, y: e.y - depth, w: e.w, h: depth };
    case 'E':
      return { x: e.x + e.w, y: e.y, w: depth, h: e.h };
    default:
      return { x: e.x - depth, y: e.y, w: depth, h: e.h };
  }
}

function sharesWall(a: Room, b: Room): boolean {
  const touchX = a.x + a.w === b.x || b.x + b.w === a.x;
  const touchY = a.y + a.h === b.y || b.y + b.h === a.y;
  const spanY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const spanX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  return (touchX && spanY > 0) || (touchY && spanX > 0);
}

export function runChecks(d: Design): Check[] {
  const out: Check[] = [];
  const racks = d.equipment.filter((e) => e.kind === 'rack');

  // 1. Every rack front faces a cold aisle.
  const badFacing = racks.filter((r) => {
    const s = frontStrip(r, 300);
    return !d.aisles.some((a) => a.kind === 'cold' && a.hall === r.room && overlaps(s, a.rect));
  });
  out.push({
    id: 'DC-ORIENT-01',
    title: 'Does every rack breathe in cold air?',
    pass: badFacing.length === 0,
    measured: badFacing.length ? `${badFacing.length} racks face a hot aisle` : `All ${racks.length} rack fronts face a cold aisle`,
    required: 'Rack fronts on the cold aisle, backs on the hot aisle',
    source: 'ASHRAE TC 9.9 hot/cold aisle practice'
  });

  // 2. Aisle widths.
  const narrow = d.aisles.filter((a) => Math.min(a.rect.w, a.rect.h) < (a.kind === 'cold' ? COLD_AISLE : HOT_AISLE) - 1);
  out.push({
    id: 'DC-AISLE-02',
    title: 'Are the aisles wide enough to work in?',
    pass: narrow.length === 0,
    measured: narrow.length ? `${narrow.length} aisles too narrow` : `Cold ${COLD_AISLE / 1000} m, hot ${HOT_AISLE / 1000} m`,
    required: '≥ 1.2 m cold aisle, ≥ 1.2 m hot aisle',
    source: 'ASHRAE TC 9.9; operator standard (assumption)'
  });

  // 3. Cooling survives any one unit failing.
  const coolKinds: Equip['kind'][] = ['cdu', 'crah', 'drycooler'];
  const coolFail = coolKinds.map((k) => ({ k, r: survivesEach(d, k) })).find((x) => !x.r.ok);
  out.push({
    id: 'DC-COOL-03',
    title: 'Does cooling survive any one unit breaking?',
    pass: !coolFail,
    measured: coolFail
      ? `Losing ${d.equipment.find((e) => e.id === coolFail.r.worstUnit)?.label} overheats racks`
      : 'Every rack stays cool with any one cooling unit off',
    required: `${d.basis.coolingRedundancy} cooling: full heat load with one unit out`,
    source: 'Design basis (stated in the brief)'
  });

  // 4. Power survives any one UPS module or power panel failing.
  const powerFail = (['ups', 'pdu', 'switchgear'] as Equip['kind'][]).map((k) => ({ k, r: survivesEach(d, k) })).find((x) => !x.r.ok);
  out.push({
    id: 'DC-POWER-04',
    title: 'Does power survive any one part breaking?',
    pass: !powerFail,
    measured: powerFail
      ? `Losing ${d.equipment.find((e) => e.id === powerFail.r.worstUnit)?.label} switches racks off`
      : 'Every rack keeps power with any one UPS module or power panel off',
    required: `${d.basis.powerRedundancy} power: no single failure turns a rack off`,
    source: 'Design basis; Uptime Institute Tier concepts (screening only)'
  });

  // 5. Generators carry the site when the grid fails.
  const gridDown = evaluate(d, {
    ...NORMAL,
    failed: new Set(d.basis.powerRedundancy === '2N' ? ['utility_A', 'utility_B'] : ['utility_A'])
  });
  const gen = gridDown.pools.find((p) => p.id === 'generators');
  out.push({
    id: 'DC-GEN-05',
    title: 'Can the generators run everything if the grid goes down?',
    pass: !!gen && gen.health === 'ok',
    measured: gen ? gen.sentence : 'No generators',
    required: 'Full facility load with one generator out',
    source: 'Design basis (assumption, stated)'
  });

  // 6. Working space in front of electrical gear.
  const elec = d.equipment.filter((e) => ['ups', 'switchgear', 'pdu'].includes(e.kind));
  const blocked = elec.filter((e) => {
    const s = frontStrip(e, 1000);
    const room = d.rooms.find((r) => r.id === e.room)!;
    const inside = s.x >= room.x && s.y >= room.y && s.x + s.w <= room.x + room.w && s.y + s.h <= room.y + room.h;
    return !inside || d.equipment.some((o) => o !== e && o.room === e.room && overlaps(s, o));
  });
  out.push({
    id: 'DC-CLEAR-06',
    title: 'Is there safe working space in front of electrical gear?',
    pass: blocked.length === 0,
    measured: blocked.length ? `${blocked.length} items blocked` : `${elec.length} items with ≥ 1.0 m clear in front`,
    required: '≥ 0.9–1.2 m clear working space',
    source: 'NEC 110.26(A) (screening only)'
  });

  // 7. Floor load.
  const p = d.profile;
  const kgPerM2 = p.weightKg / ((p.depth / 1000 + (COLD_AISLE + HOT_AISLE) / 2000) * 0.6);
  out.push({
    id: 'DC-FLOOR-07',
    title: 'Can the floor hold the racks?',
    pass: kgPerM2 <= 1200,
    measured: `${Math.round(kgPerM2)} kg/m² averaged over rack and half aisles`,
    required: '≤ 1,200 kg/m² slab rating (assumption)',
    source: 'Structural assumption, stated'
  });

  // 8. Batteries don't share a wall with a data hall.
  const halls = d.rooms.filter((r) => r.type === 'data_hall');
  const batt = d.rooms.filter((r) => r.type === 'battery_room');
  const touching = batt.filter((b) => halls.some((h) => sharesWall(b, h)));
  out.push({
    id: 'DC-FIRE-08',
    title: 'Are the batteries kept away from the computers?',
    pass: touching.length === 0,
    measured: touching.length ? `${touching.length} battery rooms next to a hall` : 'Battery rooms are across the corridor from the halls',
    required: 'Battery rooms separated from the data hall',
    source: 'NFPA 75 / NFPA 855 (screening only)'
  });

  // 9. A crated rack can reach every hall from the dock.
  const reach = deliveryReach(d, 1500);
  const unreached = halls.filter((h) => !reach.has(h.id));
  out.push({
    id: 'DC-ROUTE-09',
    title: 'Can new racks be wheeled in from the loading dock?',
    pass: unreached.length === 0,
    measured: unreached.length ? `${unreached.map((h) => h.name).join(', ')} not reachable` : 'Every door on the way is ≥ 1.5 m wide',
    required: 'Dock to every hall with doors ≥ 1.5 m (crated rack + clearance)',
    source: 'Logistics check (assumption)'
  });

  // 10. 2N power trains are kept apart.
  if (d.basis.powerRedundancy === '2N') {
    const a = d.rooms.filter((r) => r.id.endsWith('_A'));
    const b = d.rooms.filter((r) => r.id.endsWith('_B'));
    const close = a.some((x) => b.some((y) => sharesWall(x, y)));
    out.push({
      id: 'DC-SEP-10',
      title: 'Are the two power trains kept apart?',
      pass: !close,
      measured: close ? 'Train A and B rooms share a wall' : 'Train A and B rooms are separated',
      required: 'A fire in one train’s rooms leaves the other running',
      source: 'Uptime Institute Tier IV concept (screening only)'
    });
  }
  return out;
}

/* Rooms reachable from the loading dock through doors at least `minWidth` wide. */
export function deliveryReach(d: Design, minWidth: number): Set<string> {
  const seen = new Set<string>(['loading_dock_1']);
  const queue = ['loading_dock_1'];
  while (queue.length) {
    const cur = queue.shift()!;
    d.doors.forEach((door) => {
      if (door.width < minWidth) return;
      const [a, b] = door.rooms;
      const next = a === cur ? b : b === cur ? a : null;
      if (next && next !== 'outside' && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    });
  }
  return seen;
}
