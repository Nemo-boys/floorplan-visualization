# AegisPlan: Neuro-Symbolic Healthcare Spatial Synthesis
**Autonomous Engine for Geometrically & Institutionally Sound Floorplans**  
*Master Engineering & Implementation Plan — NVIDIA Hackathon*

---

## 0. Project Naming & Identity

To give the project a memorable identity for the NVIDIA Hackathon judges, we recommend **AegisPlan** as the primary title, with five strong alternatives depending on the pitch angle your team prefers:

1. **AegisPlan** *(Recommended)* — *Autonomous Engine for Geometrically & Institutionally Sound Floorplans*. Conveys clinical trust, regulatory code protection ("Aegis"), and precision engineering.
2. **Ortho Grid (or OrthoCore)** — Highlights the orthogonal 100mm modular grid, constrained decoding, and combinatorial solver core.
3. **VoxelCode (or ArchiCode)** — Bridges 2D semantic markup (`FML-DSL`), U.S. regulatory code compliance (ADA/FGI), and 3D WebGPU extrusion.
4. **NeMo-Draft** — Explicitly ties the NVIDIA **NeMo / Nemotron 3.5 Lightning** stack to architectural drafting and CAD automation.
5. **Medispace-SAT** — Emphasizes the healthcare outpatient clinic domain combined with deterministic **CP-SAT** combinatorial satisfaction.
6. **ClinicaLoom** — Evokes weaving complex clinical circulation paths (patient flow, staff routes, emergency egress) into a unified spatial fabric.

---

## 1. Executive Summary & Resolution of Open Team Decisions

**AegisPlan** is a local-first, privacy-preserving neuro-symbolic system that generates editable 2D clinical floorplans from natural-language briefs, mathematically verifies and repairs them against U.S. federal accessibility and healthcare standards (ADA, FGI, IBC/NFPA-101), and renders real-time 3D WebGPU/WebGL2 walkthroughs alongside clinical flow paths from a single shared semantic building model (`plan.json`).

Before writing code, the team locks in the following five architectural decisions based on empirical telemetry and domain literature:

### 1.1 Model Verification (`Nemotron 3.5 Lightning`)
* **Status:** Verified and production-ready. NVIDIA released **Nemotron 3.5 Lightning** on August 11, 2026, under the **OpenMDW-1.1** license [11, 12].
* **Architecture:** A **30B-parameter sparse Mixture-of-Experts (MoE) hybrid model activating 3B parameters per token (`30B-A3B`)** [11]. It interleaves Mamba-2 state-space layers, sparse MoE layers, and selected self-attention layers with a 1M token native context window, accompanied by **DSpark** and **DFlash** speculative decoding drafters and pre-quantized **NVFP4** and **GGUF** weights [11, 12].

### 1.2 Hosted (OpenRouter) vs. Local Mode & Privacy Claim
* **Solution:** Implement a **Dual-Mode Execution Router** modeled on NVIDIA NeMo Switchyard [11].
* **Primary Mode (100% Local-First):** Serve `nvidia/Nemotron-3.5-Lightning` (NVFP4/GGUF, requiring ~16–18 GB VRAM) or `nvidia/NVIDIA-Nemotron-Nano-9B-v2` (requiring ~6–8 GB VRAM in 4-bit) [15] locally via **vLLM** [17] or **llama.cpp** [18]. This guarantees 100% data privacy (zero clinical briefs leave the workstation) and unlocks 0% syntax errors via `XGrammar` EBNF enforcement [16] plus per-token geometric logit masking.
* **Cloud-Burst Toggle (OpenRouter Paid Slug ONLY):** Wire `nvidia/nemotron-3.5-lightning` ($0.025/1M input, $0.12/1M output; 83 tok/s; 2.48s E2E latency) [13].
  * **Critical Engineering Guardrail:** Explicitly pin the OpenRouter provider routing header to `CoreWeave` or `DeepInfra` (6.56% structured output error rate) and exclude `Darkbloom` (16.67% structured output error rate and 7.99s E2E latency) [13].
  * **Never use `nvidia/nemotron-3.5-lightning:free` in the live demo:** Telemetry shows it does not support structured outputs and suffers from catastrophic tail latency (33.37s P50, 242.14s P95, and 389.43s P99 E2E latency) [14].

| Deployment Tier | Slug / HuggingFace Repo | Active / Total Params | Throughput & Latency | Structured Output / Grammar Support | Team Assignment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Primary (24GB+ GPU / DGX Spark)** | `nvidia/Nemotron-3.5-Lightning` (NVFP4 / GGUF) [11, 12] | `3B` active / `30B` total | ~100+ tok/s with DSpark/DFlash drafters | Full EBNF (`XGrammar`) + custom `LogitsProcessor` (0% error) | Default local server for live demo. |
| **Local Laptop Fallback (8–16GB GPU)** | `nvidia/NVIDIA-Nemotron-Nano-9B-v2` [15] | `9B` dense (thinking + direct modes) | High local throughput on consumer GPUs | Full EBNF (`XGrammar`) & GBNF (`llama.cpp`) | Local development & QLoRA/GRPO target. |
| **OpenRouter Paid Toggle** | `nvidia/nemotron-3.5-lightning` [13] | `3B` active / `30B` total | `83 tok/s`; `0.49s` TTFT; `2.48s` E2E | JSON Schema only (`6.56%` error on CoreWeave/DeepInfra) | Cloud-burst toggle (pin `CoreWeave`/`DeepInfra`). |
| **OpenRouter Free Tier** | `nvidia/nemotron-3.5-lightning:free` [14] | `3B` active / `30B` total | `33.37s` P50 E2E; `242.14s` P95; `389.43s` P99 | **Not supported** (`3.32%` tool error) | **Do not use in production/demo**. |

