"""Tests for FML-DSL parsing and serialization."""

import pytest
from aegisplan.fml_parser import parse_fml, serialize_to_fml

SAMPLE_FML = """
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


def test_parse_sample_fml():
    plan = parse_fml(SAMPLE_FML)

    # Check Boundary
    assert plan.boundary.area_m2 == 192.0
    assert plan.boundary.polygon == [[0, 0], [16000, 0], [16000, 12000], [0, 12000]]

    # Check Rooms
    assert len(plan.rooms) == 5
    room_map = {r.id: r for r in plan.rooms}
    assert "waiting_1" in room_map
    assert room_map["waiting_1"].locked is True
    assert room_map["waiting_1"].area_actual_m2 == 30.0
    assert room_map["exam_1"].locked is False
    assert room_map["exam_1"].area_actual_m2 == 16.0

    # Check ADA turning circle generated for exam and restroom
    assert room_map["exam_1"].ada_turning_circle is not None
    assert room_map["exam_1"].ada_turning_circle.diameter_mm == 1525
    assert room_map["restroom_1"].ada_turning_circle is not None

    # Check Doors
    assert len(plan.doors) == 5
    door_5 = next(d for d in plan.doors if d.id == "door_5")
    assert door_5.connects == ["waiting_1", "OUTSIDE"]
    assert door_5.width_mm == 1220

    # Check Topology
    assert len(plan.topology.connected_by_door) == 5
    assert ["waiting_1", "corridor_1"] in plan.topology.shares_wall or ["corridor_1", "waiting_1"] in plan.topology.shares_wall
    assert ["exam_1", "corridor_1"] in plan.topology.shares_wall or ["corridor_1", "exam_1"] in plan.topology.shares_wall

    # Check Circulation Paths
    paths = plan.topology.computed_paths
    assert paths.patient_flow == ["OUTSIDE", "waiting_1", "corridor_1", "exam_1"]
    assert paths.egress_max_path is not None
    assert paths.egress_max_path.rooms[-1] == "OUTSIDE"


def test_roundtrip_fml_serialization():
    plan = parse_fml(SAMPLE_FML)
    fml_out = serialize_to_fml(plan)
    assert "BOUNDARY RECT 0 0 16000 12000" in fml_out
    assert "ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED" in fml_out
    assert "DOOR door_1 CONNECT waiting_1 corridor_1 AT 3000 5000 WIDTH 1065" in fml_out
    assert "FDOOR door_5 CONNECT waiting_1 OUTSIDE AT 3000 0 WIDTH 1220" in fml_out
    assert "END_PLAN" in fml_out

    # Re-parse serialized output
    plan2 = parse_fml(fml_out)
    assert len(plan2.rooms) == len(plan.rooms)
    assert len(plan2.doors) == len(plan.doors)
