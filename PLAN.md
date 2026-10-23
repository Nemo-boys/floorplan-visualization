# PLAN.md

How to turn the approved preview (`design/reference.html`) into a real, shareable codebase without changing what it looks like or how it behaves.

**Strategy:** port, don’t rebuild. The reference already works, and its code is in `reference-src/`. Each phase moves one part of it into typed modules, then proves parity in three ways:

- **Golden numbers:** the engine must produce exactly the numbers in `tests/golden/`.
- **Shared end-to-end tests:** the same Playwright tests run against the reference and the app. The DOM ids, classes and data attributes are kept identical, so one test file covers both.
- **Screenshots:** the app’s screenshots are compared with screenshots of the reference, taken in Phase 0.

Every phase ends with a **gate**: run the checks, show the user, wait for approval.

---

## Planned differences from the reference

These are the only intended differences. Everything else stays identical: layout, copy, colors, motion, interactions and numbers.

1. **Assistant panel is a placeholder.**
   - The Assistant button stays and opens and closes the drawer as before.
   - The drawer shows only its header (“Assistant” and “Close”) and one line: “The assistant will be connected in a later version.”
   - No messages, suggestions, input or tools. Exact markup and CSS are in `design/UI-SPEC.md`, section 7.
   - The two buttons that opened the chat stay in the markup but are hidden (`hidden` attribute): “Ask the assistant” in the edit tools (the “Bigger changes” text stays) and “Ask the assistant why” in Results.
2. **Downloads:** the export buttons are always enabled and use the browser’s normal file download, so the “Downloads aren’t available in this view…” note never appears.
3. **Renderer (Phase 7):** WebGPU when the browser supports it, WebGL2 otherwise. The badge reads “WebGPU” or “WebGL2”. Its tooltip reads “Rendering with WebGPU.” or “Rendering with WebGL2. WebGPU isn’t available in this browser.”
4. **Preview-only wording:** anything that mentions the Claude artifact viewer (`window.claude`, “Open the artifact in Claude…”) is removed.

## Stand-ins kept exactly as in the reference

The team connects these later. Build them as the reference has them, and don’t add connection code.

- **Module 1, the plan generator:**
  - The “From the Module 1 pipeline” card opens the bundled sample (Layout A as “Primary care clinic”) and keeps its note “Preview: a sample file stands in for Module 1’s output.”
  - Bigger layout changes keep the note that they go to the plan generator (Module 1).
- **Module 2, the U.S. rule checks:** the five example checks from `runChecks` are the placeholder data, with their note “Example checks until Module 2 connects with the full U.S. rule set.”

## Test hooks (all phases)

The same tests drive both the reference and the app, so the app exposes the reference’s global functions on `window.__fi` in dev and test builds (never in production):

`state`, `tour`, `setStep`, `setSimTab`, `importPlan`, `seek`, `startTour`, `nextTourStop`, `endTour`, `loadPreset`, `addBlock`, `moveBlock`, `runScenarioNow`, `runSweep`, `runCompare`, `compareHistory`, `applySwap`, `exportBundle`, `planJsonExport`.

Tests reach them through one helper: `(window.__fi || window)` for functions, `window.__fi ? window.__fi.state : state` for state, and the same pattern for `tour`. In the reference these are page globals. `tools/capture-reference.mjs` shows the pattern.

For screenshots, use `reducedMotion: 'reduce'`, pause the day (`state.playing = false`), then `seek(90)` (9:30 am) before capturing. The view is then stable.

---

## Phase 0: Set up the repo and capture the reference

**Tasks**

1. Create `package.json`, Vite + TypeScript (strict), ESLint with typescript-eslint, Prettier, Vitest, Playwright (Chromium), and `three@0.159.0` (exact pin).
2. Create the folders from CLAUDE.md’s code map. Leave `design/`, `reference-src/`, `contracts/`, `samples/`, `tests/golden/` and `tools/` exactly as delivered.
3. Add the scripts from CLAUDE.md:
   - `reference` runs `node tools/serve-reference.mjs`, which serves `design/` on port 5174.
   - `dev` runs Vite.
   - `golden:check` runs `node tools/make-golden.mjs --check`.
