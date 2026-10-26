# Findings and observations

## The fine-tuned model
- **Without a grammar it doesn't follow its training format.** We tested this with the exact fine-tuning prompts (byte-identical to `aegis/dataset/*.jsonl`) on test-split briefs. It writes `R1 TYPE EXAM ROOM`, chains doors room to room and leaves out the corridor.
- **Its chat template turns on reasoning, which uses up the token budget.** Append `/no_think` to the system prompt.
- **With the GBNF grammar** every line is valid FML. The **room program** (which rooms, how many) is reliable. The **geometry** isn't: rooms don't fit the site.
  - Forcing the 100 mm grid turned an 1830 mm corridor into 18300 mm.
  - So only the `program` grammar schema is used.
- **So generation is program-first**, which is also the research brief's split:
  1. Nemotron writes the program.
  2. `merge_programs` adds the room types the brief names; counts the brief states win.
  3. `layout_program` places 3 entrance variants on a double-loaded corridor.
  4. CP-SAT repairs, the validator ranks.
- **Speed:** about 47 s per request (3 candidates) on an M4 Pro with all layers on Metal (`AEGISPLAN_GPU_LAYERS=-1`, the default; about 1.3× faster than CPU).
  - There is one model call per request, and the time is mostly the model writing room lines.
  - The first request also loads the model.
  - Untried ideas: a lower `max_tokens`, a shorter program format, caching by brief.
- **The variants differ in the simulator** (5-day average, flu-season Monday):

  | Measure | West entrance | Centre entrance | East entrance |
  |---|---|---|---|
  | Average wait | 13.4 min | 11.5 min | 14.6 min |
  | Nurse walking per day | 2.0 km | 1.4 km | 1.4 km |

  Good for the demo.

## Bugs found and fixed in AegisPlan
- The egress check measured to (0,0) instead of through the doors to the exit, so it failed sound plans (`fml_parser._compute_circulation_paths`).
- The fallback templates ignored the boundary and brief. Scaling y uniformly broke the corridor's ADA width, so the scaling is piecewise.
- The synthesizer stretched rooms past the 2.5:1 aspect limit, which made CP-SAT infeasible. Widths are now capped, and leftover width goes to the rooms with the most slack.
- The edit parser read "20" in "waiting room 20%" as a room number; fixed with a lookahead.

## Benchmark honesty
- **Don't show `aegis/benchmark_report.md` or `aegis/aegisplan/benchmark.py` output.**
  - Its variant 1 and 2 rows (and the cost column) are hardcoded literals.
  - Its "fine-tuned" latency is `max(0.4, elapsed × 0.7)`.
- Use `make bench` → `docs/BENCHMARK.md`, where every number is measured.
  - So far (model off): 20/20 accepted, p50 0.04 s, 5/5 infeasible requests diagnosed.
  - The model rows still need the ~30 min run (Thu).

## Viewer test baseline (important before claiming "tests pass")
- `npm run check` (101 tests) passes. Python: 49/49.
- Playwright needs `npx playwright install chromium` (build 1248). **Earlier in the session I wrongly reported e2e as passing**: the grep pipe returned 0 while Playwright hadn't run at all.
- Four e2e failures are identical on the untouched original viewer (`047f11f`), so they are not ours:
  - `export.spec.ts:241` needs the reference server on :5174 plus internet;
  - `simulate.spec.ts:95` and `:264` (timeline);
  - the `shell.spec.ts:52` deep links flake about 6 times in 32 runs on both versions.
  - Others (flu-season, tour) are flaky in a full run and pass alone.

## Traps
- Vitest swallows `console.log`; write probe output to a file.
- `viz/playwright.config.ts` starts Vite with `FI_OFFLINE=1`, so e2e runs against the static app (no pipeline card).
- `pipeline.busy` is shared by generate and edit; one request at a time.
- In the viewer, generated plans carry AegisPlan's checks (`pipelineChecks` in `viz/src/engine/checks.ts`), which replace the example checks.
- Compare's button exists only after a simulation run: Simulate → Run 20 days → Results.
