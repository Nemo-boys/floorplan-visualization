# FAQ (likely judge questions)

**Why not let the LLM draw the whole plan?**
We tested it. With grammar-constrained decoding every line parses and the room program is right, but the coordinates don't fit the site. Geometry is a constraint problem, so CP-SAT does it, exactly, and can prove when a request is impossible. The model does what it's good at: reading intent.

**What did fine-tuning add?**
The model writes our compact FML format and clinic room programs (types, counts, nurse stations, utilities) reliably under the grammar, and GRPO with verifiable rewards pushed it towards non-overlapping, connected, code-sized drafts. The published GGUF runs locally at 5.5 GB.

**Is it code-compliant?**
We say "passes N implemented checks", each with its citation (ADA, FGI, IBC for clinics; ASHRAE, NEC, NFPA, Uptime concepts for data centers). It screens early; it does not replace professional review.

**How do you know the simulation is right?**
It's deterministic and seeded, ported exactly from an approved reference with golden files freezing its numbers. Walking times come from A* paths on the actual plan. It is a planning model: verdicts are averages with ranges over many days, not a promise.

**How is the data center thermal model validated?**
It isn't CFD and we don't claim it is. Pass/fail comes from capacity arithmetic (N, N+1, 2N pools); the temperature field is a calibrated diffusion estimate that shows where heat builds up when units fail.

**What runs where?**
Model: llama.cpp on the laptop (Metal), or any OpenAI-compatible endpoint (NVIDIA API catalog/NIM, vLLM). Solver, checker, API: FastAPI on the laptop. 3D, simulation, failure testing, cost: in the browser. Keys stay on the server.

**What happens with no GPU or no internet?**
Model-off mode produces valid plans in 0.04 s (p50); the assistant answers from its built-in mode; both apps also work as static sites.

**How general is it really?**
The data center app reuses the brief → program → CP-SAT → checks → 3D → simulation → export flow, the assistant, the design system and the 3D techniques. A domain needs room types, bounds, rules, prompts, models and a simulation module.

**How fast is it?**
Model-off: 0.04 s p50 for 3 checked candidates. With Nemotron on an M4 Pro: about 47 s for 3 candidates (the model writing room lines). CP-SAT proofs: milliseconds. The 3D is render-on-demand and instanced.

**What's the business?**
Pre-design and feasibility for healthcare and AI infrastructure: evidence (wait times, staffing, failure tolerance, cost) before capital is committed, privately, on a laptop, with exports into the tools teams already use (Blender, Omniverse).
