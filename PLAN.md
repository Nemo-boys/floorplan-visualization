# Floorplan Intelligence: Integration Plan

AegisPlan (2D generation, validation and repair) and the 3D viewer (review, simulation, export) joined into one pipeline. The pipeline runs on **domain packs**, so the same flow can design a clinic or a datacenter.

Built for the Nebius × NVIDIA Global AI Hackathon 2026. **Submissions close Fri Oct 30, 2026, 10:00 am PDT.**

- Datacenter design: [docs/DATACENTER.md](docs/DATACENTER.md)
- Format mapping between the two halves: [contracts/plan-mapping.md](contracts/plan-mapping.md)
- Research brief this follows: `Floorplan-Intelligence-Research.html` (team folder, not in this repo)

---

## 1. The thesis

> Within a defined design scope, a local system produces editable plans that pass stated checks, simulates how they perform, and does it at a measured cost.

The brief and the code agree on how to split the work:

- **The LLM (Nemotron Nano 9B, fine-tuned)** reads the brief and drafts room programs and edits.
- **The solver (OR-Tools CP-SAT)** turns the drafts into valid geometry, or proves a request is impossible and names the conflicting rooms.
- **The validator** runs checks against cited rules. It reports what it checked, never a blanket "compliant".
- **The viewer** derives 3D, walkthroughs, simulation and export from the same geometry, so every view stays consistent.

## 2. What we started with

### `aegis/`: AegisPlan (Python), formerly a separate repo

| Stage | Module | Notes |
|---|---|---|
| Draft | `router.py`, `gguf_engine.py`, `local_model.py` | Nemotron Nano 9B v2 (QLoRA + GRPO), local GGUF on Metal, a vLLM-style endpoint, or OpenRouter. **Without a model it falls back to heuristic candidates** (`router.py:242`), so the demo runs with no weights and no key. |
| Parse | `fml_parser.py` | FML-DSL text becomes a `PlanDocument`, with walls, topology and BFS paths |
| Validate | `validator.py` | 9 rules: geometry, ADA 404.2.3 / 403.5.1 / 304.3, FGI, IBC 1017 |
| Repair | `cpsat_repair.py` | No-overlap, locks, minimal moves; returns a conflict core when the plan is infeasible |
| Serve | `server.py` | FastAPI: `/api/generate`, `/validate`, `/repair`, `/edit`, `/sample` |

Known gaps:
- The grammar (`grammars/fml_dsl.ebnf`) is documented but not wired into decoding.
- No windows, no exterior wall segments, no DXF export, despite the README.
- Clinic types are hard-coded in the grammar, the CP-SAT size table and the validator.

### `viz/`: Floorplan Intelligence Modules 3 and 4 (TypeScript), formerly a separate repo

- Import a plan.json v0.1, then Review in 3D (orbit, walk, tour, heatmap), Simulate clinic days (`ClinicSim`, deterministic), Edit, and Export (GLB, ZIP, Blender script).
- The stack is Vite, strict TS, three.js 0.186.1 (WebGPU with WebGL2 fallback) and plain DOM.
- It derives walls, windows, furniture and the entrance itself. The input only needs rooms and doors.
- Module 1 (generator) and Module 2 (rule checks) are stand-ins with documented hooks (`viz/docs/INTEGRATION.md`).

### Verified facts (Oct 25)

| Fact | Evidence |
|---|---|
| AegisPlan's origin is top-left with y pointing down; the viewer's is bottom-left with y pointing north. **The adapter must flip y.** | `inference_cli.py:66` draws `bbox.y` directly; `index.html:1340` maps y to z; `viz/src/engine/plan.ts:200` |
| The viewer reads only rooms and doors | `adaptPlan`, `viz/src/engine/plan.ts:212` |
| With no `nurse_station`, nurses fall back to the corridor | probe of the Aegis fixtures (`nurseLabel: Corridor`) |
| The simulator separates generated layouts well | 2 exam rooms: 38 seen, ~110 min wait. 6 exam rooms: 55 seen, 5–14 min wait (normal Tuesday, seed 99) |
| Room swaps work only on the bundled samples | `viz/docs/INTEGRATION.md` |
| A hidden "Ask the assistant" button already says "Make the waiting room 20% bigger" | `#askBigger`; this maps to Aegis `/api/edit` |

