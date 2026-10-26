# Data Center Studio

**Describe a data center in a sentence; design, test and price it in your browser.** The second domain, built to prove the pipeline is general. Four steps: **Describe → Design → Test → Cost.** Page: `/datacenter`.

## 1. Describe

- One text box: *"20 MW AI factory, liquid cooled, N+1 cooling, 2N power, 9¢/kWh, 5 years"*. Example chips; dials for anything the sentence didn't say.
- **Brief reader** (`engine/brief.ts`, deterministic): MW / kW / GPU counts (GPUs are converted with GB200 NVL72-class racks: 72 GPUs, 132 kW), cooling type (liquid / hybrid / air, also inferred from GB200, NVL72, Blackwell, H200, L40S), cooling and power redundancy (N, N+1, 2N; "Tier IV" → 2N/2N), electricity price (¢ or $ per kWh), years. It records which fields the sentence stated.
- **Nemotron reading** (when the server runs): `/api/dc/brief` fills what the sentence implies but doesn't state ("enough for 6,000 GB200s", "Tier III"). **Numbers the person typed always win**; what the model added is tagged in the UI as read by the model.

## 2. Design: three options, every part placed

`generateOptions(basis)` returns three designs, one per cooling type, so people compare real alternatives:

| Option | Rack class | Rack power |
|---|---|---|
| Liquid | GB200 NVL72-class AI rack | 132 kW |
| Hybrid | 4× HGX H200-class servers with rear-door coolers | 41 kW |
| Air | Air-cooled inference servers (L40S-class) | 15 kW |

**Building generator** (`engine/design.ts`), deterministic, on a 100 mm grid, south to north:
generator yard → support row (loading dock, staging, storage, NOC, office, meet-me room) → corridor → power row (electrical, UPS, battery, mechanical rooms, a link) → corridor → **data halls** → cooling yard. Rack delivery route: dock → staging → corridor → link → corridor → hall.

**Hall filler** (`engine/hall.ts`): sizes halls to the rack count (per-hall rack and kW limits), rows with **fronts always facing a cold aisle**, hot-aisle containment, cooling units sized with `unitsFor(load, unitKw, redundancy)` (N, N+1, 2N), power paths A and B, PDUs per row, UPS, batteries, switchgear, transformers, generators and outdoor dry coolers. Generators and heat rejection are sized for the peak facility load per kW of IT (1.2 liquid, 1.3 hybrid, 1.45 air).

**Ten design checks** (`engine/checks.ts`), each with a cited source and "screening only" where it applies:

| ID | Check | Source |
|---|---|---|
| DC-ORIENT-01 | Rack fronts face cold aisles | ASHRAE TC 9.9 |
| DC-AISLE-02 | Aisle widths | ASHRAE TC 9.9 / operator standard (assumption) |
| DC-COOL-03 | Survives losing any one cooler | Design basis |
| DC-POWER-04 | Survives losing any one power unit | Design basis; Uptime Tier concepts |
| DC-GEN-05 | Generators carry the peak load | Design basis (assumption) |
| DC-CLEAR-06 | Working space in front of electrical gear | NEC 110.26(A) |
| DC-FLOOR-07 | Floor loading of heavy racks | Structural assumption |
| DC-FIRE-08 | Battery room separation | NFPA 75 / NFPA 855 |
| DC-ROUTE-09 | Crated racks fit the delivery route | Logistics check |
| DC-SEP-10 | Path A and B physically separated (2N) | Uptime Tier IV concept |

**CP-SAT proof** (when the server runs): `/api/dc/check` proves the room layout has no overlaps and every door joins rooms that touch, then that no shorter building fits. ~30 ms, OPTIMAL on all six reference designs.

**The view:** 2D plan and 3D, with four **lenses** that each answer one question: **Layout** (what is where), **Power** (where the electricity goes; racks coloured by kW, paths A/B), **Heat** (where it gets hot; temperature field and animated airflow), **Backup** (what keeps running if something breaks). Click any part for an inspector card with its numbers and a plain-language explanation.

**Export:** **OpenUSD (.usda)** for NVIDIA Omniverse and any USD tool: room floors, the same walls the 3D draws, door data, and **one PointInstancer per equipment kind** (thousands of racks stay light), with ids, labels, kW, capacity, power path, row and room as custom attributes; metres, Y up. Validated by opening it in `usd-core`. Plus **lossless JSON** (the whole design, checks, cost, basis).

## 3. Test: break it and see what keeps running

- **Status model** (`engine/status.ts`): plain capacity arithmetic over the power and cooling paths, so every status explains itself in one sentence ("the 3 remaining coolers carry 2,400 kW; the hall needs 2,112 kW"). Per rack: **ok** (running, survives one more failure), **risk** (running with no backup left, or above the comfortable inlet temperature), **down** (off or overheating).
- **Conditions:** failed parts (any equipment, or utility feed A/B), IT load (share of design), outdoor temperature. Outdoor coolers are rated at 38 °C and lose 3% per °C above it.
- **What-ifs:** a cooler breaks · a power path fails · the grid goes down (generators take over) · heat wave (40 °C) · busier than planned (105% load) · worst day (grid down, a generator fails, 42 °C).
- **Break any part** from its card or by asking the assistant; **Fix everything**; **Play a day** (temperature and load over 24 h); **Test every part**: a sweep that fails each part in turn and reports which single failures hurt; pool meters for every power and cooling pool.
- **Thermal estimate** (`engine/thermal.ts`): a steady-state air temperature field per hall solved by successive over-relaxation on a 600 mm grid: heat diffuses from rack exhausts and is removed where live air handlers are. Calibrated so the warmest inlet is 25 °C with everything running; ASHRAE recommended 27 °C and allowable 32 °C (A1) mark risk and down. Labelled "estimate, not CFD"; pass/fail comes from the capacity arithmetic.
- **3D alerts:** a broken part gets a steady red floor ring, a slow fading ripple and a thin marker; the camera frames it from 26 m so its neighbours stay in view. With nothing broken, the 3D doesn't redraw at all.

## 4. Cost

- **Build cost** by group (building, power, cooling, other) as a stacked bar; **IT hardware** cost shown separately (it often exceeds the building).
- **Running cost per year:** electricity from IT load × utilisation × **PUE**, maintenance (share of build), staff.
- **PUE model** (`pueOf`): 1 + cooling overhead (0.06 for liquid share, 0.30 for air share) + power losses (0.055 for 2N, 0.045 otherwise) + other (0.02 / utilisation).
- **Energy Sankey:** where every kWh goes (IT, cooling, power losses, other).
- **Total cost over the years** (line chart), **$ per kW per month**, **$ per GPU-hour**, **CO₂ per year** (grid intensity, default US average 0.37 kg/kWh).
- **Compare table** across the three options.
- **Every assumption is editable** and sourced (shell $/m², UPS, batteries, generators, distribution, liquid coolers, air handlers, outdoor coolers, plant, site, soft costs, maintenance, staff, carbon). Change electricity to 15¢ and everything recomputes.
