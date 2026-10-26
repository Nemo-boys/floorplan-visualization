/* Unit tests for the data center engine (src/dc/engine): brief reading, layout invariants, design checks,
   failure scenarios and cost. Pure functions only, no DOM. */
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/dc/engine/checks';
import { costOf, fmtMoney } from '../../src/dc/engine/cost';
import { DEFAULT_BASIS, readBrief } from '../../src/dc/engine/brief';
import { generateOptions } from '../../src/dc/engine/design';
import { NORMAL, evaluate } from '../../src/dc/engine/status';
import type { Basis, Cooling, Design, Equip, Redundancy, Rect, Room } from '../../src/dc/engine/types';

const basisFor = (itKw: number, coolingRed: Redundancy, powerRed: Redundancy): Basis => ({
  ...DEFAULT_BASIS,
  itKw,
  coolingRedundancy: coolingRed,
  powerRedundancy: powerRed
});

const BASES: Record<string, Basis> = {
  '20 MW, 2N power, N+1 cooling': basisFor(20_000, 'N+1', '2N'),
  '2 MW, N+1 power and cooling': basisFor(2_000, 'N+1', 'N+1'),
  '10 MW, N+1 power and cooling': basisFor(10_000, 'N+1', 'N+1'),
  '500 kW, N power and cooling': basisFor(500, 'N', 'N')
};

const optionFor = (basis: Basis, cooling: Cooling): Design => generateOptions(basis).find((d) => d.id === cooling)!;

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

