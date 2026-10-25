# Architecture

The app is a static web page. Everything runs in the browser: plan analysis, 3D, 2D, simulation, history and export. There is no backend and nothing to configure.

```
plan.json (Module 1, upload, sample)
   │  adaptPlan, preparePlan
   ▼
P = { m: model (rooms, doors, W, D), g: walkable grid, pf: pathfinder, info: analysis, furn: furniture }
   ├── src/plan2d    planSVG: floor-plan panel, thumbnails, export SVG
   ├── src/view3d    buildScene: 3D stage (people from the running ClinicSim)
   ├── src/engine    runChecks, tourStops, swapInSpec
   └── src/engine    ClinicSim(P, compiled scenario, seed): one day
                          ▲
scenario (fi.scenario.v1 blocks) ── validateScenario ── compileScenario
                                                          │ runDay × N, summarizeDays, verdictOf
                                                          ▼
                                                   Results, History, Export stats
```

## State

There is a single `state` object, the same as the reference. Its main fields:

| Group | Fields |
|---|---|
| Plan and versions | `json`, `P`, `spec` (sample layouts only, used for swaps), `versions[]`, `vIndex`, `placed[]` (furniture added by hand), `checks` |
| Step and modes | `step`, `editing`, `editTool`, `swapSel`, `renameSel`, `selectedRoom`, `view` (`orbit`, `tour`, `walk`, `follow`), `walls`, `placing`, `selected` |
| Simulation | `scn` (the builder’s scenario), `scenario` (the compiled scenario playing in 3D), `seed`, `sim` (the running ClinicSim), `playing`, `speed`, `run` (the last result), `sweep`, `history`, `histSel`, `probs`, `simTab`, `tl` |
| Panels | `dock` (floor-plan panel), `planRoutes`, `layers` |

Every change goes through a small set of functions that re-render what depends on it:

- `importPlan` and `applyVersion` rebuild the model, then the 3D scene, the 2D plan, the header, checks, versions, edit tools and builder room lists, and restart the day.
- `commitVersion` and `afterFurnitureChange` add a version.
- `setStep` and `setSimTab` switch what’s visible. `is3DVisible` and `is2DVisible` decide what the render loop draws.
- `runScenario`, `runScenarioNow` and `runSweep` produce `state.run`, save to history, and start playback of the typical day.

## Render loop

One `requestAnimationFrame` loop:

1. Advance the simulation by `dt × speed` minutes while playing.
2. If the 3D stage is visible: update the sun (every 0.4 s), the route chevrons, people and edit-pick pulses; then the active camera (orbit, walk, tour or follow); then render.
3. Update the live counts and timeline every 0.3 s.
4. Update the people dots on the plan every 0.14 s when the panel is open.
5. Refresh the tour caption and room card “now” lines every 0.7 s.
6. Repaint the foot-traffic heat map every 0.7 s when it’s on.

## Determinism

- `mulberry32` seeds every day. Day k of a run uses `daySeed(seed, k)`.
- Same plan, scenario and seed always give the same numbers, which is what the golden tests rely on.
- The typical day replayed in 3D is the same day as in the summary, because playback uses that day’s seed.

## Later integrations

The team connects these later. In this build they are stand-ins, and no connection code is written:

| What | Stand-in in this build | Where it will hook in |
|---|---|---|
| Assistant | The drawer opens with a placeholder line | The `#assistant` drawer; the reference’s chat code in `reference-src/ui3.js` |
| Module 1, plan generator | The pipeline card opens the bundled sample; bigger changes point to Module 1 | `importPlan` and the pipeline card on Import; versions via `commitVersion` |
| Module 2, U.S. rule checks | Five example checks computed by `runChecks` | `runChecks` and `renderChecks`; the same check shape (label, pass, detail, source) |

## Where the code lives

The port keeps the reference’s function names, so `reference-src/README.md` maps every function to its module. In short:

| Folder | What’s there |
|---|---|
| `src/engine/` | Pure TypeScript, no DOM: `plan` (adapter, samples, `inwardDir`), `furniture`, `grid`, `walls`, `path`, `analysis` (`preparePlan`), `sim` (`ClinicSim`), `scenario` (blocks, checks, compiler, multi-day runs), `checks`, `tour`, `edits`, `format`, `types` |
| `src/plan2d/` | `planSVG` and the live overlays (`planOverlay`, `planPeople`) |
| `src/view3d/` | `renderer` (WebGPU or WebGL2), `init`, `textures`, `materials`, `geometry`, `furniture` models, `scene` (building, walls, routes, heat, labels), `people`, `cameras`, `pointer`, `placement`, `tour`, `marks`, and `r3` (the renderer, scene and camera once started) |
| `src/export/` | `glb`, `zip`, `model` (`buildExportModel`), `texts` (Blender script, skill, README), `bundle` |
| `src/ui/` | The shell (`app`: bindings, render loop, startup; `stepper`, `theme`, `toast`, `dock`, `assistant`), Import (`import`, `versions`), Review (`review`, `edit`, `plan-panel`), `transport`, `compare`, `export-step`, `download`, `test-hooks`, and `simulate/` (builder, timeline, checks, runner, results, history, files) |
| `src/styles/` | The reference stylesheet split at its comment headers, imported in order by `index.ts` |
| `src/state.ts` | The single `state` object |

## Renderer

`chooseRenderer` asks `navigator.gpu` for an adapter. With one, it loads `three/webgpu` (a separate chunk) and awaits `init()`. Without one, or if WebGPU fails to start, it uses `WebGLRenderer` with the reference settings. The scene, materials and lights are the same either way; only the PMREM environment generator differs, because each renderer has its own. `init()` starts the renderer first and sets up the rest of the page while it starts.
