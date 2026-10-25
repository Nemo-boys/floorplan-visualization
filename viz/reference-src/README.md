# reference-src

The approved preview, split into its source files. `design/reference.html` is these files concatenated into one script inside `shell.html`, in this order: engine.js, view.js, plan2d.js, export.js, simui.js, ui3.js. They replace the placeholders `/*__ENGINE__*/`, `/*__VIEW__*/`, `/*__PLAN2D__*/`, `/*__EXPORT__*/`, `/*__SIM__*/` and `/*__UI__*/`. All files share one global scope, which is why functions call each other freely. The port turns that into explicit imports.

Read-only: change these only together with `design/reference.html`, and with the user’s go-ahead.

## Port map

Every top-level name below should exist in the port under the same name, unless it’s noted as merged or moved. Tick them off as you go.

### engine.js → src/engine/*

Plan adapter, sample layouts, furniture planner, walkable grid, walls, windows, door gaps, pathfinder, plan analysis, the simulator, scenario blocks (registry, presets, checks, compiler, multi-day runs, verdict), plan checks, tour stops, room swaps, formatting. No DOM and no three.js.

`clamp`, `mulberry32`, `prettyLabel`, `makeSamplePlan`, `makePlanFromSpec`, `adaptPlan`, `doorOrient`, `sharedEdge`, `inferDoors`, `makeEntrance`, `itemRect`, `rectsOverlap`, `roomDoors`, `doorZone`, `roomFrame`, `snapDir`, `planFurniture`, `layoutWaiting`, `layoutReception`, `buildGrid`, `isFree`, `extractWalls`, `doorGaps`, `planWindows`, `cellXY`, `cellAt`, `stepOK`, `segmentClear`, `astar`, `makePathfinder`, `analyzePlan`, `posAt`, `parseScenario`, `fmtMin`, `explainResults`, `preparePlan`, `swapInSpec`, `runChecks`, `tourStops`, `fmtClock`, `fmtHM`, `roomLabel`, `ruleText`, `makeBlock`, `makeScenario`, `checkField`, `validateScenario`, `compileScenario`, `daySeed`, `runDay`, `summarizeDays`, `verdictOf`, `applyOverrides`, `CELL`, `ZONE_OF`, `TYPE_NAME`, `SAMPLE_SPECS`, `ITEM_SIZE`, `PLACEABLE`, `WINDOW_TYPES`, `BASE_SCENARIO`, `SCENARIOS`, `WALKIN_PATTERNS`, `LOCKED_TYPES`, `PURPOSE`, `ROLE_NAMES`, `ROLE_OPTIONS`, `roleName`, `hm`, `hmStr`, `BLOCK_GROUPS`, `BLOCK_TYPES`, `blockSeq`, `SCENARIO_PRESETS`, `DAY_KEYS`, `Heap`, `ClinicSim`

### view.js → src/view3d/* (plus `$`, `esc` and `toast` into src/ui)

three.js setup, textures and materials, scene building, furniture models, people, labels, routes, heat map, sun, cameras (orbit, walk, follow, tour), picking, hover tooltip, furniture placement, highlights, edit picks. `inwardDir` moves to src/engine.

`css`, `themeColors`, `lerpAngle`, `toast`, `showNotice`, `makeCanvas`, `texFrom`, `woodTex`, `speckleTex`, `carpetTex`, `gradientTex`, `chevronTex`, `labelTex`, `initThree`, `buildEnvironment`, `setSun`, `M`, `makeMaterials`, `geoCache`, `roundedBoxGeo`, `Bx`, `Cy`, `Rb`, `rot`, `Sp`, `mergeByMaterial`, `floorQuads`, `m2`, `buildItem`, `floorMatFor`, `clearRoot`, `buildScene`, `inwardDir`, `effectiveWalls`, `wallBoxes`, `doorLeaves`, `buildWalls`, `insideSide`, `buildFurniture`, `ribbonGeo`, `buildRoutes`, `buildHeat`, `heatRamp`, `paintHeat`, `buildLabels`, `buildSelection`, `pmat`, `capsule`, `makePerson`, `outsidePoint`, `updatePeople`, `fitCamera`, `applyOrbit`, `startWalk`, `lineOK`, `tryMove`, `updateWalk`, `pickFollow`, `patientStatus`, `updateFollow`, `setView`, `floorPoint`, `roomAt`, `pickPlaced`, `bindPointer`, `focusRoomAt`, `hover`, `hideTip`, `startPlacing`, `stopPlacing`, `moveGhost`, `placeAt`, `positionPlaced`, `selectItem`, `blocksDoor`, `commitPlaced`, `rotateSelected`, `removeSelected`, `stopPose`, `poseVec`, `startTour`, `beginTourMove`, `updateTour`, `nextTourStop`, `prevTourStop`, `syncOrbitFromCamera`, `endTour`, `highlightRoom`, `focusRoom`, `markLabel`, `buildMark`, `disposeMark`, `disposeMarkMaterials`, `setRoomMarks`, `setHoverMark`, `pulseMarks`, `esc`, `mq`, `reduceMotion`, `isTouch`, `SAMPLES`, `state`, `R3`, `W2`, `wx`, `wz`, `yawOf`, `BOX`, `FURN`, `SKIN`, `HAIR`, `SHIRTS`, `PANTS`, `WAIT_COLORS`, `orbit`, `walker`, `follow`, `ray`, `ndc`, `DIRS`, `PLACE_NAMES`, `tour`