4. Turn `tools/capture-reference.mjs` into `tests/visual/capture.ts`. It takes a base URL and an output folder and captures every state in “Screenshot states” (below):
   - desktop 1440×900 in light and dark
   - phone 390×844 in light

   Run it against the reference into `tests/visual/reference/`. It needs internet, because the reference loads three.js from jsDelivr. When it captures the reference, the tool applies planned differences 1 and 2 first, so the reference shots show what the app should look like. It also writes `tests/visual/reference/index.html`, a contact sheet showing all shots.
5. Run `npm run golden:check`. It must print “All golden files match the reference.”

**Gate:** show the contact sheet and the golden check output.

## Phase 1: Port the engine (pure TypeScript)

**Tasks**

1. Port `reference-src/engine.js` into `src/engine/` modules, following the map in `reference-src/README.md`:
   - `rng`, `heap`
   - `plan` (adapter, `SAMPLE_SPECS`, `makeSamplePlan`, `makePlanFromSpec`)
   - `furniture` (`planFurniture`, `itemRect`)
   - `grid`, `walls` (`extractWalls`, `doorGaps`, `planWindows`)
   - `path` (pathfinder with string-pulling), `analysis` (`analyzePlan`, `preparePlan`)
   - `sim` (`ClinicSim`, `posAt`, `WALKIN_PATTERNS`)
   - `scenario` (`BLOCK_GROUPS`, `BLOCK_TYPES`, `makeBlock`, `SCENARIO_PRESETS`, `makeScenario`, `checkField`, `validateScenario`, `compileScenario`, `runDay`, `summarizeDays`, `verdictOf`, `applyOverrides`, `DAY_KEYS`, `daySeed`)
   - `checks` (`runChecks`), `tour` (`tourStops`, `PURPOSE`), `edits` (`swapInSpec`)
   - `format` (`fmtClock`, `fmtMin`, `hm`, `hmStr`, `fmtHM`, `roleName`, `ruleText`)
2. Move `inwardDir` from view.js into `src/engine/plan.ts`. It is pure and used by both 2D and 3D.
3. Add types for plan.json v0.1 (`contracts/plan.v0.1.schema.json`), the internal model (`m`, `g`, `info`, `furn`), `fi.scenario.v1`, compiled scenarios and metrics.
4. Keep logic identical. Keep the order of every random-number call, and don’t reorder arithmetic. Golden values are compared to 6 decimals.
5. Write golden tests in `tests/golden/` that read the provided JSON and check:
   - every layout field (counts, distances, tour order, checks)
   - all 9 scenario runs day by day, plus summaries, verdicts, typical seeds and rule firing counts
   - the 10-day runs, legacy single-day runs and the swap example
   - every validation message, exact text included
   - compiled summaries and overrides

**Gate:** all golden tests pass. Show the test summary.

## Phase 2: App shell, styles and state

**Tasks**

1. `index.html`: port the `<body>` markup from `reference-src/shell.html` verbatim, without the inline script and the three.js `<script>` tag. Keep the `<head>` (viewport, fonts, title).
2. Styles: move the reference `<style>` block into `src/styles/` files, split at its comment headers, imported in the same order. Don’t change values.
3. `src/state.ts`: the typed `state` object with the same fields and defaults as the reference.
4. Shell behavior:
   - `$`, `esc`, `toast`, `toastAction` with Undo, and the notice box
   - `themeColors`, `applyTheme`, and the `data-theme` override
   - stepper: `setStep`, `moveGlider`, disabled tabs before import, arrow keys, hash links
   - the assistant drawer: open and close, with the placeholder content (planned difference 1)
   - renderer badge text
5. Deep links: `#import`, `#review`, `#edit`, `#simulate`, `#export`. Any link other than `#import` loads the pipeline sample first.

**Gate:** visual parity for “import-empty” (desktop light and dark, phone). An end-to-end test confirms the steps stay disabled until a plan is imported.

## Phase 3: Import and the 2D plan

**Tasks**

1. `src/plan2d/`: port `planSVG`, `planOverlay` and `planPeople` from plan2d.js. `planSVG(layout A)` must equal `tests/golden/plan2d-layout-a.svg` byte for byte.
2. Import step:
   - the sample cards with thumbnails and texts
   - the pipeline card, using the stand-in until Phase 7
   - upload, with the exact error message
   - the summary card with its seven “What we read” rows
   - “Next: Review”
3. Versions model: `importPlan`, `planJsonFromVersion`, `applyVersion`, `commitVersion`, `clonePlaced`, plus header updates.

**Gate:** visual parity for “import-loaded”. End-to-end imports through all three paths, including an uploaded plan that uses `polygon_mm` and has no doors.

