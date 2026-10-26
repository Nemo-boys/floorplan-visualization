# Demo script (3–4 minutes, both domains)

Setup: `make dev`, Chrome at http://127.0.0.1:8000 (clinic) and /datacenter. Generate once before recording (the first request loads the model). Cut model waits in the edit and say so on screen.

| Time | Say | Do |
|---|---|---|
| 0:00 | "A language model alone can't be trusted with a building: rooms overlap, corridors are too narrow, it ignores the brief. So we split the work." | Clinic, Import step, brief form. |
| 0:12 | "A fine-tuned Nemotron Nano 9B, running on this laptop, reads the brief and writes the room program under a grammar. A synthesizer places three variants; OR-Tools CP-SAT makes each one exact; a rule checker ranks them." | Default brief (6 exam rooms, nurse station), **Generate 3 plans**. *(cut the wait)* |
| 0:30 | "Every candidate shows which checks it passes: ADA clearances, FGI room sizes, IBC egress, each with its citation." | Point at "9 of 9 checks". **Open this plan**. |
| 0:40 | "Same geometry in 3D, in the browser, on WebGPU." | Review: orbit, click a room, start the guided tour for two stops. |
| 0:55 | "Does it work on a busy day? Pick the day, set the staff, run it." | Simulate: tap **Flu-season Monday**, press **Run 20 days**. The 3D plays the day. |
| 1:10 | "Busy, but it copes. Providers are the bottleneck. Let's ask." | Open the assistant: *"What if we add a nurse?"* It changes the day, runs it, answers with the new wait. |
| 1:30 | "Same day on the other two layouts: the centre entrance saves minutes per patient and kilometres of nurse walking." | *"Compare the layouts."* The table opens. |
| 1:45 | "Edits are plain language. The solver keeps what you asked for and moves the rest. And when something can't work, it says why." | Ask the plan generator: "Make the waiting room 20% bigger, keep the restrooms fixed" → new version. Then "250% bigger" → rooms in red with the reason. |
| 2:10 | "Now the same pipeline, a different building." | Switch to Data Center Studio. Type "20 MW AI factory, liquid cooled, N+1 cooling, 2N power". |
| 2:20 | "Three designs, every rack, cooler, UPS and generator placed; CP-SAT proves the layout; ten checks with sources." | Design: point at options, the CP-SAT card, flip the Heat and Power lenses. |
| 2:40 | "Break things. The grid goes down: generators take over. Worst day: a generator fails at 42 °C." | Test: tap **The grid goes down**, then **Worst day**; red rows appear; ask *"why?"* |
| 3:00 | "What it costs, and where every kilowatt-hour goes. Change the electricity price and everything updates." | Cost: build bar, Sankey, set 15¢. |
| 3:15 | "Export to Blender, or OpenUSD for Omniverse." | Download USD. |
| 3:25 | "Same model, same solver, same viewer. A new building type is a config pack, not a new product. All local, no API cost." | End on both apps side by side. |

## Backup plans

- No model or no GPU: the pipeline's model-off mode gives valid plans instantly (say "template program" on screen); the assistant uses its built-in mode.
- No server at all: both apps run as static sites with sample plans and in-browser data center generation.
