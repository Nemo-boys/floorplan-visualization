"""End-to-end integration tests for FastAPI server endpoints."""

import pytest
from fastapi.testclient import TestClient
from aegisplan.server import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "AegisPlan"


def test_get_sample():
    resp = client.get("/api/sample")
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["boundary"]["area_m2"] > 0
    assert len(plan["rooms"]) > 0
    assert len(plan["validation"]["checks"]) > 0


def test_generate_endpoint():
    resp = client.post(
        "/api/generate",
        json={
            "brief": "Primary care outpatient clinic with 3 exam rooms",
            "boundary_w": 16000,
            "boundary_h": 12000,
            "mode": "local",
            "num_candidates": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["candidates"]) == 3
    assert data["candidates"][0]["rank"] == 1
    assert data["candidates"][0]["solver_status"] in ("OPTIMAL", "FEASIBLE")


def test_interactive_edit_endpoint():
    # Fetch sample first
    sample_resp = client.get("/api/sample")
    plan = sample_resp.json()

    # Edit exam_1 to increase width by 500mm
    edit_resp = client.post(
        "/api/edit",
        json={
            "plan": plan,
            "room_id": "exam_1",
            "delta_w": 500,
            "delta_h": 0,
        },
    )
    assert edit_resp.status_code == 200
    data = edit_resp.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    repaired_exam = next(r for r in data["plan"]["rooms"] if r["id"] == "exam_1")
    assert repaired_exam["bbox"]["w"] >= 3200


def test_root_serves_html():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "<!DOCTYPE html>" in resp.text
    assert "AegisPlan" in resp.text
