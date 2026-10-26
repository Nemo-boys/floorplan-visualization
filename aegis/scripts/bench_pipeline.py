"""Measured benchmark of the generation pipeline. Every number in the report comes from a run.

Three ways to get a plan for each of the 20 feasible briefs in ``aegisplan.benchmark``:

- ``raw``: the fine-tuned Nemotron alone (training prompt, no grammar, no repair), checked by the validator.
- ``pipeline``: what the app runs. Nemotron drafts the room program under the program grammar, the
  layout synthesizer places 3 variants, CP-SAT repairs, the validator ranks. Best candidate scored.
- ``template``: the same pipeline with the model switched off (the brief parser writes the program).

Plus the 5 infeasible stress tests: does CP-SAT return a conflict core instead of a plan?

    .venv/bin/python scripts/bench_pipeline.py              # all three, writes ../docs/BENCHMARK.md
    .venv/bin/python scripts/bench_pipeline.py --no-model   # template only (fast)
"""

import argparse
import asyncio
import json
import os
import platform
import statistics
import subprocess
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fidelity(room_types, brief):
    """Does the plan have every room type the brief names, and the counts the brief states?"""
    from aegisplan.program import explicit_counts, mentioned_types

    have = Counter(room_types)
    named = [t for t in mentioned_types(brief) if t != "waiting"]
    counts = explicit_counts(brief)
    return all(have[t] > 0 for t in named) and all(have[t] == n for t, n in counts.items())


def checks_of(plan):
    checks = plan.validation.checks
    return sum(c.status == "PASS" for c in checks), len(checks), {c.rule_id for c in checks if c.status == "FAIL"}


def run_raw(briefs, router):
    from aegisplan.fml_parser import parse_fml
    from aegisplan.gguf_engine import get_gguf_engine
    from aegisplan.router import SYSTEM_PROMPT
    from aegisplan.validator import validate_plan

    engine = get_gguf_engine()
    rows = []
    for b in briefs:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + "/no_think"},
            {"role": "user", "content": router._format_prompt(b["brief"], b["w"], b["h"], None, include_exemplar=False)},
        ]
        t0 = time.perf_counter()
        fml = engine.generate_chat(messages)
        dt = time.perf_counter() - t0
        row = {"id": b["id"], "latency_s": round(dt, 2), "parsed": False, "passed": 0, "total": 9,  # an unparseable plan passes none of the 9
               "all_pass": False, "fidelity": False, "fails": []}
        try:
            plan = validate_plan(parse_fml(fml))
            if plan.rooms:
                p, t, fails = checks_of(plan)
                row.update(parsed=True, passed=p, total=t, all_pass=p == t, fails=sorted(fails),
                           fidelity=fidelity([r.type for r in plan.rooms], b["brief"]))
        except Exception as e:  # unparseable output counts as a failure, which is the point
            row["error"] = str(e)[:120]
        rows.append(row)
        print(f"  raw      {b['id']}: parsed={row['parsed']} {row['passed']}/{row['total']} {dt:.1f}s", flush=True)
    return rows


async def run_pipeline(briefs, router, label):
    from aegisplan.program import explicit_counts, program_from_fml

    rows = []
    for b in briefs:
        t0 = time.perf_counter()
        cands = await router.generate_candidates(b["brief"], b["w"], b["h"], mode="local", num_candidates=3)
        dt = time.perf_counter() - t0
        best = cands[0]
        p, t, fails = checks_of(best.repaired_plan)
        model_prog = program_from_fml(best.model_fml) if best.model_fml else {}
        stated = explicit_counts(b["brief"])
        rows.append({
            "id": b["id"], "latency_s": round(dt, 2), "source": best.source, "solver": best.solver_status,
            "passed": p, "total": t, "all_pass": p == t, "fails": sorted(fails),
            "candidates_all_pass": sum(c.checks_passed == c.total_checks for c in cands),
            "fidelity": fidelity([r.type for r in best.repaired_plan.rooms], b["brief"]),
            # Before the brief's stated counts are merged in: did the model alone get them right?
            "model_counts_right": all(model_prog.get(k) == v for k, v in stated.items()) if model_prog else None,
        })
        print(f"  {label:8} {b['id']}: {best.source} {best.solver_status} {p}/{t} {dt:.1f}s", flush=True)
    return rows


def run_stress(briefs):
    from aegisplan.benchmark import BenchmarkHarness  # noqa: F401  (keeps the briefs' module importable)
    from aegisplan.cpsat_repair import repair_plan
    from aegisplan.schemas import BoundingBox, PlanDocument, Room

    rows = []
    for b in briefs:
        rooms = [Room(id=r["id"], type=r["type"], label=r["id"], locked=True,
                      bbox=BoundingBox(x=r["x"], y=r["y"], w=r["w"], h=r["h"]),
                      polygon=[[r["x"], r["y"]], [r["x"] + r["w"], r["y"]], [r["x"] + r["w"], r["y"] + r["h"]], [r["x"], r["y"] + r["h"]]],
                      area_actual_m2=r["w"] * r["h"] / 1e6) for r in b.get("locked", [])]
        if b["id"] in ("stress_01", "stress_05"):
            rooms += [Room(id=f"exam_{i}", type="exam", label=f"Exam {i}", locked=False, bbox=BoundingBox(x=0, y=0, w=3200, h=3700),
                           polygon=[[0, 0], [3200, 0], [3200, 3700], [0, 3700]], area_actual_m2=11.84) for i in (1, 2)]
        plan = PlanDocument(boundary={"polygon": [[0, 0], [b["w"], 0], [b["w"], b["h"]], [0, b["h"]]], "area_m2": b["w"] * b["h"] / 1e6},
                            rooms=rooms, walls=[], doors=[])
        res = repair_plan(plan, max_time_seconds=1.0)
        rows.append({"id": b["id"], "status": res.status, "core": res.conflict_core[:3], "ms": res.solve_time_ms,
                     "diagnosed": res.status == "INFEASIBLE" and bool(res.conflict_core)})
    return rows


