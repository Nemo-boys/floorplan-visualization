# AegisPlan: 3-Minute Hackathon Live Demo Script
**Judge-Ready Presentation & Live Execution Runbook**

---

### ⏱️ Timing & Narrative Flow (180 Seconds Total)

| Time | Phase | Focus / Talking Point | On-Screen Action |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:30** | **The Clinical Problem** | Why naive LLMs fail healthcare architecture (hallucinated overlaps, illegal corridors, ADA non-compliance). Introduce AegisPlan's neuro-symbolic cascade. | Show slide / Open `http://localhost:8000` |
| **0:30 – 1:00** | **Neural Drafting & Ranking** | NVIDIA Nemotron Nano 9B generates Best-of-3 candidate layouts from a single prompt. | Click **"Synthesize Floorplan"**; show candidate cards |
| **1:00 – 1:30** | **The CP-SAT Repair Core** | Google OR-Tools snaps coarse neural draft into 0.0% overlap and 100% ADA compliance in <15 ms. | Show Pre-Repair vs Post-Repair metrics (14.8% overlap $\rightarrow$ 0.0%) |
| **1:30 – 2:00** | **Interactive 2D/3D Walkthrough** | Real-time CAD edits + Three.js 3D extrusion with patient & staff path tracing. | Drag an exam room, toggle locked restroom, walk through 3D |
| **2:00 – 2:30** | **Conflict Core Diagnostics** | Show what happens when a brief is physically impossible. CP-SAT diagnoses the exact conflicting requirements instead of hallucinating. | Enter stress brief (10 rooms in 10m x 10m); show Conflict Core |
| **2:30 – 3:00** | **Results & NVIDIA Tech Stack** | Highlight Nemotron Mamba-2 hybrid, A100 QLoRA fine-tuning, benchmark ablation table, and local privacy. | Show `benchmark_report.md` metrics table |

---

### 📋 Step-by-Step Demo Execution

#### Step 1: Launch Local Server
Make sure the server is running on port 8000:
```bash
uvicorn aegisplan.server:app --host 127.0.0.1 --port 8000
```
Open **`http://localhost:8000`** in Chrome/Brave.

---

#### Step 2: Live Synthesis of an Outpatient Clinic
1. Paste this clinical brief into the prompt box:
   > *"Design a 24m x 15m Primary care outpatient clinic requiring central circulation corridor, 5 outpatient exam rooms (>= 11.15 m2 each), single-user ADA compliant restroom, clean and soiled utility support rooms with physical separation, and staff lounge."*
2. Set Boundary Width = `24000`, Boundary Height = `15000`.
3. Click **"Synthesize Floorplan"**.
4. **Key Talking Point:**
   > *"Notice how our fine-tuned Nemotron model drafts 3 parallel candidates. The router validates all 9 clinical codes and selects the optimal candidate."*

---

#### Step 3: Highlight Deterministic Compliance Audit
1. In the right panel, point out the **Regulatory Compliance Matrix**:
   - `ADA-404.2.3`: All door clear widths $\ge 915\text{mm}$ (PASS)
   - `ADA-403.5.1`: Central corridor $\ge 1830\text{mm}$ (PASS)
   - `ADA-304.3`: 1525mm wheelchair turning radius (PASS)
   - `FGI-2.1-2.2`: Exam rooms exceed $11.15\text{ m}^2$ (PASS)
   - `FGI-UTIL-SEP`: Clean and soiled utilities physically separated (PASS)
   - `IBC-1017`: 100% egress reachability (PASS)
2. **Key Talking Point:**
   > *"Every single check has an explicit statutory citation from federal guidelines. Nothing is left to probabilistic guessing."*

---

#### Step 4: Interactive CAD Editing & Live CP-SAT Re-solve
1. In the 2D CAD canvas, click on `restroom_1` and toggle the **"Lock Position"** switch to ON (red outline).
2. Now resize `exam_1` to make it larger.
3. Click **"Repair Geometry with CP-SAT"**.
4. Observe the solver re-pack all adjacent partitions around the locked restroom in **$<10\text{ ms}$**.
5. Switch to the **3D Walkthrough tab** to see the updated floorplan instantly extruded in Three.js with patient flow (cyan) and staff route (purple) lines!

---

#### Step 5: Stress Test & Conflict Core Diagnostics (The Killer Feature)
1. In the prompt box, enter an intentionally impossible brief:
   > *"Design a 10m x 10m clinic requiring 8 exam rooms of 15 m2 each and central corridor."*
2. Set Boundary to `10000` x `10000`.
3. Click **"Synthesize Floorplan"**.
4. Observe the solver output:
   - **Solver Status:** `INFEASIBLE`
   - **Conflict Core:** `BOUNDARY_CAPACITY_EXCEEDED` (Required area exceeds envelope by 48%)
5. **Key Talking Point:**
   > *"Unlike ChatGPT or standard LLMs that generate an impossible hallucinated drawing, AegisPlan mathematically proves infeasibility and isolates the exact conflicting constraints in 3 milliseconds."*

---

#### Step 6: Show Benchmarks & Fine-Tuning Impact
1. Open [`benchmark_report.md`](file:///Users/arvind/Desktop/Learning%20Projects/AegisPlan/benchmark_report.md) or show the table:
   - Untrained LLMs have **21.4% room overlap**.
   - With our fine-tuned Nemotron Nano 9B, pre-repair overlap drops to **1.4%**.
   - With CP-SAT repair, overlap is strictly **0.0%** across 100% of test briefs.
2. Highlight that the entire system runs **100% locally** on consumer hardware or edge servers with zero clinical data leakage.

---

#### Step 7: Export Artifacts
Click **"Export plan.json"** and **"Export SVG"** to demonstrate interoperability with Revit, AutoCAD, and IFC architectural BIM software!
