# Floorplan Intelligence

Brief in, building out. A local Nemotron model drafts floor plans, OR-Tools CP-SAT makes them valid, a rule checker cites what passed, and a WebGPU viewer reviews, simulates and exports them in 3D. Built for the Nebius × NVIDIA Global AI Hackathon 2026.

| Folder | What it is |
|---|---|
| [`aegis/`](aegis/) | AegisPlan: generation (Nemotron Nano 9B, FML-DSL), validation, CP-SAT repair, FastAPI |
| [`viz/`](viz/) | The viewer: 3D review, walkthroughs, clinic-day simulation, GLB/Blender export |
| [`contracts/`](contracts/) | How the two halves' plan formats map |
| [`docs/`](docs/) | Datacenter design and other docs |

**Plan and status: [PLAN.md](PLAN.md).** Datacenter extension: [docs/DATACENTER.md](docs/DATACENTER.md).

## Quick start

Needs Python 3.12, [uv](https://github.com/astral-sh/uv) and Node ≥ 20.

```bash
make setup
make test
```

Run each half:

```bash
cd aegis && .venv/bin/uvicorn aegisplan.server:app --port 8000   # API (works without model weights)
cd viz && npm run dev                                               # viewer on http://localhost:5173
```

Convert a generated plan for the viewer:

```bash
cd aegis && .venv/bin/python -m aegisplan.export_viz plan.json -o viz-plan.json
```

Then use Upload in the viewer.

Both projects came in with `git subtree`, so their history is in `git log -- aegis/` and `git log -- viz/`.
