# Control inventory

Every element in the reference markup that has an id, a role, a data attribute or that people interact with, in document order. Generated from `reference-src/shell.html`.

The port keeps the same ids, classes and data attributes, so the same end-to-end tests run against both the reference and the new app. Parts marked “filled by script” are built at runtime; see the matching render functions in reference-src.

## Top bar

- `<b>` `#planName` — “No plan yet”
- `<span>` `#planVersion`
- `<nav>` `#stepper` `.stepper` aria-label="Steps" role="tablist"
- `<span>` `#glider` `.glider`
- `<button>` aria-selected="true" data-step="import" role="tab" type="button" — “Import 1”
- `<button>` aria-selected="false" data-step="review" role="tab" type="button" — “Review 2”
- `<button>` aria-selected="false" data-step="simulate" role="tab" type="button" — “Simulate 3”
- `<button>` aria-selected="false" data-step="export" role="tab" type="button" — “Export 4”
- `<span>` `#rendererBadge` `.badge` — “Starting”
- `<button>` `#assistantBtn` `.btn.assistant-btn` aria-pressed="false" type="button" — “Assistant”

## Step 1: Import

- `<section>` `#importView`
- `<h2>` `#importTitle` — “Bring in a floor plan”
- `<button>` `#openPipeline` `.btn.primary` type="button" — “Open this plan”
- `<label>` `.filedrop` — “Choose a plan.json file”
- `<input>` `#fileInput` accept=".json,application/json" type="file"
- `<p>` `#fileMsg` `.small.error` hidden=
- `<button>` `.sample` data-sample="A" type="button" — “Layout A Lobby in the middle”
- `<span>` `#thumbA` `.thumb`
- `<small>` `#thumbTextA` — “Lobby in the middle”
- `<button>` `.sample` data-sample="B" type="button" — “Layout B Lobby at the west end”
- `<span>` `#thumbB` `.thumb`
- `<small>` `#thumbTextB` — “Lobby at the west end”
- `<button>` `.sample` data-sample="C" type="button" — “Layout C Nurse station among the exam rooms”
- `<span>` `#thumbC` `.thumb`
- `<small>` `#thumbTextC` — “Nurse station among the exam rooms”
- `<div>` `#importSummary` `.card.summary` hidden=
- `<div>` `#importThumb` `.thumb`
- `<h3>` `#importName` — “Plan”
- `<span>` `#importSource`
- `<span>` `#importArea`
- `<ul>` `#importRead` `.read`
- `<button>` `#importNext` `.btn.primary` data-next="review" type="button" — “Next: Review”

## Step 2: Review bar

- `<div>` `#reviewBar` `.reviewbar`
- `<b>` `#rbTitle` — “Review the plan”
- `<span>` `#rbHint` `.small.muted` — “Open the floor plan from the corner of the 3D view. Drag it to any corner, and drag its edge to resize it.”
- `<button>` `#editToggle` `.btn` aria-pressed="false" type="button" — “Edit plan”
- `<button>` `.btn.primary` data-next="simulate" type="button" — “Next: Simulate”

## Review: edit tools (shown only while editing)

- `<aside>` `#editTools` `.card.tools` aria-label="Edit tools"
- `<div>` `.seg.soft.full` aria-label="Tool" role="group"
- `<button>` aria-pressed="true" data-tool="swap" type="button" — “Swap rooms”
- `<button>` aria-pressed="false" data-tool="rename" type="button" — “Rename”
- `<button>` aria-pressed="false" data-tool="furniture" type="button" — “Furniture”
- `<div>` `#toolSwap` `.tool`
- `<p>` `#swapNote` `.small.muted` hidden= — “Swapping works on the sample layouts. For your own plans, ask the assistant and the change goes to Module 1.”
- `<p>` `#swapStatus` `.status`
- `<div>` `#swapPreview`
- `<button>` `#swapApply` `.btn.primary` type="button" — “Swap them”
- `<button>` `#swapClear` `.btn` type="button" — “Clear”
- `<div>` `#toolRename` `.tool` hidden=
- `<p>` `#renameHint` — “Click a room on the plan to rename it.”
- `<div>` `#renameRow` hidden=
- `<input>` `#renameInput` `.textfield` aria-label="New room name"
- `<button>` `#renameSave` `.btn.primary` type="button" — “Save name”
- `<div>` `#toolFurniture` `.tool` hidden=
- `<div>` `.palette` aria-label="Furniture to place" role="group"
- `<button>` aria-pressed="false" data-place="bed" type="button" — “Bed”
- `<button>` aria-pressed="false" data-place="chair" type="button" — “Chair”
- `<button>` aria-pressed="false" data-place="desk" type="button" — “Desk”
- `<button>` aria-pressed="false" data-place="plant" type="button" — “Plant”
- `<button>` aria-pressed="false" data-place="cabinet" type="button" — “Cabinet”
- `<button>` aria-pressed="false" data-place="screen" type="button" — “Screen”
- `<div>` `#selectionTools` `.seltools` hidden=
- `<b>` `#selectionName` — “Bed”
- `<button>` `#rotateBtn` `.btn.small` type="button" — “Rotate”
- `<button>` `#removeBtn` `.btn.small` type="button" — “Remove”
- `<button>` `#askBigger` `.btn` type="button" — “Ask the assistant”
- `<ul>` `#versions` `.versions`
- `<button>` `#doneEditing` `.btn.primary` type="button" — “Done editing”

