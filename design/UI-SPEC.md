# UI spec

This document describes what the approved design (`design/reference.html`) does, screen by screen, so nothing is missed in the port. The reference is the source of truth: when this text and the reference disagree, match the reference and note it in `docs/deviations.md`.

Strings in quotes are the exact visible copy. Ids and classes are listed in `design/ui-inventory.md`, and colors, type and motion in `design/design-tokens.md`.

---

## 1. Whole page

- **Frame:**
  - A top bar, a workspace grid below it, and an assistant drawer on the right that pushes the workspace left when it’s open (desktop).
  - Body text is 14.5px Atkinson Hyperlegible.
  - The page itself never scrolls; panels scroll inside.
- **Themes:**
  - Follows the system light/dark setting.
  - `html[data-theme="light"|"dark"]` forces either one. All colors come from the tokens.
  - The 2D floor plan is always drawn on a white sheet.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, CSS animations and transitions are off and the tour camera jumps instead of gliding.
- **Deep links:**
  - `#import`, `#review`, `#edit`, `#simulate`, `#export` open that step.
  - Any of them except `#import` first loads the Module 1 pipeline sample. `#edit` opens Review with editing on.
  - After that, changing step rewrites the hash (`history.replaceState`).
- **Saved in the browser:** only `fi.planDock.v1` (floor-plan panel position and size) and `fi.simHistory.v1` (simulation runs). See `contracts/storage.md`.
- **Toast:**
  - Appears at the top center under the bar for 4 seconds.
  - Toasts with an action (Undo) stay 7 seconds, and the button closes the toast and runs the action.

## 2. Top bar

- **Left:** “Floorplan Intelligence” (h1). Below it, the plan name in bold (`#planName`, “No plan yet” before import) and `#planVersion` (“Version N”, or “Start by importing a plan”).
- **Center: step tabs** “1 Import”, “2 Review”, “3 Simulate”, “4 Export” (`role="tablist"`).
  - A white highlight (`#glider`) slides under the selected tab: 280ms, `cubic-bezier(.3, .7, .2, 1)`.
  - The selected tab’s number is blue. Earlier steps show a green number (`.done`).
  - Every tab except Import is disabled until a plan is imported.
  - Left and right arrow keys move between enabled tabs.
- **Right:**
  - The renderer badge `#rendererBadge`: “WebGL2”, “WebGL1”, “3D off” or “Starting”, with a tooltip explaining it.
  - The Assistant button (chat icon and “Assistant”, `aria-pressed`), which toggles the drawer.
  - Under 560px wide, only the icon shows. Under 980px, the badge hides and the step tabs move to a second row and scroll sideways.

## 3. Step 1: Import

- **Heading:** “Bring in a floor plan”. **Lede:** “Plans normally arrive from the Module 1 pipeline. You can also upload a plan.json file or start from one of the sample layouts.”
- **Card “From the Module 1 pipeline”:**
  - Text: “New plans from the generator show up here.”
  - A blue inbox row with “plan_primary-care_v3.json” and “Primary care clinic, 18 rooms, received today at 10:42 am”, and the button “Open this plan”.
  - Note: “Preview: a sample file stands in for Module 1’s output.”
  - Opening loads sample Layout A under the name “Primary care clinic” as version 1, with the change text “Received from Module 1”.
- **Card “Upload a plan.json”:**
  - Text: “For a file you already have, such as one from your team.”
  - A dashed file drop with “Choose a plan.json file”.
  - A file that can’t be read shows: “Couldn’t read <file name>: <reason>. The page expects plan.json v0.1: rooms with "rect" or "polygon_mm", and doors with "center_mm".”
