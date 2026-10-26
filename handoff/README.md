# Handoff: start here

For the next session. Written Oct 25, 2026, just after tag `v0.1-clinic` (`adafa4b`). **Submission: Fri Oct 30, 10:00 am PDT.**

| File | What's in it |
|---|---|
| [README.md](README.md) | This page: state, how to run, what's next |
| [WORK_LOG.md](WORK_LOG.md) | What was built, step by step, with the commits |
| [FINDINGS.md](FINDINGS.md) | What we learned: model behavior, bugs found, test baseline, traps |
| [NEXT.md](NEXT.md) | Step 6 (datacenter) broken into tasks, with file pointers |
| [DATACENTER.md](DATACENTER.md) | The datacenter design (moved here from `docs/`) |

The full plan and status are in [../PLAN.md](../PLAN.md), the source of truth. Update it as steps land.

## State in one paragraph

Steps 0–5 are done. A brief typed into the viewer's Import step goes to the live AegisPlan API. The fine-tuned Nemotron Nano 9B (local GGUF, Metal) drafts the room program under a grammar. A synthesizer lays out 3 entrance variants, CP-SAT repairs them, and 9 rule checks rank them. The plans open in the 3D viewer: review, walkthrough, clinic-day simulation, compare candidates, plain-language edits solved again by CP-SAT (red conflict marks when impossible), and export. The user tested all of this in Chrome and it works. **Next: Step 6, datacenter.**

## Run it

```bash
make setup     # once: Python 3.12 venv (uv) + npm install
make dev       # builds viz, serves viewer + API on http://127.0.0.1:8000
make test      # aegis pytest (49) + viz npm run check (101)
make bench ARGS=--no-model   # measured benchmark, seconds; without ARGS ~30 min with the model
```

- The model file is `aegis/checkpoints/nemotron_aegisplan_q4_k_m.gguf`. It's gitignored and already downloaded on this machine; `aegis/scripts/download_from_hf.py` fetches it (HF repo `VenuArvind/aegisplan-nemotron-nano-9b-gguf`).
- Without the file everything still works, with "Template" plans from the brief parser. Tests always run without it (`AEGISPLAN_DISABLE_MODEL=1` in `aegis/tests/conftest.py`).
- Viewer dev with hot reload: `cd viz && npm run dev` (port 5173, proxies `/api` to :8000; `FI_OFFLINE=1` turns the proxy off).
- The user tests in their own Chrome. Give them a URL and click-by-click steps.

## Working with this user

- Keep replies short. They asked for that more than once.
- Don't over-invest in evaluation now. The full benchmark run is deferred to Thu Oct 29.
- Use Haiku/Sonnet subagents when useful.
- Commit in small topical commits and push to `main` at https://github.com/Nemo-boys/floorplan-visualization.
- Viz parity: any visible change to the viewer is logged in `viz/docs/deviations.md` (rows 6 and 7 are ours). Golden sim numbers for samples A/B/C stay frozen.