## Review and Simulate results: 3D stage and its overlays (floor-plan panel, room card, tour, tooltip, walk pad)

- `<div>` `#splitArea` `.stage`
- `<section>` `#view3d` `.pane.card` aria-label="3D view"
- `<div>` `#view3dBody` `.pane-body`
- `<div>` `#view`
- `<div>` `.seg.glassbox` aria-label="Camera" role="group"
- `<button>` aria-pressed="true" data-view="orbit" type="button" — “Overview”
- `<button>` aria-pressed="false" data-view="tour" type="button" — “Guided tour”
- `<button>` aria-pressed="false" data-view="follow" type="button" — “Follow a patient”
- `<button>` aria-pressed="false" data-view="walk" type="button" — “Walk”
- `<div>` `.seg.glassbox` aria-label="Wall height" role="group"
- `<button>` aria-pressed="true" data-walls="cut" type="button" — “Cut-away”
- `<button>` aria-pressed="false" data-walls="full" type="button" — “Full walls”
- `<button>` `#zoomIn` `.iconbtn.glassbox` aria-label="Zoom in" type="button"
- `<button>` `#zoomOut` `.iconbtn.glassbox` aria-label="Zoom out" type="button"
- `<button>` `#zoomFit` `.iconbtn.glassbox` aria-label="Show the whole building" type="button"
- `<div>` `#caption` `.ov.caption.glassbox` hidden=
- `<h3>` `#capTitle` — “Entrance”
- `<p>` `#capPurpose`
- `<p>` `#capNow` `.now`
- `<ul>` `#capFacts` `.facts`
- `<div>` `#tourBar` `.ov.tourbar.glassbox` hidden=
- `<button>` `#tourPrev` `.iconbtn` aria-label="Previous stop" type="button"
- `<button>` `#tourPlay` `.round` aria-label="Pause the tour" type="button"
- `<button>` `#tourNext` `.iconbtn` aria-label="Next stop" type="button"
- `<span>` `#tourCount` `.count` — “Stop 1 of 1”
- `<button>` `#tourExit` `.btn.small.ghost` type="button" — “End tour”
- `<div>` `#tooltip` `.ov.tooltip.glassbox` hidden=
- `<div>` `#followChip` `.ov.followchip.glassbox` hidden= role="status"
- `<div>` `#placeHint` `.ov.placehint.glassbox` hidden= role="status"
- `<div>` `#walkPad` `.ov.pad` aria-label="Walking controls" hidden=
- `<button>` `.glassbox` aria-label="Turn left" data-pad="tl" type="button" — “Turn”
- `<button>` `.glassbox` aria-label="Walk forward" data-pad="f" type="button" — “Ahead”
- `<button>` `.glassbox` aria-label="Turn right" data-pad="tr" type="button" — “Turn”
- `<button>` `.glassbox` aria-label="Step left" data-pad="l" type="button" — “Left”
- `<button>` `.glassbox` aria-label="Walk back" data-pad="b" type="button" — “Back”
- `<button>` `.glassbox` aria-label="Step right" data-pad="r" type="button" — “Right”
- `<div>` `#notice` `.ov.notice.glassbox` hidden= role="status"
- `<p>` `#viewHint` `.ov.viewhint` — “Drag to turn, scroll to zoom, right-drag to pan. Click a room for details, double-click to zoom in.”
- `<div>` `#roomCard` `.ov.roomcard.liquid` hidden=
- `<button>` `#roomCardClose` `.iconbtn.sm.rc-close` aria-label="Close the room details" type="button"
- `<div>` `#roomInfo`
- `<aside>` `#planDock` `.plandock.liquid` aria-label="Floor plan" data-corner="br" data-open="false"
- `<button>` `#pdPill` `.pd-pill` type="button" — “Floor plan”
- `<span>` `#pdThumb` `.pd-thumb`
- `<div>` `#pdPanel` `.pd-panel`
- `<div>` `#pdHead` `.pd-head`
- `<span>` `#planHint` `.hint` — “Click a room to fly there”
- `<button>` `#pdCollapse` `.iconbtn.sm` aria-label="Collapse the floor plan" type="button"
- `<div>` `#plan2d` `.plan2d`
- `<ul>` `.routes.pd-routes` aria-label="Routes on the plan"
- `<label>`  — “Patient path”
- `<input>` `#rJourney` type="checkbox"
- `<span>` `#swJ` `.sw`
- `<small>` `#tJourney`
- `<label>`  — “Nurse walks”
- `<input>` `#rStaff` type="checkbox"
- `<span>` `#swS` `.sw`
- `<small>` `#tStaff`
- `<label>`  — “Longest way out”
- `<input>` `#rEgress` type="checkbox"
- `<span>` `#swE` `.sw`
- `<small>` `#tEgress`
- `<span>` `#pdResize` `.pd-resize` title="Drag to resize"