- **Card “Or start from a sample layout”:** three buttons, Layout A, B and C. Each shows a thumbnail of the plan (no labels), the name in bold, and “<blurb>. Nurses walk <n> m to the average exam room.”
- **After import, the summary card appears:**
  - A thumbnail on the left.
  - The name, then “<source>. <area> m² on a <W> × <D> m footprint”. The source is “From the Module 1 pipeline”, “Uploaded file” or “Sample layout”.
  - “What we read”, with a green check per row:
    - Rooms: “<n> rooms, including <k> exam rooms”
    - Doors: “<n> doors and openings”, or “None in the file, so a door to the corridor was added for each room”
    - Entrance: “On the <side> side, into the <room>”
    - Walls: “Worked out from the room edges”
    - Windows: “<n> on outside walls”
    - Furniture: “<n> items placed from the room types”
    - Waiting room: “<n> seats”
  - The button “Next: Review”.

## 4. Step 2: Review

### 4.1 Review bar

- **Title and hint:**
  - Not editing: “Review the plan”, with “Open the floor plan from the corner of the 3D view. Drag it to any corner, and drag its edge to resize it.”
  - Editing: “Editing the plan”, with “Click rooms on the floor plan or in the 3D view. Every change is saved as a new version.”
- **Buttons:**
  - “Edit plan”, which becomes a blue-outlined “Done editing” while editing (`aria-pressed`).
  - “Next: Simulate”, primary.

### 4.2 The 3D stage

The stage fills the workspace. Everything else on it is an overlay.

- **Top left:**
  - Segmented “Overview | Guided tour | Follow a patient | Walk”.
  - Segmented “Cut-away | Full walls”. Cut-away walls are 1.2 m tall, full walls 2.7 m; the tour always uses cut-away; walking and following use full walls.
- **Under the switches, a hint line that changes with the camera mode:**
  - On load: “Drag to turn, scroll to zoom, right-drag to pan. Click a room for details, double-click to zoom in.”
  - Overview after a mode change: “Drag to turn, scroll to zoom, right-drag to pan, double-click a room to zoom in.” On touch: “Drag to turn, pinch to zoom, double-tap a room to zoom in.”
  - Tour: “The camera visits every room. Use the controls below to pause or skip.”
  - Walk: “W A S D to walk, arrow keys or drag to turn, Esc to go back.” On touch: “Use the buttons to walk; drag to look around.”
  - Follow: “The camera follows one patient through their visit.”
- **Top right:** three round buttons. Zoom in and zoom out change the orbit distance ×0.78 and ×1.28, limits 5–90. “Show the whole building” fits the camera and clears the selection.
- **Hover tooltip (Overview only):** the room name in bold, “<area> m², <w> × <h> m”, then “Now: <people>” or “Empty right now”. While editing, a hint line is added (see 4.6).
- **Clicking rooms:**
  - A single click on a room in 3D selects it: outline and tint in the accent color, the room card opens, and the camera doesn’t move.
  - A double click zooms the camera to the room.
  - A click on empty ground clears the selection.
- **Room card:**
  - A liquid-glass card, bottom left, with a close button.
  - Contents: the room name; its purpose (for example “A nurse takes vitals first, then the provider sees the patient here.”); facts (area and size, and for exam rooms the distance from the nurse station and from the waiting room).
  - A live line in the accent color, updated every 0.7 seconds, for example “A nurse is taking a patient’s vitals.”, “The provider is seeing a patient.”, “Empty and ready for the next patient.”, “<n> patients are waiting to be called.”
  - Hidden during the tour and while editing.
- **Follow a patient:** a pill at the top center reads “Following a patient: <status>”, for example “Waiting in the lobby, 9 min so far”. It turns the day on if it was paused.
- **Walk on touch:** a six-button pad at the bottom left: “Turn”, “Ahead”, “Turn”, “Left”, “Back”, “Right”.
- **If 3D can’t start,** a notice in the middle says “The 3D view couldn’t load because the three.js script didn’t arrive. The plan, simulation and results still work.”, or “This browser couldn’t start WebGL, so the 3D view is off. The plan, simulation and results still work.”

### 4.3 Floor-plan panel (liquid glass)

