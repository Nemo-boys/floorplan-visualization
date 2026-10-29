"""The assistant's web search proxy: configuration, the request it sends Tavily, and what comes back."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from aegisplan import search
from aegisplan.server import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_key(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    yield
    search.transport = None


def test_health_and_503_without_a_key():
    assert client.get("/api/search/health").json() == {"available": False}
    assert client.post("/api/search", json={"query": "ADA corridor width"}).status_code == 503


def test_forwards_query_and_trims_results(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-test")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        results = [{"title": f"T{i}", "url": f"https://x.org/{i}", "content": "word " * 400, "score": 0.9} for i in range(6)]
        return httpx.Response(200, json={"query": "q", "answer": "44 inches.", "results": results, "images": [], "response_time": 0.5})

    search.transport = httpx.MockTransport(handler)
    assert client.get("/api/search/health").json() == {"available": True}
    r = client.post("/api/search", json={"query": " ADA corridor width ", "topic": "news", "time_range": "year", "max_results": 3})
    assert r.status_code == 200
    body = r.json()
    assert seen["url"] == search.TAVILY_URL
    assert seen["auth"] == "Bearer tvly-test"
    assert seen["body"] == {
        "query": "ADA corridor width",
        "search_depth": "basic",
        "topic": "news",
        "max_results": 3,
        "include_answer": "basic",
        "time_range": "year",
    }
    assert body["answer"] == "44 inches."
    assert len(body["results"]) == 3
    assert len(body["results"][0]["content"]) <= search.SNIPPET_CHARS + 1
    assert set(body["results"][0]) == {"title", "url", "content", "published_date"}


def test_rejects_bad_requests(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-test")
    assert client.post("/api/search", json={"query": ""}).status_code == 422
    assert client.post("/api/search", json={"query": "x", "max_results": 50}).status_code == 422
    assert client.post("/api/search", json={"query": "x", "topic": "sports"}).status_code == 422


@pytest.mark.parametrize("status,phrase", [(401, "refused"), (432, "limit"), (500, "error 500")])
def test_upstream_errors_become_502(monkeypatch, status, phrase):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-test")
    search.transport = httpx.MockTransport(lambda req: httpx.Response(status, text="nope"))
    r = client.post("/api/search", json={"query": "x"})
    assert r.status_code == 502
    assert phrase in r.json()["detail"]
