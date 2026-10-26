# Datacenter Generation and Visualization

The flexibility demo: **the same pipeline that designs a clinic designs an AI datacenter.** The pipeline is brief → Nemotron → FML → CP-SAT → validator → 3D → simulation → export. Only the domain pack changes.

Status: design. Implementation is Step 6 in [PLAN.md](../PLAN.md). It builds on the frozen clinic demo and never blocks it.

> **Numbers in this document are planning defaults, not verified engineering values.** Every limit the validator shows must be checked against its cited source before the demo and labelled "check" or "assumption" in the UI. This doesn't replace an engineer.

---

## 1. Two levels of generation

A datacenter is two problems at different scales. Each goes to the tool that suits it.

| Level | What gets laid out | Tool | Why |
|---|---|---|---|
| **1. Building program** | Data halls, electrical/UPS rooms, battery rooms, mechanical/chiller plant, MMR (meet-me room), NOC, loading dock, staging, storage, offices, corridors | **Nemotron, FML and CP-SAT**: the Aegis pipeline unchanged, with new room types | Intent and zoning, such as "MMR near the entry" or "battery separate from the hall", suit an LLM; CP-SAT makes the geometry exact |
| **2. White space** | Rack rows, hot/cold aisles, containment, cooling units (CRAH, or CDUs for liquid cooling), PDUs/RPPs, cable trays | **A deterministic placer** (procedural first, CP-SAT if time allows), with no LLM | This is packing under hard rules; an LLM adds risk and nothing else |

This matches the research brief's recommendation: the LLM interprets intent and the solver does the geometry.

## 2. Domain packs: one pipeline, many building types

Today clinic knowledge is hard-coded in the FML grammar, `fml_parser.py`, the size table in `cpsat_repair.py:85-133`, `validator.py`, and the viewer's `ClinicSim`, furniture and materials. Step 6 moves it into packs:

```
domains/
├─ clinic/
│   ├─ pack.yaml        room types, zones, size/aspect bounds, adjacency, door widths, prompt and few-shot
│   ├─ rules.py         validator rules (moved from validator.py, unchanged)
│   └─ viz.json         room type → viewer type, materials, window types
└─ datacenter/
    ├─ pack.yaml
    ├─ rules.py
    ├─ racks.py         white-space placer (level 2)
    ├─ templates.py     synthetic CP-SAT templates (few-shot examples and test cases)
    └─ viz.json
```

- **Aegis** builds the grammar's `room_type` alternatives, the system prompt, the CP-SAT bounds and the rule set from the selected pack.
- **The viewer** selects the equipment placer, materials, overlays and simulation module from `building_type`.
- **Acceptance test:** after the refactor, every clinic test still passes byte for byte (Aegis pytest and viz goldens).

## 3. Level 1: the building program

### Room types (datacenter pack)

| Type | Zone | Notes for CP-SAT and the validator |
|---|---|---|
| `data_hall` | white space | Large and rectangular, with aspect bounds so rack rows fit; usually several |
| `electrical_room` | grey space | Switchgear; working-clearance rules apply |
| `ups_room` | grey space | Next to the data hall (short feeders) |
| `battery_room` | grey space | Next to `ups_room`, separated from `data_hall` (fire and venting) |
| `mechanical_room` | grey space | Chillers, pumps and CDU plant; next to the hall |
| `mmr` | network | Meet-me room: carrier entry, near the building edge |
| `noc` | staff | Network operations centre |
| `loading_dock` | logistics | On the exterior wall, with an exterior door |
| `staging` | logistics | Between the dock and the halls; wide route for racks |
| `storage` | support | Spares |
| `office` | staff | |
| `corridor` | circulation | Wide enough for crated racks; door widths checked along the delivery route |

### FML: same syntax, new vocabulary

```
BOUNDARY RECT 0 0 60000 40000
ROOM loading_dock_1 TYPE loading_dock RECT 0 0 8000 10000 LOCKED
ROOM staging_1 TYPE staging RECT 8000 0 8000 10000 FREE
ROOM corridor_1 TYPE corridor RECT 0 10000 60000 4000 LOCKED
ROOM data_hall_1 TYPE data_hall RECT 0 14000 30000 26000 FREE
ROOM data_hall_2 TYPE data_hall RECT 30000 14000 30000 26000 FREE
ROOM ups_room_1 TYPE ups_room RECT 16000 0 10000 10000 FREE
...
DOOR door_1 CONNECT staging_1 corridor_1 AT 12000 10000 WIDTH 2400
FDOOR door_9 CONNECT loading_dock_1 OUTSIDE AT 4000 0 WIDTH 3000
END_PLAN
```

