# Deviations log

Write down here anything in the port that would differ from `design/reference.html`, before changing it. Wait for the user’s answer, and record the decision.

| # | Where | Reference does | Port would do | Why | Decision |
|---|---|---|---|---|---|

## Open questions found while preparing the handoff

These are small inconsistencies in the reference. Keep the reference behavior unless the user decides otherwise.

1. **3D hint line.** On load it reads “Drag to turn, scroll to zoom, right-drag to pan. Click a room for details, double-click to zoom in.” After switching camera modes and coming back to Overview, `setView` writes “Drag to turn, scroll to zoom, right-drag to pan, double-click a room to zoom in.” The first wording also mentions clicking a room for details, which works. Ask whether `setView` should use the first wording.
2. **Plan checks in Simulate.** The checks are about the plan, not the day, and were once suggested for Review. They currently sit in a collapsed section of the Results panel. Keep them there unless the user says otherwise.
