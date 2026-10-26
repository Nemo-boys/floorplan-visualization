/* Reads a one-sentence brief into a design basis. Deterministic, so the app works with no model; when the
   AegisPlan server answers, Nemotron's reading can replace this one (same Basis shape). */
import type { Basis, Cooling, Redundancy } from './types';

export const DEFAULT_BASIS: Basis = {
  itKw: 20000,
  cooling: null,
  coolingRedundancy: 'N+1',
  powerRedundancy: '2N',
  priceKwh: 0.09,
  years: 5,
  utilization: 0.8
};

export interface BriefReading {
  basis: Basis;
  understood: string[]; // what the parser picked up, for the "We understood" line
}

const num = (s: string) => parseFloat(s.replace(/,/g, ''));

export function readBrief(text: string, base: Basis = DEFAULT_BASIS): BriefReading {
  const t = text.toLowerCase();
  const basis: Basis = { ...base };
  const understood: string[] = [];

  const mw = /(\d+(?:\.\d+)?)\s*(?:-\s*)?(mw|megawatts?)\b/.exec(t);
  const kw = /(\d[\d,]*(?:\.\d+)?)\s*(?:-\s*)?(kw|kilowatts?)\b(?!\s*(?:per\s+)?racks?)(?!\s*\/\s*rack)/.exec(t);
  const gpus = /(\d[\d,]*)\s*(?:gb200|b200|h100|h200)?\s*gpus?\b/.exec(t);
  if (mw) basis.itKw = Math.round(num(mw[1]) * 1000);
  else if (kw && num(kw[1]) >= 100) basis.itKw = Math.round(num(kw[1]));
  else if (gpus) basis.itKw = Math.round((num(gpus[1]) / 72) * 132); // GB200 NVL72-class racks
  if (mw || (kw && num(kw[1]) >= 100) || gpus) understood.push(`${fmtPower(basis.itKw)} of computing`);

  let cooling: Cooling | null = null;
  if (/liquid|direct[- ]to[- ]chip|dlc|immersion|gb200|nvl72|blackwell/.test(t)) cooling = 'liquid';
  else if (/hybrid|rear[- ]door/.test(t)) cooling = 'hybrid';
  else if (/air[- ]?cooled|\bair\b|crah|enterprise/.test(t)) cooling = 'air';
  if (/compare|options|not sure|any cooling/.test(t)) cooling = null;
  if (cooling) {
    basis.cooling = cooling;
    understood.push(`${cooling} cooling`);
  }

  const red = (m: RegExpExecArray | null): Redundancy | null =>
    m ? (m[1].replace(/\s/g, '').toUpperCase() as Redundancy) : null;
  const coolRed = red(/\b(n\s*\+\s*1|2n|n)\s*(?:cooling|cool|crah|cdu)/.exec(t));
  const powRed = red(/\b(n\s*\+\s*1|2n|n)\s*(?:power|ups|electrical)/.exec(t));
  if (coolRed) basis.coolingRedundancy = coolRed;
  if (powRed) basis.powerRedundancy = powRed;
  if (!coolRed && !powRed) {
    const any = red(/\b(n\s*\+\s*1|2n)\b/.exec(t));
    if (any) {
      basis.coolingRedundancy = any;
      basis.powerRedundancy = any;
    }
  }
  if (coolRed || powRed || /\b(n\s*\+\s*1|2n)\b/.test(t))
    understood.push(`${basis.coolingRedundancy} cooling backup`, `${basis.powerRedundancy} power backup`);
  if (/tier\s*(iv|4)/.test(t)) {
    basis.powerRedundancy = '2N';
    basis.coolingRedundancy = '2N';
    understood.push('Tier IV-style 2N backup');
  }

  const cents = /(\d+(?:\.\d+)?)\s*(?:¢|cents?|c)\s*(?:\/|per)\s*kwh/.exec(t);
  const dollars = /\$\s*(\d*\.\d+)\s*(?:\/|per)\s*kwh/.exec(t);
  if (cents) basis.priceKwh = num(cents[1]) / 100;
  else if (dollars) basis.priceKwh = num(dollars[1]);
  if (cents || dollars) understood.push(`electricity at ${Math.round(basis.priceKwh * 1000) / 10}¢/kWh`);

  const yrs = /(\d+)\s*[- ]?years?/.exec(t);
  if (yrs) {
    basis.years = Math.max(1, Math.min(20, parseInt(yrs[1], 10)));
    understood.push(`${basis.years}-year cost`);
  }

  basis.itKw = Math.max(200, Math.min(50_000, basis.itKw));
  return { basis, understood };
}

export function fmtPower(kw: number): string {
  return kw >= 1000 ? `${Math.round(kw / 100) / 10} MW` : `${Math.round(kw)} kW`;
}
