# Floorplan Intelligence: Review, Simulate and Export

Modules 3 and 4 of Floorplan Intelligence, for the Nebius × NVIDIA Global AI Hackathon 2026. A team imports a clinic floor plan, reviews it in 3D, simulates clinic days, and exports the final plan for Blender.

It is a static web app: everything runs in the browser, with no backend, no API keys and no calls to other services. The assistant, the Module 1 plan generator and the Module 2 rule checker connect later; until then the app uses stand-ins (see [docs/INTEGRATION.md](docs/INTEGRATION.md)).

The app is a port of the approved design in [design/reference.html](design/reference.html) and looks and behaves the same. Tests compare the two all the time; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Setup

You need Node 20 or newer. Then:

```sh
npm install
npx playwright install chromium   # for the end-to-end and screenshot tests
npm run dev                       # http://localhost:5173
```

Google Chrome is needed only for the WebGPU checks (`test:visual:webgpu`, `test:visual:webgl`, `test:perf`), because Playwright's own Chromium has no WebGPU adapter.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | The app on http://localhost:5173 |
| `npm run reference` | The approved design on http://localhost:5174/reference.html, for side-by-side checks (needs internet: it loads three.js from a CDN) |
| `npm run build` | Typecheck, then the static production build in `dist/` |
| `npm run check` | Typecheck, lint, then the unit, parity and golden tests |
| `npm test` | Unit, parity and golden tests (Vitest) |
| `npm run test:e2e` | Playwright tests against the app. `E2E_TARGET=reference` runs the same tests against the design |
| `npm run test:visual` | Screenshots of 18 states in 3 viewports, compared with `tests/visual/reference/` |
| `npm run test:visual:webgpu` | The same in Google Chrome with WebGPU |
| `npm run test:visual:webgl` | The same in Google Chrome with WebGPU turned off (WebGL2) |
| `npm run test:perf` | Guided-tour frame rate in Chrome, with WebGPU and with WebGL2 |
| `npm run perf:startup` | Startup timing of the production build next to the design (serve `dist/` with `npx vite preview` first) |
| `npm run golden:check` | Confirms the golden files in `tests/golden/` still match the design |
| `npm run capture:reference` | Re-captures the reference screenshots (only when the design changes) |

`test:e2e` starts the dev server (or, for the reference target, the reference server) if it isn't running. One app test compares the export bundle with the design's, so keep `npm run reference` running too. `test:visual` needs `npm run dev` running.

## How it's built

- Vite and TypeScript in strict mode, plain DOM (no UI framework), three.js 0.186.1.
- The 3D view uses WebGPU when the browser has it and WebGL2 otherwise. The badge in the top bar says which.
- The engine (plan analysis, pathfinding, the day simulation, scenario blocks) is pure TypeScript in `src/engine/` and is deterministic: the same plan, scenario and seed always give the same numbers.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the data flow, the state, the render loop and where each part lives. [docs/DECISIONS.md](docs/DECISIONS.md) explains the choices behind the design.

## Tests

| Layer | Where | What it proves |
|---|---|---|
| Golden | `tests/golden/*.test.ts` | The engine reproduces every number in `tests/golden/` (layouts, 9 × 20-day runs, validation messages), and the 2D drawing byte for byte |
| Parity | `tests/unit/*-parity.test.ts` | The engine, 2D drawing and export writers give the same output as `reference-src/` on many more inputs, and the CSS and markup are the reference's |
| End-to-end | `tests/e2e/` | Every step, with the same tests passing on the app and on the design. Includes axe on every step and a keyboard-only run |
| Screenshots | `tests/visual/` | 54 screenshots within the tolerances in PLAN.md |

## Deploy

`npm run build` writes a static site to `dist/`. Any static host can serve it. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Where things are

| Path | What it is |
|---|---|
| `src/` | The app |
| `design/` | The approved design and its specs: screens, controls, colors (read-only) |
| `reference-src/` | The design's source, with a function-by-function port map (read-only) |
| `contracts/` | plan.json v0.1, scenario.v1, the export bundle, browser storage (read-only) |
| `samples/` | Three sample plans and seven scenarios (read-only) |
| `tests/` | Golden, parity, end-to-end, screenshot and performance tests |
| `docs/` | Architecture, decisions, deviations from the design, integration, deploy, demo |
| `PLAN.md`, `CLAUDE.md` | The phased plan this build followed, and the rules for working on it |