## 3. Repo layout

```
floorplan-visualization/
├─ PLAN.md            ← this file
├─ Makefile           setup / test / fixtures
├─ aegis/             AegisPlan, imported with git subtree (history kept)
├─ viz/               the viewer, imported with git subtree (history kept)
├─ contracts/         plan-mapping.md (how the two formats map); later the domain-pack schema
├─ domains/           (Step 6) domain packs: clinic/, datacenter/
└─ docs/              DATACENTER.md, later the demo script and benchmarks
```

**Runtime target (Step 3):** FastAPI serves the built `viz/dist` at `/` and the API at `/api/*`. That means one process, one port, no CORS, and `make dev` for the demo. The viewer still works as a static site: if the API is unreachable, it falls back to upload and the bundled samples.

### Ground rules in this repo

- The viz parity rules (`viz/CLAUDE.md`) still guard the existing product. **Golden simulation numbers for samples A/B/C stay frozen**, and `npm run check` must pass.
- The rules are relaxed in this repo for:
  - (a) additive integration UI: the pipeline brief form, candidate picker, datacenter mode;
  - (b) the backend call to our own FastAPI.
- Log each relaxation in `viz/docs/deviations.md` as it lands.
- Clinic behavior must not change when the domain packs arrive. Clinic becomes pack #1.
- Small commits, one topic each, for example `feat(adapter): …`.

## 4. Step by step

Status key: ✅ done · 🔜 next · ⏳ planned

### Step 0: Repo and baseline ✅ (Oct 25)

- Created the repo and imported both projects with `git subtree`, so the full history of each is kept.
- Aegis runs in a Python 3.12 venv (`aegis/.venv`; ortools has no 3.14 wheels).
  - Baseline: **16/16 pytest**.
- Viz installed with `npm install`.
  - Baseline: **typecheck, lint and 87/87 Vitest, including golden tests**.

### Step 1: The adapter ✅ (Oct 25)

- `aegis/aegisplan/export_viz.py` converts a `PlanDocument` into plan.json v0.1. It is the single source of truth for the mapping, documented in [contracts/plan-mapping.md](contracts/plan-mapping.md).
  - Flips y: `y' = D − (y + h)` for rooms and `D − y` for doors.
  - Maps types and converts `OUTSIDE` to `"exterior"` plus `is_entrance`.
  - Writes the validator's results into `checks[]`, and the solver status, locks and conflict core into `provenance`.
  - **Keeps room ids**, so edits made in the viewer map back to Aegis.
  - CLI: `python -m aegisplan.export_viz plan.json -o viz-plan.json`.
- Tests:
  - `aegis/tests/test_export_viz.py`: **all 500 dataset plans** pass the viz JSON schema, and every door stays on its rooms' edges after the flip.
  - `viz/tests/unit/aegis-fixtures.test.ts`: generated plans load with their own doors, reach every room, pass the viewer checks and simulate a day.
  - Fixtures are made by `aegis/scripts/export_viz_fixtures.py`.

### Step 2: Close the grammar gaps ✅ (Oct 25)

- Add `nurse_station`, `lab` and `storage` to the FML grammar, the parser, the CP-SAT size table (`cpsat_repair.py:85-133`), the synthetic generator and the few-shot exemplar.
- Then the generated clinics staff and simulate properly.
- Add a viz fixture with a nurse station, and assert that `nurseLabel` is not "Corridor".

### Step 3: Live pipeline ✅ (Oct 25)

