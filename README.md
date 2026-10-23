# Floorplan Intelligence: handoff for Claude Code

Everything Claude Code needs to build the Review, Simulate and Export app (Modules 3 and 4) from the approved preview, so the result looks and behaves the same as the design.

## How to start

1. Make an empty folder for the repo, unzip this bundle into it so `CLAUDE.md` sits at the top level, and run `git init`.
2. Install Node 20 or newer. Claude Code installs everything else in Phase 0. It needs internet for npm, for Playwright’s Chromium, and for the reference page, which loads three.js and its font from CDNs.
3. Open Claude Code in the folder and say:

   > Read CLAUDE.md and PLAN.md, then start Phase 0. Stop at each gate and show me the results.

4. At each gate, look at the screenshots and test results. Then say “approved, next phase”, or say what to change.

## What’s inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | Standing rules Claude Code loads every session |
| `PLAN.md` | Phases 0 to 9 with tasks and gates, the planned differences, screenshot states and tolerances |
| `design/reference.html` | The approved design: the full working preview in one file. Open it in a browser with internet. |
| `design/UI-SPEC.md` | Every screen, state, interaction and key piece of copy |
| `design/ui-inventory.md` | Every control’s id, class and data attributes |
| `design/design-tokens.md` | Colors for light and dark, type, shape and motion |
| `reference-src/` | The preview’s source files, plus a function-by-function port map |
| `contracts/` | plan.json v0.1, scenario.v1 (generated from the block registry), the export bundle, browser storage |
| `samples/` | The three sample plans and seven scenarios: the presets, one using every block type, and two that exercise the checks |
| `tests/golden/` | Exact expected engine numbers, validation messages and the 2D drawing |
| `tools/` | `make-golden.mjs` regenerates or verifies golden data; `capture-reference.mjs` screenshots every state; `serve-reference.mjs` serves the reference |
| `docs/` | Architecture, decisions, and the deviations log, with two open questions |

## Not in this build

The app runs entirely in the browser, with no backend and no keys. The team connects these later:

- **The assistant:** the Assistant button and drawer are there, with a placeholder line.
- **Module 1, plans from the generator:** the pipeline card opens the bundled sample plan, and upload works.
- **Module 2, U.S. rule checks:** the five example checks stand in as placeholder data.

## Sharing with the team

Commit this whole folder together with the code. `design/`, `reference-src/`, `contracts/`, `samples/` and `tests/golden/` stay in the repo as the specification that the tests compare against.
