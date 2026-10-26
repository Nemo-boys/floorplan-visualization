# Where it can be used

## Healthcare (the clinic domain, today)

- **Health systems and clinic operators** planning a new outpatient site or a renovation: test whether 6 exam rooms and 2 nurses handle flu season *before* signing the lease; see the bottleneck (providers, nurses, front desk or rooms).
- **Healthcare architects:** a checked first plan in minutes instead of days; plain-language edits during a client meeting; three variants to discuss; export to Blender for visualisation.
- **Operations and staffing:** the simulator is a staffing tool too. "What if we add a nurse?", "What if a provider is out after lunch?", "How many patients can we book?". Sweeps compare staffing levels.
- **Compliance screening:** early flags for ADA door and corridor widths, turning circles, FGI room sizes, clean/soiled separation, egress reach and distance, each with its citation, before formal review.
- **Education:** architecture, health-administration and operations-research students can see how layout changes waiting time and walking distance.

## Data centers (the second domain, today)

- **AI infrastructure planning:** "how big a building, how many racks, what cooling, what does it cost" for a target MW or GPU count, in minutes; compare liquid vs. hybrid vs. air on build cost, running cost, PUE, $/GPU-hour and CO₂.
- **Resilience reviews:** show stakeholders what happens when a cooler, a power path or the grid fails, or on a 42 °C day; find single points of failure with a one-click sweep.
- **Site selection and finance:** change the electricity price, years and assumptions; see total cost of ownership.
- **Digital twin starting point:** OpenUSD export opens in **NVIDIA Omniverse** with every part's id, power and path as attributes.
- **Sales engineering and education:** explain N+1, 2N, PUE and hot/cold aisles to non-specialists, interactively.

## Other building types (next domain packs)

The pipeline is domain-agnostic: a pack supplies room types, size and adjacency bounds, rules with citations, a prompt and few-shot examples, 3D models and a simulation module.

- **Hospitals and urgent care** (triage flows, isolation rooms), **dental and imaging centres**
- **Schools and universities** (classroom programs, egress, timetabled flows)
- **Offices and co-working** (seat counts, meeting-room demand simulation)
- **Warehouses and fulfilment centres** (racking, pick paths, dock scheduling)
- **Labs and cleanrooms** (zoning, pressure cascades, gowning flows)
- **Retail and restaurants** (queues, kitchen flow), **airports and transit stations** (passenger flow)
- **Factories and EV/battery plants**, **telecom edge sites**

## Value

| For | Value |
|---|---|
| Owners | Evidence (waits, staffing, failure tolerance, cost) before committing capital |
| Architects / engineers | First plans and variants in minutes; changes in plain language; standard exports (GLB, SVG, Blender, USD, JSON) |
| Operators | A staffing and resilience simulator on the actual floor plan |
| Privacy-sensitive organisations | Runs locally: briefs and plans never leave the laptop |
| NVIDIA ecosystem | Nemotron fine-tuned for a structured spatial task; tool calling; NIM/vLLM compatible; Omniverse via OpenUSD |
