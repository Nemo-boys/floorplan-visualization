/* Differential tests: reference-src/plan2d.js and the port draw the same SVG strings, for every layout and every
   option set the app uses, plus the live overlays and the people dots. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as E from '../../src/engine';
import type { PlanJson, PreparedPlan, Scenario } from '../../src/engine';
import { planOverlay, planPeople, type OverlayOpts } from '../../src/plan2d/overlay';
import { planSVG, type PlanSvgOpts } from '../../src/plan2d/plan-svg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f: string): string => fs.readFileSync(path.join(root, f), 'utf8');
const view = src('reference-src/view.js');
const esc = (view.match(/^const esc = .*$/m) as RegExpMatchArray)[0];
const inward = (view.match(/^function inwardDir\(d, m\) \{[\s\S]*?^\}/m) as RegExpMatchArray)[0];
interface RefPlan2d {
  preparePlan: typeof E.preparePlan;
  compileScenario: typeof E.compileScenario;
  ClinicSim: typeof E.ClinicSim;
  planSVG: typeof planSVG;
  planOverlay: typeof planOverlay;
  planPeople: typeof planPeople;
}
const R = new Function(
  src('reference-src/engine.js') +
    '\n' +
    esc +
    '\n' +
    inward +
    '\nconst R3 = null;\n' +
    src('reference-src/plan2d.js') +
    '\nreturn { preparePlan, compileScenario, ClinicSim, planSVG, planOverlay, planPeople };'
)() as RefPlan2d;

/* Just enough of an SVG element for the overlay functions: querySelector by id, and innerHTML. */
const fakeSvg = (): { el: Element; html: Record<string, string> } => {
  const html: Record<string, string> = {};
  const parts: Record<string, { innerHTML: string }> = {};
  for (const id of ['planSel', 'planRoutes', 'planPeople'])
    parts[id] = {
      set innerHTML(v: string) {
        html[id] = v;
      },
      get innerHTML() {
        return html[id];
      }
    };
  return { el: { querySelector: (s: string) => parts[s.slice(1)] || null } as unknown as Element, html };
};
const uploaded: PlanJson = {
  name: 'Uploaded',
  rooms: (E.makeSamplePlan('B').rooms || []).map(r => {
    const q = r.rect as NonNullable<typeof r.rect>;
    return {
      id: r.id,
      type: r.type,
      label: r.label + ' & <co>',
      polygon_mm: [
        [q.x_mm, q.y_mm],
        [q.x_mm + q.w_mm, q.y_mm],
        [q.x_mm + q.w_mm, q.y_mm + q.h_mm],
        [q.x_mm, q.y_mm + q.h_mm]
      ]
    };
  })
};
const PLANS: Record<string, PlanJson> = {
  A: E.makeSamplePlan('A'),
  B: E.makeSamplePlan('B'),
  C: E.makeSamplePlan('C'),
  uploaded
};
// The option sets used by the app: live plan, export, sample and import thumbnails, the dock pill.
const OPTS: (PlanSvgOpts | undefined)[] = [
  undefined,
  {},
  { live: true },
  { compact: true, labels: false, furniture: true, doors: false, dims: false },
  { compact: true, labels: false, furniture: true, doors: false, dims: false, entrance: true },
  { compact: true, labels: false, furniture: false, doors: false, dims: false, entrance: false, windows: false },
  { compact: true },
  { dims: false }
];
const both = (json: PlanJson): [PreparedPlan, PreparedPlan] => [
  R.preparePlan(JSON.parse(JSON.stringify(json)), []),
  E.preparePlan(JSON.parse(JSON.stringify(json)), [])
];

describe('planSVG', () => {
  for (const [k, json] of Object.entries(PLANS))
    it(k + ': every option set', () => {
      const [a, b] = both(json);
      for (const o of OPTS) expect(planSVG(b, o)).toBe(R.planSVG(a, o));
    });
});

describe('planOverlay and planPeople', () => {
  for (const [k, json] of Object.entries(PLANS))
    it(k, () => {
      const [a, b] = both(json);
      const ids = b.m.rooms.map(r => r.id);
      const cases: OverlayOpts[] = [
        {},
        { outlines: [], journey: true },
        {
          outlines: [
            [ids[0], '#2453d6', false, '1'],
            [ids[3], '#e0592a', false, '2']
          ],
          journey: true,
          staff: true
        },
        { outlines: [[ids[1], '#11806a', false, '✎']], egress: true },
        {
          outlines: [
            [ids[2], '#2453d6', true],
            ['nope', '#000', false]
          ],
          journey: true,
          staff: true,
          egress: true
        }
      ];
      for (const c of cases) {
        const ra = fakeSvg(),
          rb = fakeSvg();
        R.planOverlay(ra.el, a, c);
        planOverlay(rb.el, b, c);
        expect(rb.html).toEqual(ra.html);
      }
      const scn = JSON.parse(src('samples/scenarios/flu-season-monday.scenario.json')) as Scenario;
      const sa = new R.ClinicSim(a.m, a.g, a.pf, a.info, R.compileScenario(scn), 11),
        sb = new E.ClinicSim(b.m, b.g, b.pf, b.info, E.compileScenario(scn), 11);
      const colors = { patient: '#2453d6', nurse: '#11806a', provider: '#8b3fb0', reception: '#5d6b78' };
      for (const t of [0, 45.5, 90, 200, 333]) {
        sa.advanceTo(t);
        sb.advanceTo(t);
        const ra = fakeSvg(),
          rb = fakeSvg();
        R.planPeople(ra.el, a, sa, colors);
        planPeople(rb.el, b, sb, colors);
        expect(rb.html.planPeople).toBe(ra.html.planPeople);
        expect(rb.html.planPeople.length).toBeGreaterThan(0);
      }
    });
});