- The grammar change is limited to the `room_type` list, and possibly a wider `door_w` set for dock and hall doors.
- The parser, validator framework, repair and adapter keep working.

### Model strategy within the hackathon window

1. Add `domains/datacenter/templates.py`, cloned from `dataset_generator.py`: random briefs, then CP-SAT-solved valid programs.
   - Its output feeds the few-shot examples and the validator tests.
2. Use the existing fine-tuned Nemotron with datacenter few-shot examples and the pack's system prompt. **No retraining is planned.**
3. If the model fails, the router's heuristic fallback uses the datacenter templates.
4. Optional, only if a day is spare: a quick QLoRA run on Colab with the template dataset (the notebook already exists).

## 4. Level 2: the rack placer (white space)

Inputs, all from the pack or the brief:

| Parameter | Default (assumption, check before use) |
|---|---|
| Rack footprint | 600 mm W × 1200 mm D (per preset) |
| Cold aisle width | 1200 mm |
| Hot aisle width | 1200 mm (containment enclosed) |
| Perimeter and row-end clearance | 1200 mm |
| Rack power | Preset: 10–15 kW air-cooled enterprise; ~120 kW class liquid-cooled AI rack (GB200 NVL72-class, check against NVIDIA docs) |
| Cooling | Air: CRAH units on the hall perimeter. Liquid: CDUs per row group plus residual air cooling |
| Redundancy | N+1 cooling units, 2N or N+1 UPS (brief option) |
| Grouping | Rows grouped into scalable units (SuperPOD-style pods, per preset) |

Algorithm, procedural first:

1. Compute the usable rectangle: the hall minus perimeter clearance and cooling-unit bands.
2. Choose the row orientation along the long axis (try both and keep the one with more racks).
3. Repeat the pattern `[cold aisle][row facing cold][hot aisle][row facing hot]...` so that **row fronts always face a cold aisle**.
4. Fill each row with racks and leave row-end gaps for PDUs/RPPs.
5. Trim racks until total IT kW fits within power and cooling capacity under N+1, and report which limit stopped it.
6. Group rows into pods, and place CDUs (liquid) or CRAHs (air) to cover them.

Output: an `equipment[]` layer on the plan (see section 7). The placer is a pure function and gets golden tests.

## 5. Datacenter validator rules (first set)

Each rule reports measured value, required value, citation and status, like the clinic rules. Values are to be checked against the source before the demo.

| ID | Rule | Source to cite (check) |
|---|---|---|
| DC-AISLE-01 | Cold and hot aisles ≥ minimum width | ASHRAE TC 9.9 / operator standard |
| DC-ORIENT-02 | Every rack front faces a cold aisle (no hot/cold mixing) | ASHRAE TC 9.9 hot/cold aisle practice |
| DC-CLEAR-03 | Working space in front of electrical gear (PDU, RPP, switchgear) | NEC 110.26 |
| DC-COOL-04 | Cooling capacity ≥ IT load with one unit failed (N+1) | design basis (assumption, stated) |
| DC-POWER-05 | Row/PDU load ≤ rated capacity; UPS capacity ≥ IT load under the chosen redundancy | design basis (assumption, stated) |
| DC-FLOOR-06 | Rack weight per m² ≤ floor rating (heavy liquid-cooled racks) | structural assumption, stated |
| DC-ADJ-07 | UPS next to the hall; battery not next to the hall; MMR on the perimeter | TIA-942 space-planning guidance |
| DC-ROUTE-08 | Rack delivery: dock → staging → hall with every door and corridor ≥ crated rack size | logistics check (reuses viewer A*) |
| DC-FIRE-09 | Battery room separated; suppression zone per hall | NFPA 75 / 76 (screening only) |
| IBC-1017-* | Egress reachability and travel distance | reused from the clinic pack |

Wording in the UI: "Passed N of M implemented checks; electrical design, fire engineering and structural sign-off were not evaluated."

## 6. Viewer: 3D, overlays and simulation

### 3D (new models in `viz/src/view3d/`, selected by `building_type`)

- Racks: a box with front/back material, a door grille texture and an LED strip. One instanced mesh per rack type so hundreds stay fast.
- Containment: translucent panels over the hot aisle, plus a roof.
- CRAH/CDU units, PDU/RPP cabinets, overhead cable trays and busway.
- Materials: raised-floor tiles in the hall and sealed concrete in the grey spaces.
- Windows: none in the data hall; offices and NOC only.

