/* Lenses recolour the same model to answer one question each. Shared by the 3D view and the 2D plan. */
import { NORMAL, evaluate, type Conditions, type Health, type Report } from '../engine/status';
import { COMFORT_C, LIMIT_C, thermal, type ThermalResult } from '../engine/thermal';
import type { Design, Equip } from '../engine/types';
import { heatColor } from '../view3d/textures';

export type Lens = 'layout' | 'power' | 'heat' | 'backup';
export type RGB = [number, number, number];

export const LENSES: { id: Lens; label: string; question: string }[] = [
  { id: 'layout', label: 'Layout', question: 'What is where?' },
  { id: 'power', label: 'Power', question: 'Where does the electricity go?' },
  { id: 'heat', label: 'Heat', question: 'Where does it get hot?' },
  { id: 'backup', label: 'Backup', question: 'What keeps running if something breaks?' }
];

export interface LensData {
  lens: Lens;
  report: Report;
  thermal: ThermalResult | null;
  conditions: Conditions;
}

export function lensData(d: Design, lens: Lens, c: Conditions = NORMAL): LensData {
  return { lens, report: evaluate(d, c), thermal: lens === 'heat' ? thermal(d, c) : null, conditions: c };
}

const HEALTH: Record<Health, RGB> = { ok: [0.2, 0.75, 0.42], risk: [1, 0.66, 0.15], down: [0.95, 0.22, 0.2] };
export const healthCss: Record<Health, string> = { ok: 'var(--ok)', risk: 'var(--risk)', down: 'var(--down)' };
const SIDE: Record<'A' | 'B', RGB> = { A: [1, 0.66, 0.12], B: [0.62, 0.45, 1] };
const POWER_KINDS = new Set(['pdu', 'ups', 'battery', 'switchgear', 'generator', 'transformer']);
const COOL_KINDS = new Set(['cdu', 'crah', 'drycooler']);

function kwColor(kw: number): RGB {
  // pale yellow (light racks) to deep magenta (AI racks), on a log scale
  const t = Math.min(1, Math.max(0, Math.log(kw / 8) / Math.log(150 / 8)));
  const a: RGB = [1, 0.9, 0.55];
  const b: RGB = [1, 0.45, 0.2];
  const c: RGB = [0.85, 0.15, 0.55];
  const mix = (x: RGB, y: RGB, k: number): RGB => [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  return t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);
}

/* null: show the item in its normal colours; 'ghost': fade it; RGB: paint it. */
export function colorFor(e: Equip, data: LensData): RGB | 'ghost' | null {
  const { lens, report } = data;
  const failed = report.equipment.get(e.id);
  if (lens === 'layout') return null;
  if (lens === 'backup') {
    if (e.kind === 'rack') return HEALTH[report.racks.get(e.id) ?? 'ok'];
    return HEALTH[failed ?? 'ok'];
  }
  if (lens === 'power') {
    if (e.kind === 'rack') return kwColor(e.kw ?? 0);
    if (POWER_KINDS.has(e.kind)) return failed === 'down' ? HEALTH.down : SIDE[e.side ?? 'A'];
    return 'ghost';
  }
  // heat
  if (e.kind === 'rack') return heatColor(data.thermal?.rackInlet.get(e.id) ?? 22);
  if (COOL_KINDS.has(e.kind)) return failed === 'down' ? HEALTH.down : e.kind === 'cdu' ? [0.07, 0.75, 0.75] : [0.25, 0.55, 1];
  return 'ghost';
}

export const toCss = (c: RGB) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

export interface LegendItem {
  color: string;
  label: string;
}

export function legendFor(lens: Lens, d: Design): { text: string; items: LegendItem[] } {
  switch (lens) {
    case 'power':
      return {
        text: `Each rack draws ${d.profile.kw} kW. Two colours show the two power paths, so one can fail without switching anything off.`,
        items: [
          { color: toCss(kwColor(15)), label: '15 kW rack' },
          { color: toCss(kwColor(41)), label: '41 kW' },
          { color: toCss(kwColor(132)), label: '132 kW' },
          { color: toCss(SIDE.A), label: 'Power path A' },
          { color: toCss(SIDE.B), label: 'Power path B' }
        ]
      };
    case 'heat':
      return {
        text: `Air temperature at each rack’s front. Below ${COMFORT_C} °C is comfortable; above ${LIMIT_C} °C is too hot. A heat estimate, not a CFD simulation.`,
        items: [
          { color: toCss(heatColor(20)), label: '20 °C' },
          { color: toCss(heatColor(25)), label: '25 °C' },
          { color: toCss(heatColor(29)), label: '29 °C' },
          { color: toCss(heatColor(34)), label: '34 °C+' },
          { color: 'var(--cold)', label: 'Cooling units' }
        ]
      };
    case 'backup':
      return {
        text: 'Green: running, with a spare. Amber: running, but no backup left. Red: off or overheating.',
        items: [
          { color: 'var(--ok)', label: 'Safe' },
          { color: 'var(--risk)', label: 'No backup left' },
          { color: 'var(--down)', label: 'Down' }
        ]
      };
    default:
      return {
        text: 'Racks stand in rows. Their fronts face a cold aisle (blue); hot air leaves into the hot aisle (red).',
        items: [
          { color: '#2c2c2e', label: 'Rack' },
          { color: 'var(--liquid)', label: 'Liquid cooler' },
          { color: 'var(--cold)', label: 'Air handler' },
          { color: 'var(--power)', label: 'Power panel' },
          { color: '#e8960c', label: 'UPS' },
          { color: '#5e5ce6', label: 'Generator' },
          { color: '#40b4e5', label: 'Outdoor cooler' }
        ]
      };
  }
}
