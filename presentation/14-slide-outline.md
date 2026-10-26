# Suggested deck (12 slides)

1. **Title.** Floorplan Intelligence. "Brief in, building out." Nemotron × CP-SAT × WebGPU. Team, hackathon.
   *Notes:* one sentence on what it does; show a 3D clinic and a 3D data hall side by side.

2. **The problem.** First plans take days; LLMs hallucinate geometry; solvers can't read briefs; nobody tests how a plan runs before it's built.
   *Notes:* show an LLM-drawn plan with overlapping rooms next to a valid one.

3. **The idea: split the work.** Table: Nemotron (intent) → synthesizer → CP-SAT (exact geometry or proof of impossibility) → checker (cited rules) → browser (3D, simulation, cost) → assistant.
   *Notes:* "The LLM proposes. The solver proves. The simulator tells you if it works."

4. **Nemotron, fine-tuned.** Nano 9B v2, QLoRA r=32, GRPO with 4 verifiable rewards, GBNF-constrained decoding, 5.5 GB GGUF on Metal. The finding: lines always parse and programs are reliable, coordinates aren't, so program-first.
   *Notes:* this honesty is a strength; it's why the output is always valid.

5. **CP-SAT and the checker.** NoOverlap2D on a 100 mm grid, locks, minimal moves, unsat cores. 9 rules with citations (ADA 404.2.3, 403.5.1, 304.3; FGI; IBC 1017).
   *Notes:* the impossible-request moment: the conflicting rooms turn red with the arithmetic.

6. **Clinic: review in 3D.** WebGPU, guided tour, walk, follow a patient, route overlays, plain-language edits with versions.

7. **Clinic: simulate the day.** Deterministic discrete-event simulation on real walking paths; quick setup; verdict, bottleneck, ranges over 20 days; compare layouts: 11.5 vs 14.6 min wait, 1.4 vs 2.0 km nurse walking.

8. **Same pipeline, a data center.** Brief → three designs (132 / 41 / 15 kW racks) → every part placed → CP-SAT proof in ~30 ms → 10 checks.

9. **Break it, price it.** Six what-ifs, single-failure sweep, thermal estimate, power paths; build cost, running cost, PUE, $/GPU-hour, CO₂, energy Sankey; OpenUSD for Omniverse.

10. **The assistant.** Tool calling (Nemotron through NIM/vLLM/llama.cpp, or built-in); it speaks first, answers only from tools, acts through the same functions as the buttons. Shared by both apps.

11. **Results and engineering.** 20/20 accepted, 0.04 s p50 (model off), 5/5 infeasible diagnosed, 152 + 58 tests, render-on-demand, instancing, local and private, $0 per plan.

12. **Where it goes.** Use cases (health systems, architects, AI infrastructure, education), next domain packs (schools, offices, warehouses, labs), roadmap. Closing line: "A new building type is a config pack, not a new product."