### 1.3 Building Typology (`Primary Care Outpatient Clinic`)
* **Decision:** Lock in the **Primary Care Outpatient Clinic** over residential housing.
* **Rationale:**
  1. **Unified Pipeline Narrative:** It connects Module 1 directly to **Module 2 (ADA & FGI clinical rules)** and **Module 4 (Sarvesh's 3D Hospital-Path HTML)** so patient flow, staff circulation, and emergency egress routes form a cohesive medical showcase [9].
  2. **Orthogonal Grid Exactness:** VA Space & Facility Planning [23], DoD SEPS [24], and FGI Guidelines [22] strictly follow orthogonal **Single Corridor** or **Double Corridor** modular layouts on **100mm wall thickness modules**, making axis-aligned rectangular (`RECT`) generation and CP-SAT packing exact.

### 1.4 First U.S. Rules to Implement (Module 2)
* **Decision:** Implement six machine-checkable geometric and topological rules from the **ADA Accessibility Standards** [21], **FGI Guidelines** [22], and **IBC/NFPA-101** (exact millimeter thresholds and automated CP-SAT repair equations are specified in Section 6).

### 1.5 Contract with Sarvesh's Module 4 HTML
* **Decision:** Standardize on `plan.json` (complete schema in Section 7). Module 1 computes shortest paths (`patient_flow`, `staff_route`, and `egress_max_path`) over the `connected_by_door` adjacency graph and writes them directly into `topology.computed_paths` so Module 4 renders them immediately without re-implementing graph traversal.

---

## 2. System Architecture & Three-Tier Neuro-Symbolic Cascade

Recent 2025–2026 floorplan generation research proves that purely autoregressive LLMs struggle with exact continuous geometric constraints, while purely combinatorial solvers lack semantic architectural intuition. **AegisPlan** synthesizes four breakthroughs from the latest literature:
1. **Compact Floorplan Markup Language & Token Masking:** Inspired by **FMLM** (CVPR 2026) [1].
2. **5-Tuple Axis-Aligned Room Parameterization:** Inspired by **FloorPlan-DeepSeek** (2025) [4].
3. **Verifiable Geometric & Topological Rewards (RLVR):** Inspired by **Lara et al.** (2026) [2].
4. **Two-Stage Coarse-to-Fine Refinement:** Inspired by **HouseTune** (AAAI 2026) [3], but replacing slow iterative diffusion refinement with **Google OR-Tools CP-SAT** [19, 20], which snaps coarse LLM layouts (`Layout-Init`) into 100% non-overlapping, flush-wall, code-compliant floorplans in **15 to 80 milliseconds**.

```
[User Brief + Locked Rooms]
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 1: CONSTRAINED AUTOREGRESSIVE GENERATION (Local vLLM / llama.cpp)  │
│  • Model: Nemotron 3.5 Lightning (NVFP4/GGUF) or Nemotron Nano 9B v2    │
│  • Syntax Engine: XGrammar EBNF Pushdown Automaton (0% syntax error)    │
│  • Spatial Engine: Custom vLLM LogitsProcessor (masks overlap coords)   │
│  • Output: N=3 parallel FML-DSL candidates (temperature=0.7, top_p=0.9) │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 2: OBJECT-LEVEL GEOMETRIC & REGULATORY VALIDATOR (Module 2)        │
│  • Evaluates polygon overlap, wall gaps, BFS door reachability          │
│  • Checks U.S. ADA & FGI rules (exam area >=11.15m², corridor >=1830mm) │
│  • Ranks N=3 candidates lexicographically by compliance & overlap       │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 3: COMBINATORIAL GEOMETRY REPAIR & CONFLICT SOLVER (OR-Tools)      │
│  • Formulates 2D Interval Packing (AddNoOverlap2D) on 100mm grid        │
│  • Enforces locked rooms, flush wall sharing, and door opening widths   │
│  • Minimizes L1 perturbation from LLM layout (solves in 15–80 ms)       │
│  • If impossible: extracts Minimal Unsatisfiable Core via assumptions   │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
     [plan.json] ──► Module 2 UI Report + Module 3 (WebGPU/WebGL2) + Module 4 (Sarvesh HTML)
```

---

## 3. Module 1A: Floorplan Markup Language (`FML-DSL`) & Constrained Decoding

### 3.1 The Decimeter Grid Trick for Single-Token Coordinate Masking
In standard BPE tokenizers, 4-digit millimeter coordinates such as `4000` or `3500` split unpredictably across multiple subword tokens, forcing per-token logit masking to maintain a complex multi-token prefix trie.

Because healthcare architectural guidelines standardize dimensions on **100mm wall and grid modules** [22, 23], every coordinate and dimension in a $25\text{m} \times 25\text{m}$ clinic ($25,000\text{mm} \times 25,000\text{mm}$) maps to an integer grid index in $[0, 250]$. In modern tokenizers, integers from `0` to `250` tokenize as **single atomic tokens**. In our EBNF grammar, the LLM selects the grid integer as a single token and the grammar deterministically appends `"00"` (or `"50"` for 50mm half-modules), reducing per-token geometric masking to an $O(1)$ array lookup per coordinate axis [1, 16].

### 3.2 Formal EBNF / GBNF Grammar (`fml_dsl.ebnf`)
Following FMLM's canonical sequence hierarchy (`BOUNDARY` $\rightarrow$ `ROOM` $\rightarrow$ `DOOR` $\rightarrow$ `FDOOR`) [1] and FloorPlan-DeepSeek's $(t_i, x_i, y_i, w_i, h_i)$ tuple parameterization [4], wire the following flat EBNF grammar into **XGrammar** (`vLLM` `guided_grammar`) [16, 17] or **llama.cpp** (`GBNF`) [18]. Because it contains zero recursive nesting, it avoids parser slowdowns and achieves up to a **5x structured decoding speedup** via XGrammar's precompiled pushdown automaton [16].

```ebnf
root ::= header_block room_block+ door_block+ fdoor_block+ "END_PLAN"

header_block ::= "BOUNDARY RECT 0 0 " dim_mm " " dim_mm "\n"

room_block ::= "ROOM " room_id " TYPE " room_type " RECT " coord_mm " " coord_mm " " dim_mm " " dim_mm " " lock_flag "\n"

door_block ::= "DOOR " door_id " CONNECT " room_id " " room_id " AT " coord_mm " " coord_mm " WIDTH " door_w "\n"

fdoor_block ::= "FDOOR " door_id " CONNECT " room_id " OUTSIDE AT " coord_mm " " coord_mm " WIDTH " door_w "\n"

room_type ::= "waiting" | "reception" | "corridor" | "exam" | "consult" | "procedure" | "restroom" | "clean_util" | "soiled_util" | "staff_break" | "bedroom" | "bathroom" | "kitchen" | "living"

room_id ::= [a-z]+ "_" [1-9][0-9]?
door_id ::= "door_" [1-9][0-9]?
lock_flag ::= "LOCKED" | "FREE"

coord_mm ::= "0" | ([1-9][0-9]{0,2} ("00" | "50"))
dim_mm ::= [1-9][0-9]{0,1} ("00" | "50")
door_w ::= "815" | "900" | "915" | "1000" | "1065" | "1220"
```

### 3.3 Example `FML-DSL` Stream
```text
BOUNDARY RECT 0 0 16000 12000
ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED
ROOM corridor_1 TYPE corridor RECT 0 5000 16000 2000 LOCKED
ROOM exam_1 TYPE exam RECT 0 7000 3200 5000 FREE
ROOM exam_2 TYPE exam RECT 3200 7000 3200 5000 FREE
ROOM restroom_1 TYPE restroom RECT 6000 0 2500 5000 LOCKED
DOOR door_1 CONNECT waiting_1 corridor_1 AT 3000 5000 WIDTH 1065
DOOR door_2 CONNECT exam_1 corridor_1 AT 1600 7000 WIDTH 915
DOOR door_3 CONNECT exam_2 corridor_1 AT 4800 7000 WIDTH 915
DOOR door_4 CONNECT restroom_1 corridor_1 AT 7250 5000 WIDTH 915
FDOOR door_5 CONNECT waiting_1 OUTSIDE AT 3000 0 WIDTH 1220
END_PLAN
```

### 3.4 Per-Token Geometric Logit Masking in vLLM
To enforce FMLM-style geometric validity during token generation [1], implement vLLM's custom V1 `LogitsProcessor` interface (`vllm.v1.worker.gpu.sample.logits_processor.interface.LogitsProcessor`) [17]:

1. **`__init__(self, vllm_config, req_states)`:** Pre-build a GPU lookup tensor mapping vocabulary token IDs to integer decimeter coordinate values and hold a read-only reference to `req_states.all_token_ids`.
2. **`add_request(self, req_idx, sampling_params) -> bool`:** Extract `boundary_w`, `boundary_h`, and `locked_rooms` from `sampling_params.extra_args` and initialize the placed-room bounding box list for request slot `req_idx`.
3. **`apply(self, logits, ctx) -> torch.Tensor`:** Parse the trailing tokens of `req_states.all_token_ids[slot]` to identify which coordinate slot $(x_i, y_i, w_i, h_i)$ is currently being emitted:
   * **When emitting $x_i$:** Set logits to $-\infty$ for any coordinate $x_i \ge W_{\text{boundary}} - W_{\min}$.
   * **When emitting $y_i$:** Given the just-emitted $x_i$, iterate over all previously placed rooms $r_k = (x_k, y_k, w_k, h_k)$ where $x_i \in [x_k, x_k + w_k - 1]$ and set logits to $-\infty$ for all $y_i \in [y_k, y_k + h_k - 1]$ (enforcing non-overlapping origin placement in $<0.1\text{ ms}$) [1].
   * **When emitting $w_i$ or $h_i$:** Compute the distance from $(x_i, y_i)$ to the nearest East/South placed room boundary and mask out widths/heights that cross into $r_k$ or exceed $(W_{\text{boundary}}, H_{\text{boundary}})$.

---

## 4. Module 1B: Combinatorial Geometry Repair & Conflict Diagnostics (OR-Tools CP-SAT)

Whether a candidate layout comes from local constrained decoding or the OpenRouter fallback, any residual overlap, wall gap, or Module 2 regulatory violation is repaired deterministically using Google OR-Tools `cp_model` [19, 20].

### 4.1 Mathematical & CP-SAT Formulation
Scale all millimeter coordinates to integer $100\text{mm}$ grid units before solving, where $(\hat{x}_i, \hat{y}_i, \hat{w}_i, \hat{h}_i)$ denote the LLM's initial coordinates for room $i \in \mathcal{R}$ and $(W_B, H_B)$ is the building footprint:

1. **Spatial & Interval Variables:** For each room $i \in \mathcal{R}$ with minimum regulatory dimension $D_i^{\min}$, define integer variables $x_i \in [0, W_B]$, $w_i \in [D_i^{\min}, W_B]$, $x'_i = x_i + w_i \in [D_i^{\min}, W_B]$ (and analogously $y_i, h_i, y'_i \in [0, H_B]$). Bind them to 2D interval variables [19, 20]:
   $$\text{int}_{x,i} = \text{model.NewIntervalVar}(x_i, w_i, x'_i), \quad \text{int}_{y,i} = \text{model.NewIntervalVar}(y_i, h_i, y'_i)$$

