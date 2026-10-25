# Decisions

Short reasons for the choices behind the approved design, so they don’t get re-argued during the port.

1. **Port the preview instead of rebuilding it.** It has been reviewed screen by screen and approved. Rebuilding would mean re-reviewing everything and invites drift.
2. **Plain DOM and TypeScript, no UI framework.** The reference is plain DOM. Keeping the same structure, ids and CSS makes parity testable with one shared test suite.
3. **Deterministic code does the math.** Module 1 asks an LLM for the room program and lets the solver place the rooms. In the same way, the simulator never asks a model for numbers. When the assistant is connected later, it reads results and calls tools; it doesn’t produce numbers.
4. **Typed scenario forms, not free-text scenarios.** Free text can produce nonsense and results that can’t be reproduced. Every block type is defined once in `BLOCK_TYPES`, so the form, checks, timeline and schema come from one place, and a new block means a new definition.
5. **Many days, not one.** One random day can mislead. Results are a range over N days with a typical day to watch, and the same seed reproduces it.
6. **Count the waits honestly.** Time in line at reception counts as waiting. Patients still waiting when staff leave are counted and lower the verdict, and the checks warn when arrivals continue after the last shift.
7. **3D first, 2D on demand.** Review shows only the 3D stage. The 2D plan is a collapsible, movable glass panel, which the team asked for.
8. **Editing is optional.** It lives inside Review behind “Edit plan” instead of being a pipeline step.
9. **Every change is a version.** Swaps, renames and furniture changes are kept and can be restored, which makes iteration visible in the demo.
10. **WebGL first, WebGPU second.** Phase 4 ports the 3D on the exact three.js version used by the reference, to prove parity. Phase 8 adds WebGPU with WebGL2 as the fallback.
11. **History in the browser.** It needs no backend and matches the preview. A shared, server-side history is a possible later change, and needs the user’s go-ahead.
12. **The GitHub push stays “Planned”.** It is shown in the design to signal where the product goes, but it isn’t in scope.
13. **The app first, connections later.** This build is the app alone: no backend, no keys and no calls to other services. The assistant panel is a placeholder, Module 1 uses the bundled sample, and Module 2’s checks are example data. The team connects each one later.
