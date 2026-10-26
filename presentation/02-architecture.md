# Architecture

## The pipeline

```
 Brief (plain language) + site size + locked rooms
          │
          ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ 1. DRAFT  Nemotron Nano 9B v2 (QLoRA + GRPO fine-tune)         │
 │    llama.cpp, GGUF Q4_K_M, Metal; GBNF grammar-constrained      │
 │    Output: the ROOM PROGRAM in FML (which rooms, how many)      │
 │    Fallback with no model: a deterministic brief parser         │
 └────────────────────────────────────────────────────────────────┘
          │  merge_programs: rooms the brief names are kept, stated counts win
          ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ 2. LAY OUT  program.py: double-loaded corridor, 3 entrance      │
 │    variants (west / centre / east)                              │
 └────────────────────────────────────────────────────────────────┘
          ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ 3. REPAIR  OR-Tools CP-SAT on a 100 mm grid                     │
 │    AddNoOverlap2D, locked rooms fixed, flush wall sharing,      │
 │    objective = minimal L1 movement; INFEASIBLE → conflict core  │
 └────────────────────────────────────────────────────────────────┘
          ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ 4. CHECK  validator.py: 9 rules (geometry, ADA, FGI, IBC),      │
 │    each with measured value, required value and citation;       │
 │    candidates ranked by checks passed                           │
 └────────────────────────────────────────────────────────────────┘
          ▼  export_viz.py → plan.json v0.1 (y flipped, ids kept, checks + provenance)
 ┌────────────────────────────────────────────────────────────────┐
 │ 5. VIEW, SIMULATE, EXPORT  (browser, TypeScript, three.js)      │
 │    3D review, walkthrough, discrete-event clinic simulation,    │
 │    layout comparison, plain-language edits, GLB/ZIP/Blender     │
 └────────────────────────────────────────────────────────────────┘
```

Data Center Studio uses the same layers with a different domain: a brief reader (deterministic, plus Nemotron through `/api/dc/brief`), a deterministic hall and equipment generator, CP-SAT proving the room layout (`/api/dc/check`), a capacity and failure model, a cost model, the same 3D engine family and the same assistant.

## Runtime topology

```
Browser ── http://127.0.0.1:8000 ──► FastAPI (aegisplan.server)
  │  /               the built viewer (viz/dist): clinic app
  │  /datacenter     Data Center Studio
  │  /api/pipeline   brief → 3 checked candidate plans
  │  /api/edit_text  plain-language edit → repaired new version
  │  /api/generate /validate /repair /edit /sample /health
  │  /api/chat       streams the assistant's model (SSE, OpenAI format, tool calls)
  │  /api/chat/health
  │  /api/dc/brief   Nemotron reads a data center brief into JSON
  │  /api/dc/check   CP-SAT proves a data center room layout
  │  /api/dc/health
  ▼
Local model (llama.cpp GGUF on Metal) — or any OpenAI-compatible endpoint
(NVIDIA API catalog, a vLLM / NIM / llama.cpp server, OpenRouter)
```

- **One process, one port, no CORS.** `make dev` builds the viewer and serves it with the API.
- **Graceful degradation.** Without the server, both apps still run as static sites: the clinic uses bundled sample plans, Data Center Studio reads briefs and generates designs in the browser, and the assistant answers from its built-in mode.
- **Keys stay on the server.** The browser never sees an API key; `/api/chat` proxies and streams.

## Contracts

- **FML-DSL** (Floorplan Markup Language): a compact, line-based plan language on a 100 mm grid.
  `BOUNDARY RECT 0 0 W H`, `ROOM id TYPE type RECT x y w h LOCKED|FREE`, `DOOR id CONNECT a b AT x y WIDTH w`, `FDOOR … OUTSIDE`, `END_PLAN`. Short, so the model writes fewer tokens; regular, so a grammar can constrain it.
- **plan.json v0.1**: the viewer's input. Rooms (rect or polygon, mm), doors (centre, width), optional checks and provenance (generator, solver status, locks, conflict core). Pydantic schema on the Python side; all 500 dataset plans pass it after conversion.
- **Coordinate frames:** AegisPlan is top-left, y down; the viewer is bottom-left, y north. The adapter flips y (`y' = D − (y + h)` for rooms, `D − y` for doors) and keeps room ids, so edits in the viewer map back to AegisPlan.
- **fi.scenario.v1**: a clinic day as typed blocks (hours, run settings, shifts, appointments, walk-ins, visit types, visit steps, breaks, staff out, closed rooms, group arrivals, rules). Importable and exportable as JSON.
- **Data center export:** OpenUSD `.usda` (one PointInstancer per equipment kind, every id and number as custom attributes) and a lossless JSON (`datacenter-studio/v1`).

## Repository map

```
floorplan-visualization/
├─ aegis/            AegisPlan (Python 3.12): generation, validation, repair, FastAPI, chat proxy, data center endpoints
│  ├─ aegisplan/     server.py, router.py, gguf_engine.py, fml_grammar.py, fml_parser.py, program.py,
│  │                 cpsat_repair.py, validator.py, edits.py, export_viz.py, chat.py, datacenter.py, train_qlora.py
│  ├─ dataset/       400 train / 50 val plans, 500 GRPO prompts
│  ├─ grammars/      fml_dsl.ebnf
│  └─ notebooks/     fine-tuning and GGUF export notebook
├─ viz/              the browser apps (TypeScript, Vite, three.js)
│  ├─ src/engine/    clinic engine: plan adapter, furniture, grid, walls, A* paths, analysis, simulator, scenarios, checks, tour, edits
│  ├─ src/view3d/    clinic 3D: scene, materials, furniture, people, cameras (orbit, walk, follow, tour)
│  ├─ src/ui/        clinic UI, plus src/ui/studio/ (new look, quick setup, assistant tools)
│  ├─ src/dc/        Data Center Studio: engine/, view3d/, ui/, assistant/, export/
│  ├─ src/assistant/ the shared chat panel, agent loop, providers
│  └─ tests/         unit, golden, e2e, visual
├─ contracts/        plan-mapping.md
├─ docs/             DEMO.md, BENCHMARK.md
└─ handoff/          plan, findings, data center design
```

Size (approx.): ~21,900 lines of TypeScript and CSS in `viz/src`, ~5,400 lines of Python in `aegis/aegisplan`.
