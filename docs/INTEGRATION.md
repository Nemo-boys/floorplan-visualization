# Integration

For the teammates connecting the assistant, Module 1 (the plan generator) and Module 2 (the U.S. rule checks). In this build all three are stand-ins, and there is no connection code. Each section lists what the stand-in does today, and the functions and elements to hook into.

This build has no backend and no API keys. Anything that talks to a model or another service needs that decision first.

## The assistant

**Today:** the Assistant button opens and closes a drawer that says “The assistant will be connected in a later version.” Two buttons that opened the chat in the design are in the page but hidden.

| Hook | Where |
|---|---|
| The drawer | `<aside class="drawer" id="assistant">` in [index.html](../index.html). The header (`h2` “Assistant”, `#chatClose`) stays; replace `p.assistant-later` with the chat |
| Open and close | `toggleChat(open?)` in [src/ui/assistant.ts](../src/ui/assistant.ts). It sets `.chat-open` on `#app`, `aria-pressed` on `#assistantBtn`, and resizes the 3D view |
| “Ask the assistant” (edit tools, under Bigger changes) | `#askBigger` in [index.html](../index.html), `hidden`. The design opens the chat with “Make the waiting room 20% bigger” typed in |
| “Ask the assistant why” (Results) | `#askWhy`, built in `renderResults` in [src/ui/simulate/results.ts](../src/ui/simulate/results.ts), `hidden`. The design sends “Why do patients wait in this scenario, and what would help most?” |
| The approved chat | [reference-src/ui3.js](../reference-src/ui3.js): `sendChat`, `CHAT_TOOLS`, `chatContext`, `chatRules`, `fallbackReply`, `SUGGESTIONS` and the functions around them; the drawer markup in [reference-src/shell.html](../reference-src/shell.html) (`#chatLog`, `#chatSuggest`, `#chatForm`, `#chatInput`, `#chatSend`, `#chatStop`, `#chatMode`). The chat CSS is already in [src/styles/11-assistant.css](../src/styles/11-assistant.css) |

**What a tool can call:** the design's chat tools map onto functions that exist in the port:

| Tool in the design | Port |
|---|---|
| Show a room | `focusRoom(room)` ([src/view3d/marks.ts](../src/view3d/marks.ts)), with `findRoom(text)` ([src/ui/edit.ts](../src/ui/edit.ts)) |
| Swap rooms | set `state.swapSel`, then `applySwap()` ([src/ui/edit.ts](../src/ui/edit.ts)) |
| Run a day | `applyOverrides`, `compileScenario`, `runDay`, `summarizeDays`, `verdictOf` ([src/engine/scenario.ts](../src/engine/scenario.ts)); or `runScenarioNow()` for the builder's scenario ([src/ui/simulate/runner.ts](../src/ui/simulate/runner.ts)) |
| Compare layouts | `compareRows(sc)`, `runCompare()` ([src/ui/compare.ts](../src/ui/compare.ts)) |
| Start the tour, change step | `startTour(i)` ([src/view3d/tour.ts](../src/view3d/tour.ts)), `setStep(name)` ([src/ui/stepper.ts](../src/ui/stepper.ts)) |

Numbers always come from the engine, never from the model (docs/DECISIONS.md, item 3).

## Module 1: the plan generator

**Today:** the “From the Module 1 pipeline” card on Import opens the bundled sample (Layout A) as “Primary care clinic”, version 1, with the change “Received from Module 1” and the note “Preview: a sample file stands in for Module 1’s output.” Bigger layout changes say they go to the plan generator.

| Hook | Where |
|---|---|
| The pipeline card | `.card.source` with `.inbox` and `#openPipeline` in [index.html](../index.html). The click is bound in `bindUI` in [src/ui/app.ts](../src/ui/app.ts): `importPlan({ kind: 'pipeline', key: 'A' })` |
| Loading a plan | `importPlan(src)` in [src/ui/versions.ts](../src/ui/versions.ts). A generated plan can come in as `{ kind: 'file', json, file }` today; a `pipeline` source with JSON instead of a sample key is a small change there |
| The plan format | plan.json v0.1, [contracts/plan.v0.1.schema.json](../contracts/plan.v0.1.schema.json). `adaptPlan` in [src/engine/plan.ts](../src/engine/plan.ts) is the only place to change if Module 1's format changes |
| Saving a change as a version | `commitVersion(change, mutate)` in [src/ui/versions.ts](../src/ui/versions.ts). Swaps (`swapInSpec`) work only on the sample layouts; generated changes should arrive as a new plan.json and become a new version |
| The deep link | Any hash except `#import` loads the pipeline sample first (`init` in [src/ui/app.ts](../src/ui/app.ts)) |

## Module 2: the U.S. rule checks

**Today:** five example checks computed from the plan by `runChecks`, shown in Results under “Plan checks” with “Example checks until Module 2 connects with the full U.S. rule set.”, counted on Export, and written into plan.json.

| Hook | Where |
|---|---|
| Computing checks | `runChecks(P)` in [src/engine/checks.ts](../src/engine/checks.ts). Each check is `{ id, label, pass, detail, source }` |
| When they run | `applyVersion` and `afterFurnitureChange` in [src/ui/versions.ts](../src/ui/versions.ts) set `state.checks` |
| Showing them | `renderChecks()` in [src/ui/simulate/results.ts](../src/ui/simulate/results.ts) fills `#checks` and `#checksSummary` (“5 of 5 example checks pass”). The section is `details.planchecks` in [index.html](../index.html), with the note |
| Export | the Checks stat in `renderExport` ([src/ui/export-step.ts](../src/ui/export-step.ts)), and `checks` in plan.json (`planJsonExport` in [src/export/bundle.ts](../src/export/bundle.ts)) |

If Module 2 runs elsewhere and answers asynchronously, keep the same check shape, set `state.checks` and call `renderChecks()` when the answer arrives. Where the checks should sit (Results or Review) is open question 2 in [docs/deviations.md](deviations.md).
