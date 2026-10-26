"""Data Center Studio routes: Nemotron's reading of a brief and the CP-SAT check of the building program."""

import copy
import json
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from aegisplan import chat, datacenter
from aegisplan.server import app

client = TestClient(app)
PROGRAM = json.load(open(os.path.join(os.path.dirname(__file__), "dc_program_2mw.json")))


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for k in ("AEGIS_CHAT_URL", "AEGIS_CHAT_KEY", "AEGIS_CHAT_MODEL", "NVIDIA_API_KEY", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("AEGISPLAN_DISABLE_MODEL", "1")
    yield
    chat.transport = None


def test_cpsat_proves_the_generated_program():
    r = client.post("/api/dc/check", json=PROGRAM).json()
    assert r["valid"] and r["proven_by"] == "CP-SAT"
    assert all(c["pass"] for c in r["checks"])
    assert r["best_length_mm"] <= r["ours_length_mm"]
    assert len(r["layout"]) == r["rooms"]


def test_cpsat_names_what_breaks():
    bad = copy.deepcopy(PROGRAM)
    indoor = [x for x in bad["rooms"] if not x["outdoor"]]
    indoor[1]["x"] = indoor[0]["x"]
    indoor[1]["y"] = indoor[0]["y"]  # stacked on top of another room
    r = client.post("/api/dc/check", json=bad).json()
    assert not r["valid"]
    assert not next(c for c in r["checks"] if c["title"].startswith("No two rooms"))["pass"]


def test_brief_without_a_model_is_503():
    assert client.post("/api/dc/brief", json={"brief": "10 MW"}).status_code == 503
    assert client.get("/api/dc/health").json() == {"cpsat": True, "brief_model": None}


def test_brief_reading_from_the_model(monkeypatch):
    monkeypatch.setenv("AEGIS_CHAT_URL", "http://model.local/v1")
    reply = '<think>x</think>```json\n{"it_mw": 12, "cooling": "liquid", "cooling_redundancy": "n+1", "power_redundancy": "2N", "price_kwh": 7, "years": null, "notes": "GB200 implies liquid."}\n```'
    chat.transport = httpx.MockTransport(lambda req: httpx.Response(200, json={"choices": [{"message": {"content": reply}}]}))
    r = client.post("/api/dc/brief", json={"brief": "about 6,600 GB200 GPUs"}).json()
    assert r["source"] == "nemotron"
    # 7 is not a price per kWh in dollars, so it is dropped rather than trusted
    assert r["reading"] == {"it_kw": 12000, "cooling": "liquid", "cooling_redundancy": "N+1", "power_redundancy": "2N", "notes": "GB200 implies liquid."}


def test_parse_reading_rejects_nonsense():
    with pytest.raises(ValueError):
        datacenter.parse_reading("no json here")
    assert datacenter.parse_reading('{"it_mw": 9999, "cooling": "steam"}') == {}
