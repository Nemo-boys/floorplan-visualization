/* Thermal proxy: a steady-state air temperature field per hall. NOT CFD: heat spreads by diffusion from the
   racks' exhausts and is taken out where the live air handlers are. It shows where heat builds up and how
   that changes when units fail; the pass/fail numbers come from capacity arithmetic in status.ts.

   Solved with successive over-relaxation on a grid of CELL mm. Calibrated per design so that, with every
   unit running at full load, the warmest rack inlet sits at NOMINAL_MAX_C. */
import type { Conditions } from './status';
import { NORMAL } from './status';
import type { Design, Room } from './types';

export const CELL = 600;
export const SUPPLY_C = 20;
const NOMINAL_MAX_C = 25;
export const COMFORT_C = 27; // ASHRAE recommended upper inlet
export const LIMIT_C = 32; // ASHRAE A1 allowable upper inlet

export interface HallField {
  hall: string;
  room: Room;
  nx: number;
  ny: number;
  temps: Float32Array; // °C per cell, row-major from the hall's south-west corner
}

export interface ThermalResult {
  halls: HallField[];
  rackInlet: Map<string, number>; // °C
  maxInlet: number;
}

interface Raw {
  hall: Room;
  nx: number;
  ny: number;
  phi: Float32Array;
  shortfall: number; // share of the hall's air-side heat the live air handlers can't take
}

function solve(d: Design, c: Conditions): Raw[] {
  const out: Raw[] = [];
  const halls = d.rooms.filter((r) => r.type === 'data_hall' && d.rows.some((row) => row.hall === r.id));
  const airShare = 1 - d.profile.liquidShare;
  for (const hall of halls) {
    const nx = Math.max(2, Math.round(hall.w / CELL));
    const ny = Math.max(2, Math.round(hall.h / CELL));
    const q = new Float32Array(nx * ny);
    const g = new Float32Array(nx * ny);
    const cell = (x: number, y: number) => {
      const i = Math.min(nx - 1, Math.max(0, Math.floor((x - hall.x) / CELL)));
      const j = Math.min(ny - 1, Math.max(0, Math.floor((y - hall.y) / CELL)));
      return j * nx + i;
    };
    const liquidLost = new Set<string>(); // rows whose liquid loop has no capacity left: their heat goes to air
    const cdus = d.equipment.filter((e) => e.kind === 'cdu' && e.room === hall.id);
    const liveCdu = cdus.filter((e) => !c.failed.has(e.id)).reduce((a, e) => a + (e.capacityKw ?? 0), 0);
    const liquidLoad = d.equipment
      .filter((e) => e.kind === 'rack' && e.room === hall.id)
      .reduce((a, e) => a + (e.kw ?? 0) * c.load * d.profile.liquidShare, 0);
    const liquidOverflow = cdus.length && liveCdu < liquidLoad ? (liquidLoad - liveCdu) / liquidLoad : 0;
    if (liquidOverflow > 0) d.rows.filter((r) => r.hall === hall.id).forEach((r) => liquidLost.add(r.id));
    for (const e of d.equipment) {
      if (e.room !== hall.id) continue;
      if (e.kind === 'rack') {
        // heat leaves at the back of the rack
        const backY = e.facing === 'N' ? e.y - CELL / 2 : e.y + e.h + CELL / 2;
        const share = airShare + (liquidLost.has(e.row ?? '') ? d.profile.liquidShare * liquidOverflow : 0);
        q[cell(e.x + e.w / 2, backY)] += (e.kw ?? 0) * c.load * share;
      } else if (e.kind === 'crah' && !c.failed.has(e.id)) {
        const front = e.facing === 'E' ? e.x + e.w + CELL / 2 : e.x - CELL / 2;
        const cells = Math.max(1, Math.round(e.h / CELL));
        for (let k = 0; k < cells; k++) g[cell(front, e.y + (k + 0.5) * CELL)] += (e.capacityKw ?? 0) / 250 / cells;
      }
    }
    // a little leakage everywhere stands for the building envelope and liquid loop residuals
    const leak = 0.0008;
    const phi = new Float32Array(nx * ny);
    const omega = 1.85;
    for (let it = 0; it < 180; it++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          let sum = 0;
          let n = 0;
          if (i > 0) {
            sum += phi[k - 1];
            n++;
          }
          if (i < nx - 1) {
            sum += phi[k + 1];
            n++;
          }
          if (j > 0) {
            sum += phi[k - nx];
            n++;
          }
          if (j < ny - 1) {
            sum += phi[k + nx];
            n++;
          }
          const next = (sum + q[k]) / (n + g[k] * 4 + leak);
          phi[k] += omega * (next - phi[k]);
        }
      }
    }
    // the diffusion alone just moves heat to the remaining units, so a capacity shortfall lifts the whole hall
    const airHeat = q.reduce((a, b) => a + b, 0);
    const airCap = d.equipment
      .filter((e) => e.kind === 'crah' && e.room === hall.id && !c.failed.has(e.id))
      .reduce((a, e) => a + (e.capacityKw ?? 0), 0);
    const shortfall = airHeat > 0 ? Math.max(0, (airHeat - airCap) / airHeat) : 0;
    out.push({ hall, nx, ny, phi, shortfall });
  }
  return out;
}

function inletPhi(d: Design, raw: Raw[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of raw) {
    for (const e of d.equipment) {
      if (e.kind !== 'rack' || e.room !== r.hall.id) continue;
      const fy = e.facing === 'N' ? e.y + e.h + CELL / 2 : e.y - CELL / 2;
      const i = Math.min(r.nx - 1, Math.max(0, Math.floor((e.x + e.w / 2 - r.hall.x) / CELL)));
      const j = Math.min(r.ny - 1, Math.max(0, Math.floor((fy - r.hall.y) / CELL)));
      m.set(e.id, r.phi[j * r.nx + i]);
    }
  }
  return m;
}

const scaleCache = new WeakMap<Design, number>();
function scaleFor(d: Design): number {
  let k = scaleCache.get(d);
  if (k === undefined) {
    const raw = solve(d, NORMAL);
    const inlets = inletPhi(d, raw);
    const maxPhi = Math.max(1e-6, ...inlets.values());
    k = (NOMINAL_MAX_C - SUPPLY_C) / maxPhi;
    scaleCache.set(d, k);
  }
  return k;
}

export function thermal(d: Design, c: Conditions = NORMAL): ThermalResult {
  const k = scaleFor(d);
  // a heat wave raises the supply air when the outdoor coolers run short
  const supply = SUPPLY_C + (c.outdoorC > 35 ? (c.outdoorC - 35) * 0.6 : 0);
  const raw = solve(d, c);
  const lift = (r: Raw) => Math.min(18, r.shortfall * 40); // a 25% shortfall adds ~10 °C
  const halls = raw.map((r) => {
    const temps = new Float32Array(r.phi.length);
    for (let i = 0; i < temps.length; i++) temps[i] = supply + lift(r) + k * r.phi[i] * (1 + r.shortfall);
    return { hall: r.hall.id, room: r.hall, nx: r.nx, ny: r.ny, temps };
  });
  const rackInlet = new Map<string, number>();
  const hallOf = new Map(d.equipment.map((e) => [e.id, e.room]));
  const byHall = new Map(raw.map((r) => [r.hall.id, r]));
  inletPhi(d, raw).forEach((v, id) => {
    const r = byHall.get(hallOf.get(id)!)!;
    rackInlet.set(id, supply + lift(r) + k * v * (1 + r.shortfall));
  });
  return { halls, rackInlet, maxInlet: Math.max(SUPPLY_C, ...rackInlet.values()) };
}
