# Deviations log

Write down here anything in the port that would differ from `design/reference.html`, before changing it. Wait for the user’s answer, and record the decision.

| # | Where | Reference does | Port would do | Why | Decision |
|---|---|---|---|---|---|

## Open questions found while preparing the handoff

These are small inconsistencies in the reference. Keep the reference behavior unless the user decides otherwise.

1. **3D hint line.** On load it reads “Drag to turn, scroll to zoom, right-drag to pan. Click a room for details, double-click to zoom in.” After switching camera modes and coming back to Overview, `setView` writes “Drag to turn, scroll to zoom, right-drag to pan, double-click a room to zoom in.” The first wording also mentions clicking a room for details, which works. Ask whether `setView` should use the first wording.
2. **Plan checks in Simulate.** The checks are about the plan, not the day, and were once suggested for Review. They currently sit in a collapsed section of the Results panel. Keep them there unless the user says otherwise.
3. **People dots on the 2D plan block room clicks.** (Found in Phase 0.) In `#planPeople`, each person is an SVG circle drawn over the rooms and it takes pointer events, so a click on a dot doesn’t reach the room under it. With the day paused at load (reduced motion), a nurse’s dot sits on the center of `exam_room_5`, and clicking the room’s center does nothing. The port keeps this. `tests/visual/capture.ts` clicks that room’s upper-left quarter instead, which reaches the same state. A possible fix later is `pointer-events: none` on `#planPeople`; ask before changing it.

## Where the written spec and the reference disagree

The reference wins (CLAUDE.md), so the port follows it. Listed here so the spec can be corrected.

1. **Toast duration.** (Found in Phase 2.) `design/UI-SPEC.md` section 1 says a toast stays 4 seconds. The reference’s `toast()` hides it after 3.6 seconds (`toastAction`, with Undo, uses 7 seconds, as the spec says). The port uses 3.6 seconds.