### Overlays (reusing the existing heatmap pipeline)

- **kW per rack** (sequential colour scale).
- **Thermal proxy per aisle:** hot-aisle heat load against cooling capacity in reach (distance-weighted). Labelled "thermal proxy, not CFD".
- **Power path:** utility → switchgear → UPS → PDU → row, drawn as lines. Hover shows load and capacity.
- **Redundancy:** colour by whether each row survives a single cooling or UPS failure.

### Simulation (`DatacenterSim`, in place of `ClinicSim` for this domain)

The clinic simulation stays untouched; the datacenter simulation is a separate module with its own panel content.

1. **Failure scenarios:** fail one CRAH/CDU or one UPS module. Rows lose margin, over-limit rows turn red, and the remaining headroom is shown.
2. **Capacity ramp:** fill racks month by month and report when power, cooling or space runs out first, with the date.
3. **Move-in:** animate a crated rack from the dock to its slot on the existing A* grid, and flag any door it doesn't fit through.
4. **PUE estimate:** from cooling type and stated assumptions (shown next to the number).
5. **Technician walk:** NOC → hall → rack, for walking time in the operations view.

### Export

- GLB/ZIP as today; the equipment layer becomes named nodes.
- **Stretch:** convert the GLB to OpenUSD (`usd-core`) so the hall opens in NVIDIA Omniverse as a digital-twin starting point.

## 7. Contract extension: plan.json v0.2 (additive)

v0.1 stays valid. v0.2 adds optional fields:

```jsonc
{
  "schema_version": "0.2",
  "building_type": "datacenter",
  "domain_pack": "datacenter@1",
  "rooms": [ /* same as v0.1, new type values for the datacenter pack */ ],
  "doors": [ /* same */ ],
  "equipment": [
    { "id": "rack_h1_r03_07", "kind": "rack", "room": "data_hall_1",
      "rect": { "x_mm": 3600, "y_mm": 8400, "w_mm": 600, "h_mm": 1200 },
      "facing": { "x": 0, "y": 1 }, "row": "h1_r03", "pod": "h1_p1",
      "power_kw": 120, "cooling": "liquid", "weight_kg": 1400 },
    { "id": "cdu_h1_01", "kind": "cdu", "room": "data_hall_1", "rect": { }, "capacity_kw": 1200 },
    { "id": "pdu_h1_r03", "kind": "pdu", "room": "data_hall_1", "rect": { }, "capacity_kw": 1500 }
  ],
  "systems": {
    "power": { "redundancy": "2N", "ups_capacity_kw": 2400 },
    "cooling": { "type": "liquid", "redundancy": "N+1" }
  }
}
```

Note: the `power_kw`, `weight_kg` and capacity values above are placeholders showing the shape, not design values.

- The viewer's `adaptPlan` keeps reading rooms and doors as before.
- The `equipment[]` layer and `systems` go to the datacenter modules.
- The clinic plans and goldens are unaffected.

## 8. Build order and cut lines

| # | Piece | Cut if late? |
|---|---|---|
| 1 | Domain-pack refactor with clinic tests unchanged | **No**: this is the flexibility proof |
| 2 | Datacenter pack: types, bounds, adjacency, prompt; templates for few-shot | No |
| 3 | Rack placer (procedural) + `equipment[]` + golden tests | No |
| 4 | Datacenter rules DC-AISLE, DC-ORIENT, DC-COOL, DC-POWER, DC-ADJ | Keep at least 3 |
| 5 | Viewer: rack/CDU/containment models (instanced), kW overlay | No |
| 6 | Failure scenario (N+1) | Keep: the strongest datacenter moment |
| 7 | Thermal proxy, power path, move-in animation, capacity ramp | Yes, in this order |
| 8 | USD export for Omniverse | Yes |

## 9. Demo beat (about 60 s)

1. In the same UI, switch the domain to Datacenter.
2. Type the brief: "2 MW AI training hall, liquid-cooled racks, N+1 cooling, 2N UPS".
3. The building program appears: dock, staging, two halls, UPS, battery and MMR, with checks passed.
4. Rack rows fill the halls. Containment and CDUs appear, and the kW overlay glows.
5. Fail CDU 2: two rows turn red ("N+1 lost on rows h1_r05–r06"). Undo.
6. Walk the hot aisle in first-person view. Export.
7. Closing line: "Same model, same solver, same viewer. A new domain is a config pack, not a new product."
