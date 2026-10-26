# Presentation source material

Everything about **Floorplan Intelligence** (AegisPlan + the 3D viewer + Data Center Studio), written as source text for generating slides, a pitch, a video script, a write-up or a submission form. Built for the **Nebius × NVIDIA Global AI Hackathon 2026** (submissions close Fri Oct 30, 2026, 10:00 PDT).

Each file stands on its own, so a generator can take one file per slide group.

| File | What it covers |
|---|---|
| [01-overview.md](01-overview.md) | One-liners, the problem, the idea, why it matters, taglines |
| [02-architecture.md](02-architecture.md) | System architecture, data flow, contracts, repository map |
| [03-aegisplan-generation.md](03-aegisplan-generation.md) | Nemotron fine-tune, grammar-constrained decoding, program-first generation, CP-SAT repair, rule checker, edits, infeasibility proofs |
| [04-clinic-viewer.md](04-clinic-viewer.md) | The clinic app: import, 3D review, discrete-event simulation, scenarios, results, compare, export |
| [05-datacenter-studio.md](05-datacenter-studio.md) | Data Center Studio: brief → three designs → failure testing → cost; engines, checks, 3D, OpenUSD |
| [06-assistant.md](06-assistant.md) | The tool-calling assistant (Nemotron or built-in), shared by both apps |
| [07-design-and-ux.md](07-design-and-ux.md) | The design system, interaction principles, accessibility |
| [08-engineering-and-performance.md](08-engineering-and-performance.md) | 3D rendering, performance techniques, testing, measured benchmarks |
| [09-use-cases.md](09-use-cases.md) | Where it can be used, who uses it, value |
| [10-tech-stack.md](10-tech-stack.md) | Every technology used, and where |
| [11-key-numbers.md](11-key-numbers.md) | A fact sheet of numbers safe to quote, with their source |
| [12-limitations-and-roadmap.md](12-limitations-and-roadmap.md) | Honest limits, wording to avoid, what comes next |
| [13-demo-script.md](13-demo-script.md) | A 3–4 minute demo script covering both domains |
| [14-slide-outline.md](14-slide-outline.md) | A suggested 12-slide deck with speaker notes |
| [15-faq.md](15-faq.md) | Likely judge questions and short answers |

## Rules for anyone generating from this

- **Quote only numbers from [11-key-numbers.md](11-key-numbers.md).** They are measured or come from the code. Do not use the benchmark table in `aegis/README.md` or `aegis/benchmark_report.md`: some of its rows are hard-coded, not measured (see `handoff/FINDINGS.md`).
- Say "passes N implemented checks", never "code-compliant". Say "thermal estimate", never "CFD". Cost figures are planning estimates from stated, editable assumptions.
- The project name is **Floorplan Intelligence**. **AegisPlan** is its generation engine. **Data Center Studio** is the data center app.
