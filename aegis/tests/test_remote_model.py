"""The fine-tuned model behind a remote llama.cpp server: same request shape, grammar included."""

import json

import httpx
import pytest

from aegisplan import gguf_engine
from aegisplan.router import GenerationRouter


@pytest.fixture
def remote(monkeypatch):
    monkeypatch.delenv("AEGISPLAN_DISABLE_MODEL", raising=False)
    monkeypatch.setenv("AEGIS_GGUF_URL", "http://gpu.local/")
    monkeypatch.setenv("AEGIS_GGUF_KEY", "k")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        fml = "ROOM exam_1 TYPE exam RECT 0 0 3000 3000 FREE\nROOM exam_2 TYPE exam RECT 3000 0 3000 3000 FREE\nROOM nurse_station_1 TYPE nurse_station RECT 6000 0 3000 2000 FREE\nEND_PLAN"
        return httpx.Response(200, json={"choices": [{"message": {"content": fml}}]})

    monkeypatch.setattr(gguf_engine.RemoteGGUFEngine, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(gguf_engine, "_GLOBAL_GGUF_ENGINE", None)
    yield seen


def test_remote_engine_is_used_and_sends_the_grammar(remote):
    assert gguf_engine.is_gguf_available()
    assert gguf_engine.model_label() == "Nemotron Nano 9B (cloud GPU)"
    draft = GenerationRouter()._draft_program("A clinic with 2 exam rooms and a nurse station", 24000, 16000)
    assert remote["url"] == "http://gpu.local/v1/chat/completions"
    assert remote["auth"] == "Bearer k"
    assert remote["body"]["grammar"].strip() and remote["body"]["max_tokens"] == 900
    assert draft["source"] == "nemotron"


def test_disable_model_wins_over_the_url(remote, monkeypatch):
    monkeypatch.setenv("AEGISPLAN_DISABLE_MODEL", "1")
    assert not gguf_engine.remote_model_url()
    assert GenerationRouter()._draft_program("A clinic with 2 exam rooms", 24000, 16000)["source"] == "fallback"
