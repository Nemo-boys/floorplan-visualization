# Benchmark (measured)

> Partial: only the model-off rows so far. The model rows come from `make bench` (about 30 min), planned for Thu Oct 29.

Run on 2026-10-25, Apple M4 Pro, Darwin 27.0.0. Model: `none` (llama.cpp, Q4_K_M, Metal).
Briefs: the 20 feasible clinic briefs and 5 infeasible stress tests in `aegis/aegisplan/benchmark.py`. Regenerate with `make bench`. Raw per-brief rows: `aegis/benchmark_measured.json`.

A plan is **accepted** when every implemented check that applies passes (8 or 9 per plan: geometry, ADA clearances, FGI room sizes, IBC egress). **Brief fidelity**: the plan has every room type the brief names and the room counts it states.

| Configuration | Parses | Accepted | Checks passed | Brief fidelity | p50 / max latency | Seconds per accepted plan |
|---|---:|---:|---:|---:|---:|---:|
| Pipeline, model off (brief parser → synthesizer → CP-SAT) | 20/20 | 20/20 | 100.0% | 20/20 | 0.04 s / 0.13 s | 0.1 |

Most common failed checks:

- Pipeline, model off (brief parser → synthesizer → CP-SAT): none

**Infeasible requests:** 5/5 returned INFEASIBLE with a conflict core instead of a plan (max 0 ms).

**Cost:** everything runs on the laptop; there is no API call, so the marginal cost is electricity. Latency is wall time for 3 candidates, including the model's program draft (one call per request).

This file supersedes `aegis/benchmark_report.md`, whose baseline rows were fixed numbers rather than measurements.
