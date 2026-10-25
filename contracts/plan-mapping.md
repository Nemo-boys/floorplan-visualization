# AegisPlan PlanDocument → viewer plan.json v0.1

Implemented in [`aegis/aegisplan/export_viz.py`](../aegis/aegisplan/export_viz.py). That file is the source of truth; this page explains it.

| | AegisPlan (`aegis/aegisplan/schemas.py`) | Viewer ([`viz/contracts/plan.v0.1.schema.json`](../viz/contracts/plan.v0.1.schema.json)) |
|---|---|---|
| Units | mm | mm |
| Origin | top-left, x east, **y down** | bottom-left, x east, **y north** |
| Footprint | `boundary.polygon` | `footprint {width_mm, depth_mm}` |
| Room geometry | `bbox {x, y, w, h}` | `rect {x_mm, y_mm, w_mm, h_mm}` with `y_mm = D − (y + h)` |
| Door position | `position [x, y]` | `center_mm [x, D − y]` |
| Exterior | `"OUTSIDE"` | `"exterior"` and `is_entrance: true` |
| Walls | `walls[]` (interior only) | not sent; the viewer derives walls and windows from rooms |
| Checks | `validation.checks[] {rule_id, status, measured, required, citation}` | `checks[] {rule, pass, detail, source}` plus `label` and `status` (`pass` is false only for FAIL) |
| Locks, solver | `rooms[].locked`, `metadata.solver_status` | `provenance.locked_rooms`, `provenance.solver_status` |
| Conflict core | `validation.conflict_core` | `provenance.conflict_core` |
| Room ids | kept as they are, so viewer edits map back to Aegis | |

## Room types

| AegisPlan | Viewer |
|---|---|
| `waiting`, `reception`, `corridor`, `restroom` | same |
| `exam` | `exam_room` |
| `consult` | `provider_office` |
| `procedure` | `procedure_room` |
| `clean_util` / `soiled_util` | `clean_utility` / `soiled_utility` |
| `staff_break` | `staff_lounge` |
| `bathroom` | `restroom` |
| `nurse_station`, `lab`, `storage` | same (Step 2 adds them to the Aegis grammar) |
| anything else (`bedroom`, `kitchen`, `living`, …) | `storage` with the original name as `label`, listed in `provenance.unmapped_room_types` |

## Tests

- `aegis/tests/test_export_viz.py`: every plan in `aegis/dataset/{train,val,test}.jsonl` validates against the viewer schema, and every door stays on the edges of the rooms it connects after the y flip.
- `viz/tests/unit/aegis-fixtures.test.ts`: the fixtures in `viz/tests/fixtures/aegis/` load with their own doors, reach every room, pass the viewer checks and run a simulated day.