2. **Global 2D Non-Overlap:** Guarantee zero polygon intersection across all rooms while allowing flush wall contact ($x'_i = x_j$ or $y'_i = y_j$) [20]:
   $$\text{model.AddNoOverlap2D}\left([\text{int}_{x,1}, \dots, \text{int}_{x,N}], [\text{int}_{y,1}, \dots, \text{int}_{y,N}]\right)$$

3. **Hard Lock Preservation:** For every room $i$ where $\text{locked}_i = \text{True}$:
   $$x_i = \hat{x}_i, \quad y_i = \hat{y}_i, \quad w_i = \hat{w}_i, \quad h_i = \hat{h}_i$$

4. **Target Area & Aspect Ratio Constraints:** Enforce area bounds $[A_i^{\min}, A_i^{\max}]$ via `model.AddMultiplicationEquality(a_i, [w_i, h_i])` (or first-order Taylor linearization $\hat{h}_i w_i + \hat{w}_i h_i - \hat{w}_i \hat{h}_i \in [A_i^{\min}, A_i^{\max}]$), and bound non-corridor aspect ratios to $\rho_{\max} = 2.5$:
   $$2 w_i \le 5 h_i \quad \land \quad 2 h_i \le 5 w_i$$

5. **Disjunctive Wall Sharing & Door Clearance:** For every door connection $(i, j) \in \mathcal{E}_{\text{door}}$ requiring door width $W_{\text{door}}$ plus $200\text{mm}$ jamb clearance ($L_{\min} = W_{\text{door}} + 200\text{mm}$), introduce four directional booleans $\delta_{\text{E}}, \delta_{\text{W}}, \delta_{\text{N}}, \delta_{\text{S}} \in \{0, 1\}$ with $\delta_{\text{E}} + \delta_{\text{W}} + \delta_{\text{N}} + \delta_{\text{S}} = 1$:
   * If $\delta_{\text{E}} = 1$ (`OnlyEnforceIf`):
     $$x'_i = x_j \quad \land \quad y'_i - y_j \ge L_{\min} \quad \land \quad y'_j - y_i \ge L_{\min}$$
   * Symmetrical constraints apply for $\delta_{\text{W}}$ ($x'_j = x_i$), $\delta_{\text{N}}$ ($y'_i = y_j$), and $\delta_{\text{S}}$ ($y'_j = y_i$).

6. **Minimum-Perturbation $L_1$ Objective:** Minimize layout displacement so interactive edits preserve visual stability:
   $$\min \sum_{i \in \mathcal{R}} \left[ 1 \cdot (|x_i - \hat{x}_i| + |y_i - \hat{y}_i|) + 2 \cdot (|w_i - \hat{w}_i| + |h_i - \hat{h}_i|) \right]$$

### 4.2 Analytical Door Placement & Unsatisfiable Core Extraction (Demo Step 5)
* **Analytical Door Midpoints:** Once CP-SAT returns `OPTIMAL` or `FEASIBLE`, compute the 1D intersection interval of the shared wall between connected rooms $(i, j)$ (for example, along vertical wall $X = x'_i$, overlap interval $[y_{\text{low}}, y_{\text{high}}] = [\max(y_i, y_j), \min(y'_i, y'_j)]$) and place the door of width $W_{\text{door}}$ at the exact midpoint $y_{\text{door}} = \frac{1}{2}(y_{\text{low}} + y_{\text{high}})$. Any touching rooms without a door are recorded under `shares_wall: true` and `connected_by_door: false` [5, 6].
* **Infeasibility vs. Timeout Diagnostics:** Attach a boolean assumption literal $b_c$ (`OnlyEnforceIf(b_c)`) to every user lock, area bound, and regulatory constraint, and register them via `model.AddAssumptions([b_1, b_2, ...])` [19].
  * **Proven Infeasibility (`cp_model.INFEASIBLE`):** Call `solver.SufficientAssumptionsForInfeasibility()` to extract the exact Minimal Unsatisfiable Core (e.g., `["BOUNDARY_100m2", "EXAM_ROOMS_10x11.15m2", "LOCKED_WAITING_ROOM"]`) and display the conflicting requirements in the UI (Demo Step 5).
  * **Solver Timeout (`cp_model.UNKNOWN` at `max_time_in_seconds = 2.0`):** Explicitly report a solver timeout rather than claiming the design is mathematically impossible.

---

## 5. Module 1C: Local Model Post-Training Recipe (Synthetic Curriculum + QLoRA SFT + GRPO)

Because existing public datasets like **RPLAN** (~80,000 Asian residential raster floorplans) [10] and **CubiCasa5K** (5,000 residential raster parsing annotations) [7, 10] do not reflect U.S. clinical standards, we combine a synthetic CP-SAT clinical curriculum with the **SFT + RLVR (GRPO)** post-training recipe of Lara et al. (2026) [2], which demonstrated that **only 100 RLVR prompts** reduce topological compatibility errors by **94%**.

1. **Stage 0: Synthetic CP-SAT Curriculum Generation (<10 mins on CPU):** Run a parametric generator that samples 5,000 outpatient clinic briefs (Waiting, Reception, Central Corridor, 3–6 Exam Rooms, Consult, ADA Restroom, Clean/Soiled Utility, Staff Breakroom) and solves them to optimality via our CP-SAT engine using Single and Double Corridor clinical templates [9, 23, 24]. Apply FMLM's **room permutation augmentation** (shuffling `ROOM` lines while keeping `LOCKED` rooms first) so the model learns conditional layout completion [1].
2. **Stage 1: QLoRA Supervised Fine-Tuning (~45 mins on 1x A100/H100):** Fine-tune `nvidia/NVIDIA-Nemotron-Nano-9B-v2` [15] (or `Nemotron-3.5-Lightning` [12]) on the 5,000 synthetic `Brief -> FML-DSL` pairs using LoRA ($r=32, \alpha=64, \text{lr}=2\times 10^{-4}$, 3 epochs).
3. **Stage 2: RLVR with GRPO via NVIDIA NeMo-RL (`rl/nemo_rl/rlvr`) or TRL:** Train on **100 to 200 diverse clinical briefs** with zero ground-truth floorplans required [2]. Sample $G = 8$ rollouts per prompt (`temperature=0.7, top_p=0.9`) with the leave-one-out baseline enabled, and score each rollout in $<5\text{ ms}$ using a dense 4-term verifiable reward adapted from Lara et al. [2] and GreenPlanner [8]:
   $$R(x, y) = 0.30 \, r_{\text{overlap}}(y) + 0.30 \, r_{\text{conn}}(y) + 0.20 \, r_{\text{TA}}(y) + 0.20 \, r_{\text{ADA/FGI}}(y)$$
   where:
   * $r_{\text{overlap}}(y) = \max\left(0, 1 - 10 \cdot \frac{A_{\text{overlap}}(y)}{A_{\text{total}}(y)}\right)$ smoothly penalizes polygon overlap percentage.
   * $r_{\text{conn}}(y) = \frac{|\mathcal{E}_{\text{req}} \cap \mathcal{E}_{\text{gen}}|}{|\mathcal{E}_{\text{req}}|}$ scores exact door-graph topological satisfaction.
   * $r_{\text{TA}}(y) = 1 - \frac{1}{N}\sum_{i=1}^N \min\left(1, \frac{|A_i(y) - A_i^\star|}{A_i^\star}\right)$ rewards target room area fidelity.
   * $r_{\text{ADA/FGI}}(y)$ is the fraction of passed Module 2 regulatory checks below.

---

## 6. Module 2 Integration: Machine-Checkable U.S. Rules & Repair Equations

Every check in Module 2 operates dual-purpose: it generates the cited pass/fail validation report for the UI (explicitly stating which checks were evaluated and which were out of scope) and translates failures directly into linear constraints for the Module 1 CP-SAT repair loop.

| Rule ID & Standard | Machine-Checkable Geometric Condition (mm) | Automated CP-SAT Repair Constraint Translation |
| :--- | :--- | :--- |
| **ADA-404.2.3** (Door Clear Width) [21] | Accessible doors require clear width $W_{\text{door}} \ge 815\text{mm}$ ($32\text{ in}$); clinical exam/patient doors require $\ge 915\text{mm}$ ($36\text{ in}$) or $\ge 1065\text{mm}$ ($42\text{ in}$). | Restrict `door_w` domain $\ge 915\text{mm}$ and enforce shared wall segment length $L_{\min} = W_{\text{door}} + 200\text{mm} \ge 1115\text{mm}$ in Constraint 5. |
| **ADA-403.5.1** (Accessible Route Width) [21] | `corridor` rooms require minimum clear width $\min(w_i, h_i) \ge 915\text{mm}$ ($36\text{ in}$) residential, or $\ge 1830\text{mm}$ ($72\text{ in}$) for outpatient clinics [22, 23]. | Add hard linear bound $\min(w_{\text{corridor}}, h_{\text{corridor}}) \ge 1830\text{mm}$ along the corridor's minor axis. |
| **ADA-304.3** ($60\text{ in}$ Turning Circle) [21] | Accessible rooms (`restroom`, `exam`, `consult`) must fit an unobstructed circle of diameter $D_{\text{turn}} = 1525\text{mm}$ ($60\text{ in}$). | Enforce $w_i \ge 2150\text{mm} \land h_i \ge 2150\text{mm}$ on single-user ADA restrooms to fit the $1525\text{mm}$ circle plus fixture clearances. |
| **FGI-2.1-2.2** (Outpatient Exam Room Sizing) [22] | Each `exam` or `procedure` room must have clear floor area $A_i \ge 11.15\text{ m}^2$ ($120\text{ sq ft}$), minimum dimension $\min(w_i, h_i) \ge 3048\text{mm}$ ($10\text{ ft}$), and $915\text{mm}$ ($3\text{ ft}$) clearance around the exam table. | Add lower bounds $w_{\text{exam}} \ge 3050\text{mm}$ and $h_{\text{exam}} \ge 3700\text{mm}$ ($3.05\text{m} \times 3.70\text{m} = 11.28\text{ m}^2 \ge 11.15\text{ m}^2$). |
| **FGI Support & Utility Adjacency** [22, 24] | Staff restroom must be adjacent to `staff_break`; `clean_util` and `soiled_util` cannot directly connect via a door. | Add $(i_{\text{restroom}}, j_{\text{break}})$ to $\mathcal{E}_{\text{wall\_share}}$; remove/forbid $(i_{\text{clean}}, j_{\text{soiled}})$ from $\mathcal{E}_{\text{door}}$. |
| **IBC-1017 / NFPA-101** (Reachability & Egress Distance) | BFS traversal over `connected_by_door` from `FDOOR` (`OUTSIDE`) must reach 100% of rooms, with max Manhattan travel distance $\le 45,720\text{mm}$ ($150\text{ ft}$ unsprinklered) or $\le 60,960\text{mm}$ ($200\text{ ft}$ sprinklered). | For any unreachable room $k$, select touching room $m$ (preferring `corridor`), enforce shared wall overlap $L_{\min} \ge 1115\text{mm}$, and inject a connecting door at the wall midpoint. |

---

## 7. Shared Semantic Building Contract (`plan.json`)

Modules 1, 2, 3 (Three.js `WebGPURenderer` [25] with `navigator.gpu` feature detection [26] and automatic fallback badge for `WebGL2`), and 4 (Sarvesh's Hospital-Path HTML) read and write this single JSON schema:

```json
{
  "metadata": {
    "plan_id": "clinic_candidate_1",
    "building_type": "outpatient_clinic",
    "units": "mm",
    "grid_module_mm": 100,
    "wall_thickness_mm": { "interior": 100, "exterior": 150 },
    "generator_mode": "local_vllm_xgrammar",
    "solver_status": "OPTIMAL",
    "solve_time_ms": 42
  },
  "boundary": {
    "polygon": [[0, 0], [16000, 0], [16000, 12000], [0, 12000]],
    "area_m2": 192.0
  },
  "rooms": [
    {
      "id": "exam_1",
      "type": "exam",
      "label": "Exam Room 1",
      "locked": true,
      "bbox": { "x": 0, "y": 0, "w": 3100, "h": 3700 },
      "polygon": [[0, 0], [3100, 0], [3100, 3700], [0, 3700]],
      "area_target_m2": [11.15, 14.0],
      "area_actual_m2": 11.47,
      "ada_turning_circle": { "center": [1550, 1850], "diameter_mm": 1525 }
    }
  ],
  "walls": [
    {
      "id": "wall_1",
      "start": [3100, 0],
      "end": [3100, 3700],
      "thickness_mm": 100,
      "is_exterior": false,
      "adjacent_rooms": ["exam_1", "corridor_1"],
      "openings": ["door_1"]
    }
  ],
  "doors": [
    {
      "id": "door_1",
      "wall_id": "wall_1",
      "connects": ["exam_1", "corridor_1"],
      "position": [3100, 1850],
      "segment": [[3100, 1392], [3100, 2307]],
      "width_mm": 915,
      "height_mm": 2135,
      "swing_dir": "in_left"
    }
  ],
  "topology": {
    "shares_wall": [["exam_1", "corridor_1"], ["exam_1", "exam_2"]],
    "connected_by_door": [["exam_1", "corridor_1"], ["waiting_1", "corridor_1"], ["waiting_1", "OUTSIDE"]],
    "computed_paths": {
      "patient_flow": ["OUTSIDE", "waiting_1", "corridor_1", "exam_1"],
      "staff_route": ["staff_break_1", "corridor_1", "clean_util_1", "exam_1"],
      "egress_max_path": {
        "rooms": ["exam_4", "corridor_1", "waiting_1", "OUTSIDE"],
        "distance_mm": 18400
      }
    }
  },
  "validation": {
    "summary_statement": "Passed 12 of 12 implemented geometry checks; MEP, fire-resistance ratings, and acoustic STC requirements were not evaluated.",
    "conflict_core": [],
    "checks": [
      {
        "rule_id": "FGI-2.1-2.2",
        "status": "PASS",
        "measured": "11.47 m2 (min dim 3100mm)",
        "required": ">= 11.15 m2 (min dim 3048mm)",
        "citation": "FGI Guidelines for Design and Construction of Outpatient Facilities, Section 2.1-2.2"
      }
    ]
  }
}
```

---

## 8. 20-Hour Hackathon Execution Schedule & Role Breakdown

Following our prioritized engineering order (**Grammar-Constrained Output $\rightarrow$ Object-Level Validation $\rightarrow$ Solver Repair $\rightarrow$ Per-Token Geometric Masking**):

### Milestone 1: Zero-Syntax-Error Foundation (Hours 1–4)
* **Deliverable 1.1 (`fml_parser.py`):** Parse `BOUNDARY`, `ROOM`, `DOOR`, and `FDOOR` lines into `plan.json`, automatically computing `walls[]`, `shares_wall`, and `connected_by_door` from axis-aligned rectangle intersections.
* **Deliverable 1.2 (Local Constrained Server):** Stand up the local **vLLM** server [17] running `NVIDIA-Nemotron-Nano-9B-v2` [15] or `Nemotron-3.5-Lightning` (NVFP4/GGUF) [12] with `guided_grammar` bound to `fml_dsl.ebnf` via **XGrammar** [16].
* **Deliverable 1.3 (Dual-Mode Cloud Router):** Wire the Cloud-Burst toggle to OpenRouter (`nvidia/nemotron-3.5-lightning`, provider pinned to `CoreWeave`/`DeepInfra`) [13] and render the UI privacy badge (Demo Step 1).

### Milestone 2: Closed-Loop Geometric & Regulatory Guarantee (Hours 5–9)
* **Deliverable 2.1 (`validator.py`):** Implement polygon overlap percentage, unallocated area, BFS door reachability, max egress Manhattan distance, ADA door/corridor/turning checks [21], and FGI exam room checks ($11.15\text{ m}^2$ / $3048\text{mm}$) [22] with source citations (Demo Step 3).
* **Deliverable 2.2 (`cpsat_repair.py`):** Implement `AddNoOverlap2D` [20], locked room equalities, 4-way disjunctive wall sharing, analytical door midpoint placement, and the $L_1$ minimum-perturbation objective.
* **Deliverable 2.3 (Conflict Core Diagnostics):** Wire `model.AddAssumptions()` and `SufficientAssumptionsForInfeasibility()` [19] to distinguish contradictory constraints from solver timeouts (Demo Step 5).

### Milestone 3: Interactive Editing & Downstream 3D Integration (Hours 10–14)
* **Deliverable 3.1 (Best-of-3 Candidate Ranking):** Generate $N=3$ parallel candidates (`temperature=0.7, top_p=0.9`), repair each via CP-SAT, and rank them lexicographically by (1) Module 2 checks passed & lock preservation, (2) pre-repair `% Overlap`, and (3) circulation efficiency (Demo Step 2).
* **Deliverable 3.2 (Real-Time 2D/3D Sync & WebGPU Fallback):** Wire interactive 2D/chat edits (e.g., *"Make Exam Room 1 20% larger, keep restrooms locked"*) to update `area_target_m2` and re-run CP-SAT in $<50\text{ ms}$, triggering live wall re-extrusion in Module 3 (`WebGPURenderer` [25] with `!navigator.gpu` [26] fallback badge for `WebGL2`) and clinical path updates in Module 4 (Sarvesh's HTML) via `plan.json` (Demo Steps 4, 6, 7).

### Milestone 4: Stretch Goal & Quantitative Benchmarks (Hours 15–20)
* **Deliverable 4.1 (`FMLGeometricLogitsProcessor`):** Register the custom vLLM `LogitsProcessor` [17] to mask out coordinate tokens that fall inside already placed rooms during autoregressive decoding [1].
* **Deliverable 4.2 (Synthetic Curriculum + QLoRA/GRPO):** Generate 1,000–5,000 synthetic outpatient plans via `cpsat_repair.py` and run QLoRA SFT + a 100-prompt GRPO job in **NeMo-RL** (`rl/nemo_rl/rlvr`) or **TRL** [2].
* **Deliverable 4.3 (Ablation Benchmark Table):** Run the evaluation harness across 25 test briefs (including 5 infeasible stress tests) to populate the final presentation metrics table below.

---

## 9. Evaluation & Ablation Benchmark Protocol

Run all four system variants on the identical benchmark suite of 25 clinical briefs (20 feasible briefs with locked rooms + 5 intentionally over-constrained/impossible briefs) and report:

| System Variant | Syntax Validity (%) | Pre-Repair Overlap (%) | Post-Repair Overlap (%) | ADA / FGI Rule Pass Rate (%) | Lock Preservation (%) | P50 / P95 Latency (s) | Cost per Accepted Plan ($) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Baseline:** Unconstrained JSON | ~78–85% | ~18–25% | N/A | ~35% | ~60% | ~2.5s / 4.8s | ~$0.0004 |
| **2. + EBNF Grammar (`XGrammar` FML-DSL)** | **100.0%** | ~12–16% | N/A | ~52% | ~85% | ~1.8s / 3.1s | ~$0.0003 |
| **3. + Module 2 Validator & CP-SAT Repair** | **100.0%** | ~12–16% | **0.0%** | **100.0%** *(or exact conflict core)* | **100.0%** | ~1.9s / 3.2s *(+45ms solver)* | ~$0.0009 *(Best-of-3)* |
| **4. + Geometric Logit Masking & GRPO** | **100.0%** | **< 2.0%** | **0.0%** | **100.0%** | **100.0%** | **~1.4s / 2.3s** | **$0.0000 (Local)** |

---

## 10. References & Citations

### Core Architectural & Floorplan Generation Papers
1. **[FMLM]** *FMLM: Unified Vector Floorplan Generation via Markup Representation*, CVPR 2026. [arXiv:2604.04859](https://arxiv.org/abs/2604.04859) · [Project Page](https://mapooon.github.io/FMLPage/)
2. **[RLVR Floorplan]** Lara et al., *Generative Floor Plan Design with LLMs via Reinforcement Learning with Verifiable Rewards (RLVR)*, May 2026. [arXiv:2605.14117v1](https://arxiv.org/html/2605.14117v1)
3. **[HouseTune]** *HouseTune: Two-Stage Floorplan Generation with LLM Assistance*, AAAI 2026. [AAAI Proceedings](https://ojs.aaai.org/index.php/AAAI/article/view/38417)
4. **[FloorPlan-DeepSeek]** *FloorPlan-DeepSeek: Vector-based Next Room Prediction*, 2025. [arXiv:2506.21562](https://arxiv.org/abs/2506.21562)
5. **[HouseDiffusion]** Shabani et al., *HouseDiffusion: Vector Floorplan Generation via a Diffusion Model with Discrete and Continuous Denoising*, CVPR 2023. [arXiv:2211.13287](https://arxiv.org/abs/2211.13287)
6. **[Graph2Plan]** Hu et al., *Graph2Plan: Learning Floorplan Generation from Layout Graphs*, ACM SIGGRAPH 2020. [arXiv:2004.13204](https://arxiv.org/abs/2004.13204)
7. **[Raster2Seq]** *Raster2Seq: Vector Polygon Reconstruction from Floor-Plan Images*, SIGGRAPH 2026. [GitHub: Cornell-VAILab/Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq)
8. **[GreenPlanner]** *GreenPlanner: Feedback Loop for Functionality and Energy Evaluation in Layout Design*, 2025. [arXiv:2512.00406](https://arxiv.org/abs/2512.00406)
9. **[Hospital NSGA-II]** *Multi-objective layout optimization of hospital outpatient clinics (NSGA-II)*, Scientific Reports (Nature), 2025. [Nature Article](https://www.nature.com/articles/s41598-025-98388-z)
10. **[CubiCasa5K & RPLAN]** Kalervo et al., *CubiCasa5K: A Dataset and an Improved Multi-Task Model for Floorplan Image Analysis*, SCIA 2019 ([GitHub](https://github.com/CubiCasa/CubiCasa5k)); Wu et al., *Data-driven Interior Plan Generation for Residential Buildings (RPLAN)*, ACM SIGGRAPH Asia 2019.

### Models, Constrained Decoding & Combinatorial Solvers
11. **[NVIDIA Nemotron 3.5 Lightning Technical Blog]** NVIDIA Developer Blog, *Introducing Nemotron 3.5 Lightning: Hybrid Mamba-2 MoE for High-Speed Reasoning*, August 2026.
12. **[Nemotron 3.5 Lightning Weights]** Hugging Face Repository: `nvidia/Nemotron-3.5-Lightning` (OpenMDW-1.1 License, NVFP4 & GGUF quantizations).
13. **[OpenRouter Paid Telemetry]** OpenRouter Model Card & Provider Metrics: [`nvidia/nemotron-3.5-lightning`](https://openrouter.ai/nvidia/nemotron-3.5-lightning).
14. **[OpenRouter Free Tier Telemetry]** OpenRouter Model Card & Latency Distribution: [`nvidia/nemotron-3.5-lightning:free`](https://openrouter.ai/nvidia/nemotron-3.5-lightning:free).
15. **[Nemotron Nano 9B v2]** Hugging Face Model Card: [`nvidia/NVIDIA-Nemotron-Nano-9B-v2`](https://huggingface.co/nvidia/NVIDIA-Nemotron-Nano-9B-v2).
16. **[XGrammar]** Dong et al. (MLC-AI), *XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models*, 2024–2026. [GitHub: mlc-ai/xgrammar](https://github.com/mlc-ai/xgrammar)
17. **[vLLM Structured Outputs & Custom LogitsProcessors]** vLLM Documentation, *Structured Outputs & V1 Custom LogitsProcessor Interface*. [vLLM Docs](https://docs.vllm.ai/en/latest/features/structured_outputs/)
18. **[llama.cpp GBNF]** ggml-org, *GGML BNF (GBNF) Grammar Guide*. [GitHub: ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)
19. **[OR-Tools CP-SAT Solver]** Perron & Didier (Google), *CP-SAT Solver Documentation & Assumption-Based Unsatisfiable Core Extraction*. [Google Optimization Docs](https://developers.google.com/optimization/cp/cp_solver)
20. **[OR-Tools 2D Non-Overlap]** Google OR-Tools Official Example: `cover_rectangle_sat.py` (`AddNoOverlap2D`). [GitHub](https://github.com/google/or-tools/blob/stable/examples/python/cover_rectangle_sat.py)

### U.S. Healthcare & Accessibility Regulations and 3D Web Standards
21. **[U.S. Access Board — ADA Standards]** *ADA Accessibility Standards (Chapter 3: Clear Floor or Ground Space and Turning Space §304.3; Chapter 4: Accessible Routes §403.5.1; Entrances, Doors, and Gates §404.2.3)*. [U.S. Access Board](https://www.access-board.gov/ada/)
22. **[FGI Guidelines]** Facility Guidelines Institute, *Guidelines for Design and Construction of Outpatient Facilities (§2.1-2.2 Examination and Observation Rooms)* & [FGI State Adoption Map](https://fgiguidelines.org/codes/adoption-map/).
23. **[VA Space & Facility Planning]** U.S. Department of Veterans Affairs, *Technical Information Library (TIL) — Outpatient Clinic Design Guides*. [VA CFM](https://www.cfm.va.gov/til/planning.asp)
24. **[DoD SEPS]** Defense Health Agency, *Space and Equipment Planning System (SEPS)*. [Military Health System](https://facilities.health.mil/Content/space_equipment_planning_system_seps)
25. **[Three.js WebGPURenderer]** Three.js Documentation & Source Repository (`WebGPURenderer` with automatic `WebGL2` fallback). [threejs.org](https://threejs.org/) · [GitHub: mrdoob/three.js](https://github.com/mrdoob/three.js)
26. **[MDN WebGPU API]** Mozilla Developer Network, *WebGPU API & `navigator.gpu` Feature Detection*. [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)