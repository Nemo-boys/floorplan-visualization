"""The assistant's chat proxy: configuration, the request it forwards, and streaming back."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from aegisplan import chat
from aegisplan.server import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_model_env(monkeypatch):
    for k in ("AEGIS_CHAT_URL", "AEGIS_CHAT_KEY", "AEGIS_CHAT_MODEL", "NEBIUS_API_KEY", "NVIDIA_API_KEY", "OPENROUTER_API_KEY", "AEGIS_CHAT_LABEL", "AEGIS_CHAT_EXTRA", "AEGIS_CHAT_NO_THINK"):
        monkeypatch.delenv(k, raising=False)
    yield
    chat.transport = None


def test_health_without_a_model():
    r = client.get("/api/chat/health")
    assert r.status_code == 200
    assert r.json()["available"] is False
    assert client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 503


def test_health_with_nvidia_key(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")
    body = client.get("/api/chat/health").json()
    assert body == {"available": True, "label": "Nemotron", "model": chat.DEFAULT_MODEL}


def test_health_with_nebius_key_uses_token_factory(monkeypatch):
    monkeypatch.setenv("NEBIUS_API_KEY", "nebius-test")
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")  # Token Factory wins over the NVIDIA catalog
    assert chat.chat_config()["url"] == chat.NEBIUS_URL
    body = client.get("/api/chat/health").json()
    assert body == {"available": True, "label": "Nemotron Ultra", "model": chat.NEBIUS_MODEL}
    # Token Factory's Nemotron 3 reasons unless its chat template is told not to
    payload = chat.build_payload(chat.ChatRequest(messages=[{"role": "user", "content": "hi"}]), chat.chat_config())
    assert payload["chat_template_kwargs"] == {"enable_thinking": False}


def test_streams_and_forwards_tools(monkeypatch):
    monkeypatch.setenv("AEGIS_CHAT_URL", "http://model.local/v1")
    monkeypatch.setenv("AEGIS_CHAT_KEY", "secret")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        sse = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n'
        return httpx.Response(200, text=sse, headers={"content-type": "text/event-stream"})

    chat.transport = httpx.MockTransport(handler)
    tools = [{"type": "function", "function": {"name": "get_costs", "parameters": {"type": "object", "properties": {}}}}]
    r = client.post(
        "/api/chat",
        json={"messages": [{"role": "system", "content": "Be brief."}, {"role": "user", "content": "cost?"}], "tools": tools},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert '"content":"Hi"' in r.text
    assert seen["url"] == "http://model.local/v1/chat/completions"
    assert seen["auth"] == "Bearer secret"
    assert seen["body"]["tools"] == tools and seen["body"]["tool_choice"] == "auto"
    # Nemotron is asked to answer without a thinking pass
    assert seen["body"]["messages"][0]["content"].startswith("/no_think\nBe brief.")


def test_upstream_error_becomes_an_sse_error(monkeypatch):
    monkeypatch.setenv("AEGIS_CHAT_URL", "http://model.local/v1")
    chat.transport = httpx.MockTransport(lambda req: httpx.Response(401, text="bad key"))
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    assert "Model error 401" in r.text
