# Golden data

`tools/make-golden.mjs` produced these files from `reference-src/`. They define the exact numbers the TypeScript engine must reproduce.

| File | What it checks |
|---|---|
| `engine-golden.json` | `layouts`: per sample layout, room, door, wall, window and furniture counts, distances, tour order and checks. `swap_A_nurse_station_with_exam_5`: the swap preview numbers. `scenario_runs`: the three presets on the three layouts, 20 days each, every day’s metrics, the summary (mean, 10th and 90th percentile), the typical day’s seed, how often rules fired, and the verdict. `scenario_runs_10_days`: two more scenarios. `legacy_single_day`: the old fixed scenarios with seed 7. |
| `scenario-golden.json` | `validateScenario` on every sample scenario (level, block, field and exact message), the compiled summary when there are no errors, and an `applyOverrides` example |
| `plan2d-layout-a.svg`, `.sha256` | `planSVG(layout A, {})`, byte for byte |

**How to compare:** numbers are rounded to 6 decimals. Round the port’s value the same way (`Math.round(v * 1e6) / 1e6`), then require `Math.abs(a − b) < 1e-6`. Strings and counts must be equal.

The sample scenarios in `samples/scenarios/` use fixed block ids (`n1`, `f13`, …), so firing counts are keyed by those ids.

**If a golden test fails,** the port differs from the reference. Fix the port; don’t touch the golden files. They change only when the reference changes on purpose: run `node tools/make-golden.mjs`, commit the regenerated files together with the reference change, and explain why.