## Phase 4: 3D view and the Review step

**Tasks**

1. Port view.js into `src/view3d/`:
   - `initThree`, textures and materials, `buildScene`
   - floors, `wallBoxes`, `doorLeaves`, windows, ambient-occlusion strips, site, trees
   - furniture builders (`FURN`, `buildItem`), people (`updatePeople`, poses), floor labels
   - routes with moving chevrons, the heat map (`paintHeat`), `setSun`, `fitCamera`
2. Cameras:
   - orbit with damping
   - walk (keys and the touch pad)
   - follow a patient
   - guided tour: `startTour`, `beginTourMove`, `updateTour`, `nextTourStop`, `prevTourStop`, `endTour`, `syncOrbitFromCamera`
3. Highlights and picks: `focusRoom`, `highlightRoom`, `setRoomMarks`, `setHoverMark`, `pulseMarks`, `markLabel`.
4. Pointer and placement:
   - `floorPoint`, `roomAt`, `pickPlaced`, hover tooltip
   - single tap calls `onRoomTap`, double tap calls `focusRoomAt`
   - `startPlacing`, `commitPlaced`, `rotateSelected`, `removeSelected`, `blocksDoor`
5. Renderer: `WebGLRenderer` with the reference settings (pixel ratio cap, shadows, tone mapping, color space).
6. Review UI:
   - review bar with “Edit plan” / “Done editing” and “Next: Simulate”
   - camera and wall switches, the view hint, zoom buttons
   - tour caption and tour bar, follow chip, walk pad
   - room card
   - floor-plan panel: `applyDock`, `bindDock` (open and close, drag to a corner with a springy snap, resize from the inner corner, saved to `fi.planDock.v1`) and the plan thumbnail on the pill
   - keyboard: Esc, R, Delete/Backspace, W A S D Q E and arrow keys
7. Edit mode:
   - `enterEdit`, `exitEdit`, the three tools, swap preview, `applySwap`, `applyRename`
   - furniture palette and `afterFurnitureChange`
   - “Ask the assistant” under “Bigger changes” stays hidden (planned difference 1)
   - versions list with Restore
   - `syncEditMarks` and `onRoomHover` hints, numbered badges on the plan

**Gate:**

- Visual parity for every Review state (strict outside the 3D canvas, looser inside it; see “Visual tolerance”).
- End-to-end: the tour visits all 19 stops of layout A in the golden order, and the caption title at each stop matches the reference.
- End-to-end edits:
  - a swap through the plan and another through 3D taps, with the preview text checked
  - rename
  - furniture add, move, rotate and remove
  - restoring version 1

## Phase 5: Simulate

**Tasks**

1. Port simui.js:
   - palette, block cards, every field type, `bindBuilder`
   - drag and drop (`startBlockDrag`, `moveBlockDrag`, `endBlockDrag`, insertion line, section highlight, auto-scroll)
   - presets and Undo
   - day timeline: `renderDayTimeline`, move and resize with 5-minute snap and the live time tooltip
   - checks panel: `refreshChecks`, `focusProblem`
   - runner: `runDays` yielding to the UI, `runScenario`, `runScenarioNow`, `runSweep`
   - `renderResults`, with “Ask the assistant why” hidden (planned difference 1)
   - history in `fi.simHistory.v1`: load, run again, delete, clear with Undo, compare with the trimmed diff
   - scenario `.json` import and download
2. Transport:
   - play, pause and restart
   - clock and live counts
   - timeline canvas (`dayRange`, `renderTicks`, rule-firing markers) and click to seek
   - speeds 1×, 10×, 60× and 300×, with 10× the default
3. The layout comparison dialog (`runCompare`, `quickMeans`), foot traffic, waiting-time dots.
4. Keep runs on the main thread with yielding, exactly as the reference does. A Web Worker is allowed later only if every test still passes.

**Gate:**

- Visual parity for scenario, results and history.
- End-to-end:
  - drag a palette block into its section
  - reorder a card
  - move and resize a timeline bar, and check the card fields update
  - load presets, then Undo
  - errors block the Run button
  - run Normal Tuesday on layout A: the verdict, numbers and ranges equal the golden summary
  - Flu Monday’s rule fires on 18 of 20 days
  - a range run and a history comparison
  - import and download a scenario `.json`

## Phase 6: Export

**Tasks**

