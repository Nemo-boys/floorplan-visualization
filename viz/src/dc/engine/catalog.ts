/* Planning profiles and unit sizes. These are planning defaults, not engineering values: every number that
   reaches the screen carries its source or says "assumption", and the person can change the cost inputs. */
import type { Cooling, RackProfile } from './types';

export const RACK_PROFILES: Record<Cooling, RackProfile> = {
  liquid: {
    key: 'liquid',
    name: 'Liquid-cooled',
    hardware: 'GB200 NVL72-class AI rack',
    kw: 132, // Supermicro SRS-GB200-NVL72 spec sheet; Gigabyte quotes up to 130 kW
    depth: 1200,
    weightKg: 1400,
    gpus: 72,
    liquidShare: 0.85,
    itCost: 3_400_000 // analyst estimates $3.0–3.9M per rack (SemiAnalysis, Wolfe, 2026)
  },
  hybrid: {
    key: 'hybrid',
    name: 'Hybrid',
    hardware: '4× HGX H200-class servers with rear-door coolers',
    kw: 41, // 4 x ~10.2 kW HGX servers
    depth: 1200,
    weightKg: 1100,
    gpus: 32,
    liquidShare: 0.7,
    itCost: 1_250_000 // assumption: ~$300k per 8-GPU server plus network
  },
  air: {
    key: 'air',
    name: 'Air-cooled',
    hardware: 'Air-cooled inference servers (L40S-class)',
    kw: 15,
    depth: 1200,
    weightKg: 900,
    gpus: 16,
    liquidShare: 0,
    itCost: 380_000 // assumption: 2 x 8-GPU inference servers plus network
  }
};

export const RACK_W = 600;
export const COLD_AISLE = 1200;
export const HOT_AISLE = 1200;
export const PERIMETER = 1200; // clearance between the outer rows and the wall
export const ROW_END = 1500; // service gap at each row end; PDUs sit in the east one
export const GALLERY = 2400; // cooling gallery along a hall wall: 900 mm units + service space
export const CORRIDOR = 3000; // crated AI racks on a pallet jack
export const HALL_DOOR = 2400;

export const UNITS = {
  cdu: { capacityKw: 800, w: 1200, d: 1200, h: 2200 }, // in-row CDU, vendor range 600 kW–1.35 MW
  crah: { capacityKw: 250, w: 1800, d: 900, h: 2400 }, // fan-wall CRAH unit
  ups: { capacityKw: 1200, w: 3000, d: 1000, h: 2000 }, // UPS block (1.2 MW class)
  battery: { w: 2400, d: 800, h: 2000 }, // Li-ion cabinet string, one per UPS block
  switchgear: { w: 4800, d: 1200, h: 2300 },
  pdu: { capacityKw: 0, w: 600, d: 1000, h: 2000 }, // remote power panel at the row end; sized per row
  generator: { capacityKw: 2000, w: 2600, d: 9000, h: 3200 }, // containerised diesel genset
  transformer: { w: 2500, d: 2500, h: 2600 },
  drycooler: { capacityKw: 1000, w: 2400, d: 8000, h: 2600 }
} as const;

export const MAX_RACKS_PER_ROW = 20;
export const MAX_RACKS_PER_HALL = 160;
export const MAX_HALL_KW = 5000;