- **Collapsed (the default):** a 190×50 pill at the bottom right with a small plan thumbnail, “Floor plan” and an up chevron.
- **Opening:** clicking the pill morphs it into a panel (default 440×300) in 560ms with a slight overshoot. The panel’s content fades in after 160ms.
- **Panel layout:**
  - A header with a grip, “Floor plan”, a hint and a collapse chevron. The hint reads “Click a room to fly there”, or while editing “Click two rooms to swap them”, “Click a room to rename it” or “Place furniture in the 3D view”.
  - The interactive plan.
  - The route switches:
    - “Patient path” (on by default), with “<n> m, to <exam room> and back”
    - “Nurse walks”, with “<n> m on average”
    - “Longest way out”, with “<n> m, from <room>”
  - Routes show on the plan and on the 3D floor.
- **Moving:** drag the header or the pill and it follows the pointer. On release it snaps to the nearest corner with a 420ms springy move from where it was dropped. Corner positions:
  - top left: below the camera switches (top 58px, left 12px)
  - top right: left of the zoom buttons (top 12px, right 56px)
  - bottom left and bottom right: 12px from the edges
- **Resizing:** a small diagonal handle on the inner corner. Width 280px up to the stage width minus 24px; height 200px up to the stage height minus 24px, or minus 82px when the panel sits at the top.
- **Effects on other overlays:** at the bottom left, the room card and tour caption move to the right. At the top left, the hint line hides.
- **When the tour starts** on a stage narrower than 760px, the panel collapses.
- **Saved** (open, corner, width, height) in `fi.planDock.v1`.
- **On the plan:**
  - Clicking a room flies the 3D camera to it, selects it and opens the room card.
  - People appear as dots, colored by role, every 140ms.
  - The current tour stop is outlined.

### 4.4 The 2D plan drawing

The plan is an SVG in centimetre units: 1 m = 100 units, with y pointing up in the plan.

- **Rooms:** filled by zone, using the plan palette. Hovering outlines a room in blue.
- **Furniture:** light outlines, with plants as circles.
- **Walls:** exterior 24 units thick, interior 12.
- **Windows:** two blue lines over a white gap.
- **Doors:** a leaf line plus a dashed swing arc.
- **Labels:** the room name in bold and the area below it. A label turns vertical when it doesn’t fit the room’s width and the room is taller than wide.
- **Dimensions:** width along the top and depth along the left, both in metres.
- **Entrance:** a blue arrow with “Entrance”.
- **Fixed output:** the same function makes the export SVG and the thumbnails, so `planSVG(layout A)` must match `tests/golden/plan2d-layout-a.svg` exactly.

### 4.5 Guided tour

- **Stop order (`tourStops`):**
  1. the entrance
  2. the waiting room, then reception
  3. exam rooms, nearest to the waiting room first
  4. nurse station, procedure room, lab, provider office, staff lounge, clean utility, soiled utility, storage, restrooms
  5. any other rooms except corridors
  6. the exit
- **Camera:**
  - It glides 2.4s (smoothstep) to a raised view from the room’s door side, looking in, then stays 6.5s with a slight sideways drift before moving on.
  - The entrance is viewed from outside. The exit stop shows the whole building.
  - The current room gets the accent outline and tint, and is outlined on the plan.
- **Caption (liquid glass, bottom left):**
  - Title, purpose, the live “now” line and facts.
  - Entrance: “Entrance”, “Patients come in here and head to the reception counter to check in.” and “<n> patients are inside right now.”
  - Exit: “That’s the whole clinic” (at the end) or “Back outside”, then “Every room connects to the entrance. The farthest room is <n> m from the exit (<room>).” and “<n> patients seen so far today.”
- **Tour bar (bottom center):** previous, a round play/pause, next, “Stop k of n”, and “End tour”. Previous is disabled at the first stop, next at the last.
- **Ending the tour** goes back to Overview at the current camera position, without a jump.

### 4.6 Editing (optional, from “Edit plan”)

