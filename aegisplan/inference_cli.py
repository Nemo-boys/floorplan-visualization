"""AegisPlan Inference & Synthesis CLI.

Executes end-to-end neuro-symbolic inference:
1. Generates FML-DSL candidates using fine-tuned Nemotron (via local/remote endpoint or router)
2. Parses FML stream into certified PlanDocument
3. Audits ADA (§404, §403, §304), FGI (§2.1, §2.2), and IBC-1017 code compliance
4. Applies OR-Tools CP-SAT geometric repair to eliminate overlaps and enforce circulation
5. Exports certified plan.json, compliance report, and CAD SVG
"""

import os
import sys
import json
import argparse
import asyncio
from typing import Optional, List, Dict, Any

from aegisplan.schemas import PlanDocument
from aegisplan.fml_parser import parse_fml, serialize_to_fml
from aegisplan.validator import validate_plan
from aegisplan.cpsat_repair import repair_plan
from aegisplan.router import GenerationRouter, SYSTEM_PROMPT


def format_cli_table(title: str, rows: List[List[str]], headers: List[str]) -> str:
    col_widths = [len(h) for h in headers]
    for row in rows:
        for idx, val in enumerate(row):
            col_widths[idx] = max(col_widths[idx], len(str(val)))
    
    sep_line = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"
    header_line = "| " + " | ".join(h.ljust(w) for h, w in zip(headers, col_widths)) + " |"
    
    lines = [f"\n=== {title} ===", sep_line, header_line, sep_line]
    for row in rows:
        r_str = "| " + " | ".join(str(val).ljust(w) for val, w in zip(row, col_widths)) + " |"
        lines.append(r_str)
    lines.append(sep_line)
    return "\n".join(lines)


def export_svg(plan: PlanDocument, output_path: str):
    """Render 2D CAD SVG diagram."""
    bw = max(p[0] for p in plan.boundary.polygon)
    bh = max(p[1] for p in plan.boundary.polygon)
    scale = 0.05
    svg_w = int(bw * scale)
    svg_h = int(bh * scale)
    
    palette = {
        "corridor": "#e2e8f0",
        "waiting": "#fed7aa",
        "exam": "#bfdbfe",
        "restroom": "#bbf7d0",
        "clean_util": "#c7d2fe",
        "soiled_util": "#fecaca",
        "procedure": "#ddd6fe",
        "reception": "#fef08a",
        "staff_break": "#f5d0fe",
    }
    
    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" width="{svg_w}" height="{svg_h}" style="background:#0f172a;font-family:sans-serif;">',
        f'  <rect x="0" y="0" width="{svg_w}" height="{svg_h}" fill="#1e293b" stroke="#334155" stroke-width="2"/>',
    ]
    
    for r in plan.rooms:
        rx = int(r.bbox.x * scale)
        ry = int(r.bbox.y * scale)
        rw = int(r.bbox.w * scale)
        rh = int(r.bbox.h * scale)
        fill = palette.get(r.type, "#94a3b8")
        stroke = "#ef4444" if r.locked else "#3b82f6"
        svg_lines.append(f'  <rect x="{rx}" y="{ry}" width="{rw}" height="{rh}" fill="{fill}" fill-opacity="0.8" stroke="{stroke}" stroke-width="1.5"/>')
        svg_lines.append(f'  <text x="{rx + rw/2}" y="{ry + rh/2}" font-size="10" fill="#0f172a" font-weight="bold" text-anchor="middle" dominant-baseline="middle">{r.id}</text>')
    
    for d in plan.doors:
        dx = int(d.position[0] * scale)
        dy = int(d.position[1] * scale)
        dw = max(int(d.width_mm * scale), 4)
        svg_lines.append(f'  <circle cx="{dx}" cy="{dy}" r="{dw/2}" fill="#22c55e" stroke="#ffffff" stroke-width="1"/>')
        
    svg_lines.append('</svg>')
    
    with open(output_path, "w") as f:
        f.write("\n".join(svg_lines))


