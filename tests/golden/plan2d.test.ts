/* planSVG(layout A) against tests/golden/plan2d-layout-a.svg, byte for byte. */
import crypto from 'node:crypto';
import { expect, it } from 'vitest';
import { planSVG } from '../../src/plan2d/plan-svg';
import { plan, readText } from './helpers';

it('planSVG(layout A, {}) equals the golden drawing byte for byte', () => {
  const svg = planSVG(plan('A'), {});
  expect(svg).toBe(readText('tests/golden/plan2d-layout-a.svg'));
  expect(crypto.createHash('sha256').update(svg).digest('hex') + '\n').toBe(
    readText('tests/golden/plan2d-layout-a.sha256')
  );
});
