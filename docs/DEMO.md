# Demo script (clinic)

About 3 minutes. Everything runs on one laptop: `make dev`, then Chrome at http://127.0.0.1:8000. The datacenter beat is added in Step 6 (see [DATACENTER.md](DATACENTER.md)).

## Before recording

- `make dev` and wait for `Uvicorn running`. Open http://127.0.0.1:8000. The Import step should show the brief form. If it shows the stand-in inbox instead, the API isn't answering.
- Generate once before recording. The first request loads the model (about 10 s more); later ones are faster.
- Generation takes tens of seconds on a laptop (see [BENCHMARK.md](BENCHMARK.md)). Cut that wait in the video, and say it on screen.
- Use a fresh Chrome profile or clear the site's data, so History starts empty.

## Script

| Time | Say | Do |
|---|---|---|
| 0:00 | "A language model alone can't be trusted with a building: rooms overlap, corridors are too narrow, and it ignores the brief. We use the model for what it's good at, and a solver and a rule checker for the rest." | Import step, brief form visible. |
| 0:15 | "A fine-tuned Nemotron Nano 9B, running locally, reads the brief and drafts the room program under a grammar. A layout synthesizer places three variants and OR-Tools CP-SAT makes each one valid." | Keep the default brief (6 exam rooms, nurse station…), 24 × 14 m. Click **Generate 3 plans**. *(cut the wait)* |
| 0:35 | "Three candidates, ranked by the rule checks they pass: geometry, ADA clearances, FGI room sizes, IBC egress." | Point at the list: "9 of 9 checks pass · Nemotron". Click **Open this plan** on #1. |
| 0:45 | "This is the same plan in 3D." | Review step: orbit the 3D, click a room. Open the checks: each one cites its source. |
| 1:05 | "Does the layout work on a busy day? We simulate one: patients arrive, nurses and providers move through the rooms." | Simulate: pick the flu-season scenario, **Run 20 days**. Let the 3D play a few seconds. |
| 1:25 | "Same day, the other two candidates. The entrance and nurse station positions change the wait and how far the nurses walk." | **Compare layouts with this scenario**. Point at average wait and nurse walking for the three plans. |
| 1:45 | "Changes are in plain language. The solver holds what you asked for and moves the rest." | Review → Edit → **Ask the plan generator**: "Make the waiting room 20% bigger, keep the restrooms fixed". **Send**. A new version appears; the checks still pass. |
| 2:05 | "When a change can't work, it says why instead of making something up." | Send "Make the waiting room 250% bigger". The waiting room turns red; read the reason. |
| 2:25 | "Measured on 20 briefs: the model alone vs. the full pipeline." | Show the table in BENCHMARK.md. |
| 2:45 | "Export to GLB or Blender, all local, no API." | Export step: download the GLB. |

## If something goes wrong

- **No brief form:** the API isn't running. Restart `make dev`.
- **"Template" instead of "Nemotron" on the candidates:** the model file wasn't found (`aegis/checkpoints/*.gguf`). The plans are still valid; say so, or download the model with `aegis/scripts/download_from_hf.py`.
- **Generation is slow:** close other apps that use the GPU.
