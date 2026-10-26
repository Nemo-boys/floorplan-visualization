# Work log (Oct 25, 2026)

Newest last. Commit hashes are on `main`.

## Step 0: Repo and baseline
- New repo; `aegis/` and `viz/` imported with `git subtree`, so their histories are kept (`3501a72`, `047f11f`).
- Root `Makefile` (`setup`, `test`, `fixtures`), `README.md`, `PLAN.md`, `handoff/DATACENTER.md`, `contracts/plan-mapping.md` (`245ac5c`).
- Python 3.12 venv. Python 3.14 has no OR-Tools wheels.

## Step 1: The adapter
- `aegis/aegisplan/export_viz.py`: AegisPlan plan → viewer `plan.json` v0.1 (`5de6f6e`):
  - flips y (Aegis is top-left, y down; the viewer is bottom-left, y north): rooms `y' = D − (y + h)`, doors `y' = D − y`;
  - maps room types (`exam`→`exam_room`, `consult`→`provider_office`, …), and unknown types become `storage` with the label kept;
  - `OUTSIDE` doors become `exterior` + `is_entrance`;
  - the 9 validator checks come through with labels and code sources;
  - `provenance` records the generator, solver status, locked rooms, unmapped types and conflict core;
  - has a CLI.
- All 500 dataset plans pass the viewer schema (`aegis/tests/test_export_viz.py`). Viewer tests load, path-find and simulate them (`viz/tests/unit/aegis-fixtures.test.ts`, `f837b79`). Fixtures come from `make fixtures`.

## Step 2: Grammar gaps
- Added room types `nurse_station`, `lab` and `storage` (`c697cb2`), and ids with several words.
- The fallback templates now fit the requested boundary (`4ed629f`).

## Step 3: Live pipeline
- `/api/pipeline` returns ranked candidates already converted for the viewer (`858568d`).
- FastAPI serves `viz/dist` at `/`; the old Aegis UI moved to `/aegis`.
- Viewer: `viz/src/ui/pipeline.ts` adds a brief form and candidate list to the Import step's pipeline card, only when `/api/health` answers (`0ee87f6`, deviation 6).
- The egress check now measures to the exit door instead of the site corner (`9bffa8a`).
- GBNF grammar for constrained decoding: `aegisplan/fml_grammar.py` (`cc1c8a9`).
- Program-first generation: `aegisplan/program.py` plus `router._draft_program` (`17aab38`). See FINDINGS for why.

## Step 4: Close the loop
- `aegisplan/edits.py` + `/api/edit_text`: plain-language edits ("Make the waiting room 20% bigger, keep the restrooms fixed") (`092766b`).
  - Resized rooms are held at their new size while CP-SAT moves the rest.
  - An impossible edit returns the conflicting rooms and the arithmetic.
- Viewer (`32888a6`, deviation 7):
  - Compare (Simulate → Run 20 days → "Compare layouts with this scenario") uses the other generated candidates.
  - Review → Edit → "Ask the plan generator" sends edits; the result becomes a new version.
  - Rooms in a conflict turn red (`viz/src/ui/conflicts.ts`).

## Step 5: Demo freeze (light)
- `make dev`, `make bench`, `docs/DEMO.md` (3-min script), `docs/BENCHMARK.md` (model-off rows only), tag `v0.1-clinic` (`adafa4b`).
