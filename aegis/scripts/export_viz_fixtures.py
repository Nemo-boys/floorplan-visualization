"""Write viewer plan.json fixtures from AegisPlan plans, for the viz-side integration tests.

Usage: python scripts/export_viz_fixtures.py [--count 5]
Output: viz/tests/fixtures/aegis/*.plan.json
"""

import argparse
import json
from pathlib import Path

from aegisplan.export_viz import to_viz_plan
from aegisplan.fml_parser import parse_fml
from aegisplan.router import FEW_SHOT_EXEMPLAR, GenerationRouter
from aegisplan.validator import validate_plan

AEGIS_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = AEGIS_ROOT.parent / "viz" / "tests" / "fixtures" / "aegis"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=5, help="How many plans to take from dataset/test.jsonl")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    plans = [("exemplar", FEW_SHOT_EXEMPLAR)]
    with open(AEGIS_ROOT / "dataset" / "test.jsonl") as f:
        for i, line in enumerate(f):
            if i >= args.count:
                break
            msgs = json.loads(line)["messages"]
            plans.append((f"test_{i + 1:02d}", next(m["content"] for m in msgs if m["role"] == "assistant")))

    # The offline fallback candidates include a nurse station.
    fallback = GenerationRouter()._synthesize_heuristic_candidates("", 24000, 14000, None, 3)
    plans += [(f"fallback_{i + 1}", fml) for i, fml in enumerate(fallback)]

    for name, fml in plans:
        viz = to_viz_plan(validate_plan(parse_fml(fml, plan_id=name)), name=f"AegisPlan {name}")
        path = OUT_DIR / f"{name}.plan.json"
        path.write_text(json.dumps(viz, indent=2) + "\n")
        print(f"Wrote {path.relative_to(AEGIS_ROOT.parent)}")


if __name__ == "__main__":
    main()