- **Layout:** a 300px tools panel slides in on the left; the stage stays on the right. Editing opens the floor-plan panel (except with the furniture tool) and clears the review selection.
- **“What do you want to change?”:** segmented “Swap rooms | Rename | Furniture”. Switching tools clears the current picks.
- **Swap rooms:**
  - “Click two rooms on the same side of the corridor to trade their places.”
  - Picks show as chips: a number in a colored circle plus the room name. The first is blue (`#2453d6`), the second orange (`#e0592a`). Before any pick: “Click the first room, on the floor plan or in the 3D view.” After one pick: “Now click the room to swap it with.”
  - With two valid picks, a preview: “If you swap them:” “Nurse walk to the average exam room: <a> m to <b> m” and “Longest patient journey: <a> m to <b> m”.
  - Refusals, shown in red:
    - “Pick two rooms on the same side of the corridor.”
    - “The waiting room and reception stay where they are, because the entrance and check-in counter depend on them.”
    - “Pick two different rooms.”
    - For uploaded plans, the note: “Swapping works on the sample layouts. For your own plans, ask the assistant and the change goes to Module 1.”
  - Buttons: “Swap them” (disabled until a valid pair) and “Clear”.
  - After a swap, toast: “Swapped <a> and <b>, saved as version <n>.” If furniture had been added, it adds “ Added furniture was cleared because the rooms moved.”
- **Rename:**
  - “Click a room on the plan to rename it.”
  - A picked room shows a text box with its current name and “Save name”. Enter also saves.
  - Toast: “Renamed <old> to <new>.” A new version is saved.
- **Furniture:**
  - “Pick an item, then click inside a room in the 3D view. Drag to move it, R to rotate. Walking routes go around it.”
  - A palette of six: Bed, Chair, Desk, Plant, Cabinet, Screen.
  - A placed item can be selected, which shows a bar with its name, “Rotate” and “Remove”. R rotates, Delete or Backspace removes, Esc cancels placing.
  - Refusals, as toasts:
    - “Place furniture inside a room.”
    - “That doesn’t fit inside <room>. Try rotating it with R.”
    - “Keep doorways clear: that spot is right in front of a door.”
    - “That spot would block the way through a door or into a room, so it was put back.”
  - Adding or removing an item saves a version.
- **Bigger changes:** “Resizing, adding or removing rooms goes to the plan generator (Module 1).” In the reference, the button “Ask the assistant” opens the chat with “Make the waiting room 20% bigger” typed in. In this build the button stays in the markup but is hidden (planned difference 1).
- **Versions:**
  - Newest first. Each row shows “v<n>”, the change, the time, and either the tag “Current” or a “Restore” button.
  - Restore shows a toast “Restored version <n>.”
  - Making a change after a restore drops the newer versions.
- **Done editing:**
  - The button closes the tools.
  - Toast: “Editing closed. The plan is now at version <n>.”
- **Picks in 3D:**
  - **Picked rooms:** a tinted volume up to the wall height, a thick outline, and a pulsing floor tint, with a floating label that always stays readable (a number in a white circle, then the room name). Renaming uses green (`#11806a`) and the label “Renaming <room>”.
  - **Hover preview:** the room under the pointer lights up in the color it would get. Grey (`#8a96a3`) means the swap isn’t allowed.
  - **Tooltip hints:**
    - “Click to pick this room first”
    - “Click to swap with <room>”
    - “Can’t swap: <reason>”
    - “Click again to unselect”
    - “Pick a room, not the corridor”
    - “Click to rename this room”
    - “Click to start a new pair”
  - **On the 2D plan:** picks show the same colors, with numbered badges.

## 5. Step 3: Simulate

### 5.1 Simulate bar

- **Tabs:** “Scenario | Results | History”. History shows a count badge.
- **Scenario name:** “Scenario” then the name in an inline text box, up to 60 characters.
- **Buttons:** “Import .json” (a file picker), “Download .json”, and “Looks good: finalize” (primary, goes to Export). The first two hide under 980px.

### 5.2 Scenario tab (three columns: 236px, flexible, 300px)

