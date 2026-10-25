"""Tests for the PlanDocument -> viewer plan.json v0.1 exporter."""

import json
from pathlib import Path

import jsonschema
import pytest

from aegisplan.export_viz import to_viz_plan
from aegisplan.fml_parser import parse_fml
from aegisplan.validator import validate_plan

AEGIS_ROOT = Path(__file__).resolve().parents[1]
VIZ_SCHEMA = AEGIS_ROOT.parent / "viz" / "contracts" / "plan.v0.1.schema.json"

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


def _dataset_fml(split: str):
    with open(AEGIS_ROOT / "dataset" / f"{split}.jsonl") as f:
        for line in f:
            msgs = json.loads(line)["messages"]
            yield next(m["content"] for m in msgs if m["role"] == "assistant")


def _on_room_edge(point, rect, tol=1):
    x, y = point
    x0, y0 = rect["x_mm"], rect["y_mm"]
    x1, y1 = x0 + rect["w_mm"], y0 + rect["h_mm"]
    on_h = (abs(y - y0) <= tol or abs(y - y1) <= tol) and x0 - tol <= x <= x1 + tol
    on_v = (abs(x - x0) <= tol or abs(x - x1) <= tol) and y0 - tol <= y <= y1 + tol
    return on_h or on_v


@pytest.fixture(scope="module")
def viz_schema():
    with open(VIZ_SCHEMA) as f:
        return json.load(f)


def test_y_axis_is_flipped():
    viz = to_viz_plan(validate_plan(parse_fml(SAMPLE_FML)))
    rooms = {r["id"]: r["rect"] for r in viz["rooms"]}

    # waiting_1 touches the top edge in AegisPlan (y = 0, y down), so the north edge in the viewer.
    assert rooms["waiting_1"] == {"x_mm": 0, "y_mm": 7000, "w_mm": 6000, "h_mm": 5000}
    # exam_1 touches the bottom edge in AegisPlan, so the south edge (y = 0) in the viewer.
    assert rooms["exam_1"]["y_mm"] == 0
    assert viz["footprint"] == {"width_mm": 16000, "depth_mm": 12000}


def test_types_doors_and_checks():
    viz = to_viz_plan(validate_plan(parse_fml(SAMPLE_FML)), name="Sample")
    types = {r["id"]: r["type"] for r in viz["rooms"]}
    assert types["exam_1"] == "exam_room"
    assert types["corridor_1"] == "corridor"

    doors = {d["id"]: d for d in viz["doors"]}
    assert doors["door_5"]["connects"] == ["waiting_1", "exterior"]
    assert doors["door_5"]["is_entrance"] is True
    assert doors["door_5"]["center_mm"] == [3000, 12000]
    assert doors["door_1"]["is_entrance"] is False

    assert viz["name"] == "Sample"
    assert len(viz["checks"]) == 8
    assert all(c["pass"] for c in viz["checks"])
    assert viz["provenance"]["locked_rooms"] == ["waiting_1", "corridor_1", "restroom_1"]


def test_unknown_room_type_falls_back_to_storage():
    fml = SAMPLE_FML.replace("ROOM exam_2 TYPE exam", "ROOM kitchen_1 TYPE kitchen").replace(
        "CONNECT exam_2", "CONNECT kitchen_1"
    )
    viz = to_viz_plan(parse_fml(fml))
    kitchen = next(r for r in viz["rooms"] if r["id"] == "kitchen_1")
    assert kitchen["type"] == "storage"
    assert kitchen["label"] == "Kitchen"
    assert viz["provenance"]["unmapped_room_types"] == ["kitchen"]


@pytest.mark.parametrize("split", ["train", "val", "test"])
def test_dataset_plans_match_viewer_contract(split, viz_schema):
    count = 0
    for fml in _dataset_fml(split):
        plan = validate_plan(parse_fml(fml))
        viz = to_viz_plan(plan)
        jsonschema.validate(viz, viz_schema)

        assert len(viz["rooms"]) == len(plan.rooms)
        assert len(viz["doors"]) == len(plan.doors)
        assert viz["provenance"]["unmapped_room_types"] == []

        W, D = viz["footprint"]["width_mm"], viz["footprint"]["depth_mm"]
        rects = {r["id"]: r["rect"] for r in viz["rooms"]}
        for rect in rects.values():
            assert 0 <= rect["x_mm"] and rect["x_mm"] + rect["w_mm"] <= W
            assert 0 <= rect["y_mm"] and rect["y_mm"] + rect["h_mm"] <= D
        # Every door still sits on an edge of each room it connects after the flip.
        for d in viz["doors"]:
            for rid in d["connects"]:
                if rid != "exterior":
                    assert _on_room_edge(d["center_mm"], rects[rid]), (d["id"], rid)
        count += 1
    assert count > 0
