"""Tests for the offline fallback candidates and the nurse station / lab / storage room types."""

import pytest

from aegisplan.cpsat_repair import repair_plan
from aegisplan.export_viz import to_viz_plan
from aegisplan.fml_parser import parse_fml
from aegisplan.router import GenerationRouter
from aegisplan.validator import validate_plan


@pytest.fixture(scope="module")
def router():
    return GenerationRouter()


@pytest.mark.parametrize("w,h", [(16000, 12000), (24000, 14000), (20000, 10000), (30000, 20000)])
def test_fallback_candidates_fit_the_boundary_and_pass(router, w, h):
    for fml in router._synthesize_heuristic_candidates("brief", w, h, None, 3):
        plan = validate_plan(parse_fml(fml))
        assert plan.boundary.polygon == [[0, 0], [w, 0], [w, h], [0, h]]
        for r in plan.rooms:
            assert r.bbox.x + r.bbox.w <= w and r.bbox.y + r.bbox.h <= h
        assert all(c.status == "PASS" for c in plan.validation.checks)
        assert repair_plan(plan).status == "OPTIMAL"


def test_fallback_keeps_corridor_width(router):
    fml = router._synthesize_heuristic_candidates("brief", 20000, 10000, None, 1)[0]
    corridor = next(r for r in parse_fml(fml).rooms if r.type == "corridor")
    assert corridor.bbox.h == 2000


def test_too_narrow_site_is_reported_infeasible(router):
    fml = router._synthesize_heuristic_candidates("brief", 13000, 11000, None, 1)[0]
    result = repair_plan(parse_fml(fml))
    assert result.status == "INFEASIBLE"
    assert result.conflict_core


def test_nurse_station_lab_and_storage():
    fml = """BOUNDARY RECT 0 0 12000 8000
ROOM corridor_1 TYPE corridor RECT 0 3000 12000 2000 LOCKED
ROOM nurse_station_1 TYPE nurse_station RECT 0 0 3000 3000 FREE
ROOM lab_1 TYPE lab RECT 3000 0 3000 3000 FREE
ROOM storage_1 TYPE storage RECT 6000 0 3000 3000 FREE
DOOR door_1 CONNECT nurse_station_1 corridor_1 AT 1500 3000 WIDTH 915
DOOR door_2 CONNECT lab_1 corridor_1 AT 4500 3000 WIDTH 915
DOOR door_3 CONNECT storage_1 corridor_1 AT 7500 3000 WIDTH 915
FDOOR door_4 CONNECT corridor_1 OUTSIDE AT 0 4000 WIDTH 1220
END_PLAN"""
    plan = parse_fml(fml)
    labels = {r.id: r.label for r in plan.rooms}
    assert labels["nurse_station_1"] == "Nurse station 1"
    assert labels["lab_1"] == "Lab 1"

    types = {r["id"]: r["type"] for r in to_viz_plan(plan)["rooms"]}
    assert types == {"corridor_1": "corridor", "nurse_station_1": "nurse_station", "lab_1": "lab", "storage_1": "storage"}
