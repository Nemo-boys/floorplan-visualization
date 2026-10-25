# CLAUDE.md

Floorplan Intelligence, Modules 3 and 4: a web app where a team imports a clinic floor plan, reviews it in 3D, simulates clinic days, and exports the final plan for Blender. Built for the Nebius × NVIDIA Global AI Hackathon 2026 (submissions close October 30, 2026, 10:00 am PDT).

This build is the app itself. It runs entirely in the browser, with no backend and no API keys. The team connects the assistant, the Module 1 plan generator and the Module 2 rule checker later. Until then, the app uses the stand-ins listed in PLAN.md.

## The one rule: build the approved design, exactly

- `design/reference.html` is the approved design. It is a complete, working single-file app. The port must look and behave the same: same steps, layout, copy, colors, interactions, animations and numbers.
- `reference-src/` is the same app split into its source modules. Port this code to TypeScript. Don’t redesign it or rewrite it from scratch.
- Keep the DOM: the same element ids, classes, data attributes and ARIA attributes. Port the CSS unchanged.
- Keep the numbers: the simulator is deterministic, and `tests/golden/` holds the exact expected results. They must pass.
- The only allowed differences are listed in PLAN.md under “Planned differences from the reference”. For anything else that would differ (a bug fix, an improvement, a library limitation), stop, write it in `docs/deviations.md`, and ask the user before doing it.
- If the reference and a written spec disagree, the reference wins. Log the mismatch in `docs/deviations.md`.

## How to work

- Follow PLAN.md one phase at a time. Each phase ends with a gate: run the listed checks, show the user what changed (with screenshots where listed), and wait for approval before starting the next phase.
- Make small commits with one topic each, for example `feat(engine): port ClinicSim` or `test: golden scenario runs`.
- Before calling a task done, run `npm run check` plus the phase’s end-to-end or visual tests.
- When you’re unsure what the reference does, run it (`npm run reference`) and read the matching function in `reference-src/`. Functions keep their names in the port, so you can search for them by name.

## Never

- Never add a backend, API keys or calls to outside services in this build. Everything runs in the browser. The only network requests are the page’s own files and the Google Fonts stylesheet.
- Never port the preview’s chat logic (`sendChat`, `CHAT_TOOLS`, `fallbackReply` and the rest; see `reference-src/README.md`). The assistant panel is a placeholder in this build.
- Never change engine behavior to improve results. Golden numbers change only when the user asks for a behavior change. In that case, update the reference first, run `node tools/make-golden.mjs`, and explain the diff.
- Never add a UI framework such as React or Vue. The reference is plain DOM, so the port is plain TypeScript modules.
- Never edit `design/`, `reference-src/`, `contracts/`, `samples/` or `tests/golden/` without the user’s go-ahead. They are the specification.
- Never commit `node_modules`, `dist`, or Playwright reports and output.

## Stack

- Vite with TypeScript in strict mode. Plain DOM. The build output is a static site.
- three.js pinned to exactly `0.159.0`, the version the reference uses, until Phase 7. Phase 7 moves to a pinned newer release that includes `three/webgpu`.
- Tests: Vitest for unit and golden tests, Playwright for end-to-end and visual tests.
- Font: Atkinson Hyperlegible from Google Fonts, loaded with the same `<link>` tags as the reference.

## Commands (created in Phase 0)

| Command | What it does |
|---|---|
| `npm run dev` | The app on http://localhost:5173 |
| `npm run reference` | Serves `design/` at http://localhost:5174/reference.html for side-by-side checks |
| `npm run build` | Static production build into `dist/` |
| `npm run check` | Typecheck, lint and unit tests |
| `npm test` | Unit and golden tests (Vitest) |
| `npm run test:e2e` | Playwright flows against the app; set `E2E_TARGET=reference` to run the same tests against the reference |
| `npm run test:visual` | Screenshots of the app compared with `tests/visual/reference/` |
| `npm run golden:check` | `node tools/make-golden.mjs --check`, which confirms the golden files still match the reference |

## Code map (target)

```
src/engine/   pure TypeScript, no DOM and no three.js: plan adapter, furniture, grid, walls, pathfinding,
              analysis, simulator, scenario blocks, checks, tour, edits, formatting
src/view3d/   three.js scene, materials, furniture models, people, cameras (orbit, walk, follow, tour),
              highlights, edit picks, placement, renderer choice
src/plan2d/   SVG floor plan drawing and its overlays
src/export/   GLB writer, ZIP writer, Blender script, Claude skill, README text, bundle
src/ui/       stepper and steps: import, review (floor-plan panel, room card, tour, edit tools),
              simulate (palette, cards, timeline, checks, runner, results, history), export,
              the assistant panel placeholder, compare dialog, transport, toast
src/state.ts  the single app state object, with the same fields as the reference `state`
src/styles/   the reference CSS, split along its comment headers, otherwise unchanged
tests/        unit/, golden/, e2e/, visual/
```

## Where things are defined

- The approved design: `design/reference.html`. Screens, states, behavior and copy: `design/UI-SPEC.md`. Every control: `design/ui-inventory.md`. Colors, type and motion: `design/design-tokens.md`.
- Data contracts: `contracts/` (plan.json v0.1, scenario.v1, the export bundle, browser storage).
- Expected numbers: `tests/golden/` (regenerate or verify with `tools/make-golden.mjs`).
- Why things are the way they are: `docs/DECISIONS.md`. Module map and data flow: `docs/ARCHITECTURE.md`. Function-by-function port map: `reference-src/README.md`.

## Style

- Copy: keep every visible string exactly as in the reference. Use typographic quotes and apostrophes (’ “ ”) in visible text and straight quotes in code.
- Units and formats: metres, minutes, clock times such as 9:30 am via `fmtClock`, durations via `fmtMin`.
- Accessibility: every control reachable by keyboard, visible focus rings, ARIA attributes as in the reference, `prefers-reduced-motion` respected.
- TypeScript: no `any` in new code except at third-party boundaries. Keep the reference’s function names and module boundaries. Prefer small pure functions in `src/engine/`.