## Step 3: Simulate bar

- `<div>` `#simBar` `.card.simbar`
- `<div>` `.seg.soft.simtabs` aria-label="Simulation" role="tablist"
- `<button>` aria-selected="true" data-simtab="scenario" role="tab" type="button" — “Scenario”
- `<button>` aria-selected="false" data-simtab="results" role="tab" type="button" — “Results”
- `<button>` aria-selected="false" data-simtab="history" role="tab" type="button" — “History”
- `<span>` `#histCount` `.count`
- `<label>` `.scnname` — “Scenario”
- `<input>` `#scnName` aria-label="Scenario name" maxlength="60" type="text"
- `<label>` `.btn.small.filebtn` — “Import .json”
- `<input>` `#scnImport` accept=".json,application/json" type="file"
- `<button>` `#scnDownload` `.btn.small` type="button" — “Download .json”
- `<button>` `.btn.primary` data-next="export" type="button" — “Looks good: finalize”

## Simulate, Scenario tab: block palette (filled by script)

- `<aside>` `#palette` `.card.bpalette` aria-label="Blocks you can add"

## Simulate, Scenario tab: presets, day timeline, block sections (filled by script)

- `<section>` `#scnCanvas` `.card.canvas` aria-label="Scenario"
- `<div>` `#presetRow` `.presets`
- `<div>` `#dayTimeline` `.daytl` aria-label="The day at a glance. Drag a bar to move it, or drag its edges to change the times."
- `<div>` `#tlTip` `.tltip` hidden=
- `<div>` `#scnSections`

## Simulate, Scenario tab: checks and run

- `<aside>` `#checkPanel` `.card.checkpanel` aria-label="Checks and run"
- `<div>` `#chkStatus` `.chkstatus` role="status"
- `<ul>` `#chkList` `.chklist`
- `<div>` `#chkSummary`
- `<button>` `#runBtn` `.btn.primary.big` type="button" — “Run 20 days”
- `<div>` `#runProgress` `.progress` hidden=
- `<details>` `.sweep`
- `<summary>`  — “Try a range of values”
- `<label>` `.field` — “Change Nurses Providers Receptionists Patients per day”
- `<select>` `#swField` — “Nurses | Providers | Receptionists | Patients per day”
- `<label>` `.field` — “Values”
- `<input>` `#swValues` `.textfield` value="1, 2, 3"
- `<p>` `#swHelp` `.small.muted` — “Separate values with commas.”
- `<button>` `#sweepBtn` `.btn` type="button" — “Run the range”

## Simulate, Results tab: results panel

