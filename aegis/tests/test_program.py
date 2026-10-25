"""Tests for room programs and the double-loaded-corridor layout synthesizer."""

import pytest

from aegisplan.cpsat_repair import repair_plan
from aegisplan.fml_grammar import build_gbnf
from aegisplan.fml_parser import parse_fml
from aegisplan.program import (
    VARIANTS,
    explicit_counts,
    layout_program,
    merge_programs,
    program_from_brief,
    program_from_fml,
)
from aegisplan.validator import validate_plan

BRIEF = (
    "Primary care clinic with 6 exam rooms, a nurse station, reception and waiting, "
    "an ADA restroom, and separate clean and soiled utility rooms."
)


def test_brief_parser_reads_counts_and_mentions():
    assert explicit_counts(BRIEF) == {"exam": 6, "nurse_station": 1, "restroom": 1}
    assert program_from_brief(BRIEF) == {
        "exam": 6, "nurse_station": 1, "reception": 1, "restroom": 1, "clean_util": 1, "soiled_util": 1,
    }
    vague = program_from_brief("Pediatric care: a few exam rooms, an observation room and a lab.")
    assert vague["exam"] == 4 and vague["procedure"] == 1 and vague["lab"] == 1
    assert program_from_brief("eight exam rooms, two restrooms")["exam"] == 8


def test_merge_keeps_brief_counts_and_caps_repeats():
    model = {"exam": 5, "restroom": 4, "lab": 3}
    merged = merge_programs(model, BRIEF)
    assert merged["exam"] == 6  # the brief's number wins
    assert merged["restroom"] == 1  # "an ADA restroom"
    assert merged["lab"] == 1  # unstated repeats are capped
    assert merged["clean_util"] == 1 and merged["soiled_util"] == 1  # named in the brief, missed by the model


def test_program_from_model_output():
    fml = build_gbnf(24000, 14000, schema="program")  # sanity: the program grammar builds
    assert "END_PLAN" in fml
    out = """BOUNDARY RECT 0 0 24000 14000
ROOM corridor_1 TYPE corridor RECT 0 5000 24000 2000 LOCKED
ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED
ROOM exam_1 TYPE exam RECT 0 7000 3200 5000 FREE
ROOM exam_2 TYPE exam RECT 3200 7000 3200 5000 FREE
ROOM lab_1 TYPE lab RECT 6400 7000 3200 5000 FREE
END_PLAN"""
    assert program_from_fml(out) == {"exam": 2, "lab": 1}


@pytest.mark.parametrize("w,h", [(24000, 14000), (30000, 16000), (20000, 12000)])
@pytest.mark.parametrize("variant", VARIANTS)
def test_layouts_pass_every_check(w, h, variant):
    for program in (program_from_brief(BRIEF), {"exam": 4, "restroom": 1}):
        plan = validate_plan(parse_fml(layout_program(program, w, h, variant)))
        failed = [c.rule_id for c in plan.validation.checks if c.status != "PASS"]
        assert failed == [], (program, failed)
        assert repair_plan(plan).status in ("OPTIMAL", "FEASIBLE")


def test_center_entrance_shortens_egress():
    dist = {
        v: validate_plan(parse_fml(layout_program(program_from_brief(BRIEF), 24000, 14000, v)))
        .topology.computed_paths.egress_max_path.distance_mm
        for v in VARIANTS
    }
    assert dist["entrance_center"] < dist["entrance_west"]
    assert dist["entrance_center"] < dist["entrance_east"]


def test_egress_is_measured_to_the_exit_door():
    # Entrance at the east end: the old measure ran to (0, 0) and reported over 45 m.
    plan = validate_plan(parse_fml(layout_program(program_from_brief(BRIEF), 24000, 14000, "entrance_east")))
    assert plan.topology.computed_paths.egress_max_path.distance_mm < 35000