- **Palette (left):**
  - “Blocks”, with “Drag a block into the scenario, or click it to add it.”
  - Groups: Day, People, Patients, Visits, Timeline, Rules. Each chip has a tinted icon, a name and a one-line description.
  - **Dragging:** after 6px of movement, a colored ghost chip follows the pointer, the block’s own section is highlighted, an insertion line shows where it will land, and the canvas scrolls near its edges.
  - **Click** adds the block at the end of its section.
  - Adding a second copy of a one-only block shows “This scenario already has “<label>”.” and highlights the existing card.
  - **Smart defaults for new blocks:**
    - a new staff shift picks the first missing role (3 providers, 2 nurses, 1 receptionist)
    - a closed room picks the first exam room
    - a new visit type is “Standard visit” at 100% if it’s the first, otherwise “Visit type <n>” at 20%
- **Canvas (middle):**
  - **Presets row:** “Start from” with chips “Normal Tuesday”, “Flu-season Monday”, “Short-staffed day” and “Custom”. The active chip is filled, with a small “edited” tag once changed. Loading a preset over edits shows “Loaded “<preset>”. Your edits were replaced.” with Undo.
  - **Day timeline:** sticky at the top of the canvas.
    - Lanes: Staff, Arrivals, Changes, Rules, with hour ticks across the opening hours.
    - Bars use the block’s color. Breaks are dashed. Group arrivals are dots with a label. Empty lanes show a hint, for example “Add a staff shift”.
    - Drag a bar to move it (its length stays). Drag either edge to resize it. Movement snaps to 5 minutes, stays within opening hours, and is at least 5 minutes long.
    - While dragging, a dark tooltip shows the times, and the card’s fields update live.
    - Clicking a bar without dragging scrolls to its card and flashes it.
    - After a run, amber triangles mark when rules fired on the day shown.
  - **Sections:** Day, People, Patients, Visits, Timeline, Rules. Each header shows the name, a hint and a count. Empty sections show a dashed drop area: “Drag a block here from the list, or click one”.
- **Block cards:**
  - A left border in the block’s color (staff shifts use the role color), a drag grip (not on one-only blocks), the icon, the name, and a one-line summary that updates as you type.
  - **Actions:** an on/off switch, copy, remove, and fold. Required blocks (Opening hours, Run settings, Visit steps) have only fold. One-only blocks have no copy.
  - Removing shows “Removed “<label>”.” with Undo.
  - **Fields** sit in a grid. Types: whole numbers, percent (with a % sign), time (5-minute steps), dropdown, text, a range pair (“<a> to <b>”), switch, and room. Every block type, field, limit and default is in `BLOCK_TYPES` and `contracts/scenario.v1.schema.json`.
  - Fields that only matter for “call in extra staff” (who, how many, arrives after) hide for “stop taking walk-ins”.
  - **Problems:** a field with an error gets a red border, and the card lists its problems under the fields.
- **Checks panel (right):**
  - **Status box:**
    - green “Ready to run”, with “Everything checks out.”
    - amber “Ready to run”, with “<n> warning(s), which won’t stop a run.”
    - red “<n> problem(s) to fix”, with “Running is blocked until these are fixed.”
  - **Problems list:** clicking one opens its card and focuses the field.
  - **Summary:**
    - “About <n> patients, open <time> to <time>”
    - the staff counts
    - the extras (breaks, staff out, room closed, group arrivals, rules), or “No breaks or changes during the day”
  - **“Run <n> days” button:** large and primary. It’s disabled while there are errors or a run is in progress, and reads “Running…” during a run, with a progress bar and “Simulating day <k> of <n>…”.
  - **“Try a range of values”** (collapsible):
    - “Runs the scenario once for each value, 10 days each, and compares them.”
    - **Change:** Nurses, Providers, Receptionists or Patients per day.
    - **Values:** defaults “1, 2, 3”; for receptionists “1, 2”; for patients “40, 60, 80, 100”. Two to six distinct values; whole numbers 1–10 for staff, 1–200 for patients.
    - “Run the range”.

### 5.3 Running

