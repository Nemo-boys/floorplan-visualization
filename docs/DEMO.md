# Demo checklist: the 3-minute video

A script for recording the submission video, with what to click and what to say. The numbers are what the app shows for the sample plan (they're deterministic, so they'll be the same on the day).

## Before recording

- [ ] `npm run build && npx vite preview`, or the deployed site. Don't record the dev server: it's slower to start.
- [ ] Google Chrome, window at 1440×900 or larger, zoom 100%. The badge in the top bar should read **WebGPU** (a recent Chrome on a laptop with a GPU).
- [ ] Light mode, unless you want to show dark mode at the end.
- [ ] Fresh state: open DevTools > Application > Local storage and clear the site, so History is empty and the floor-plan panel starts collapsed. Or use a new guest profile.
- [ ] Notifications off, other tabs closed, mouse pointer visible.
- [ ] Do one practice run: the first 3D load and the first 20-day run are slower than later ones.

## The script (about 3:00)

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | **Import.** Point at the Module 1 card, click **Open this plan**. The summary appears: 18 rooms, 6 exam rooms, doors, entrance, windows, furniture, 17 seats. | “Plans arrive from our generator, Module 1. The app reads the rooms and doors, works out walls, windows and furniture, and checks it can walk every route.” |
| 0:20–0:55 | **Review.** Click **Next: Review**. Drag to turn the clinic. Open the **Floor plan** pill; turn on **Nurse walks**. Click **Guided tour**, let it visit two stops (Waiting, an exam room with a nurse taking vitals), then **End tour**. | “The plan in 3D, with people from a simulated day. The floor plan shows routes: nurses walk 12 m to the average exam room. The guided tour visits every room in the order a patient would.” |
| 0:55–1:25 | **Edit.** Click **Edit plan**. On the floor plan, click **Nurse station**, then **Exam 5**. The preview reads “Nurse walk to the average exam room: 12 m to 11 m”. Click **Swap them**, then **Restore** on v1 in the versions list (so the numbers below match). | “Small changes happen right here, with the effect shown before you commit. Every change is a version you can restore. Bigger changes go back to Module 1.” |
| 1:25–2:25 | **Simulate.** Click **Done editing**, then **Next: Simulate**. Show the blocks (staff shifts, appointments, breaks) and point at the day timeline. Don’t drag its bars before running, or the numbers below change. Click **Run 20 days**. Results: **Handles it**; on a typical day the average wait is 4.3 min and 1 in 10 patients wait more than 11 min. Then **Flu-season Monday** in Start from, **Run 20 days**: **Busy, but it copes**, and the rule that calls in a receptionist fired on 18 of 20 days. Click **Compare layouts with this scenario**. | “Scenarios are typed blocks, not free text, so every run is checked and reproducible. Twenty days, not one: you get a range and a typical day to watch in 3D. On a flu-season Monday the same clinic copes, but only because the rule calls in help most days. And the same day on the other layouts: the headline names the layout that needs the least nurse walking.” |
| 2:25–2:50 | **Export.** Close the comparison, click **Looks good: finalize**. Show the stats and the drawing, click **Download .zip**. If you have Blender, show the .blend with one collection per room (prepare it before recording). | “The final plan goes out as a Blender-ready bundle: a 3D model with each room as its own group, the plan data, the drawing, a Blender script and a Claude skill.” |
| 2:50–3:00 | Back to Review, the whole clinic in 3D. | “Floorplan Intelligence: plan, check, simulate and hand off a clinic, all in the browser.” |

## If something goes wrong

- **The badge reads WebGL2:** fine, everything works the same. WebGPU needs a recent Chrome or Edge, and HTTPS when it's not on localhost.
- **A run takes long:** the first run warms up; the second is faster. Range runs (“Try a range of values”) take longest; skip them in the video.
- **The floor-plan panel is in the way:** drag it to another corner, or collapse it with its chevron.
- **History has old runs:** clear local storage (see above), or use **Clear history** in the History tab.