function overlappingPairs<T extends Rect & { id: string }>(items: T[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (overlap(items[i], items[j])) out.push(`${items[i].id} / ${items[j].id}`);
  return out;
}

const failingChecks = (d: Design) => runChecks(d).filter((c) => !c.pass).map((c) => c.id);

describe('readBrief', () => {
  it('reads the 20 MW AI factory brief', () => {
    const { basis } = readBrief('20 MW AI factory, liquid-cooled GB200 racks, N+1 cooling, 2N power');
    expect(basis.itKw).toBe(20_000);
    expect(basis.cooling).toBe('liquid');
    expect(basis.coolingRedundancy).toBe('N+1');
    expect(basis.powerRedundancy).toBe('2N');
  });

  it('reads kilowatts and air cooling', () => {
    const { basis } = readBrief('500 kW air cooled');
    expect(basis.itKw).toBe(500);
    expect(basis.cooling).toBe('air');
  });

  it('reads electricity price in cents', () => {
    expect(readBrief('8 cents per kWh').basis.priceKwh).toBeCloseTo(0.08, 10);
  });

  it('converts GPU counts into GB200-class racks', () => {
    // 1440 GPUs / 72 per rack = 20 racks x 132 kW
    expect(readBrief('1440 GPUs').basis.itKw).toBe(2640);
  });

  it('keeps DEFAULT_BASIS when the brief has no numbers', () => {
    expect(readBrief('a data center for our team').basis).toEqual(DEFAULT_BASIS);
  });
});

describe('generateOptions layout', () => {
  for (const [name, basis] of Object.entries(BASES)) {
    describe(name, () => {
      const designs = generateOptions(basis);

      it('produces all three cooling options', () => {
        expect(designs.map((d) => d.id)).toEqual(['liquid', 'hybrid', 'air']);
      });

      it('has no overlapping equipment', () => {
        for (const d of designs) expect(overlappingPairs(d.equipment), d.id).toEqual([]);
      });

      it('keeps every equipment item inside its room', () => {
        for (const d of designs) {
          const bad = d.equipment.filter((e: Equip) => {
            const room = d.rooms.find((r: Room) => r.id === e.room);
            return !room || !inside(e, room);
          });
          expect(bad.map((e) => e.id), d.id).toEqual([]);
        }
      });

      it('has no overlapping indoor rooms', () => {
        for (const d of designs) {
          const indoor = d.rooms.filter((r) => !r.outdoor);
          expect(overlappingPairs(indoor), d.id).toEqual([]);
        }
      });

      it('installs at least the requested IT load', () => {
        for (const d of designs) {
          const installed = d.equipment.filter((e) => e.kind === 'rack').reduce((a, e) => a + (e.kw ?? 0), 0);
          expect(installed, d.id).toBeGreaterThanOrEqual(basis.itKw);
          expect(d.itKw, d.id).toBeGreaterThanOrEqual(basis.itKw);
        }
      });

      it('faces every rack onto a cold aisle', () => {
        for (const d of designs) {
          const orient = runChecks(d).find((c) => c.id === 'DC-ORIENT-01');
          expect(orient?.pass, d.id).toBe(true);
        }
      });

      it('is deterministic', () => {
        expect(JSON.stringify(generateOptions(basis))).toBe(JSON.stringify(generateOptions(basis)));
      });
    });
  }
});

describe('runChecks on the default 20 MW 2N brief', () => {
  const basis = BASES['20 MW, 2N power, N+1 cooling'];
  for (const cooling of ['liquid', 'hybrid', 'air'] as const) {
    it(`passes every check for ${cooling}`, () => {
      expect(failingChecks(optionFor(basis, cooling))).toEqual([]);
    });
  }
});

describe('evaluate', () => {
  const basis = BASES['20 MW, 2N power, N+1 cooling'];
  const liquid = optionFor(basis, 'liquid');

  it('reports ok when nothing has failed', () => {
    expect(evaluate(liquid, NORMAL).headline).toBe('ok');
  });

  it('keeps every row running when one CDU fails', () => {
    const cdu = liquid.equipment.find((e) => e.kind === 'cdu')!;
    const r = evaluate(liquid, { ...NORMAL, failed: new Set([cdu.id]) });
    expect(r.rowsDown).toBe(0);
  });

  it('takes rows down when every CDU in hall 1 fails', () => {
    const failed = new Set(liquid.equipment.filter((e) => e.kind === 'cdu' && e.room === 'data_hall_1').map((e) => e.id));
    const r = evaluate(liquid, { ...NORMAL, failed });
    expect(r.rowsDown).toBeGreaterThan(0);
    expect(r.headline).toBe('down');
  });

  // Expected by the spec: losing one whole 2N train leaves the site running with no backup (risk), not down.
  // The engine marks train A 'down' on its own pool and that drives the headline to 'down' with rowsDown 0.
  it('reports risk when all UPS on side A fail in 2N (engine headline is down)', () => {
    const failed = new Set(liquid.equipment.filter((e) => e.id.startsWith('ups_A')).map((e) => e.id));
    const r = evaluate(liquid, { ...NORMAL, failed });
    expect(r.rowsDown).toBe(0);
    expect(r.headline).toBe('risk');
  });

  // Same root cause: train A's pool is 'down' whenever its live UPS modules can't carry the whole load, even though
  // train B covers every rack. One failed module (16 x 1.2 MW = 19.2 MW < 20.06 MW) already sets headline 'down'.
  it('does not report down when a single UPS module fails in 2N (no rack is down)', () => {
    const r = evaluate(liquid, { ...NORMAL, failed: new Set(['ups_A1']) });
    expect(r.rowsDown).toBe(0);
    expect(r.headline).not.toBe('down');
  });

  it('adds a generators pool when both utilities fail in 2N', () => {
    const r = evaluate(liquid, { ...NORMAL, failed: new Set(['utility_A', 'utility_B']) });
    expect(r.pools.some((p) => p.id === 'generators')).toBe(true);
  });
});

describe('costOf', () => {
  const basis = BASES['20 MW, 2N power, N+1 cooling'];

  it('prices facility, PUE in a plausible range, and liquid cheaper to run than air', () => {
    const liquid = costOf(optionFor(basis, 'liquid'));
    const air = costOf(optionFor(basis, 'air'));
    expect(liquid.facility).toBeGreaterThan(0);
    for (const r of [liquid, air]) {
      expect(r.pue).toBeGreaterThan(1.05);
      expect(r.pue).toBeLessThan(1.6);
    }
    expect(liquid.pue).toBeLessThan(air.pue);
  });

  it('costs more facility for 2N power than N+1 on the same load and cooling', () => {
    const twoN = costOf(optionFor(basis, 'liquid'));
    const nPlus1 = costOf(optionFor({ ...basis, powerRedundancy: 'N+1' }, 'liquid'));
    expect(twoN.facility).toBeGreaterThan(nPlus1.facility);
  });

  it('computes total cost of ownership from facility, IT and running cost', () => {
    const r = costOf(optionFor(basis, 'liquid'));
    expect(Math.abs(r.tco - (r.facility + r.it + r.opexYear * r.years))).toBeLessThan(1);
  });

  it('formats money in millions', () => {
    expect(fmtMoney(2_500_000)).toBe('$2.5M');
  });
});