### plan2d.js → src/plan2d/*

The SVG floor plan and its live overlays.

`planSVG`, `planOverlay`, `planPeople`, `PLAN_COLORS`

### export.js → src/export/*

GLB writer, ZIP writer, export model from the scene, Blender script, Claude skill and README texts.

`writeGLB`, `crc32`, `makeZip`, `concatF32`, `buildExportModel`, `blenderScript`, `skillMd`, `readmeMd`, `CRC_TABLE`, `FLOOR_EXPORT`, `ITEM_NAMES`

### simui.js → src/ui/simulate/*

Simulate: tabs, palette, block cards, drag and drop, presets, day timeline, checks panel, runner, results, history, scenario files.

`setSimTab`, `blockOf`, `safeSummary`, `markEdited`, `renderPresetChips`, `fillRoomDefaults`, `loadPreset`, `toastAction`, `renderPalette`, `fieldInput`, `cardColor`, `cardHTML`, `renderBuilder`, `updateCardSummary`, `syncCardFields`, `parseFieldValue`, `scheduleChecks`, `bindBuilder`, `smartDefaults`, `addBlock`, `insertBlock`, `moveBlock`, `focusCard`, `startBlockDrag`, `clearInsertLine`, `moveBlockDrag`, `cleanupBlockDrag`, `cancelBlockDrag`, `endBlockDrag`, `timelineLabel`, `renderDayTimeline`, `bindDayTimeline`, `refreshChecks`, `focusProblem`, `planTag`, `setProgress`, `runDays`, `playTypical`, `runScenario`, `runScenarioNow`, `parseSweepValues`, `runSweep`, `rng`, `renderResults`, `loadHistory`, `storeHistory`, `saveHistory`, `renderHistoryCount`, `scnFacts`, `renderHistory`, `bindHistory`, `compareHistory`, `bindScenarioFiles`, `initSimulate`, `BICON`, `bIcon`, `SVG_GRIP`, `SVG_COPY`, `SVG_TRASH`, `SVG_CHEV`, `SVG_WARN`, `TL_LANES`, `TYPE_COLORS`, `ROLE_COLORS`, `SWEEP_FIELDS`, `HISTORY_KEY`, `checkTimer`, `bDrag`, `tlDrag`, `fmtPct`

### ui3.js → src/ui/*

Shell and steps: versions, stepper, import, floor-plan panel, room card, tour captions, edit tools, transport, layout comparison, export step, assistant, key bindings, render loop, startup.

`findRoom`, `clonePlaced`, `planJsonFromVersion`, `applyVersion`, `commitVersion`, `afterFurnitureChange`, `importPlan`, `moveGlider`, `setStep`, `is3DVisible`, `is2DVisible`, `enterEdit`, `exitEdit`, `renderPlanHint`, `loadDock`, `saveDock`, `applyDock`, `setDockOpen`, `renderDockThumb`, `bindDock`, `onRoomTap`, `updatePlanHeader`, `renderImportSummary`, `facadeName`, `renderPlan2D`, `refreshPlanOverlay`, `onPlanRoomClick`, `roomFacts`, `roomNow`, `renderReviewInfo`, `updateRouteText`, `onTourStop`, `renderTourCaption`, `onViewChange`, `renderEditTools`, `syncEditMarks`, `onRoomHover`, `applySwap`, `applyRename`, `renderVersions`, `resetSim`, `seek`, `dayDone`, `buildKpis`, `updateLive`, `updateTransport`, `drawTimeline`, `dayRange`, `renderTicks`, `renderChecks`, `headlessDay`, `quickMeans`, `compareRows`, `runCompare`, `slug`, `renderExport`, `saveFile`, `planJsonExport`, `exportBundle`, `renderSuggestions`, `chatContext`, `chatRules`, `scenarioFrom`, `whatIf`, `toolSimulate`, `toolCompare`, `toolShowRoom`, `toolSwap`, `chatBubble`, `chatNote`, `fallbackReply`, `sendChat`, `updateChatMode`, `toggleChat`, `bindUI`, `rendererNote`, `applyTheme`, `resize`, `loop`, `initCapabilities`, `renderSampleThumbs`, `init`, `STEPS`, `ROLE_DOTS`, `caps`, `MARK`, `ICON`, `labelOf`, `norm`, `DOCK_KEY`, `KPIS`, `lastLive`, `tickKey`, `SUGGESTIONS`, `CHAT_TOOLS`, `last`

### Not ported in this build (the assistant comes later)

These belong to the chat and stay in `reference-src/ui3.js` for the teammate who connects the assistant: `SUGGESTIONS`, `renderSuggestions`, `chatContext`, `chatRules`, `whatIf`, `toolSimulate`, `toolCompare`, `toolShowRoom`, `toolSwap`, `CHAT_TOOLS`, `chatBubble`, `chatNote`, `fallbackReply`, `sendChat`, `updateChatMode`, and the `sample` part of `initCapabilities`.

`toggleChat` is ported, but only to open and close the drawer. The `downloads` part of `initCapabilities` is replaced by normal browser downloads.

### shell.html → index.html and src/styles/

The `<head>` (viewport, fonts), the `<body>` markup (ids, classes and data attributes unchanged), and the `<style>` block, moved unchanged into CSS files. The three.js `<script>` tag is replaced by the npm import of `three@0.159.0`.