async def run_pipeline(
    brief: str,
    boundary_w: int,
    boundary_h: int,
    fml_text: Optional[str] = None,
    endpoint: Optional[str] = None,
    out_json: Optional[str] = None,
    out_svg: Optional[str] = None,
):
    print("\n" + "=" * 65)
    print("  AEGISPLAN: NEURO-SYMBOLIC SPATIAL SYNTHESIS INFERENCE")
    print("=" * 65)
    print(f"Clinical Brief: {brief}")
    print(f"Boundary:       {boundary_w}mm x {boundary_h}mm")
    
    # 1. Obtain FML-DSL text
    if fml_text:
        print("\n[Stage 1] Using provided FML-DSL layout...")
        raw_fml = fml_text.strip()
    else:
        print(f"\n[Stage 1] Synthesizing via GenerationRouter (endpoint: {endpoint or 'heuristic/local'})...")
        router = GenerationRouter(local_endpoint=endpoint or "http://localhost:8000/v1")
        evaluations = await router.generate_candidates(
            brief=brief,
            boundary_w=boundary_w,
            boundary_h=boundary_h,
            num_candidates=1,
        )
        if not evaluations:
            raise RuntimeError("Candidate generation failed.")
        raw_fml = evaluations[0].raw_fml

    print("\n--- Raw FML-DSL Stream ---")
    print(raw_fml)
    print("--------------------------")

    # 2. Parse into initial plan
    print("\n[Stage 2] Parsing FML-DSL into Building Contract...")
    initial_plan = parse_fml(raw_fml, plan_id="inference_plan")
    
    # 3. Initial Validation
    print("\n[Stage 3] Auditing Initial Layout against Healthcare Regulations...")
    initial_val = validate_plan(initial_plan)
    init_passes = sum(1 for c in initial_val.validation.checks if c.status == "PASS")
    init_total = len(initial_val.validation.checks)
    print(f"Initial Compliance Score: {init_passes}/{init_total} checks passed ({(init_passes/init_total)*100:.1f}%)")
    
    # 4. CP-SAT Geometric Repair
    print("\n[Stage 4] Applying OR-Tools CP-SAT Geometric Repair...")
    repair_res = repair_plan(initial_plan)
    print(f"Solver Status: {repair_res.status} in {repair_res.solve_time_ms} ms")
    
    # 5. Final Validation
    print("\n[Stage 5] Auditing Repaired Layout...")
    final_plan = validate_plan(repair_res.plan)
    final_passes = sum(1 for c in final_plan.validation.checks if c.status == "PASS")
    final_total = len(final_plan.validation.checks)
    print(f"Final Compliance Score:   {final_passes}/{final_total} checks passed ({(final_passes/final_total)*100:.1f}%)")

    # Metrics Summary Table
    rows = [
        ["Total Rooms", str(len(initial_plan.rooms)), str(len(final_plan.rooms))],
        ["Total Doors", str(len(initial_plan.doors)), str(len(final_plan.doors))],
        ["Compliance Pass Rate", f"{(init_passes/init_total)*100:.1f}%", f"{(final_passes/final_total)*100:.1f}%"],
        ["CP-SAT Repair Status", "N/A", repair_res.status],
        ["CP-SAT Solve Time", "N/A", f"{repair_res.solve_time_ms} ms"],
    ]
    print(format_cli_table("Synthesis Comparison", rows, ["Metric", "Pre-Repair", "Post-Repair"]))

    # Rule checks breakdown
    rule_rows = [
        [c.rule_id, c.citation, c.measured, c.status]
        for c in final_plan.validation.checks
    ]
    print(format_cli_table("Regulatory Audit Breakdown", rule_rows, ["Rule ID", "Standard", "Measured", "Status"]))

    # Save outputs
    if out_json:
        with open(out_json, "w") as f:
            f.write(final_plan.model_dump_json(indent=2))
        print(f"\n✓ Saved validated PlanDocument to: {out_json}")
        
    if out_svg:
        export_svg(final_plan, out_svg)
        print(f"✓ Saved 2D CAD SVG diagram to:    {out_svg}")

    print("\nInference pipeline completed successfully!")


def main():
    parser = argparse.ArgumentParser(description="AegisPlan Inference & Spatial Synthesis CLI")
    parser.add_argument("--brief", type=str, default="Design a 20m x 14m Urgent care satellite facility requiring central circulation corridor, 4 outpatient exam rooms (>= 11.15 m2 each), single-user ADA restroom, clean and soiled utility support rooms.", help="Clinical architectural brief")
    parser.add_argument("--boundary-w", type=int, default=20000, help="Boundary width in mm")
    parser.add_argument("--boundary-h", type=int, default=14000, help="Boundary height in mm")
    parser.add_argument("--fml", type=str, default=None, help="Raw FML-DSL text to parse and repair directly")
    parser.add_argument("--fml-file", type=str, default=None, help="Path to .fml file")
    parser.add_argument("--endpoint", type=str, default=None, help="OpenAI-compatible LLM endpoint (e.g. Colab ngrok URL)")
    parser.add_argument("--out", type=str, default="inference_output.json", help="Output path for plan.json")
    parser.add_argument("--svg", type=str, default="inference_output.svg", help="Output path for 2D CAD SVG")

    args = parser.parse_args()

    fml_content = args.fml
    if args.fml_file and os.path.exists(args.fml_file):
        with open(args.fml_file, "r") as f:
            fml_content = f.read()

    asyncio.run(
        run_pipeline(
            brief=args.brief,
            boundary_w=args.boundary_w,
            boundary_h=args.boundary_h,
            fml_text=fml_content,
            endpoint=args.endpoint,
            out_json=args.out,
            out_svg=args.svg,
        )
    )


if __name__ == "__main__":
    main()
