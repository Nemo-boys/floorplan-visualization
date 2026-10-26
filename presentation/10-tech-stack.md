# Technology stack

| Layer | Technology | Used for |
|---|---|---|
| Language model | **NVIDIA Nemotron Nano 9B v2** (hybrid Mamba-2 + Transformer) | Room programs, brief reading, plain-language edits, the assistant |
| Fine-tuning | QLoRA (PEFT, r = 32, α = 64), Hugging Face TRL, **GRPO / RLVR** with 4 verifiable rewards, Unsloth notebook on A100 | Teaching FML and spatial rules |
| Inference | **llama.cpp** via llama-cpp-python, GGUF Q4_K_M (5.5 GB), Apple Silicon Metal; or any OpenAI-compatible endpoint: **NVIDIA API catalog / NIM**, vLLM, OpenRouter | Local, private, no per-call cost |
| Constrained decoding | **GBNF grammar** (generated from the FML schema) inside llama.cpp | Every generated line parses |
| Optimisation | **Google OR-Tools CP-SAT** (NoOverlap2D, assumptions, unsat cores) | Exact geometry, infeasibility proofs |
| Geometry | Shapely (rewards), custom grid, BFS, A* | Overlap, connectivity, egress, walking paths |
| Backend | Python 3.12, **FastAPI**, Uvicorn, Pydantic v2, httpx (SSE streaming proxy) | API, model proxy, serving the apps |
| Frontend | **TypeScript (strict)**, Vite (multi-page), plain DOM, no UI framework | Both apps |
| 3D | **three.js 0.186, WebGPU** with WebGL2 fallback, InstancedMesh, render-on-demand | Clinic and data center 3D |
| 2D | SVG | Floor plans, charts (stacked bar, Sankey, lines) |
| Simulation | Custom discrete-event engine (event heap, seeded PRNG) | Clinic days |
| Thermal | Successive over-relaxation on a 600 mm grid | Data hall temperature estimate |
| Export | glTF/GLB writer, ZIP writer, Blender Python script, SVG, **OpenUSD (.usda)**, JSON, a Claude Code skill | Blender, Omniverse, any tool |
| Testing | Vitest (unit + golden), Playwright (e2e + visual diff), pytest, ESLint, `tsc --noEmit` | Correctness and design parity |
| Tooling | uv, npm, Make (`make setup`, `make dev`, `make test`, `make bench`), git subtree | One-command setup and run |
| Fonts | Inter; Atkinson Hyperlegible (reference look) | |

## NVIDIA technologies, specifically

- **Nemotron Nano 9B v2**: fine-tuned with QLoRA + GRPO and published; runs locally as GGUF; its native tool calling powers the assistant through the NVIDIA API catalog or a local server.
- **NIM / NVIDIA API catalog**: drop-in endpoint for the assistant and brief reader (`NVIDIA_API_KEY`).
- **Omniverse / OpenUSD**: data center designs export as USD with PointInstancers and custom attributes.
- **Data center content** is modelled on NVIDIA hardware classes: GB200 NVL72-class liquid racks (132 kW), HGX H200-class hybrid racks, L40S-class air racks.
