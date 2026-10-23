# Final screenshots

The app at the end of the build, in Google Chrome with WebGPU, 1440×900 (plus one in dark mode and one on a phone). They were taken by `tests/visual/capture.ts` with the day paused at 9:30 am. The magenta bars hide times and dates, which change from run to run.

| | |
|---|---|
| ![Import, after opening the pipeline plan](import-loaded.png) Import | ![Review](review.png) Review |
| ![Guided tour at Exam 5](review-tour.png) Guided tour | ![Editing: swapping two rooms](edit-swap.png) Edit: swap |
| ![The scenario builder](simulate-scenario.png) Scenario | ![Results for Flu-season Monday](simulate-results-flu.png) Results |
| ![Layouts compared on the same day](compare-layouts.png) Layout comparison | ![Export](export.png) Export |
| ![Review in dark mode](review-dark.png) Dark mode | ![Review on a phone](review-phone.png) Phone |

All 54 screenshot states, in three browsers, are produced by `npm run test:visual`, `test:visual:webgpu` and `test:visual:webgl`.