- `POST /api/pipeline {brief, boundary_w, boundary_h, locked_rooms, domain}` runs generate (Best-of-3), validate and repair, and returns 3 viz plans.
- FastAPI serves `viz/dist`.
- In the viz app:
  - `importPlan({kind: 'pipeline', json})` replaces the sample stand-in behind "From the Module 1 pipeline".
  - Add a small brief form.
- The Aegis checks fill `state.checks` and call `renderChecks()`, replacing the 5 example checks. That makes Module 2 real.

### Step 4: Close the loop ✅ (Oct 25)

This is the strongest part of the demo.

- **Generate 3, simulate 3.**
  - The 3 candidates go into the compare dialog.
  - Rank by checks passed, then simulated wait and throughput.
  - Check first whether `compare.ts` assumes samples A/B/C.
- **Edit in 3D, solve again.**
  - Lock a room in Review.
  - `#askBigger` sends free text to `/api/edit`, then `/api/repair`.
  - The result returns as a new version (`commitVersion`) with a visible diff.
- **Show infeasibility.** Highlight the `conflict_core` rooms in red in 3D, with the solver's explanation. This is the "impossible request" moment.

**Built:** `aegisplan/edits.py` reads plain-language edits ("Make the waiting room 20% bigger, keep the restrooms fixed"). It holds the edited room at its new size while CP-SAT repairs the rest. An impossible request returns the rooms in the way and the arithmetic, for example "Waiting Area 1 would be 35 m wide, and the building is 24 m wide". Compare uses the request's other candidates.

**End-to-end baseline (viz):**
- 4 tests fail or flake identically on the untouched import, so they are not regressions:
  - `export.spec.ts:241` needs the reference server on port 5174, with internet;
  - the two timeline tests `simulate.spec.ts:95` and `:264`;
  - the deep links in `shell.spec.ts:52`, which fail about 6 times in 32 runs on both versions.
- Playwright needs `npx playwright install chromium` (build 1248).

### Step 5: Clinic demo freeze ✅ (Oct 25, light version)

- ✅ `make dev` (builds the viewer, serves it with the API on :8000), README, [docs/DEMO.md](docs/DEMO.md).
- ✅ `make bench` (`aegis/scripts/bench_pipeline.py`): a measured benchmark, raw model vs. pipeline vs. model off, to [docs/BENCHMARK.md](docs/BENCHMARK.md). Only the model-off rows are in so far. The full run (about 30 min) is left for Thu Oct 29. The old `aegis/benchmark_report.md` hardcodes its baseline rows, so don't show it.
- ✅ Tag `v0.1-clinic`.

### Step 6: Domain packs, then datacenter 🔜

See [docs/DATACENTER.md](docs/DATACENTER.md).

- In short: refactor the hard-coded clinic tables into `domains/clinic/`, then add `domains/datacenter/`.
- Generation works at two levels:
  - **Building program:** Nemotron, FML and CP-SAT, unchanged except for the room types.
  - **White space:** a deterministic rack placer, with no LLM.
- On the viewer side: datacenter validator rules, 3D rack models, power and heat overlays, and a failure-scenario simulation in place of the clinic simulation.

### Step 7: Ship ⏳

- Full viz suite: `npm run check`, `npm run test:e2e`, `npm run test:visual` (about 20 minutes).
- Record the demo, finish the README, submit.

### Generation as built (Oct 25), and why

The fine-tuned GGUF (`VenuArvind/aegisplan-nemotron-nano-9b-gguf`, Q4_K_M) was tested with the exact fine-tuning prompts on test-split briefs.

- **Without a grammar, it does not follow the training format.** It writes `R1 TYPE EXAM ROOM`, chains doors room to room and leaves out the corridor, unlike every training target. Its own chat template also turns reasoning on, which uses up the token budget; `/no_think` fixes that.
- **With grammar-constrained decoding** (`aegisplan/fml_grammar.py`, GBNF in llama.cpp), every line is valid FML with the right types and ids. The **room program** is reliable (6 exam rooms, nurse station, utilities). The **geometry** is not: room sizes and positions don't fit the site, and the corridor sometimes runs 18.3 m wide.
- So the pipeline is **program-first**, which is the research brief's split:
  1. Nemotron (grammar-constrained) writes the room program.
  2. The program is merged with the brief: named rooms are kept and stated counts win.
  3. `aegisplan/program.py` lays the program out on a double-loaded corridor in 3 entrance variants.
  4. CP-SAT repairs and the validator ranks.
