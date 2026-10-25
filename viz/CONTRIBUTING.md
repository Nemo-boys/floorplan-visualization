# Contributing

This app is a port of an approved design. The rule that matters most: **it must look and behave like [design/reference.html](design/reference.html)**. The tests compare the app with the design all the time, so changes either keep parity or change the design first.

## The parity rules

1. **Keep the DOM.** Element ids, classes, data attributes and ARIA attributes stay as in the design. One set of end-to-end tests runs against both, and it finds elements by those names.
2. **Keep the CSS.** `src/styles/` is the design's stylesheet split at its comment headers. `tests/unit/shell-parity.test.ts` fails if the files, joined, differ from the design. Prettier doesn't touch these files.
3. **Keep the copy.** Every visible string is as in the design, with typographic quotes and apostrophes (’ “ ”) in visible text.
4. **Keep the numbers.** The engine is deterministic and `tests/golden/` holds the expected results. Don't change engine behavior to improve results.
5. **Keep the names.** Functions keep the design's names, so `reference-src/README.md` maps each one to its module.
6. **Planned differences only.** The only intended differences are in PLAN.md under “Planned differences from the reference”. For anything else that would differ (a fix, an improvement, a library limitation), write it in [docs/deviations.md](docs/deviations.md) first and get agreement before changing it.

`design/`, `reference-src/`, `contracts/`, `samples/` and the files in `tests/golden/` are the specification. Change them only together, and on purpose.

## Changing behavior on purpose

1. Agree on the change and log it in `docs/deviations.md`.
2. Change the design first: `reference-src/` and the matching `design/reference.html`.
3. If engine numbers change, run `node tools/make-golden.mjs` and commit the regenerated golden files with an explanation of the diff.
4. If the look changes, run `npm run reference` and `npm run capture:reference` to update `tests/visual/reference/`.
5. Port the change into `src/`, and run everything below.

## Before you commit

```sh
npm run check            # typecheck, lint, unit, parity and golden tests
npm run test:e2e         # the app
E2E_TARGET=reference npm run test:e2e   # the same tests on the design (needs internet)
npm run test:visual      # with npm run dev running
```

A full screenshot run takes about 20 minutes. To re-shoot a few states, set `CAPTURE_ONLY`, for example `CAPTURE_ONLY=review,export` before `npx tsx tests/visual/capture.ts http://localhost:5173/ tests/visual/output` and the same variable before `npx tsx tests/visual/compare.ts`.

## Style

- TypeScript in strict mode; no `any` except at third-party boundaries.
- Small pure functions in `src/engine/`, which has no DOM and no three.js.
- Plain DOM: no UI framework.
- Small commits with one topic each, for example `feat(engine): …` or `test: …`.
- Accessibility: every control reachable by keyboard, visible focus rings, ARIA as in the design, and `prefers-reduced-motion` respected. `tests/e2e/a11y.spec.ts` runs axe on every step and a keyboard-only pass.

## Test hooks

In dev and test builds, `window.__fi` exposes the design's page globals that the tests drive (`state`, `tour`, `setStep`, `importPlan`, `runScenarioNow` and so on). Tests reach them with `(window.__fi || window)`, which works on both the app and the design. Production builds don't include them.
