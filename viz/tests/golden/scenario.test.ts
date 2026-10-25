/* Scenario checks and the compiler against tests/golden/scenario-golden.json: every message, exact text included. */
import { describe, it } from 'vitest';
import { applyOverrides, compileScenario, validateScenario } from '../../src/engine';
import { SCENARIO_KEYS, expectGolden, plan, r6, readJson, scenario } from './helpers';

interface Golden {
  scenarios: Record<string, unknown>;
  overrides_normal_patients90_nurses3: unknown;
}
const G = readJson<Golden>('tests/golden/scenario-golden.json');

describe('validateScenario and compileScenario on layout A', () => {
  for (const key of SCENARIO_KEYS)
    it(key, () => {
      const scn = scenario(key);
      const problems = validateScenario(scn, plan('A')).map(p => ({
        level: p.level,
        block: p.block,
        field: p.field,
        msg: p.msg
      }));
      let compiled = null;
      if (!problems.some(p => p.level === 'error')) {
        const c = compileScenario(scn);
        compiled = {
          opens: c.opens,
          closes: c.closes,
          patients: c.patients,
          providers: c.providers,
          nurses: c.nurses,
          receptionists: c.receptionists,
          breaks: c.breaks.length,
          outs: c.outs.length,
          closures: c.closures.length,
          rules: c.rules.map(r => r.label),
          visit_types: c.visitTypes.map(v => v.name + ' ' + r6(v.p)),
          days: c.days,
          seed: c.seed
        };
      }
      expectGolden({ problems, compiled }, G.scenarios[key], key);
    });
});

it('applyOverrides: Normal Tuesday with 90 patients and 3 nurses', () => {
  const ov = compileScenario(applyOverrides(scenario('normal-tuesday'), { patients: 90, nurses: 3 }));
  expectGolden(
    { patients: ov.patients, nurses: ov.nurses, providers: ov.providers },
    G.overrides_normal_patients90_nurses3,
    'overrides'
  );
});
