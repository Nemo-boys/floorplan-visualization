# Overview

## One-liners

- **Brief in, building out.** Describe a building in a sentence; get valid floor plans, a 3D model, a simulation of how it performs, and a file for Blender or NVIDIA Omniverse.
- A local NVIDIA Nemotron model drafts, a constraint solver makes it exact, a rule checker cites what passed, and the browser lets anyone walk it, stress it and price it.
- **Same model, same solver, same viewer. A new building type is a config pack, not a new product.** We show it with two very different buildings: an outpatient clinic and an AI data center.

## The problem

1. **Early building design is slow and expert-bound.** Turning a brief ("a primary-care clinic with 6 exam rooms") into a first plan takes an architect days. Testing whether that plan actually works on a busy day takes longer, and usually never happens before construction.
2. **Language models alone can't be trusted with geometry.** Asked to draw a plan, an LLM overlaps rooms, makes corridors too narrow, forgets the brief and invents compliance. We measured this on our own fine-tuned model: without a grammar it ignores its training format; with one, the room list is right but the coordinates don't fit the site.
3. **Solvers alone can't read a brief.** A constraint solver gives exact geometry but cannot interpret "nurse station among the exam rooms" or "enough for 6,000 GB200s".
4. **Plans are judged on paper, not on how they run.** How long patients wait, how far nurses walk, whether a data center survives a cooler failure: these are the questions owners care about, and they are answered late, if at all.

## The idea: split the work by what each tool is good at

| Job | Tool | Why |
|---|---|---|
| Read intent, write the room program, read edits | **NVIDIA Nemotron Nano 9B v2**, fine-tuned (QLoRA + GRPO), grammar-constrained, running locally | Language understanding; never trusted with coordinates |
| Exact geometry, or a proof that a request is impossible | **Google OR-Tools CP-SAT** | No overlaps, locked rooms kept, minimal moves; names the conflicting rooms when infeasible |
| Say what passed and why | **Rule checker** with citations (ADA, FGI, IBC; ASHRAE, NEC, NFPA for data centers) | Reports what it checked, never a blanket "compliant" |
| Show it, run it, price it | **Browser app**: WebGPU 3D, deterministic simulation, failure testing, cost model | Everyone sees the same geometry; numbers are reproducible |
| Talk to it | **Tool-calling assistant** (Nemotron, or a built-in fallback) | Answers from the app's live numbers and acts through the same functions as the buttons |

## What a user does

**Clinic:** type a brief → three candidate plans ranked by the checks they pass → review in 3D (orbit, guided tour, walk, follow a patient) → simulate 20 clinic days (flu season, short-staffed…) → compare layouts on the same day → edit in plain language ("make the waiting room 20% bigger, keep the restrooms") → export GLB, plan.json, SVG and a Blender build script.

**Data center:** type "20 MW AI factory, liquid cooled, N+1 cooling, 2N power" → three designs (liquid, hybrid, air) with every rack, cooler, UPS and generator placed → see heat, power paths and backup in 3D → break any part or run a heat wave and watch what keeps running → see build cost, running cost and where the energy goes → export OpenUSD for Omniverse.

## Why it matters

- **Hours to minutes** for a first, checked, simulated plan.
- **Decisions on evidence:** wait times, walking distance, failure tolerance and cost, before anything is built.
- **Runs on a laptop.** The model is a 5.5 GB quantized GGUF on Apple Silicon Metal; the apps run in the browser. No data leaves the machine, and there is no per-plan API cost.
- **Honest by construction.** Every check names its rule; impossible requests return the conflicting rooms and the arithmetic instead of a made-up plan.
- **General.** The second domain (data centers) reuses the pipeline, the solver, the 3D engine, the assistant and the design system.

## Taglines (pick one)

- "From a sentence to a building you can walk, stress and price."
- "The LLM proposes. The solver proves. The simulator tells you if it works."
- "Design it, break it, price it. In your browser."
- "Neuro-symbolic architecture: Nemotron for intent, CP-SAT for geometry."
