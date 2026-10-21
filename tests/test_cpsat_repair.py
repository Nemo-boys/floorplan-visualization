"""Tests for CP-SAT combinatorial geometry repair and conflict core extraction."""

import pytest
from aegisplan.fml_parser import parse_fml
from aegisplan.validator import validate_plan
from aegisplan.cpsat_repair import repair_plan

# An overlapping draft where exam_1 and exam_2 overlap
OVERLAPPING_FML = """
BOUNDARY RECT 0 0 16000 12000
ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED
ROOM corridor_1 TYPE corridor RECT 0 5000 16000 2000 LOCKED
ROOM exam_1 TYPE exam RECT 0 7000 3500 5000 FREE
ROOM exam_2 TYPE exam RECT 2000 7000 3500 5000 FREE
ROOM restroom_1 TYPE restroom RECT 6000 0 2500 5000 LOCKED
DOOR door_1 CONNECT waiting_1 corridor_1 AT 3000 5000 WIDTH 1065
DOOR door_2 CONNECT exam_1 corridor_1 AT 1600 7000 WIDTH 915
DOOR door_3 CONNECT exam_2 corridor_1 AT 4800 7000 WIDTH 915
DOOR door_4 CONNECT restroom_1 corridor_1 AT 7250 5000 WIDTH 915
FDOOR door_5 CONNECT waiting_1 OUTSIDE AT 3000 0 WIDTH 1220
END_PLAN
""".strip()

# An over-constrained plan that cannot fit inside a tiny 5m x 5m building
INFEASIBLE_FML = """
BOUNDARY RECT 0 0 5000 5000
ROOM waiting_1 TYPE waiting RECT 0 0 4000 4000 LOCKED
ROOM exam_1 TYPE exam RECT 0 0 3500 4000 FREE
ROOM exam_2 TYPE exam RECT 0 0 3500 4000 FREE
END_PLAN
""".strip()


def test_repair_overlapping_plan():
    plan = parse_fml(OVERLAPPING_FML)

    # Pre-repair validation should show overlap
    pre_val = validate_plan(plan)
    overlap_check = next(c for c in pre_val.validation.checks if c.rule_id == "GEOM-OVERLAP-02")
    assert overlap_check.status == "FAIL"

    # Run CP-SAT repair
    result = repair_plan(plan, max_time_seconds=2.0)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.solve_time_ms < 2000  # fast solve

    # Validate repaired plan
    repaired_plan = validate_plan(result.plan)
    post_overlap_check = next(c for c in repaired_plan.validation.checks if c.rule_id == "GEOM-OVERLAP-02")
    assert post_overlap_check.status == "PASS"

    # Verify locked rooms remained unchanged
    waiting = next(r for r in repaired_plan.rooms if r.id == "waiting_1")
    assert waiting.bbox.x == 0 and waiting.bbox.y == 0
    assert waiting.bbox.w == 6000 and waiting.bbox.h == 5000

    corridor = next(r for r in repaired_plan.rooms if r.id == "corridor_1")
    assert corridor.bbox.x == 0 and corridor.bbox.y == 5000
    assert corridor.bbox.w == 16000 and corridor.bbox.h == 2000

    # Verify non-overlapping exam rooms
    e1 = next(r for r in repaired_plan.rooms if r.id == "exam_1")
    e2 = next(r for r in repaired_plan.rooms if r.id == "exam_2")
    # Horizontal separation
    assert (e1.bbox.x + e1.bbox.w <= e2.bbox.x) or (e2.bbox.x + e2.bbox.w <= e1.bbox.x) or (e1.bbox.y + e1.bbox.h <= e2.bbox.y) or (e2.bbox.y + e2.bbox.h <= e1.bbox.y)


def test_conflict_core_extraction_on_infeasible_brief():
    plan = parse_fml(INFEASIBLE_FML)
    result = repair_plan(plan, max_time_seconds=1.0)

    assert result.status == "INFEASIBLE"
    assert len(result.conflict_core) > 0
    # The conflict core should point to the locked room or area constraints that cause infeasibility
    assert any("LOCKED_ROOM" in c or "MIN_AREA" in c for c in result.conflict_core)
