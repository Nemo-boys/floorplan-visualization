# AegisPlan: how plans are generated (highly technical)

AegisPlan is the generation engine: a **neuro-symbolic cascade** where a fine-tuned language model handles intent and a constraint solver handles geometry, with a rule checker in between.

## 1. The model: NVIDIA Nemotron Nano 9B v2, fine-tuned

- **Base:** `nvidia/NVIDIA-Nemotron-Nano-9B-v2`, a hybrid **Mamba-2 state-space + Transformer attention** architecture (`nemotron_h`): long-context efficiency of SSM layers with attention where it matters.
- **Stage 1, SFT:** supervised fine-tuning with **QLoRA** (LoRA rank r = 32, alpha = 64, learning rate 2e-4) on certified outpatient layouts written in FML. Dataset: **400 train / 50 validation** plans, synthesized and solver-certified (`dataset_generator.py`).
- **Stage 2, GRPO / RLVR** (reinforcement learning with verifiable rewards) on **500 clinical prompts**. Rewards are computed from the generated plan, not from a preference model:
  - `r_format`: valid `<fml>…</fml>` matching the grammar;
  - `r_overlap = max(0, 1 − 8 · overlap_area / total_area)` (Shapely polygon intersection);
  - `r_connectivity`: share of rooms reachable from OUTSIDE through the door graph;
  - `r_regulatory`: corridor ≥ 1830 mm, accessible restroom ≥ 4.84 m² with a side ≥ 2200 mm, exam room ≥ 11.15 m².
- **Published:** merged BF16 SafeTensors (18 GB) and GGUF Q8_0 (9.2 GB) / **Q4_K_M (5.5 GB)** on Hugging Face (`VenuArvind/aegisplan-nemotron-nano-9b`, `…-gguf`).
- **Local inference:** `llama-cpp-python`, all layers on Apple Silicon **Metal** (`n_gpu_layers = -1`), about 5.8 GB of unified memory. Reasoning is switched off with `/no_think` in the system prompt, because Nemotron's chat template otherwise spends the token budget thinking.

## 2. What we learned, and why generation is "program-first"

We tested the fine-tuned GGUF with byte-identical fine-tuning prompts on held-out briefs:

| Setting | Result |
|---|---|
| No grammar | Ignores its training format (`R1 TYPE EXAM ROOM`), chains doors room to room, drops the corridor |
| **GBNF grammar-constrained decoding** (`fml_grammar.py`, enforced inside llama.cpp) | **Every line is valid FML** with correct types and ids. The **room program** (which rooms, how many) is reliable. The **coordinates** are not: rooms don't fit the site, a 1830 mm corridor can come out as 18,300 mm when the 100 mm grid is forced |

So the model is used for what it is reliable at:

1. **Nemotron writes the room program** under a "program" grammar schema (types and counts, no coordinates).
2. **`merge_programs`** merges it with the brief: every room type the brief names is present, and counts the brief states win.
3. **`program.py` lays the program out** on a double-loaded corridor in **3 entrance variants** (west, centre, east). Room widths are capped to keep aspect ratios ≤ 2.5:1 and spare width goes to rooms with the most slack (otherwise CP-SAT becomes infeasible).
4. **CP-SAT repairs** each variant; **the validator ranks** them.

Without a model (no weights, CI, a demo machine without a GPU) a deterministic brief parser supplies the program, and everything downstream is identical. That is also the "model off" row of the benchmark.

## 3. The solver: OR-Tools CP-SAT

`cpsat_repair.py`, on a **100 mm integer grid**:

- **Variables:** x, y, w, h per room as integers, with per-type size and aspect bounds from a size table (exam ≥ 11.15 m² and side ≥ 3048 mm, corridor ≥ 1830 mm wide, etc.).
- **`AddNoOverlap2D`** over interval variables: no two rooms intersect (0 mm² overlap by construction).
- **Containment** in the boundary; **locked rooms** fixed by equality constraints.
- **Flush wall sharing:** a 4-way boolean disjunction per adjacent pair (left/right/above/below) so rooms that share a door actually touch.
- **Objective:** minimise the L1 movement from the drafted layout, so the solver changes as little as possible.
- **Infeasibility:** each requirement gets an assumption literal (`AddAssumptions`); on INFEASIBLE, CP-SAT returns a **minimal unsatisfiable core**: the exact rooms and constraints that cannot all hold. The UI paints those rooms red and shows the arithmetic ("Waiting Area 1 would be 35 m wide, and the building is 24 m wide").

## 4. The rule checker

`validator.py` runs 9 machine-checkable rules. Each reports measured value, required value, status and citation:

| Rule | Requirement | Method |
|---|---|---|
| GEOM-BOUNDARY-01 | Every room inside the footprint | Containment |
| GEOM-OVERLAP-02 | 0 mm² overlap between rooms | Interval disjointness |
| ADA 404.2.3 | Door clear width ≥ 915 mm (clinical), ≥ 815 mm (general) | Opening widths |
| ADA 403.5.1 | Corridor ≥ 1830 mm | Axis-aligned width |
| ADA 304.3 | 1525 mm wheelchair turning circle | Inscribed circle |
| FGI 2.1-2.2 | Exam room ≥ 11.15 m², min side ≥ 3048 mm | Area and dimension |
| FGI 2.1-3 | Clean and soiled utility never connect directly | Adjacency graph |
| IBC 1017 reach | Every room reachable from the exit | BFS on the door graph |
| IBC 1017.2 distance | Exit travel ≤ 45,720 mm (150 ft) | Shortest path through doors |

Bug fixed during integration: the egress check measured distance to the site corner instead of through the doors to the exit, which failed sound plans.

## 5. Plain-language edits

`edits.py` reads requests like *"Make the waiting room 20% bigger, keep the restrooms fixed"*:

- it identifies the target room(s) and the change (scale by %, set size), and which rooms to lock;
- it holds the edited room at its new size while CP-SAT repairs everything else with minimal movement;
- the result comes back to the viewer as a **new version** (version history, undo);
- an impossible edit returns the blocking rooms and the reason instead of a plan (the "impossible request" demo moment).

## 6. Adapter to the viewer

`export_viz.py` converts a `PlanDocument` into plan.json v0.1: flips y, maps room types, turns OUTSIDE doors into an exterior entrance, keeps ids, and writes the validator results into `checks[]` and the solver status, locks and conflict core into `provenance`. Tested on all 500 dataset plans: every plan passes the schema, every door stays on its rooms' shared edge after the flip.

## 7. Data center reuse

- `/api/dc/brief`: Nemotron reads a data center brief ("enough for 6,000 GB200s, Tier III, Texas power prices") into strict JSON (IT kW, cooling, redundancy, electricity price, years). The browser merges it **under** what the brief states explicitly: numbers the person typed always win.
- `/api/dc/check`: CP-SAT proves the generated building layout: **NoOverlap2D** across all rooms, and door-adjacency booleans (every door joins two rooms that touch). It first proves the layout as drawn is valid, then minimises the building length to show no shorter building fits. All six generated designs (20 MW and 2 MW × three cooling types) prove valid and OPTIMAL in about 30 ms.
