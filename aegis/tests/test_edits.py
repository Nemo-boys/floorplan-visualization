"""Tests for plain-language edits."""

import pytest
from fastapi.testclient import TestClient

from aegisplan.edits import apply_edit, parse_edit
from aegisplan.fml_parser import parse_fml
from aegisplan.program import layout_program, program_from_brief
from aegisplan.server import app
from aegisplan.validator import validate_plan


@pytest.fixture(scope="module")
def plan():
    program = program_from_brief("6 exam rooms, a nurse station, reception, an ADA restroom, clean and soiled utility")
    return validate_plan(parse_fml(layout_program(program, 24000, 14000, "entrance_center")))


def test_parse_resize_and_keep(plan):
    spec = parse_edit("Make the waiting room 20% bigger, keep the restrooms fixed", plan)
    assert spec.resize == ["waiting_1"] and spec.delta_pct == 20 and spec.lock == ["restroom_1"]
    spec = parse_edit("make exam room 3 1 m wider", plan)
    assert spec.resize == ["exam_3"] and spec.delta_mm == 1000
    assert parse_edit("shrink the exam rooms by 10%", plan).resize == [f"exam_{i}" for i in range(1, 7)]


def test_edit_grows_room_and_keeps_checks(plan):
    res = apply_edit(plan, "Make the waiting room 20% bigger, keep the restrooms fixed")
    assert res.status in ("OPTIMAL", "FEASIBLE")
    rooms = {r.id: r for r in res.plan.rooms}
    assert rooms["waiting_1"].bbox.w == 12000
    before = next(r for r in plan.rooms if r.id == "restroom_1").bbox
    assert rooms["restroom_1"].bbox == before and rooms["restroom_1"].locked
    assert all(c.status == "PASS" for c in res.plan.validation.checks)


def test_impossible_edits_name_the_rooms(plan):
    res = apply_edit(plan, "Make the waiting room 100% bigger and keep the reception and restroom fixed")
    assert res.status == "INFEASIBLE"
    assert set(res.conflict_rooms) == {"waiting_1", "reception_1", "restroom_1"}
    assert "24 m wide" in res.explanation
    res = apply_edit(plan, "shrink the exam rooms by 10%")
    assert res.status == "INFEASIBLE" and "3.1 m minimum" in res.explanation
    assert apply_edit(plan, "Make the cafeteria bigger").status == "NOT_UNDERSTOOD"


def test_edit_text_endpoint(plan):
    client = TestClient(app)
    resp = client.post("/api/edit_text", json={"plan": plan.model_dump(), "text": "make exam room 3 1 m wider", "name": "Candidate 1"})
    data = resp.json()
    assert resp.status_code == 200 and data["status"] in ("OPTIMAL", "FEASIBLE")
    assert data["viz_plan"]["name"] == "Candidate 1"
