# Floorplan Intelligence

Brief in, building out. A local Nemotron model drafts floor plans, OR-Tools CP-SAT makes them valid, a rule checker cites what passed, and a WebGPU viewer reviews, simulates and exports them in 3D. Built for the Nebius × NVIDIA Global AI Hackathon 2026.

| Folder | What it is |
|---|---|
| [`aegis/`](aegis/) | AegisPlan: generation (Nemotron Nano 9B, FML-DSL), validation, CP-SAT repair, FastAPI |
| [`viz/`](viz/) | The viewer: 3D review, walkthroughs, clinic-day simulation, GLB/Blender export |
| [`contracts/`](contracts/) | How the two halves' plan formats map |
| [`docs/`](docs/) | Datacenter design and other docs |

**Plan and status: [PLAN.md](PLAN.md).** New session? Start at [handoff/](handoff/README.md). Datacenter extension: [handoff/DATACENTER.md](handoff/DATACENTER.md).

## Quick start

Needs Python 3.12, [uv](https://github.com/astral-sh/uv) and Node ≥ 20.

```bash
make setup
make test
```

Run the app (viewer + API, uses the local model if it's downloaded):

```bash
make dev        # http://127.0.0.1:8000
```

Data Center Studio is at http://127.0.0.1:8000/datacenter. Its assistant answers instantly from the app's own numbers with no model; to give it a real model (Nemotron, with tool calling), start the server with one of:

```bash
NVIDIA_API_KEY=nvapi-... make dev                       # build.nvidia.com, nvidia/nvidia-nemotron-nano-9b-v2
AEGIS_CHAT_URL=http://localhost:8001/v1 make dev        # your own vLLM / llama.cpp / NIM serving Nemotron
AEGIS_CHAT_MODEL=<model id>                             # optional: any OpenAI-compatible model with tools
```

The key stays on the server (`/api/chat` proxies and streams); the browser runs the tools. See `aegis/aegisplan/chat.py`.

Demo script: [docs/DEMO.md](docs/DEMO.md). Measured benchmark: [docs/BENCHMARK.md](docs/BENCHMARK.md) (`make bench`).

Or run each half on its own:

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
