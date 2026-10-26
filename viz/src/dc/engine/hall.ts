/* The white-space placer: fills a data hall with rack rows on a hot/cold-aisle pattern. Pure and deterministic.

   Pattern, south to north, per pod (cold-aisle containment):
     [hot / perimeter] [row, fronts north] [cold aisle] [row, fronts south] [hot aisle] ...
   Rows run east-west. In-row CDUs take the west end of rows, PDUs sit in the east row-end gap, and
   air handlers (CRAHs) stand in galleries along the west wall (and the east wall when one isn't enough). */
import {
  COLD_AISLE,
  GALLERY,
  HOT_AISLE,
  MAX_RACKS_PER_ROW,
  PERIMETER,
  RACK_W,
  ROW_END,
  UNITS
} from './catalog';
import type { Aisle, Equip, RackProfile, Redundancy, Row } from './types';

/* How many units carry a load at a redundancy level. */
export function unitsFor(loadKw: number, unitKw: number, red: Redundancy): number {
  if (loadKw <= 0) return 0;
  const n = Math.ceil(loadKw / unitKw - 1e-9);
  return red === '2N' ? 2 * n : red === 'N+1' ? n + 1 : n;
}

export interface HallShape {
  racks: number;
  perRow: number; // slots per row (racks + CDU slots)
  rows: number;
  cdus: number;
  crahs: number;
  galleries: 1 | 2;
  w: number;
  h: number;
}

const CDU_SLOTS = UNITS.cdu.w / RACK_W;
const UNIT_PITCH = UNITS.crah.w + 400;

function patternDepth(rows: number, depth: number): number {
  const pods = rows / 2;
  return 2 * PERIMETER + pods * (2 * depth + COLD_AISLE) + (pods - 1) * HOT_AISLE;
}

/* Picks the row length that gives the most compact, well-proportioned hall. */
export function shapeHall(racks: number, profile: RackProfile, coolingRed: Redundancy): HallShape {
  const heat = racks * profile.kw;
  const cdus = unitsFor(heat * profile.liquidShare, UNITS.cdu.capacityKw, coolingRed);
  const crahs = unitsFor(heat * (1 - profile.liquidShare), UNITS.crah.capacityKw, coolingRed);
  const slots = racks + cdus * CDU_SLOTS;
  let best: HallShape | null = null;
  let bestScore = Infinity;
  for (let perRow = 6; perRow <= MAX_RACKS_PER_ROW; perRow++) {
    let rows = Math.ceil(slots / perRow);
    if (rows % 2) rows++;
    // a row with CDUs needs room for at least one rack after them
    if (Math.ceil(cdus / rows) * CDU_SLOTS >= perRow) continue;
    let h = patternDepth(rows, profile.depth);
    let galleries: 1 | 2 = 1;
    const fit = (len: number) => Math.floor((len - 600) / UNIT_PITCH);
    if (crahs > fit(h)) galleries = 2;
    const perGallery = Math.ceil(crahs / galleries);
    if (perGallery > fit(h)) h = perGallery * UNIT_PITCH + 600;
    const w = GALLERY * galleries + 2 * ROW_END + perRow * RACK_W;
    const aspect = Math.max(w, h) / Math.min(w, h);
    const waste = (rows * perRow - slots) / slots;
    const score = Math.abs(aspect - 1.5) + 2 * waste;
    if (score < bestScore) {
      bestScore = score;
      best = { racks, perRow, rows, cdus, crahs, galleries, w, h };
    }
  }
  if (!best) throw new Error(`no hall shape for ${racks} racks`);
  return best;
}

export interface HallFill {
  equipment: Equip[];
  rows: Row[];
  aisles: Aisle[];
}

const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/* Places racks, CDUs, PDUs and CRAHs inside a hall rectangle at (hx, hy). The hall may be larger than its
   shape (extra width stays free at the east end, extra depth is split above and below the rows). */
