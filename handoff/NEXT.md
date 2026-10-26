# Next: Step 6, datacenter

Design: [DATACENTER.md](DATACENTER.md). Rule: the clinic must behave exactly as it does now. Run `make test` after each task.

## 6a. Domain packs (clinic stays identical)
Move the clinic-only tables behind a `domain` key (default `"clinic"`). They currently live in:
- `aegis/aegisplan/fml_grammar.py:11`: `CLINIC_ROOM_TYPES`;
- `aegis/aegisplan/program.py`: `ROOM_SPECS` (row, preferred, min width, door width), `_BRIEF_PATTERNS`, `MOVABLE`, defaults in `program_from_brief`;
- `aegis/aegisplan/router.py:27`: `SYSTEM_PROMPT` (healthcare wording), `_format_prompt` ("outpatient clinic");
- `aegis/aegisplan/export_viz.py`: `ROOM_TYPE_MAP`, `CHECK_LABELS`;
- `aegis/aegisplan/validator.py`: clinic rules (ADA/FGI); the datacenter gets its own rule set;
- viewer: clinic room types in `viz/src/engine/{plan,furniture,walls,scenario,analysis,tour}.ts` and `viz/src/ui/{review,import}.ts`. The viewer should switch on `building_type` in plan.json.

Suggested layout: `aegis/aegisplan/domains/{clinic,datacenter}.py`, each with room types, specs, brief patterns, prompt and rules. `/api/pipeline` takes `domain`.

## 6b. Datacenter generation
- **Level 1, the building program:**
  - The fine-tuned model knows only clinics, so for the datacenter the program comes from the brief parser (as in the model-off path), optionally with a base-model prompt.
  - Rooms: `data_hall`, `ups_room`, `battery_room`, `mmr`, … (DATACENTER.md §3).
  - Reuse `layout_program` with the datacenter specs, then CP-SAT.
- **Level 2, the rack placer:**
  - A deterministic placer fills each `data_hall` with hot/cold-aisle rows (DATACENTER.md §4).
  - Output goes in plan.json v0.2's `equipment[]` (§7, additive).
- Rules DC-AISLE-01 … DC-FIRE-09 (§5).

## 6c. Viewer
- Rack and CRAH/CDU models in `viz/src/view3d/`, with kW and thermal overlays reusing the heatmap.
- `DatacenterSim`: take out a cooling unit, and the affected rows turn red.
- The import form needs a domain switch and a datacenter default brief ("2 MW AI hall, liquid-cooled racks, N+1 cooling").
- Log each visible change in `viz/docs/deviations.md`.

## Cut lines (DATACENTER.md §8)
Ship in order and stop when time runs out. The clinic demo is frozen at `v0.1-clinic` and must never break.

## Later (Thu Oct 29)
- `make bench` full run with the model; paste the numbers into the demo.
- Full viz suite (`npm run check`, `test:e2e`, `test:visual`), record the demo, finish the README, submit before Fri 10:00 am PDT.