- Days run in sequence with different random arrivals (`daySeed`), yielding to the page every two days.
- The summary gives the mean and the 10th–90th percentile range per number, plus the “typical day”: the day whose average wait is closest to the median.
- The run is saved to History and the 3D replays the typical day from about 9:30 am. Then the Results tab opens.
- A range run saves one History entry, named “<scenario>: <field> <values>”, and replays the middle value.

### 5.4 Results tab (3D stage and transport on the left, a 370px panel on the right)

- **Meta:** the scenario name, then “<n> days on <plan>, version <v>”.
- **Verdict box:**
  - “Handles it” (green), “Busy, but it copes” (amber) or “Struggles” (red).
  - Then: “On a typical day the average wait is <x>, and 1 in 10 patients wait more than <y>. Across <n> days, average waits ranged from <lo> to <hi>.”
  - If patients were left over, it adds “On average <n> patients were still waiting when the staff went home.”
  - Rules: good if the 1-in-10 wait is at most 15 minutes and no walk-ins were turned away; busy if it’s at most 40; otherwise struggles. An average of 3 or more patients not seen forces struggles. Any average above 0.5 not seen downgrades good to busy.
- **“Busiest: <resource>”:**
  - “Busy <x>% of their time on shift.” (for exam rooms: “In use <x>% of the day.”), then “The lobby was fullest around <time> on the day shown, with <n> waiting.” or “The lobby never really filled up on the day shown.”
  - Bars for providers, nurses, reception and exam rooms, sorted high to low; the top bar is amber.
- **“Across <n> days”:** a two-column grid. Each tile shows the mean and a small “<lo> to <hi>” line:
  - Patients seen, Average wait, 1 in 10 waited over, Time in the clinic, Walking per nurse, Last patient leaves
  - when above zero: No-shows, Walk-ins turned away, Not seen before staff left
- **Rules:** one line each: “Fired on <k> of <n> days. <rule text>”.
- **Range results (after a range run):** a table of value, verdict pill, average wait, “1 in 10 over”, busiest; with “<n> days each. The 3D plays the middle value.”
- **Buttons:**
  - “Compare layouts with this scenario”
  - “Ask the assistant why”: hidden in this build (planned difference 1). In the reference it opens the chat and sends “Why do patients wait in this scenario, and what would help most?”
  - “Change the scenario”
- **“Watching the day”:** “The 3D plays the typical day from this run.”, the day message (“Day finished at <time> with <n> patients seen.”), and the switches “Foot traffic” and “Waiting-time dots” (on by default).
- **“Plan checks” (collapsed):** a summary (“5 of 5 example checks pass”) and each check with a pass/fail icon, detail and source, plus the note “Example checks until Module 2 connects with the full U.S. rule set.”
- **Before any run:** “No results yet”, with “Set up a scenario and run it. The answer shows up here, and the 3D plays a typical day.” and a button “Set up a scenario”.
- **Transport bar:**
  - a round play/pause and restart
  - the clock with “In clinic <n> Lobby <n> Seen <n>”
  - a timeline canvas: people in the clinic as a light blue area, the lobby in amber, progress in blue, rule firings as amber triangles
  - tick labels every two hours across the scenario’s hours
  - speed “1× | 10× | 60× | 300×”, with 10× the default
  - clicking the timeline jumps to that time
- **Compare layouts dialog:**
  - “Layouts compared on the same day”
  - A headline such as “Layout C needs 36% less nurse walking than Layout B on the same day.”
  - A caption: “<scenario>”, averaged over 5 days each: about <n> patients, <p> providers, <q> nurses.”
  - A table with Patients seen, Average wait, 1 in 10 waited over, Walking per nurse, Exam rooms in use, Longest patient journey and Longest way out. Each cell has a bar, and the best value in each row is green. The current plan’s column is marked “Yours”.
  - “Close”.

### 5.5 History tab

