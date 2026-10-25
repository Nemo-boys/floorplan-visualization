# AegisPlan: Neuro-Symbolic Healthcare Spatial Synthesis Engine
**Autonomous Architectural Engine for Geometrically & Institutionally Sound Healthcare Outpatient Facilities**  
*Trained on NVIDIA Nemotron Nano 9B v2 • Aligned with 4-Reward GRPO / RLVR • Accelerated via Apple Silicon Metal GGUF*

[![Hugging Face Models](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Merged%20Model-blue)](https://huggingface.co/VenuArvind/aegisplan-nemotron-nano-9b)
[![Hugging Face GGUF](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-GGUF%20Quantized-green)](https://huggingface.co/VenuArvind/aegisplan-nemotron-nano-9b-gguf)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🏥 Overview

Healthcare architecture is governed by stringent, non-negotiable statutory codes:
* **ADA Standards for Accessible Design** (Chapter 3 §304 Wheelchair Clearances & Chapter 4 §403/§404 Corridors and Doors)
* **FGI Guidelines for Design and Construction of Outpatient Facilities** (Exam rooms $\ge 11.15\text{ m}^2$, clean/soiled utility isolation)
* **IBC / NFPA-101 Life Safety Code** (Continuous means of egress and dead-end corridor limitations)

Pure autoregressive Large Language Models (LLMs) hallucinate overlapping rooms, non-compliant clearances, and disjoint circulation paths. Conversely, pure mathematical constraint solvers lack architectural intuition and cannot reason over flexible, natural-language clinical briefs.

**AegisPlan** bridges this divide with a **Three-Tier Neuro-Symbolic Cascade**:
1. **Tier 1 (Autoregressive Drafting):** Fine-tuned **NVIDIA Nemotron Nano 9B v2** (Mamba-2 Hybrid with LoRA $r=32$), aligned using **Stage 2 GRPO / RLVR** with 4 verifiable architectural reward functions, conditioned on compact **FML-DSL** (Floorplan Markup Language) with a 100mm modular decimeter grid.
2. **Tier 2 (Deterministic Code Auditor):** An analytical geometric and regulatory compliance engine auditing 9 machine-verifiable ADA, FGI, and IBC standards.
3. **Tier 3 (Combinatorial CP-SAT Repair):** A **Google OR-Tools CP-SAT** 2D interval packing solver that snaps coarse candidate layouts into **0.0% overlap, 100% code-compliant** floorplans in **under 15 milliseconds**—or extracts an assumption-based **Minimal Unsatisfiable Core** when requirements are physically contradictory.

---

## 🏛️ System Architecture

```
                       [Clinical Brief + Locked Spatial Boundaries]
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: CONSTRAINED NEURAL DRAFTING (NVIDIA Nemotron Nano 9B v2 GGUF)                 │
│  • Base Architecture: Hybrid Mamba-2 SSM + Transformer Attention (nemotron_h)         │
│  • Stage 1 SFT: Warmup supervised fine-tuning on certified outpatient layouts         │
│  • Stage 2 RLVR: Group Relative Policy Optimization (GRPO) with 4 Verifiable Rewards  │
│  • Logits Processor: FMLGeometricLogitsProcessor (masks illegal spatial tokens)       │
│  • Inference Backend: llama-cpp-python with Apple Silicon Metal GPU acceleration      │
│  • Throughput: 30+ tokens/second in unified memory (< 6 GB VRAM)                      │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: DETERMINISTIC REGULATORY AUDITOR (ADA, FGI, IBC)                              │
│  • ADA §404.2.3: Door clear width (≥ 915mm clinical, ≥ 815mm standard)                │
│  • ADA §403.5.1: Corridor minimum clearance (≥ 1830mm / 6 ft primary circulation)     │
│  • ADA §304.3: 1525mm (60-inch) wheelchair turning circle in all accessible rooms     │
│  • FGI §2.1-2.2: Exam rooms ≥ 11.15 m² (120 sq ft) with min dimension ≥ 3048mm       │
│  • FGI Section 2.1-3: Strict physical separation between clean and soiled utilities   │
│  • IBC Table 1017.2 & NFPA-101: Graph BFS travel distance ≤ 45,720mm (150 ft)         │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: COMBINATORIAL CP-SAT REPAIR & CONFLICT SOLVER (Google OR-Tools)               │
│  • 2D Interval Disjointness (AddNoOverlap2D) on 100mm modular grid                   │
│  • Locked Room Equality: Fixed boundary constraints preserved unconditionally          │
│  • Flush Wall Sharing: 4-way boolean disjunctive formulation for adjacent rooms       │
│  • Objective: Minimize L1 perturbation from neural layout (solves in 5–15 ms)         │
│  • Unsatisfiable Diagnostics: Assumption-based Minimal Unsatisfiable Core extraction  │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ DOWNSTREAM CONSUMERS (Single Shared Semantic Building Model: plan.json)               │
│  • 2D Interactive CAD Canvas (SVG with real-time room drag & lock toggles)            │
│  • 3D Three.js Walkthrough (WebGPU with WebGL2 fallback + patient & staff pathing)    │
│  • Regulatory Audit Matrix (Instant Pass/Fail telemetry with statutory citations)     │
│  • CAD Exports: Scalable Vector Graphics (SVG) & Industry Standard CAD DXF format     │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Stage 2 GRPO / RLVR (Reinforcement Learning with Verifiable Rewards)

Unlike standard RLHF relying on subjective preference models, AegisPlan uses **mathematically verifiable architectural rewards** evaluated directly against the generated spatial graph:

$$\mathcal{R}_{\text{total}} = w_1 r_{\text{format}} + w_2 r_{\text{overlap}} + w_3 r_{\text{connectivity}} + w_4 r_{\text{regulatory}}$$

1. **Format & Grammar Reward ($r_{\text{format}}$):**
   Verifies `<think>...</think>` chain-of-thought architectural reasoning and valid `<fml>...</fml>` boundaries matching the modular grammar:
   `BOUNDARY RECT 0 0 <W> <H>, ROOM <ID> TYPE <TYPE> RECT <X> <Y> <W> <H> [LOCKED|FREE], DOOR/FDOOR, END_PLAN`.
2. **Geometric Non-Overlap Reward ($r_{\text{overlap}}$):**
   Continuous Shapely 2D polygon intersection audit across all placed room intervals:
   $$r_{\text{overlap}} = \max\left(0.0, 1.0 - 8.0 \times \frac{\text{Area}_{\text{overlap}}}{\text{Area}_{\text{total}}}\right)$$
3. **Topological Connectivity Reward ($r_{\text{connectivity}}$):**
   Constructs the door adjacency graph and computes the ratio of rooms accessible from `OUTSIDE` via egress corridors.
4. **FGI & ADA Regulatory Compliance Reward ($r_{\text{regulatory}}$):**
   Directly tests FGI corridor minimum clearance ($\ge 1830\text{mm}$), ADA single-user restrooms ($\ge 4.84\text{ m}^2$ with dimension $\ge 2200\text{mm}$), and outpatient exam rooms ($\ge 11.15\text{ m}^2$).

---

## 📦 Published Model Checkpoints

All fine-tuned and quantized assets are published on the Hugging Face Hub:

| Repository | Format | Size | Description |
| :--- | :--- | :--- | :--- |
| [`VenuArvind/aegisplan-nemotron-nano-9b-gguf`](https://huggingface.co/VenuArvind/aegisplan-nemotron-nano-9b-gguf) | **GGUF Q4_K_M** | **5.5 GB** | Recommended local model for Apple Silicon Metal (30+ tok/s) |
| [`VenuArvind/aegisplan-nemotron-nano-9b-gguf`](https://huggingface.co/VenuArvind/aegisplan-nemotron-nano-9b-gguf) | **GGUF Q8_0** | **9.2 GB** | Near-lossless precision quantized GGUF |
| [`VenuArvind/aegisplan-nemotron-nano-9b`](https://huggingface.co/VenuArvind/aegisplan-nemotron-nano-9b) | **SafeTensors (BF16)** | **18 GB** | Standalone merged base + LoRA model with tokenizer & remote code |

---

## ⚡ Local Inference Engine (Apple Silicon Metal)

AegisPlan runs entirely locally on macOS without needing cloud APIs or external servers:

* **Backend:** `llama-cpp-python` with Apple Silicon Metal offloading (`n_gpu_layers=-1`).
* **RAM/VRAM Footprint:** ~5.8 GB Unified Memory (fits comfortably on M1/M2/M3/M4/M5 Macs with 16GB+ RAM).
* **Generation Throughput:** **30 to 45 tokens/second**.
* **Geometric Masking:** `FMLGeometricLogitsProcessor` intercepts logits in real-time, masking out invalid numerical coordinates during token generation to prevent boundary overruns before they happen.

---

## 🚀 Quickstart & Installation

### 1. Environment Setup
```bash
# Clone the repository
git clone https://github.com/VenuArvind/AegisPlan.git
cd AegisPlan

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies (includes llama-cpp-python and OR-Tools)
pip install -r requirements.txt
pip install -e .
```

### 2. Download the Fine-Tuned GGUF Model
Run the automated downloader to fetch `nemotron_aegisplan_q4_k_m.gguf` directly into `checkpoints/`:
```bash
python scripts/download_from_hf.py
```
*(No Hugging Face token required—the repository is public).*

### 3. Launch the Interactive Web CAD & 3D Walkthrough
```bash
uvicorn aegisplan.server:app --host 127.0.0.1 --port 8000
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser:
* **Interactive 2D CAD:** Drag rooms, resize partitions, toggle room locks, and re-solve with CP-SAT in real-time.
* **3D Three.js Walkthrough:** Real-time architectural extrusion with WebGPU (and WebGL2 fallback), rendering ceiling heights, ADA turning circles, and circulation path tracing.
* **Export Buttons:** Instant one-click export for `plan.json` building contracts and publication-ready 2D CAD SVGs.
* **Geometric Logits Toggle:** Enable or disable per-token spatial coordinate masking.

### 4. Run CLI Synthesis & Regulatory Audit
```bash
python -m aegisplan.inference_cli \
  --brief "Primary care clinic requiring central circulation corridor, 4 outpatient exam rooms (>= 11.15 m2), ADA restroom, and clean/soiled utility support." \
  --boundary-w 18000 --boundary-h 12000 \
  --out clinic_plan.json \
  --svg clinic_plan.svg
```

---

## 📊 Empirical Benchmarks & Ablation Study

Evaluated across **25 clinical briefs** (20 feasible complex outpatient clinics + 5 stress tests designed to induce geometric/code conflicts):

| System Variant | Syntax Validity | Pre-Repair Overlap | Post-Repair Overlap | ADA / FGI Pass Rate | Lock Preservation | Median Latency | Cost / Plan |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Baseline (Unconstrained JSON)** | 82.5% | 21.4% | 21.4% (no repair) | 36.0% | 62.0% | ~2.5s | $0.0004 |
| **2. + EBNF Grammar (`fml_dsl.ebnf`)** | **100.0%** | 14.8% | 14.8% (no repair) | 54.0% | 85.0% | ~1.7s | $0.0003 |
| **3. + Validator & CP-SAT Repair** | **100.0%** | 14.8% | **0.0%** | **100.0%** | **100.0%** | ~37 ms *(solver)* | $0.0009 |
| **4. + Nemotron Nano 9B GRPO (Ours)** | **100.0%** | **1.2%** | **0.0%** | **100.0%** | **100.0%** | **< 15 ms *(solver)*** | **$0.0000 (Local)** |

### 🔍 Conflict Core Diagnostics (Over-Constrained Stress Tests)
* **Diagnostic Rate:** **5 / 5 (100.0%)**
* For mathematically impossible briefs (e.g., placing 10 exam rooms in a 10m x 10m envelope or contradictory locked room anchors), CP-SAT activates assumption literals (`model.AddAssumptions()`) and extracts the **Minimal Unsatisfiable Core** in $<5\text{ ms}$, reporting the exact conflicting rooms without infinite solver loops or false completions.

---

## 📂 Repository Structure

```
AegisPlan/
├── aegisplan/                       # Core Python Package
│   ├── schemas.py                   # Pydantic v2 plan.json building contract schema
│   ├── fml_parser.py                # FML-DSL parser and serializer
│   ├── validator.py                 # ADA, FGI, and IBC healthcare code auditor
│   ├── cpsat_repair.py              # Google OR-Tools CP-SAT 2D geometric repair engine
│   ├── gguf_engine.py               # Local Apple Silicon Metal GGUF inference engine
│   ├── logits_processor.py          # Real-time geometric boundary & collision logits processor
│   ├── router.py                    # Multi-tier candidate router & Best-of-3 ranker
│   ├── server.py                    # FastAPI web application backend
│   ├── inference_cli.py             # End-to-end command line synthesis and evaluation CLI
│   ├── benchmark.py                 # 25-brief evaluation harness and ablation suite
│   ├── dataset_generator.py         # Synthetic clinic layout synthesizer
│   └── static/
│       └── index.html               # 2D CAD Canvas + 3D Three.js WebGPU/WebGL2 viewer
├── checkpoints/
│   └── nemotron_aegisplan_q4_k_m.gguf # Downloaded quantized Metal model (5.5 GB)
├── dataset/
│   ├── train.jsonl                  # 400 certified training examples
│   ├── val.jsonl                    # 50 validation examples
│   └── grpo_rlvr_prompts.jsonl      # 500 clinical prompts for Stage 2 RLVR
├── grammars/
│   └── fml_dsl.ebnf                 # Flat EBNF grammar with 100mm decimeter grid trick
├── notebooks/
│   └── aegisplan_unsloth_finetune.ipynb # End-to-end A100 training & GGUF export notebook
├── scripts/
│   ├── download_from_hf.py          # Automated Hugging Face GGUF model downloader
│   ├── push_to_hf.py                # Hugging Face publisher CLI
│   └── convert_merged_to_gguf.py    # Local llama.cpp converter script
└── tests/                           # Unit & integration test suite
```

---

## 📜 Regulatory Standards Implemented

| Rule ID | Standard & Citation | Requirement | Verification Method |
| :--- | :--- | :--- | :--- |
| **GEOM-BOUNDARY-01** | IBC Chapter 5 Standard Footprint | All room coordinates $x+w \le W$, $y+h \le H$ | Bounding polygon containment |
| **GEOM-OVERLAP-02** | Building Code Architectural Separation | Inter-room overlap area $= 0.0\text{ mm}^2$ | 2D interval disjointness (`AddNoOverlap2D`) |
| **ADA-404.2.3** | ADA Chapter 4 §404.2.3 Clear Width | Door width $\ge 915\text{mm}$ (clinical), $\ge 815\text{mm}$ (general) | Analytical opening verification |
| **ADA-403.5.1** | ADA Chapter 4 §403.5.1 / VA Guidelines | Corridor width $\ge 1830\text{mm}$ (6 ft minimum) | Axis-aligned width check |
| **ADA-304.3** | ADA Chapter 3 §304.3 Turning Space | Wheelchair circle $d \ge 1525\text{mm}$ (60 in) | Inscribed clearance circle check |
| **FGI-2.1-2.2** | FGI Guidelines Outpatient Facilities | Exam rooms $\ge 11.15\text{ m}^2$ (120 sq ft), min dim $\ge 3048\text{mm}$ | Dimension and polygon area check |
| **FGI-UTIL-SEP** | FGI Section 2.1-3 Infection Prevention | Clean & soiled utilities must never connect directly | Adjacency graph topology check |
| **IBC-1017-REACH** | IBC Chapter 10 / NFPA-101 Life Safety | 100% of rooms connected to exit corridor | Breadth-First Search (BFS) graph traversal |
| **IBC-1017-DIST** | IBC Table 1017.2 Exit Access Travel | Max travel distance $\le 45,720\text{mm}$ (150 ft) | Shortest path graph traversal |

---

## 👥 Acknowledgements

Built with **NVIDIA Nemotron Nano 9B v2**, **Google OR-Tools CP-SAT**, **FastAPI**, **Three.js**, **llama.cpp**, and **Hugging Face TRL/PEFT**.