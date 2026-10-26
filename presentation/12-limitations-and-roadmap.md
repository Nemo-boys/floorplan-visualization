# Limitations, honest wording, roadmap

## Limitations (say them before a judge does)

- **Not a licensed design or code sign-off.** The checker implements 9 clinic rules and 10 data center checks; electrical design, fire engineering, structural and MEP sign-off are not evaluated. Data center checks marked "screening only" are exactly that.
- **The model is not trusted with coordinates.** With grammar-constrained decoding its lines always parse and its room programs are reliable, but its geometry doesn't fit the site, so a deterministic synthesizer and CP-SAT do the geometry. This is a design choice backed by our own test, not a gap we hide.
- **Generation with the model is slow on a laptop** (~47 s for 3 candidates on an M4 Pro). The model-off pipeline answers in 0.04 s; a hosted Nemotron (NIM / API catalog) is the path to faster generation.
- **Layouts are single-storey, orthogonal**, on a double-loaded corridor for clinics and a banded layout for data centers.
- **Thermal is an estimate, not CFD.** Pass/fail comes from capacity arithmetic; the temperature field shows where heat builds up.
- **Costs are planning estimates** from stated, editable assumptions, not quotes.
- **The model-on benchmark rows are not measured yet** (planned `make bench` run).
- The clinic's quick-setup screen still needs a phone layout pass.

## Wording

| Avoid | Say |
|---|---|
| "Code-compliant", "certified" | "Passes N of M implemented checks, each with its citation" |
| "CFD", "thermal simulation" | "Thermal estimate (not CFD)" |
| "The AI designs the building" | "Nemotron drafts the program; CP-SAT makes the geometry exact; the checker reports what passed" |
| "Accurate cost" | "Planning estimate from editable, sourced assumptions" |
| Benchmark rows from `aegis/README.md` | Measured rows from `docs/BENCHMARK.md` |

## Roadmap

1. **Domain packs as config:** move clinic tables (grammar room types, CP-SAT size table, rules, prompt, few-shot) into `domains/clinic/`, then `domains/datacenter/` on the Python side, with clinic tests unchanged byte for byte.
2. **Measure the model-on benchmark** and publish raw per-brief rows.
3. **Faster generation:** shorter program format, lower `max_tokens`, caching by brief, hosted Nemotron via NIM.
4. **More geometry:** multi-storey, non-rectangular sites, windows and exterior walls in the solver, DXF export.
5. **Data center:** capacity ramp over months, move-in animation of a crated rack along the A* route, technician walk times, phased growth slider, CP-SAT for rack placement.
6. **Clinic:** keyboard picking of rooms, more rule packs (state codes, infection control), staffing optimisation (search the cheapest staffing that "Handles it").
7. **Collaboration:** shareable scenario links, side-by-side clinic/data center view, a guided demo story button.
8. **Omniverse:** richer USD (materials, per-rack variants), live sync of failure states into a digital twin.
9. **More domains:** schools, offices, warehouses, labs, hospitals.