1. Port export.js: `writeGLB`, `makeZip`, `crc32`, `buildExportModel`, `blenderScript`, `skillMd`, `readmeMd`, `planJsonExport`, `exportBundle`.
2. Export step UI: `renderExport` (stats from `quickMeans`, plan preview), the four output cards and the status line.
3. Downloads through the browser (planned difference 2).
4. Validate the output:
   - the GLB passes `gltf-validator` with 0 errors
   - the ZIP contains exactly the files in `contracts/export-bundle.md`
   - the node tree matches that file
   - if Blender is installed, run `blender --background --python build_in_blender.py -- clinic.glb clinic.blend` and confirm the file appears with one collection per room

**Gate:** show the validator report and the ZIP listing.

## Phase 7: WebGPU with WebGL2 fallback

**Tasks**

1. Move three.js to a pinned release that ships `three/webgpu`, at least 14 days old.
2. Re-run the visual tests on the WebGL path first, and fix regressions until the screenshots match the reference again.
3. Renderer factory:
   - when `navigator.gpu` exists and an adapter is available, use `WebGPURenderer` and await `init()`
   - otherwise use `WebGLRenderer`
   - same scene and materials either way
   - badge and tooltip per planned difference 3
4. Confirm every feature works on both renderers: InstancedMesh, shadows, CanvasTexture, Sprite with `sizeAttenuation: false`, transparent sorting by render order, fog, the data texture used by the heat map.

**Gate:**

- Visual tests pass in both modes: Chrome with WebGPU, and Chrome with WebGPU turned off.
- The guided tour holds at least 30 frames per second on a laptop with integrated graphics.

## Phase 8: Finish

**Tasks**

1. Accessibility: run axe on each step, and do one keyboard-only run through the whole flow.
2. Performance: check bundle size and time to first render, and lazy-load what can wait.
3. Team docs: `README.md` (setup, scripts, architecture), `CONTRIBUTING.md` (the parity rules), and deploy notes. The app is a static site: any static host can serve `dist/`, and a Nebius AI Cloud VM is optional.
4. A short `docs/INTEGRATION.md` for the teammates connecting the assistant, Module 1 and Module 2. List the functions and elements each will hook into: the drawer in `#assistant`; `importPlan` and the pipeline card for Module 1; `runChecks` and `renderChecks` for Module 2.

**Gate:** the full test suite is green. Hand over the final screenshots and a demo checklist for the 3-minute video.

---

## Screenshot states

Each state starts from the given hash. Then apply the actions and freeze: reduced motion, day paused, `seek(90)`. `tools/capture-reference.mjs` implements all of them. For the reference it also applies planned differences 1 and 2 just before each screenshot: the placeholder drawer, the two assistant buttons hidden, the download buttons enabled and their note hidden.

| Name | Start | Actions |
|---|---|---|
| import-empty | `#import` | none |
| import-loaded | `#import` | click `#openPipeline` |
| review | `#review` | wait for the 3D |
| review-dock-open | `#review` | click `#pdPill` |
| review-room-card | `#review` | open the dock, click room `exam_room_3` on the plan |
| review-tour | `#review` | `startTour(3)` (Exam 5), let it reach the stop |
| review-full-walls | `#review` | click `[data-walls="full"]` |
| edit-swap | `#edit` | open the dock, click `nurse_station_1` then `exam_room_5` on the plan |
| edit-rename | `#edit` | click `[data-tool="rename"]`, then `exam_room_1` on the plan |
| edit-furniture | `#edit` | click `[data-tool="furniture"]`, then `[data-place="bed"]` |
| simulate-scenario | `#simulate` | none |
| simulate-custom | `#simulate` | `loadPreset('custom')` |
| simulate-results | `#simulate` | `runScenarioNow()` |
| simulate-results-flu | `#simulate` | `loadPreset('flu')`, `runScenarioNow()` |
| simulate-history | `#simulate` | run Normal Tuesday, then Flu Monday, select both, click `#histCompare` |
| compare-layouts | `#simulate` | `runScenarioNow()`, then `runCompare()` |
| export | `#export` | none |
| assistant | `#review` | click `#assistantBtn` |

## Visual tolerance

- **Outside the 3D canvas:** at most 0.1% of pixels may differ (pixelmatch threshold 0.1).
- **Inside the 3D canvas:** GPUs and drivers differ, so up to 3% of pixels may differ (threshold 0.2). Composition, colors and positions must still match by eye. Show the user any 3D diff over 1%.
