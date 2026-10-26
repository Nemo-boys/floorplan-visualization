# Key numbers (safe to quote)

Every number here is measured or read from the code, with its source. Use these, not the table in `aegis/README.md`.

## Pipeline (clinic)

| Number | What | Source |
|---|---|---|
| **20 / 20** | Feasible briefs accepted (every applicable check passes), model off | `docs/BENCHMARK.md`, 2026-10-25, M4 Pro |
| **20 / 20** | Brief fidelity (every room type named, every stated count) | same |
| **0.04 s / 0.13 s** | p50 / max latency for 3 candidates, model off | same |
| **5 / 5** | Impossible requests answered with a conflict core instead of a plan | same |
| **~47 s** | Per request with Nemotron on (3 candidates), all layers on Metal | `handoff/FINDINGS.md` |
| **~1.3×** | Metal speed-up over CPU for the model | same |
| **9** | Implemented plan rules (geometry, ADA ×3, FGI ×2, IBC ×2, boundary) | `aegis/aegisplan/validator.py` |
| **100 mm** | CP-SAT grid | `cpsat_repair.py` |
| **3** | Candidate layouts per request (entrance variants) | `program.py` |
| **500** | Dataset plans converted and schema-checked by the adapter, all pass | `aegis/tests/test_export_viz.py` |

## Model

| Number | What |
|---|---|
| **9B** | Nemotron Nano v2 parameters (hybrid Mamba-2 + Transformer) |
| **r = 32, α = 64** | LoRA rank and alpha (QLoRA) |
| **400 / 50 / 500** | SFT train / validation plans, GRPO prompts |
| **4** | Verifiable rewards (format, overlap, connectivity, regulatory) |
| **5.5 GB** | GGUF Q4_K_M size (Q8_0 9.2 GB, BF16 18 GB) |
| **~5.8 GB** | Unified memory when running |

## Simulation (clinic)

| Number | What |
|---|---|
| **20** | Days per run by default (seeded, deterministic) |
| **4** | Roles simulated: patients, nurses, providers, receptionists |
| **11.5 vs 13.4 vs 14.6 min** | Average wait, flu-season Monday, centre / west / east entrance variants (5-day mean) |
| **1.4 vs 2.0 km** | Nurse walking per day, centre vs west entrance |
| **≤ 15 min / ≤ 40 min** | 90th-percentile wait thresholds for "Handles it" / "Busy, but it copes" |
| **4.9 min** | Average wait, Normal Tuesday, Layout A, 20 days (56 patients seen) |
| **162 min** | Average wait with only 1 provider (Layout B, Normal Tuesday): the bottleneck made visible |

## Data center

| Number | What | Source |
|---|---|---|
| **3** | Options per brief (liquid, hybrid, air) | `generateOptions` |
| **132 / 41 / 15 kW** | Rack power: GB200 NVL72-class / 4× HGX H200-class / L40S-class | `engine/catalog.ts` (Supermicro spec sheet for GB200) |
| **10** | Design checks with cited sources | `engine/checks.ts` |
| **6** | One-click what-ifs (cooler, power path, grid, heat wave 40 °C, 105% load, worst day) | `ui/test.ts` |
| **4** | Lenses: layout, power, heat, backup | `ui/lens.ts` |
| **~30 ms** | CP-SAT proof of the room layout, OPTIMAL on all 6 reference designs | `/api/dc/check` tests |
| **38 °C, −3%/°C** | Outdoor cooler rating and derate above it | `engine/status.ts` |
| **25 / 27 / 32 °C** | Calibrated warmest inlet / ASHRAE recommended / A1 allowable | `engine/thermal.ts` |
| **14** | Editable, sourced cost assumptions | `engine/cost.ts` |
| **~20** | Assistant tools | `dc/assistant/tools.ts` |

## Software

| Number | What |
|---|---|
| **152** | viz unit + golden tests passing |
| **58** | Aegis pytest tests passing |
| **~21,900** | Lines of TypeScript/CSS in `viz/src` |
| **~5,400** | Lines of Python in `aegis/aegisplan` |
| **2** | Domains on one pipeline (clinic, data center) |
| **$0** | API cost per plan when run locally |
