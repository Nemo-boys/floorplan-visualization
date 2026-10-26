/* Build cost, running cost and total cost of ownership. Every rate is an input the person can change; the
   defaults are planning assumptions with the source they were checked against, never quotes. */
import type { Basis, Design } from './types';

/* The money side of the brief: what electricity costs, over how many years, and how busy the site is. */
export type Money = Pick<Basis, 'priceKwh' | 'years' | 'utilization'>;

export interface Rate {
  key: RateKey;
  label: string;
  value: number;
  unit: string;
  source: string;
}

export type RateKey =
  | 'shell'
  | 'ups'
  | 'battery'
  | 'generator'
  | 'distribution'
  | 'cdu'
  | 'crah'
  | 'drycooler'
  | 'plant'
  | 'site'
  | 'soft'
  | 'maintenance'
  | 'staff'
  | 'carbon';

export const RATES: Rate[] = [
  { key: 'shell', label: 'Building shell and fit-out', value: 4200, unit: '$/m²', source: 'Assumption, ~$390/ft² for a hardened single-storey shell' },
  { key: 'ups', label: 'UPS modules', value: 450, unit: '$/kW installed', source: 'Assumption' },
  { key: 'battery', label: 'Batteries (5 min, Li-ion)', value: 250, unit: '$/kW installed', source: 'Assumption' },
  { key: 'generator', label: 'Generators', value: 700, unit: '$/kW installed', source: 'Assumption' },
  { key: 'distribution', label: 'Switchgear, transformers and cabling', value: 1300, unit: '$/kW IT per power train', source: 'Assumption' },
  { key: 'cdu', label: 'Liquid coolers and water loop', value: 1100, unit: '$/kW installed', source: 'Assumption' },
  { key: 'crah', label: 'Air handlers', value: 800, unit: '$/kW installed', source: 'Assumption' },
  { key: 'drycooler', label: 'Outdoor coolers', value: 450, unit: '$/kW installed', source: 'Assumption' },
  { key: 'plant', label: 'Pumps, pipes and controls', value: 500, unit: '$/kW IT', source: 'Assumption' },
  { key: 'site', label: 'Land, grid connection and site works', value: 900, unit: '$/kW IT', source: 'Assumption' },
  { key: 'soft', label: 'Design, permits and contingency', value: 0.25, unit: 'share of the above', source: 'Assumption' },
  { key: 'maintenance', label: 'Maintenance', value: 0.025, unit: 'share of build cost per year', source: 'Assumption' },
  { key: 'staff', label: 'Staff', value: 140_000, unit: '$ per person per year', source: 'Assumption' },
  { key: 'carbon', label: 'Grid carbon intensity', value: 0.37, unit: 'kg CO₂ per kWh', source: 'US grid average, EIA (check for your region)' }
];

export type Rates = Record<RateKey, number>;
export const DEFAULT_RATES: Rates = Object.fromEntries(RATES.map((r) => [r.key, r.value])) as Rates;

export interface CostLine {
  label: string;
  group: 'building' | 'power' | 'cooling' | 'other' | 'it';
  amount: number;
}

export interface CostReport {
  lines: CostLine[];
  facility: number; // build cost without IT
  it: number;
  perMw: number; // facility $ per MW of IT
  pue: number;
  pueParts: { it: number; cooling: number; power: number; other: number }; // shares of total energy
  energyMwhYear: number;
  energyYear: number;
  maintenanceYear: number;
  staffYear: number;
  staff: number;
  opexYear: number;
  tco: number; // facility + IT + opex over the horizon
  co2Tonnes: number; // per year
  gpus: number;
  perGpuHour: number; // TCO per GPU-hour at the stated utilisation
  perKwMonth: number; // TCO per kW of computing per month: compares designs with different GPUs
  years: number;
}

const installed = (d: Design, kind: string) =>
  d.equipment.filter((e) => e.kind === kind).reduce((a, e) => a + (e.capacityKw ?? 0), 0);

/* Annual PUE for a design: cooling energy by heat path, power-chain losses, and a fixed overhead that
   weighs more at low utilisation. Planning model, shown with its parts. */
export function pueOf(d: Design, utilization: number): { pue: number; cooling: number; power: number; other: number } {
  const ls = d.profile.liquidShare;
  const cooling = ls * 0.06 + (1 - ls) * 0.3;
  const power = d.basis.powerRedundancy === '2N' ? 0.055 : 0.045;
  const other = 0.02 / Math.max(0.2, utilization);
  return { pue: 1 + cooling + power + other, cooling, power, other };
}

export function costOf(d: Design, rates: Rates = DEFAULT_RATES, b: Money = d.basis): CostReport {
  const it = d.itKw;
  const trains = d.basis.powerRedundancy === '2N' ? 2 : 1;
  const area = d.rooms.filter((r) => !r.outdoor).reduce((a, r) => a + (r.w * r.h) / 1e6, 0);
  const raw: CostLine[] = [
    { label: 'Building', group: 'building', amount: area * rates.shell },
    { label: 'UPS', group: 'power', amount: installed(d, 'ups') * rates.ups },
    { label: 'Batteries', group: 'power', amount: installed(d, 'ups') * rates.battery },
    { label: 'Generators', group: 'power', amount: installed(d, 'generator') * rates.generator },
    { label: 'Switchgear & cabling', group: 'power', amount: it * trains * rates.distribution },
    { label: 'Liquid cooling', group: 'cooling', amount: installed(d, 'cdu') * rates.cdu },
    { label: 'Air handlers', group: 'cooling', amount: installed(d, 'crah') * rates.crah },
    { label: 'Outdoor coolers', group: 'cooling', amount: installed(d, 'drycooler') * rates.drycooler },
    { label: 'Pumps & pipes', group: 'cooling', amount: it * rates.plant },
    { label: 'Land & grid', group: 'other', amount: it * rates.site }
  ];
  const base = raw.reduce((a, l) => a + l.amount, 0);
  const lines = [...raw.filter((l) => l.amount > 0), { label: 'Design & contingency', group: 'other' as const, amount: base * rates.soft }];
  const facility = base * (1 + rates.soft);
  const itCost = d.racks * d.profile.itCost;
  lines.push({ label: 'Computers (estimate)', group: 'it', amount: itCost });

  const p = pueOf(d, b.utilization);
  const itMwh = (it * b.utilization * 8760) / 1000;
  const energyMwhYear = itMwh * p.pue;
  const energyYear = energyMwhYear * 1000 * b.priceKwh;
  const maintenanceYear = facility * rates.maintenance;
  const staff = Math.round(6 + 1.5 * (it / 1000));
  const staffYear = staff * rates.staff;
  const opexYear = energyYear + maintenanceYear + staffYear;
  const tco = facility + itCost + opexYear * b.years;
  const gpus = d.racks * d.profile.gpus;
  const gpuHours = gpus * 8760 * b.years * b.utilization;
  return {
    lines,
    facility,
    it: itCost,
    perMw: facility / (it / 1000),
    pue: p.pue,
    pueParts: { it: 1 / p.pue, cooling: p.cooling / p.pue, power: p.power / p.pue, other: p.other / p.pue },
    energyMwhYear,
    energyYear,
    maintenanceYear,
    staffYear,
    staff,
    opexYear,
    tco,
    co2Tonnes: (energyMwhYear * 1000 * rates.carbon) / 1000,
    gpus,
    perGpuHour: tco / gpuHours,
    perKwMonth: tco / (it * 12 * b.years),
    years: b.years
  };
}

export function fmtMoney(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${n.toFixed(2)}`;
}
