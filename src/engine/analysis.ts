/* Plan analysis: key spots and the three routes drawn on the floor, and preparePlan, which builds everything. */
import { adaptPlan } from './plan';
import { itemRect, planFurniture } from './furniture';
import { buildGrid, cellXY } from './grid';
import { makePathfinder } from './path';
import type {
  CellSpot,
  Door,
  Egress,
  ExamInfo,
  FurnItem,
  FurnSpots,
  Furniture,
  Grid,
  Model,
  Path,
  Pathfinder,
  PlanInfo,
  PlanJson,
  PreparedPlan,
  Spot
} from './types';

/* Key spots and the three routes drawn on the floor. Seats and workstations come from the furniture plan. */
export function analyzePlan(m: Model, g: Grid, pf: Pathfinder, furn: Furniture | null | undefined): PlanInfo {
  const N = g.nx * g.ny;
  const cellsOf = (k: number): number[] => {
    const a: number[] = [];
    for (let c = 0; c < N; c++) if (g.room[c] === k && !g.blocked[c]) a.push(c);
    return a;
  };
  const nearestIn = (k: number, x: number, y: number): number => {
    let best = -1,
      bd = Infinity;
    for (let c = 0; c < N; c++) {
      if (g.room[c] !== k || g.blocked[c]) continue;
      const p = cellXY(g, c),
        d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  const centerOf = (k: number): number => {
    const r = m.rooms[k];
    return nearestIn(k, r.x + r.w / 2, r.y + r.h / 2);
  };
  const firstOf = (t: string): number => m.rooms.findIndex(r => r.type === t);
  const idx = (id: string): number => m.rooms.findIndex(r => r.id === id);
  const roomOf = (x: number, y: number): number =>
    m.rooms.findIndex(r => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6);
  const toward = (d: Door, k: number, dist: number): number => {
    const r = m.rooms[k],
      vx = r.x + r.w / 2 - d.cx,
      vy = r.y + r.h / 2 - d.cy,
      L = Math.hypot(vx, vy) || 1;
    return nearestIn(k, d.cx + (vx / L) * dist, d.cy + (vy / L) * dist);
  };
  const withCell = (s: Spot | null | undefined): CellSpot | null => {
    if (!s) return null;
    const k = s.room != null ? s.room : roomOf(s.ax, s.ay);
    const c = k >= 0 ? nearestIn(k, s.ax, s.ay) : -1;
    return c >= 0 ? Object.assign({}, s, { cell: c }) : null;
  };
  const ent = m.doors.find(d => d.isEntrance);
  let entK = ent ? idx(ent.a !== 'exterior' ? ent.a : ent.b) : -1;
  if (entK < 0) entK = Math.max(0, firstOf('waiting'));
  const waitingK = firstOf('waiting') >= 0 ? firstOf('waiting') : entK;
  const recK = firstOf('reception') >= 0 ? firstOf('reception') : waitingK;
  const entranceCell = ent ? toward(ent, entK, 0.55) : centerOf(entK);
  const sp: FurnSpots = furn ? furn.spots : { seats: [], exams: {}, nurseHomes: [], officeHomes: [] };
  const counter: CellSpot = withCell(sp.counter && Object.assign({}, sp.counter, { room: waitingK })) || {
    cell: centerOf(waitingK),
    pose: 'stand'
  };
  const receptionist: CellSpot = withCell(sp.receptionist) || { cell: centerOf(recK), pose: 'stand' };
  const waitCell = centerOf(waitingK);
  const homeFallback = (k: number, n: number): CellSpot[] => {
    const r = m.rooms[k],
      cx = r.x + r.w / 2,
      cy = r.y + r.h / 2;
    return cellsOf(k)
      .map((c): [number, number] => {
        const p = cellXY(g, c);
        return [c, (p.x - cx) ** 2 + (p.y - cy) ** 2];
      })
      .sort((a, b) => a[1] - b[1])
      .filter((_, q) => q % 3 === 0)
      .slice(0, n)
      .map(a => ({ cell: a[0], pose: 'stand' }));
  };
  let seats = sp.seats.map(withCell).filter((s): s is CellSpot => !!(s && pf(waitCell, s.cell)));
  if (!seats.length)
    seats = cellsOf(waitingK)
      .filter((c, q) => q % 5 === 0)
      .slice(0, 16)
      .map(c => ({ cell: c, pose: 'stand' }));
  const corrK = firstOf('corridor');
  let nurseK = firstOf('nurse_station');
  if (nurseK < 0) nurseK = corrK >= 0 ? corrK : waitingK;
  let officeK = firstOf('provider_office');
  if (officeK < 0) officeK = firstOf('staff_lounge');
  if (officeK < 0) officeK = corrK >= 0 ? corrK : waitingK;
  let nurseHomes = sp.nurseHomes.map(withCell).filter((s): s is CellSpot => Boolean(s));
  if (!nurseHomes.length) nurseHomes = homeFallback(nurseK, 4);
  let officeHomes = sp.officeHomes.map(withCell).filter((s): s is CellSpot => Boolean(s));
  if (!officeHomes.length) officeHomes = homeFallback(officeK, 4);
  const allExams: ExamInfo[] = [];
  m.rooms.forEach((r, k) => {
    if (r.type !== 'exam_room') return;
    const fs = sp.exams[r.id];
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2;
    const e = { k, id: r.id, label: r.label } as ExamInfo;
    e.patient = (fs && withCell(fs.patient)) || { cell: nearestIn(k, cx, cy), pose: 'stand' };
    e.nurse = (fs && withCell(fs.nurse)) || { cell: nearestIn(k, cx + 0.5, cy - 0.7), pose: 'stand' };
    e.provider = (fs && withCell(fs.provider)) || { cell: nearestIn(k, cx - 0.5, cy - 0.7), pose: 'stand' };
    const pw = pf(waitCell, e.patient.cell),
      pn = pf(nurseHomes[0].cell, e.nurse.cell),
      po = pf(officeHomes[0].cell, e.provider.cell);
    e.reachable = !!(pw && pn && po);
    e.distWait = pw ? pw.len : Infinity;
    e.distNurse = pn ? pn.len : Infinity;
    e.distOffice = po ? po.len : Infinity;
    allExams.push(e);
  });
  const exams = allExams.filter(e => e.reachable);
  const farthest = exams.slice().sort((a, b) => b.distWait - a.distWait)[0];
  const seatMid = seats[Math.floor(seats.length / 2)].cell;
  const legs = farthest
    ? (
        [
          [entranceCell, counter.cell],
          [counter.cell, seatMid],
          [seatMid, farthest.patient.cell],
          [farthest.patient.cell, counter.cell],
          [counter.cell, entranceCell]
        ] as [number, number][]
      )
        .map(([a, b]) => pf(a, b))
        .filter((l): l is Path => Boolean(l))
    : [];
  const journey = {
    legs: legs.map(l => l.pts),
    len: legs.reduce((s, l) => s + l.len, 0),
    examLabel: farthest ? farthest.label : null
  };
  const staff = exams.map(e => {
    const p = pf(nurseHomes[0].cell, e.nurse.cell) as Path;
    return { pts: p.pts, len: p.len, label: e.label };
  });
  let egress: Egress | null = null;
  const unreachableRooms: string[] = [];
  m.rooms.forEach((r, k) => {
    if (r.type === 'corridor') return;
    const c = centerOf(k);
    const p = c >= 0 ? pf(c, entranceCell) : null;
    if (!p) {
      unreachableRooms.push(r.label);
      return;
    }
    if (!egress || p.len > egress.len) egress = { pts: p.pts, len: p.len, fromLabel: r.label };
  });
  const avgNurse = exams.length ? exams.reduce((s, e) => s + e.distNurse, 0) / exams.length : 0;
  return {
    entranceCell,
    counter,
    receptionist,
    seats,
    waitCell,
    nurseHomes,
    officeHomes,
    exams,
    allExams,
    routes: { journey, staff, egress },
    avgNurse,
    unreachableRooms,
    nurseLabel: m.rooms[nurseK].label,
    entK,
    waitingK,
    loungeSpots: firstOf('staff_lounge') >= 0 ? homeFallback(firstOf('staff_lounge'), 6) : nurseHomes.slice(),
    receptionSpots: [receptionist].concat(homeFallback(recK, 4).filter(h => h.cell !== receptionist.cell)).slice(0, 4)
  };
}
/* Everything the view needs for one plan, built in one place. */
export function preparePlan(json: PlanJson, extraItems?: FurnItem[] | null): PreparedPlan {
  const m = adaptPlan(json);
  const furn = planFurniture(m);
  if (extraItems && extraItems.length) {
    for (const it of extraItems) {
      furn.items.push(it);
      furn.blocks.push(itemRect(it));
    }
  }
  const g = buildGrid(m, furn.blocks),
    pf = makePathfinder(g),
    info = analyzePlan(m, g, pf, furn);
  return { m, furn, g, pf, info };
}
