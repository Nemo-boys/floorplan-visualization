# Browser storage

The app saves only these two keys in `localStorage`. Every read and write is wrapped in try/catch, and anything that doesn’t parse or doesn’t have the expected shape is ignored, falling back to the defaults.

## `fi.planDock.v1`: the floor-plan panel

```json
{ "open": false, "corner": "br", "w": 440, "h": 300 }
```

- `corner` is one of `tl`, `tr`, `bl`, `br`.
- `w` and `h` are re-clamped to the stage size every time the panel is laid out.
- Written on every change.

## `fi.simHistory.v1`: simulation runs

An array, newest first, with at most 30 entries:

```json
{
  "id": "r<base36 time>",
  "at": 1761129480000,
  "kind": "run",
  "name": "Normal Tuesday",
  "plan": { "name": "Primary care clinic", "version": 1 },
  "scn": { "schema": "fi.scenario.v1", "name": "...", "preset": "normal", "blocks": [] },
  "n": 20,
  "verdict": { "level": "good", "title": "Handles it", "bottleneck": { "name": "providers", "util": 0.72 } },
  "agg": { "seen": { "mean": 57, "lo": 54, "hi": 60 }, "avgWait": {}, "p90Wait": {}, "avgTime": {}, "nurseKm": {}, "turnedAway": {} },
  "sweep": null
}
```

- `kind` is `"run"` or `"range"`.
- For ranges, `sweep` is `{ "field": "nurses", "values": [1, 2, 3] }`.
- Only the listed `agg` keys are stored, each with `mean`, `lo` and `hi`.
- “Run again” recomputes everything from `scn` on the current plan.