- **Header:** “History”, with “Every run is saved in this browser. Reload a scenario, run it again, or pick two to four runs to compare.” The buttons are “Compare selected (<n>)”, enabled at two or more, and “Clear history”, which shows Undo.
- **Rows, newest first, at most 30:**
  - a checkbox (a fifth selection shows “Compare up to 4 runs at a time.”)
  - the name; “<date>, <time> on <plan>, version <v>, <n> days” (plus “ per value” for ranges); and a facts line such as “57 patients, 3 providers, 2 nurses, 1 receptionist, 2 breaks”
  - the verdict pill, the average wait and the 1-in-10 wait
  - “Load scenario” (opens it in the builder, toast “Loaded “<name>” into the scenario.”), “Run again” (runs without adding a new entry), and delete
- **Comparison table:**
  - Rows: Verdict, Average wait, 1 in 10 waited over, Patients seen, Walking per nurse, Busiest, and “What’s different”. Best values are green.
  - “What’s different”: the first column says “The starting point”. Other columns list added blocks with “+” and removed ones struck through, up to eight lines, then “and <n> more changes”. Identical scenarios say “Same scenario”.

## 6. Step 4: Export

- **Heading:** “Finalize and export”, with “This version becomes the final plan. Take it to Blender or other 3D tools, or keep the data for your team.”
- **Final plan card:**
  - the name
  - “Version <n>: <change>”
  - six stats: Rooms, Floor area, Checks, Average wait (with the scenario name), Walking per nurse, Longest patient journey
  - the plan drawing
- **Output cards:**
  - **“Everything, ready for Blender”:** “Download .zip”, the file name (“<plan-slug>-v<n>.zip”) and a contents list (clinic.glb; plan.json and plan.svg; build_in_blender.py; the Claude skill).
  - **“Plan data”:** “Download .json”.
  - **“2D drawing”:** “Download .svg”.
  - **“Send to a GitHub repository”:** a disabled “Planned” button, with “Pushes this export into a folder in your repo. Planned for the real build.”
- **Status line:** “Preparing <file>…”, “Saved <file>.”, “Download cancelled.” or the error.
- **Downloads:** the buttons are always enabled and use the browser’s normal download (planned difference 2).
- Bundle contents and formats: `contracts/export-bundle.md`.

## 7. Assistant drawer (placeholder in this build)

- **Button:** “Assistant” in the top bar opens and closes the drawer, as in the reference (`aria-pressed`, the workspace shifts left on desktop, full width under 980px).
- **Drawer content:** only this markup inside `<aside class="drawer" id="assistant">`:

```html
<header><h2>Assistant</h2><button type="button" class="btn small ghost" id="chatClose">Close</button></header>
<p class="assistant-later">The assistant will be connected in a later version.</p>
```

- **Added CSS:** `.assistant-later { margin: 0; padding: 16px 14px; color: var(--ink-2); font-size: 13.5px; }`
- **Close** closes the drawer.
- **No messages, suggestions, input, mode line or tools.** The two buttons that opened the chat elsewhere are hidden (sections 4.6 and 5.4).
- **Later:** the approved chat design (log, suggestions, input, tools, built-in answers) is in the reference, in `reference-src/ui3.js` (`sendChat` and the functions around it), for whoever connects the assistant.

## 8. Keyboard

| Key | Action |
|---|---|
| Esc | Cancel placing furniture, otherwise deselect, otherwise end the tour, otherwise go back to Overview |
| R | Rotate the selected furniture (while editing) |
| Delete, Backspace | Remove the selected furniture |
| W A S D, Q E, arrow keys | Walk and turn in Walk mode |
| Left and right arrows on the step tabs | Move between enabled steps |

## 9. Small screens (980px and below)

- **Top bar:** wraps; the step tabs scroll sideways.
- **Review:** while editing, the tools panel sits above the stage. The camera switches scroll sideways, and the zoom buttons and hint line hide.
- **Simulate:**
  - Scenario stacks bar, checks, canvas, then palette.
  - Results stacks bar, 3D, transport, then panel.
  - History rows drop the number columns.
- **Import and Export:** single column.
