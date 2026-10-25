"""Unit tests for geometric and regulatory validator."""

from aegisplan.fml_parser import parse_fml
from aegisplan.validator import validate_plan

SAMPLE_VALID_FML = """
BOUNDARY RECT 0 0 16000 12000
ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED
ROOM corridor_1 TYPE corridor RECT 0 5000 16000 2000 LOCKED
ROOM exam_1 TYPE exam RECT 0 7000 3200 5000 FREE
ROOM exam_2 TYPE exam RECT 3200 7000 3200 5000 FREE
ROOM restroom_1 TYPE restroom RECT 6000 0 2500 5000 LOCKED
DOOR door_1 CONNECT waiting_1 corridor_1 AT 3000 5000 WIDTH 1065
DOOR door_2 CONNECT exam_1 corridor_1 AT 1600 7000 WIDTH 915
DOOR door_3 CONNECT exam_2 corridor_1 AT 4800 7000 WIDTH 915
DOOR door_4 CONNECT restroom_1 corridor_1 AT 7250 5000 WIDTH 915
FDOOR door_5 CONNECT waiting_1 OUTSIDE AT 3000 0 WIDTH 1220
END_PLAN
""".strip()

SAMPLE_DEFICIENT_FML = """
BOUNDARY RECT 0 0 16000 12000
ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED
ROOM corridor_1 TYPE corridor RECT 0 5000 16000 1200 LOCKED
ROOM exam_1 TYPE exam RECT 0 7000 2500 4000 FREE
ROOM exam_2 TYPE exam RECT 2000 7000 3200 5000 FREE
DOOR door_1 CONNECT waiting_1 corridor_1 AT 3000 5000 WIDTH 750
FDOOR door_5 CONNECT waiting_1 OUTSIDE AT 3000 0 WIDTH 1220
END_PLAN
""".strip()


def test_valid_plan_validation():
    plan = parse_fml(SAMPLE_VALID_FML)
    plan = validate_plan(plan)

    assert len(plan.validation.conflict_core) == 0
    statuses = [c.status for c in plan.validation.checks]
    assert all(s == "PASS" for s in statuses)
    assert "Passed" in plan.validation.summary_statement


def test_deficient_plan_validation():
    plan = parse_fml(SAMPLE_DEFICIENT_FML)
    plan = validate_plan(plan)

    # Should fail:
    # 1. Overlap between exam_1 (0..2500) and exam_2 (2000..5200)
    # 2. Corridor width (1200mm < 1830mm)
    # 3. Door width (750mm < 815mm)
    # 4. Exam 1 area (2.5m * 4m = 10m2 < 11.15m2) and min dim (2500mm < 3048mm)
    # 5. Exam 1 and 2 unreachable (no doors connecting them)

    failed_rules = {c.rule_id for c in plan.validation.checks if c.status == "FAIL"}
    assert "GEOM-OVERLAP-02" in failed_rules
    assert "ADA-403.5.1" in failed_rules
    assert "ADA-404.2.3" in failed_rules
    assert "FGI-2.1-2.2" in failed_rules
    assert "IBC-1017-REACH" in failed_rules
    assert len(plan.validation.conflict_core) > 0
