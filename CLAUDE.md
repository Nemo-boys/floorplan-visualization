# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Floorplan Intelligence, built for the Nebius × NVIDIA Global AI Hackathon 2026. **Submissions close Fri Oct 30, 2026, 10:00 am PDT.** A brief goes in, and the system returns validated floor plans that you can review, simulate and export in 3D. It covers two domains: an outpatient clinic and a data center.

- **PLAN.md is the source of truth** for scope and status. Update it as work lands.
- `handoff/` has the work log, findings and traps. Read `handoff/FINDINGS.md` before you claim tests pass or quote benchmark numbers.
- Note that `handoff/NEXT.md` and PLAN Step 6 describe a "domain packs" refactor. That refactor was **not** built. Data Center Studio was built as a separate app instead (see below). Check `git log` for the current state.

## Commands

The repo root is the integration repo. `aegis/` and `viz/` came in with `git subtree`.

```bash
make setup            # aegis/.venv (Python 3.12 via uv; ortools has no 3.14 wheels) + viz npm install
make dev              # builds viz, then serves viewer + API on http://127.0.0.1:8000 (/datacenter for the DC studio)
make test             # aegis pytest + viz `npm run check`
make fixtures         # regenerate viz/tests/fixtures/aegis from AegisPlan
make bench ARGS=--no-model   # measured benchmark -> docs/BENCHMARK.md (no ARGS = ~30 min with the model)
```

Single tests:

```bash
cd aegis && .venv/bin/python -m pytest tests/test_program.py::test_name -q
cd viz && npx vitest run tests/unit/dc-engine.test.ts -t "name"
cd viz && npx playwright test tests/e2e/review.spec.ts   # needs `npx playwright install chromium` once
```

Viz scripts: `npm run dev` (Vite on :5173, proxies `/api` to :8000; `FI_OFFLINE=1` turns the proxy off), `npm run build`, `npm run check` (typecheck + lint + Vitest), `npm run test:e2e`, `npm run test:visual`, `npm run golden:check`.

Optional chat model for the assistants: set `NVIDIA_API_KEY`, `AEGIS_CHAT_URL` (+`AEGIS_CHAT_KEY`, `AEGIS_CHAT_MODEL`) or `OPENROUTER_API_KEY` when you run `make dev`. See the docstring in `aegis/aegisplan/chat.py`. Web search for the assistants needs `TAVILY_API_KEY`. `server.py` loads it from the gitignored `aegis/.env`, which holds the key on this machine. Never commit it.

## Architecture

**One process, one port.** FastAPI (`aegis/aegisplan/server.py`) serves `/api/*` and mounts the built `viz/dist` at `/`. `/datacenter` serves the second Vite page. The old Aegis UI lives at `/aegis`. Both front ends still work as static sites when the API is unreachable.

### aegis/ (Python): generation, validation, repair

The clinic pipeline is **program-first**. The fine-tuned model is only reliable at writing the room *program*, not the geometry; FINDINGS explains why.

1. `router.py` drafts with Nemotron Nano 9B (local GGUF via `gguf_engine.py`, constrained by the GBNF in `fml_grammar.py`, with `/no_think`). With no model, a brief parser supplies the program. Everything works without weights.
2. `program.py` merges the program with the brief (the brief's counts win) and lays it out on a double-loaded corridor in 3 entrance variants.
3. `cpsat_repair.py` (OR-Tools CP-SAT) makes the geometry valid. When a plan is infeasible, it returns a conflict core.
4. `validator.py` runs 9 cited rule checks (ADA, FGI, IBC) that rank the candidates.
5. `export_viz.py` is the **only** mapping to the viewer's plan.json v0.1 (spec: `contracts/plan-mapping.md`). It flips y (Aegis uses a top-left origin, the viewer a bottom-left one), keeps room ids, and writes checks and provenance.

Key routes: `/api/pipeline` (generate 3, validate, repair, convert), `/api/edit_text` (plain-language edits from `edits.py`, then re-solve), `/api/validate`, `/api/repair`. Data center routes are in `datacenter.py` (`/api/dc/brief`: Nemotron reads the brief; `/api/dc/check`: CP-SAT proves the room layout). The chat proxy lives in `chat.py`.

Tests set `AEGISPLAN_DISABLE_MODEL=1` (`tests/conftest.py`), so they never load the model. The model file is `aegis/checkpoints/nemotron_aegisplan_q4_k_m.gguf`. It's gitignored; fetch it with `scripts/download_from_hf.py`.

### viz/ (TypeScript, Vite, plain DOM, three.js 0.186.1 WebGPU/WebGL2): two pages

- **Clinic viewer** (`index.html`, `src/main.ts`). It's a strict port of `design/reference.html`, with these parts: `src/engine/` (pure; no DOM or three; holds the plan adapter, pathfinding, the deterministic `ClinicSim`, checks), `src/view3d/`, `src/plan2d/`, `src/export/` (GLB, ZIP, Blender), `src/ui/` (stepper steps). Integration additions: `src/ui/pipeline.ts` (brief form, shown only when `/api/health` answers), `src/ui/conflicts.ts`, and `pipelineChecks` in `src/engine/checks.ts`.
- **Data Center Studio** (`datacenter.html`, `src/dc/`). A self-contained Describe → Design → Test → Cost app that generates designs in the browser (`src/dc/engine/`: brief, hall/rack placement, thermal, checks, cost), with USD export (`src/dc/export/usd.ts`). It calls the server only to improve results (`src/dc/aegis.ts`).
- `src/assistant/` is the shared assistant panel. The browser runs the agent loop and the tools, and the server only proxies the model. The same goes for `web_search` (`src/assistant/websearch.ts`), which calls `/api/search` (`aegisplan/search.py`, Tavily). It's added through `panel.addTools` only when `/api/search/health` reports a key.

## Ground rules

- `viz/CLAUDE.md` is the original port's rulebook. It still guards the clinic viewer. In this repo its "no backend" rule is relaxed only for additive integration UI and calls to our own FastAPI.
- **Golden sim numbers for samples A/B/C stay frozen.** Don't edit `viz/design/`, `viz/reference-src/`, `viz/contracts/`, `viz/samples/` or `viz/tests/golden/`. `npm run check` must pass.
- Log every visible change to the clinic viewer in `viz/docs/deviations.md`.
- The clinic demo (tag `v0.1-clinic`) must never break. Datacenter work never blocks it.
- Known e2e failures that aren't regressions: `export.spec.ts:241`, `simulate.spec.ts:95` and `:264`, plus flaky `shell.spec.ts:52`. Playwright runs Vite with `FI_OFFLINE=1`, so the pipeline card is absent in e2e.
- Never present `aegis/benchmark_report.md` or `aegisplan/benchmark.py` output as measured, because their numbers are hardcoded. Use `docs/BENCHMARK.md` instead.
- Make small, topical commits (`feat(adapter): …`) and push to `main` on github.com/Nemo-boys/floorplan-visualization.
- The user tests in their own Chrome. Give them a URL and click-by-click steps, and keep replies short.
