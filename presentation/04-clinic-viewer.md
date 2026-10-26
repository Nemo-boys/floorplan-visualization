# The clinic app: review, simulate, export

A browser app (TypeScript, plain DOM, three.js) where a team brings in an outpatient clinic plan, reviews it in 3D, simulates clinic days and exports the final plan. Four steps: **Import → Review → Simulate → Export.**

## Import

- **From the pipeline:** a brief form (brief, site width and depth) → **Generate 3 plans** → three candidates ranked by checks passed, each tagged with whether Nemotron or the fallback drafted it.
- **Upload** any plan.json v0.1, or start from **three sample layouts** (lobby in the middle, lobby at the west end, nurse station among the exam rooms).
- The import summary reads the plan back: rooms, doors, exam rooms, area, footprint, with pass marks.
- The viewer needs only rooms and doors. It derives **walls, windows, furniture, the entrance and a walkable grid** itself.

## Review (3D)

- **Renderer:** three.js 0.186 with **WebGPU**, falling back to **WebGL2**; the badge shows which one is running.
- **Camera modes:** Overview (orbit), **Guided tour** (stops follow a patient's visit: entrance, lobby, reception, exam rooms nearest first, staff and support rooms, exit; each with a caption and live "now" text), **Follow a patient** (during a simulated day), **Walk** (first-person with collision, keyboard or on-screen pad).
- **Cut-away or full walls**; low-poly furniture per room type; people as animated figures; trees and site.
- **Room card:** area, size, purpose, what is happening in it now.
- **Floor plan dock:** a draggable, resizable glass panel with the 2D plan (SVG); click a room to fly there. **Route overlays:** patient path (door → exam room → out), nurse walks (station to every exam room), longest way out (egress).
- **Edit:** swap rooms, rename, place furniture (walking routes re-plan around it), versions with undo, and **"Ask the plan generator"** for bigger changes (goes to AegisPlan's edit endpoint, returns a repaired new version or the reason it can't be done, with blocking rooms in red).
- **Plan checks** with citations; for generated plans these are AegisPlan's real checks.

## Simulate (the core differentiator)

### The engine

- **Discrete-event simulation** of a clinic day (`ClinicSim`, `src/engine/sim.ts`), minutes from 8:00 am, event heap, seeded RNG (mulberry32): **fully deterministic**, same seed gives the same day. Golden files freeze the exact numbers.
- **Walking time comes from real path lengths:** A* on the walkable grid derived from the plan's walls and doors, with segment smoothing. Moving the nurse station really changes how far nurses walk.
- **Agents:** patients, nurses, providers, receptionists. Visit flow: arrive → check in at reception → wait in the lobby → nurse intake (vitals) → provider visit (time by visit type) → checkout → leave.
- **Resources:** exam rooms, staff by role and shift, breaks, staff out, closed rooms.

### Scenarios as typed blocks (fi.scenario.v1)

Hours, run settings (days, seed), staff shifts, appointments (count, no-show %), walk-ins (count, arrival pattern such as a morning rush), group arrivals, visit types (share, provider minutes), visit steps (intake minutes), breaks (staggered windows), staff out, closed rooms, and **When/Then rules** (e.g. "when more than 3 people wait at the desk for 10 min between 8 am and 1 pm, call in a receptionist after 15 min for 4 h").

- **Presets:** Normal Tuesday (3 providers, 2 nurses, ~60 patients), Flu-season Monday (~90 patients, a morning rush, a call-in rule), Short-staffed day (2 providers, 1 nurse, a provider out after lunch), Custom.
- **Quick setup (new look):** pick the kind of day, then − / + for providers, nurses, front desk and patients per day. It edits the same scenario through the engine's own override function, so it is the same thing as editing blocks; the full block builder and a draggable day timeline are one click away.
- Live validation: problems block a run; warnings don't.

### Running and results

- **Run 20 days** (seeded per day) → a **verdict**: *Handles it* (90th-percentile wait ≤ 15 min, nobody turned away), *Busy, but it copes* (≤ 40 min), *Struggles* (otherwise, or ≥ 3 patients not seen).
- The **bottleneck** (busiest of providers, nurses, reception, exam rooms) with utilisation bars; when the lobby was fullest.
- **Across N days**, as mean with a low–high range: patients seen, average wait, 1-in-10 wait, time in clinic, walking per nurse, last patient leaves, no-shows, not seen before staff left, rule firings.
- **The 3D plays the typical day** with a transport bar (play, speed 1×–300×, scrub the day timeline, live counts: in clinic, in lobby, seen); layers for foot-traffic heat and waiting-time dots.
- **Try a range of values:** sweep nurses, providers, receptionists or patients over several values (10 days each) and compare verdicts side by side.
- **History:** every run saved in the browser; reload, re-run, or compare 2–4 runs.
- **Compare layouts:** the same day on this plan and the alternatives (the other generated candidates, or samples A/B/C): average wait, 1-in-10 wait, time in clinic, nurse walking.

Example finding from the generated variants (flu-season Monday, 5-day mean): centre entrance **11.5 min** average wait and **1.4 km** nurse walking per day, versus 13.4 min / 2.0 km for the west entrance.

## Export

- **One .zip for Blender:** `clinic.glb` (each room its own node group), `plan.json` with edits, furniture and check results, `plan.svg` (2D drawing), `build_in_blender.py` (builds a Blender file with one collection per room), a **Claude Code skill** that builds the Blender file or adds the export to a repository, and a README.
- Individual downloads: plan.json, SVG.

## Quality bar

- Ported exactly from an approved single-file reference design; **golden tests** freeze the simulator's numbers for samples A, B and C, and parity tests guard the DOM and CSS. The new look is a theme layer; `?look=reference` shows the approved design unchanged.