- Without a model, a brief parser supplies the program.
- Timing: about 47 s per request on an M4 Pro. Metal runs all layers (`AEGISPLAN_GPU_LAYERS=-1`, the default now), which is about 1.3× faster than CPU. The time is mostly the model writing room lines.
- The simulator separates the variants, averaged over 5 simulated days:

  | Scenario | West entrance | Centre entrance | East entrance |
  |---|---|---|---|
  | Flu-season Monday: average wait | 13.4 min | 11.5 min | 14.6 min |
  | Nurse walking per day (flu) | 2.0 km | 1.4 km | 1.4 km |

- Fixed on the way:
  - The egress check measured to the site corner instead of the exit door, which failed sound plans.
  - The fallback templates ignored the boundary.
  - Tests now never load the model (`AEGISPLAN_DISABLE_MODEL`).

## 5. Schedule

| Day | Clinic (must ship) | Datacenter (on top, never blocking) |
|---|---|---|
| Sun Oct 25 | ✅ Steps 0–3 · plan docs · real Nemotron + grammar + layout synthesizer | ✅ Datacenter design doc |
| Mon Oct 26 | Steps 2–3 | Domain-pack refactor (clinic unchanged); datacenter template generator |
| Tue Oct 27 | Step 4 · **freeze Step 5** | Rack placer; datacenter validator rules |
| Wed Oct 28 | Bug fixes only | Datacenter 3D models, overlays, failure-scenario simulation |
| Thu Oct 29 | Tests, README, benchmarks, recording | Datacenter polish; USD export only if ahead |
| Fri Oct 30 | **Submit before 10:00 am PDT** | — |

## 6. Demo storyline (draft)

1. **Clinic.** Type a brief. 3 candidates appear in about 10 s, ranked by the checks they pass. Show the validator's cited results.
2. Open the best candidate in 3D, walk it, then simulate a flu-season Monday.
   - Compare it with a 2-exam-room candidate: the wait gap is large.
3. Say "Make the waiting room 20% bigger, keep the restrooms." The solver repairs and a new version appears.
   - Then ask for something impossible. The conflicting rooms turn red, with the reason.
4. **Switch the domain to datacenter**, same pipeline. Type "2 MW AI hall, liquid-cooled racks, N+1 cooling".
   - The building program is generated, rack rows are placed, and kW and thermal overlays appear.
   - Take out one cooling unit: the affected rows turn red.
5. Export GLB/ZIP, and USD if it exists. Show the measured cost and latency per accepted plan.

## 7. Risks

| Risk | Mitigation |
|---|---|
| No GPU or weights at demo time | Heuristic fallback works; pre-generate candidates; OpenRouter as a backup if a key is available |
| Viz parity tests break from UI additions | Additive DOM only; log deviations; keep goldens frozen |
| `compare.ts` or swaps tied to the sample specs | Generated changes arrive as new plan.json versions (the documented route) |
| Datacenter scope creep | Datacenter only builds on top of the frozen clinic demo; each datacenter feature is optional |
| Overclaiming (constrained decoding, code compliance, CFD) | Say "grammar-documented, solver-enforced", "passed N implemented checks", "thermal proxy, not CFD" |

## 8. Commands

```bash
make setup      # aegis venv (Python 3.12) + viz npm install
make test       # aegis pytest + viz npm run check
make fixtures   # regenerate viz/tests/fixtures/aegis from AegisPlan
```

Aegis server: `cd aegis && .venv/bin/uvicorn aegisplan.server:app --port 8000`. Viewer: `cd viz && npm run dev`, on port 5173.
