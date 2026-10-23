/* Shared helpers for the golden tests: read the delivered files, and compare with the golden README's rule. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { makeSamplePlan, preparePlan, type PreparedPlan, type Scenario } from '../../src/engine';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) as T;
export const readText = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

/* Numbers are rounded to 6 decimals, as tools/make-golden.mjs does. Non-finite numbers became null in the JSON. */
export const r6 = (v: unknown): unknown => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
export const pick = (o: object, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(keys.map(k => [k, r6((o as Record<string, unknown>)[k])]));

/* Deep comparison: numbers within 1e-6 after rounding, everything else equal. Reports the path of the first mismatch. */
export function expectGolden(actual: unknown, expected: unknown, where = '$'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, where).toBe('number');
    const a = r6(actual) as number;
    if (!(Math.abs(a - expected) < 1e-6)) expect(a, where).toBe(expected);
    return;
  }
  if (expected === null && typeof actual === 'number' && !isFinite(actual)) return;
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), where + ' is an array').toBe(true);
    const arr = actual as unknown[];
    expect(arr.length, where + '.length').toBe(expected.length);
    expected.forEach((e, i) => expectGolden(arr[i], e, where + '[' + i + ']'));
    return;
  }
  if (expected && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', where + ' is an object').toBe(true);
    const obj = actual as Record<string, unknown>;
    expect(Object.keys(obj).sort(), where + ' keys').toEqual(Object.keys(expected).sort());
    for (const [k, e] of Object.entries(expected)) expectGolden(obj[k], e, where + '.' + k);
    return;
  }
  expect(actual, where).toBe(expected);
}

export const LAYOUTS = ['A', 'B', 'C'] as const;
const prepared: Record<string, PreparedPlan> = {};
/* Each sample layout prepared once, as the generator does (no added furniture). */
export function plan(k: string): PreparedPlan {
  return (prepared[k] ||= preparePlan(makeSamplePlan(k), []));
}
export const scenario = (key: string): Scenario => readJson<Scenario>('samples/scenarios/' + key + '.scenario.json');
export const SCENARIO_KEYS = [
  'normal-tuesday',
  'flu-season-monday',
  'short-staffed-day',
  'custom-starter',
  'every-block-type',
  'broken-on-purpose',
  'providers-leave-early'
];