def summary(rows):
    lat = sorted(r["latency_s"] for r in rows)
    n = len(rows)
    acc = sum(r["all_pass"] for r in rows)
    return {
        "n": n,
        "parsed": sum(r.get("parsed", True) for r in rows),
        "all_pass": acc,
        "checks_pct": round(100 * sum(r["passed"] for r in rows) / max(1, sum(r["total"] for r in rows)), 1),
        "fidelity": sum(r["fidelity"] for r in rows),
        "p50_s": round(statistics.median(lat), 2),
        "max_s": round(lat[-1], 2),
        "s_per_accepted": round(sum(lat) / acc, 1) if acc else None,
        "fails": Counter(f for r in rows for f in r["fails"]).most_common(),
    }


def machine():
    chip = platform.processor()
    try:
        chip = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True).stdout.strip() or chip
    except OSError:
        pass
    return f"{chip}, {platform.system()} {platform.release()}"


def markdown(res):
    lines = [
        "# Benchmark (measured)",
        "",
        f"Run on {res['date']}, {res['machine']}. Model: `{res['model'] or 'none'}` (llama.cpp, Q4_K_M, Metal).",
        f"Briefs: the 20 feasible clinic briefs and 5 infeasible stress tests in `aegis/aegisplan/benchmark.py`. "
        "Regenerate with `make bench`. Raw per-brief rows: `aegis/benchmark_measured.json`.",
        "",
        "A plan is **accepted** when every implemented check that applies passes (8 or 9 per plan: geometry, ADA clearances, FGI room sizes, IBC egress). "
        "**Brief fidelity**: the plan has every room type the brief names and the room counts it states.",
        "",
        "| Configuration | Parses | Accepted | Checks passed | Brief fidelity | p50 / max latency | Seconds per accepted plan |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    names = {
        "raw": "Fine-tuned Nemotron alone (no grammar, no repair)",
        "template": "Pipeline, model off (brief parser → synthesizer → CP-SAT)",
        "pipeline": "**Pipeline (Nemotron program + grammar → synthesizer → CP-SAT)**",
    }
    for key in ("raw", "template", "pipeline"):
        s = res["summary"].get(key)
        if not s:
            continue
        n = s["n"]
        lines.append(
            f"| {names[key]} | {s['parsed']}/{n} | {s['all_pass']}/{n} | {s['checks_pct']}% | {s['fidelity']}/{n} | "
            f"{s['p50_s']} s / {s['max_s']} s | {s['s_per_accepted'] if s['s_per_accepted'] is not None else '—'} |"
        )
    lines += ["", "Most common failed checks:", ""]
    for key in ("raw", "template", "pipeline"):
        s = res["summary"].get(key)
        if s:
            fails = ", ".join(f"{k} ×{v}" for k, v in s["fails"][:5]) or "none"
            lines.append(f"- {names[key].strip('*')}: {fails}")
    mc = [r["model_counts_right"] for r in res.get("pipeline", []) if r["model_counts_right"] is not None]
    if mc:
        lines += ["", f"The model's own program had the brief's stated room counts right in {sum(mc)} of {len(mc)} briefs; "
                  "the pipeline then applies the stated counts, so the final plans match the brief regardless."]
    st = res["stress"]
    lines += [
        "",
        f"**Infeasible requests:** {sum(r['diagnosed'] for r in st)}/{len(st)} returned INFEASIBLE with a conflict core "
        f"instead of a plan (max {max(r['ms'] for r in st)} ms).",
        "",
        "**Cost:** everything runs on the laptop; there is no API call, so the marginal cost is electricity. "
        "Latency is wall time for 3 candidates, including the model's program draft (one call per request).",
        "",
        "This file supersedes `aegis/benchmark_report.md`, whose baseline rows were fixed numbers rather than measurements.",
    ]
    return "\n".join(lines) + "\n"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-model", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    from aegisplan.benchmark import BENCHMARK_BRIEFS
    from aegisplan.gguf_engine import find_gguf_model_path
    from aegisplan.router import GenerationRouter

    feasible = [b for b in BENCHMARK_BRIEFS if b["type"] == "feasible"]
    if args.limit:
        feasible = feasible[: args.limit]
    stress = [b for b in BENCHMARK_BRIEFS if b["type"] == "infeasible"]

    os.environ["AEGISPLAN_DISABLE_MODEL"] = "1"
    res = {"date": time.strftime("%Y-%m-%d"), "machine": machine(), "model": None, "summary": {}}
    res["template"] = await run_pipeline(feasible, GenerationRouter(), "template")
    res["stress"] = run_stress(stress)

    if not args.no_model:
        del os.environ["AEGISPLAN_DISABLE_MODEL"]
        path = find_gguf_model_path()
        if not path:
            raise SystemExit("No GGUF model found; run with --no-model.")
        res["model"] = Path(path).name
        router = GenerationRouter()
        res["raw"] = run_raw(feasible, router)
        res["pipeline"] = await run_pipeline(feasible, router, "pipeline")

    for key in ("raw", "template", "pipeline"):
        if key in res:
            res["summary"][key] = summary(res[key])
    (ROOT / "benchmark_measured.json").write_text(json.dumps(res, indent=2))
    (ROOT.parent / "docs" / "BENCHMARK.md").write_text(markdown(res))
    print(markdown(res))


if __name__ == "__main__":
    asyncio.run(main())
