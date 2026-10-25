"""Exporter from AegisPlan's PlanDocument to the viewer's plan.json v0.1.

The viewer (viz/contracts/plan.v0.1.schema.json) uses millimetres with the origin at the
bottom-left corner, x pointing east and y pointing north. AegisPlan uses millimetres with
the origin at the top-left corner and y pointing down (the SVG and Three.js views draw
bbox.y directly). So every y is flipped against the boundary height.

Room ids are kept as they are, so a plan edited in the viewer can be matched back to the
PlanDocument it came from. Walls, windows and furniture are not exported: the viewer
derives them from the rooms and doors.
"""

import argparse
import json
from typing import Any, Dict, List

from aegisplan.schemas import PlanDocument

SCHEMA_VERSION = "0.1"
ORIGIN = "bottom-left; x = east, y = north"
EXTERIOR = "exterior"

# AegisPlan room type -> viewer room type (the viewer's enum in plan.v0.1.schema.json).
ROOM_TYPE_MAP: Dict[str, str] = {
    "waiting": "waiting",
    "reception": "reception",
    "corridor": "corridor",
    "exam": "exam_room",
    "consult": "provider_office",
    "procedure": "procedure_room",
    "restroom": "restroom",
    "bathroom": "restroom",
    "clean_util": "clean_utility",
    "soiled_util": "soiled_utility",
    "staff_break": "staff_lounge",
    "nurse_station": "nurse_station",
    "lab": "lab",
    "storage": "storage",
}
# The viewer draws and simulates unknown types as storage; we say so explicitly.
FALLBACK_TYPE = "storage"

# Short labels for the viewer's "Plan checks" list, keyed by validator rule id.
CHECK_LABELS: Dict[str, str] = {
    "GEOM-BOUNDARY-01": "Rooms inside the building outline",
    "GEOM-OVERLAP-02": "No overlapping rooms",
    "ADA-404.2.3": "Door clear widths",
    "ADA-403.5.1": "Corridor width",
    "ADA-304.3": "Wheelchair turning space",
    "FGI-2.1-2.2": "Exam room size",
    "FGI-UTIL-SEP": "Clean and soiled utility separation",
    "IBC-1017-REACH": "Every room reachable from an exit",
    "IBC-1017-DIST": "Exit travel distance",
}


def _boundary_size(plan: PlanDocument) -> tuple:
    xs = [p[0] for p in plan.boundary.polygon]
    ys = [p[1] for p in plan.boundary.polygon]
    return max(xs) - min(xs), max(ys) - min(ys)


def _pretty(raw_type: str) -> str:
    return raw_type.replace("_", " ").capitalize()


def to_viz_plan(plan: PlanDocument, name: str = "", blurb: str = "") -> Dict[str, Any]:
    """Convert a PlanDocument into a plan.json v0.1 dict for the viewer."""
    width, depth = _boundary_size(plan)

    rooms: List[Dict[str, Any]] = []
    unmapped: List[str] = []
    for r in plan.rooms:
        viz_type = ROOM_TYPE_MAP.get(r.type)
        room: Dict[str, Any] = {
            "id": r.id,
            "type": viz_type or FALLBACK_TYPE,
            "rect": {
                "x_mm": r.bbox.x,
                "y_mm": depth - (r.bbox.y + r.bbox.h),
                "w_mm": r.bbox.w,
                "h_mm": r.bbox.h,
            },
        }
        if viz_type is None:
            # Keep the original name visible instead of a generic "Storage".
            room["label"] = _pretty(r.type)
            unmapped.append(r.type)
        rooms.append(room)

    doors: List[Dict[str, Any]] = []
    for d in plan.doors:
        connects = [EXTERIOR if c.upper() == "OUTSIDE" else c for c in d.connects]
        doors.append({
            "id": d.id,
            "kind": "door",
            "connects": connects,
            "center_mm": [d.position[0], depth - d.position[1]],
            "width_mm": d.width_mm,
            "is_entrance": EXTERIOR in connects,
        })

    checks = [
        {
            "rule": c.rule_id,
            "label": CHECK_LABELS.get(c.rule_id, c.rule_id),
            "pass": c.status != "FAIL",
            "status": c.status,
            "detail": f"{c.measured} (required: {c.required})",
            "source": c.citation,
        }
        for c in plan.validation.checks
    ]

    meta = plan.metadata
    return {
        "schema_version": SCHEMA_VERSION,
        "units": "mm",
        "origin": ORIGIN,
        "building_type": "clinic",
        "name": name or meta.plan_id,
        "blurb": blurb,
        "footprint": {"width_mm": width, "depth_mm": depth},
        "rooms": rooms,
        "doors": doors,
        "checks": checks,
        "metrics": {
            "boundary_area_m2": plan.boundary.area_m2,
            "room_area_m2": round(sum(r.area_actual_m2 for r in plan.rooms), 2),
        },
        "provenance": {
            "generator": "aegisplan",
            "plan_id": meta.plan_id,
            "generator_mode": meta.generator_mode,
            "solver_status": meta.solver_status,
            "solve_time_ms": meta.solve_time_ms,
            "source_origin": "top-left; x = east, y = south",
            "locked_rooms": [r.id for r in plan.rooms if r.locked],
            "unmapped_room_types": sorted(set(unmapped)),
            "validation_summary": plan.validation.summary_statement,
            "conflict_core": plan.validation.conflict_core,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Convert an AegisPlan plan.json into the viewer's plan.json v0.1.")
    parser.add_argument("input", help="AegisPlan plan.json (PlanDocument)")
    parser.add_argument("-o", "--out", required=True, help="Output path for the viewer plan.json")
    parser.add_argument("--name", default="", help="Plan name shown in the viewer")
    args = parser.parse_args()

    with open(args.input) as f:
        plan = PlanDocument.model_validate(json.load(f))
    with open(args.out, "w") as f:
        json.dump(to_viz_plan(plan, name=args.name), f, indent=2)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
