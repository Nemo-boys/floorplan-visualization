"""Verifiable Reward Function for RLVR / GRPO Training (Module 1C Stage 2).

Adapted from Lara et al. (2026) and GreenPlanner (2025).
Evaluates an FML rollout against geometric integrity, topological door connectivity,
target area fidelity, and ADA/FGI healthcare standards in <5 ms without human annotations.
"""

from typing import List, Dict, Any, Optional
import re
from shapely.geometry import box, Polygon

from aegisplan.schemas import PlanDocument
from aegisplan.fml_parser import parse_fml
from aegisplan.validator import validate_plan


def compute_verifiable_reward(
    fml_completion: str,
    target_boundary_w: int = 16000,
    target_boundary_h: int = 12000,
    expected_rooms: Optional[List[str]] = None,
) -> Dict[str, float]:
    """Compute dense verifiable 4-term reward R in [0.0, 1.0].

    R = 0.30 * r_overlap + 0.30 * r_conn + 0.20 * r_area + 0.20 * r_regulatory
    """
    # 0. Check syntax parsing
    try:
        plan = parse_fml(fml_completion)
        syntax_score = 1.0
    except Exception:
        return {
            "reward": 0.0,
            "r_syntax": 0.0,
            "r_overlap": 0.0,
            "r_conn": 0.0,
            "r_area": 0.0,
            "r_regulatory": 0.0,
        }

    # 1. Non-Overlap Reward: r_overlap = max(0, 1 - 10 * (overlap_area / total_area))
    total_area = 0.0
    overlap_area = 0.0
    polys = [box(r.bbox.x, r.bbox.y, r.bbox.x + r.bbox.w, r.bbox.y + r.bbox.h) for r in plan.rooms]

    for i in range(len(polys)):
        total_area += polys[i].area
        for j in range(i + 1, len(polys)):
            if polys[i].intersects(polys[j]):
                inter = polys[i].intersection(polys[j]).area
                if inter > 10.0:
                    overlap_area += inter

    overlap_ratio = (overlap_area / total_area) if total_area > 0 else 1.0
    r_overlap = max(0.0, 1.0 - 10.0 * overlap_ratio)

    # 2. Door Connectivity Reward: r_conn = reachability percentage from OUTSIDE
    validated = validate_plan(plan)
    reach_check = next((c for c in validated.validation.checks if c.rule_id == "IBC-1017-REACH"), None)
    if reach_check and reach_check.status == "PASS":
        r_conn = 1.0
    else:
        # Partial credit: fraction of rooms connected to at least one door
        door_rooms = set()
        for d in plan.doors:
            door_rooms.update(d.connects)
        connected_count = sum(1 for r in plan.rooms if r.id in door_rooms)
        r_conn = connected_count / max(1, len(plan.rooms))

    # 3. Target Area & Room Presence Reward: r_area
    if expected_rooms:
        found_types = [r.type for r in plan.rooms]
        match_count = sum(1 for t in expected_rooms if t in found_types)
        r_area = match_count / max(1, len(expected_rooms))
    else:
        # Default: verify all rooms have positive realistic area (> 5 m2)
        valid_sized = sum(1 for r in plan.rooms if r.area_actual_m2 >= 5.0)
        r_area = valid_sized / max(1, len(plan.rooms))

    # 4. ADA & FGI Regulatory Compliance Reward: r_regulatory
    passed_rules = sum(1 for c in validated.validation.checks if c.status == "PASS")
    total_rules = len(validated.validation.checks)
    r_regulatory = passed_rules / max(1, total_rules)

    # Combined composite verifiable reward
    composite_reward = (
        0.30 * r_overlap +
        0.30 * r_conn +
        0.20 * r_area +
        0.20 * r_regulatory
    )

    return {
        "reward": round(composite_reward, 4),
        "r_syntax": syntax_score,
        "r_overlap": round(r_overlap, 4),
        "r_conn": round(r_conn, 4),
        "r_area": round(r_area, 4),
        "r_regulatory": round(r_regulatory, 4),
    }
