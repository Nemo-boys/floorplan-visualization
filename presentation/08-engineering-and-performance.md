# Engineering and performance

## 3D rendering

- **three.js 0.186 with WebGPU** (`three/webgpu`), falling back to **WebGL2** automatically; the UI names the renderer in use.
- **Instancing:** Data Center Studio draws **one InstancedMesh per equipment kind**, so thousands of racks render in a handful of draw calls; walls, lintels, containment roofs, trays and alert markers are instanced too.
- **Render on demand:** frames are drawn only when something changes (camera move, selection, lens). Continuous animation runs only while alerts or airflow are visible, and the alert ripple is capped at 30 fps. An idle 3D view costs nothing.
- **Inset-aware camera:** `setViewOffset` keeps the scene centred in the area not covered by panels; resizes are skipped when insets haven't changed (each resize used to cause a visible blink).
- **Pixel ratio capped at 2**; HTML labels positioned with transforms.
- **Clinic 3D:** low-poly furniture per room type, animated people driven by the simulator, sun position following the simulated clock, route ribbons with animated chevrons, a foot-traffic heat layer, cut-away walls.
- Calm visual alerts: the earlier pulsing beam flickered, so it was replaced by a steady floor ring and a slow fading ripple.

## Simulation and models

- **Clinic:** discrete-event simulation with an event heap and a seeded PRNG (mulberry32), A* pathfinding on a walkable grid derived from walls and doors. Deterministic: golden files freeze exact results for the sample layouts; 20 simulated days run in the browser in seconds.
- **Data center:** capacity arithmetic over power and cooling pools (N, N+1, 2N), single-failure sweeps, a successive-over-relaxation thermal field on a 600 mm grid, a PUE and cost model with sourced, editable assumptions.
- **CP-SAT** on a 100 mm integer grid in both domains.

## Software engineering

- **TypeScript, strict mode**, plain DOM (no UI framework), Vite multi-page build (`index.html` clinic, `datacenter.html` studio). Pure engines (`src/engine`, `src/dc/engine`) have no DOM or three.js dependency, so they are unit-testable and reusable on a server.
- **Python 3.12**, FastAPI, Pydantic v2, OR-Tools, llama-cpp-python, httpx (streaming proxy).
- **Tests:**
  - viz: **152 unit and golden tests** (Vitest) including engine parity with the reference, plan-drawing parity, export parity, shell/CSS parity, Aegis fixtures (generated plans load, reach every room, simulate a day), the data center engine and the assistant;
  - Aegis: **58 pytest tests** (adapter on all 500 dataset plans, chat proxy with a mocked transport, data center endpoints, CP-SAT, edits);
  - Playwright end-to-end and visual-diff suites for the clinic against the approved reference.
- **Design parity discipline:** the clinic was ported exactly from an approved reference; every visible difference is logged in a deviations file. The new look is a scoped theme layer, so the reference stays one URL parameter away.

## Measured benchmark (pipeline)

Run on 2026-10-25, Apple M4 Pro, 20 feasible clinic briefs + 5 infeasible stress tests (`make bench`, `docs/BENCHMARK.md`):

| Configuration | Parses | Accepted (all applicable checks pass) | Brief fidelity | p50 / max latency |
|---|---:|---:|---:|---:|
| Pipeline, model off (brief parser → synthesizer → CP-SAT) | 20/20 | **20/20** | 20/20 | **0.04 s / 0.13 s** |

- **Infeasible requests:** 5/5 returned INFEASIBLE with a conflict core instead of a plan.
- **With Nemotron on:** about **47 s per request** (3 candidates) on an M4 Pro, all layers on Metal (~1.3× faster than CPU); time is mostly the model writing room lines. The model-on benchmark rows are still to be measured (`make bench`, ~30 min).
- **Data center CP-SAT proof:** ~30 ms per design, OPTIMAL on all six reference designs.
- **Cost per plan:** no API call; everything runs on the laptop.