export function fillHall(
  hallId: string,
  hallNo: number,
  hx: number,
  hy: number,
  hw: number,
  hh: number,
  shape: HallShape,
  profile: RackProfile,
  powerRed: Redundancy
): HallFill {
  const equipment: Equip[] = [];
  const rows: Row[] = [];
  const aisles: Aisle[] = [];
  const d = profile.depth;
  const pat = patternDepth(shape.rows, d);
  const y0 = hy + Math.round((hh - pat) / 2 / 100) * 100;
  const xs = hx + GALLERY + ROW_END;
  const rowLen = shape.perRow * RACK_W;
  const tag = `h${hallNo}`;

  // CDUs round-robin over rows, racks spread evenly over what's left.
  const cduInRow = Array.from({ length: shape.rows }, (_, i) =>
    Math.floor(shape.cdus / shape.rows) + (i < shape.cdus % shape.rows ? 1 : 0)
  );
  const freeSlots = cduInRow.map((c) => shape.perRow - c * CDU_SLOTS);
  const totalFree = freeSlots.reduce((a, b) => a + b, 0);
  const racksInRow = freeSlots.map((f) => Math.min(f, Math.floor((shape.racks * f) / totalFree)));
  let left = shape.racks - racksInRow.reduce((a, b) => a + b, 0);
  // hand out the remainder one rack at a time to rows that still have a free slot
  for (let i = 0; left > 0; i = (i + 1) % shape.rows) {
    if (racksInRow[i] < freeSlots[i]) {
      racksInRow[i]++;
      left--;
    }
  }

  let cduNo = 0;
  for (let r = 0; r < shape.rows; r++) {
    const pod = Math.floor(r / 2);
    const upper = r % 2 === 1;
    const podY = y0 + PERIMETER + pod * (2 * d + COLD_AISLE + HOT_AISLE);
    const ry = upper ? podY + d + COLD_AISLE : podY;
    const facing = upper ? 'S' : 'N';
    const letter = ROW_LETTERS[r % ROW_LETTERS.length];
    const rowId = `${tag}_row${letter}`;
    const row: Row = {
      id: rowId,
      hall: hallId,
      facing,
      racks: [],
      units: [],
      pdus: [],
      rect: { x: xs, y: ry, w: rowLen, h: d }
    };
    let slot = 0;
    for (let c = 0; c < cduInRow[r]; c++) {
      cduNo++;
      const id = `${tag}_cdu${cduNo}`;
      equipment.push({
        id,
        kind: 'cdu',
        room: hallId,
        x: xs + slot * RACK_W,
        y: ry,
        w: UNITS.cdu.w,
        h: d,
        height: UNITS.cdu.h,
        facing,
        label: `Liquid cooler ${hallNo}.${cduNo}`,
        capacityKw: UNITS.cdu.capacityKw,
        row: rowId
      });
      row.units.push(id);
      slot += CDU_SLOTS;
    }
    for (let k = 0; k < racksInRow[r]; k++) {
      const n = String(k + 1).padStart(2, '0');
      const id = `${tag}_${letter}${n}`;
      equipment.push({
        id,
        kind: 'rack',
        room: hallId,
        x: xs + slot * RACK_W,
        y: ry,
        w: RACK_W,
        h: d,
        height: 2300,
        facing,
        label: `Rack ${letter}${n}`,
        kw: profile.kw,
        row: rowId
      });
      row.racks.push(id);
      slot++;
    }
    const rowKw = racksInRow[r] * profile.kw;
    const sides: ('A' | 'B')[] = powerRed === '2N' ? ['A', 'B'] : ['A'];
    sides.forEach((side, i) => {
      const id = `${rowId}_pdu${side}`;
      equipment.push({
        id,
        kind: 'pdu',
        room: hallId,
        x: xs + rowLen + 200 + i * (UNITS.pdu.w + 50),
        y: ry + (d - UNITS.pdu.d) / 2,
        w: UNITS.pdu.w,
        h: UNITS.pdu.d,
        height: UNITS.pdu.h,
        facing,
        label: `Power panel ${letter}${sides.length > 1 ? `-${side}` : ''}`,
        capacityKw: Math.ceil((rowKw * 1.25) / 10) * 10,
        row: rowId,
        side
      });
      row.pdus.push(id);
    });
    rows.push(row);

    if (!upper) {
      aisles.push({
        id: `${tag}_cold${pod + 1}`,
        hall: hallId,
        kind: 'cold',
        rect: { x: xs, y: ry + d, w: rowLen, h: COLD_AISLE }
      });
      const hotY = pod === 0 ? podY - PERIMETER : podY - HOT_AISLE;
      aisles.push({
        id: `${tag}_hot${pod + 1}`,
        hall: hallId,
        kind: 'hot',
        rect: { x: xs, y: hotY, w: rowLen, h: pod === 0 ? PERIMETER : HOT_AISLE }
      });
    }
  }
  const top = y0 + pat - PERIMETER;
  aisles.push({
    id: `${tag}_hot${shape.rows / 2 + 1}`,
    hall: hallId,
    kind: 'hot',
    rect: { x: xs, y: top, w: rowLen, h: PERIMETER }
  });

  // CRAHs in the galleries, spread evenly along the wall, blowing into the hall.
  const perGallery = [Math.ceil(shape.crahs / shape.galleries), Math.floor(shape.crahs / shape.galleries)];
  let crahNo = 0;
  for (let g = 0; g < shape.galleries; g++) {
    const n = shape.galleries === 1 ? shape.crahs : perGallery[g];
    const gx = g === 0 ? hx + 300 : hx + hw - 300 - UNITS.crah.d;
    const pitch = hh / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      crahNo++;
      equipment.push({
        id: `${tag}_crah${crahNo}`,
        kind: 'crah',
        room: hallId,
        x: gx,
        y: hy + Math.round((pitch * (i + 0.5) - UNITS.crah.w / 2) / 50) * 50,
        w: UNITS.crah.d,
        h: UNITS.crah.w,
        height: UNITS.crah.h,
        facing: g === 0 ? 'E' : 'W',
        label: `Air handler ${hallNo}.${crahNo}`,
        capacityKw: UNITS.crah.capacityKw
      });
    }
  }
  return { equipment, rows, aisles };
}