- `<aside>` `#simPanel` `.card` aria-label="Results"
- `<div>` `#resultsBody`
- `<p>` `#playNote` `.small.muted`
- `<p>` `#dayMsg` `.small`
- `<label>`  — “Foot traffic”
- `<input>` `#lyrTraffic` type="checkbox"
- `<label>`  — “Waiting-time dots”
- `<input>` `#lyrWaits` type="checkbox"
- `<details>` `.rsec.planchecks`
- `<summary>`  — “Plan checks”
- `<span>` `#checksSummary` `.small.muted`
- `<ul>` `#checks` `.checks`

## Simulate, Results tab: day timeline and playback

- `<div>` `#transport` `.card.transport` aria-label="Day timeline"
- `<button>` `#playBtn` `.play` aria-label="Play the day" type="button"
- `<button>` `#restartBtn` `.iconbtn.btn.restart` aria-label="Restart the day" type="button"
- `<span>` `#clock` `.clock` — “8:00 am”
- `<b>` `#liveIn` — “0”
- `<b>` `#liveWait` — “0”
- `<b>` `#liveSeen` — “0”
- `<canvas>` `#tl` aria-label="Day timeline. Click to jump to a time."
- `<div>` `#tlTicks` `.ticks`
- `<label>` `#speedLbl` — “Speed”
- `<div>` `.seg.soft` role="group"
- `<button>` aria-pressed="false" data-speed="0.0166667" title="Real time" type="button" — “1×”
- `<button>` aria-pressed="true" data-speed="0.1666667" title="One minute of the day every 6 seconds" type="button" — “10×”
- `<button>` aria-pressed="false" data-speed="1" title="One minute of the day every second" type="button" — “60×”
- `<button>` aria-pressed="false" data-speed="5" title="Five minutes of the day every second" type="button" — “300×”

## Simulate, History tab

- `<section>` `#historyView` `.card.history` aria-label="Earlier runs"
- `<button>` `#histCompare` `.btn.primary` type="button" — “Compare selected”
- `<button>` `#histClear` `.btn.ghost` type="button" — “Clear history”
- `<ul>` `#historyList` `.hlist`
- `<div>` `#histCompareBox`

## Step 4: Export

- `<section>` `#exportView`
- `<h2>` `#exportTitle` — “Finalize and export”
- `<h3>` `#exName` — “Plan”
- `<p>` `#exVersion` `.ver`
- `<dl>` `#exStats` `.stats`
- `<div>` `#exPreview` `.thumb`
- `<button>` `.btn.primary` data-export="zip" type="button" — “Download .zip”
- `<p>` `#exZipName` — “plan.zip”
- `<p>` `#exGlbNote` `.small` hidden= — “The 3D model needs WebGL, which didn’t start here, so the .zip has everything except clinic.glb.”
- `<button>` `.btn` data-export="json" type="button" — “Download .json”
- `<button>` `.btn` data-export="svg" type="button" — “Download .svg”
- `<button>` `.btn` type="button" — “Planned”
- `<p>` `#exDlNote` `.small.muted` hidden= — “Downloads aren’t available in this view. Open the artifact in Claude to save files.”
- `<p>` `#exStatus` `.status` role="status"

## Assistant drawer

In this build, keep only the drawer itself, its header and `#chatClose`, plus the placeholder line from `design/UI-SPEC.md` section 7. The chat controls below belong to the later integration and aren’t built now.

- `<aside>` `#assistant` `.drawer` aria-label="Assistant" hidden=
- `<button>` `#chatClose` `.btn.small.ghost` type="button" — “Close”
- `<div>` `#chatLog` `.chatlog`
- `<div>` `#chatSuggest` `.chips`
- `<form>` `#chatForm` `.chatform`
- `<textarea>` `#chatInput` aria-label="Message" placeholder="Ask or give feedback"
- `<button>` `#chatSend` `.btn.primary` type="submit" — “Send”
- `<button>` `#chatStop` `.btn.small` hidden= type="button" — “Stop”
- `<p>` `#chatMode` `.chatmode`

## Toast

- `<div>` `#toast` `.toast.glassbox` hidden= role="status"

## Layout comparison dialog

- `<section>` `#comparePanel` `.modal.glassbox` hidden= role="dialog"
- `<h2>` `#compareTitle` — “Layouts compared on the same day”
- `<button>` `#closeCompare` `.btn` type="button" — “Close”
- `<p>` `#compareHeadline` `.headline`
- `<p>` `#compareCaption` `.caption-line`
- `<table>` `#compareTable` `.cmp`

## Other

- `<div>` `#app` `.app.step-import`
- `<main>` `#workspace` `.workspace`
