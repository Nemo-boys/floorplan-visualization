"""Web search for the in-app assistants, through Tavily (https://docs.tavily.com).

Like /api/chat, the browser runs the tool and this route holds the key: the page sends a query, the server
asks Tavily and returns a short answer plus trimmed sources, small enough to hand back to the model.

Configuration: TAVILY_API_KEY (in the environment, or in aegis/.env, which server.py loads).

  GET  /api/search/health   {"available": bool}
  POST /api/search          {query, topic?, time_range?, max_results?, include_domains?}
                            -> {query, answer, results: [{title, url, content, published_date}]}
"""

import os
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

TAVILY_URL = "https://api.tavily.com/search"
MAX_RESULTS = 8
SNIPPET_CHARS = 600

# Tests replace this with an httpx.MockTransport.
transport: Optional[httpx.AsyncBaseTransport] = None


def search_key() -> str:
    return os.environ.get("TAVILY_API_KEY", "").strip()


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=400)
    topic: Literal["general", "news", "finance"] = "general"
    time_range: Optional[Literal["day", "week", "month", "year"]] = None
    max_results: int = Field(5, ge=1, le=MAX_RESULTS)
    include_domains: Optional[List[str]] = Field(None, max_length=20)


@router.get("/api/search/health")
async def search_health():
    return {"available": bool(search_key())}


def build_payload(req: SearchRequest) -> Dict[str, Any]:
    # basic depth costs 1 credit; the short answer saves the model reading every source
    payload: Dict[str, Any] = {
        "query": req.query.strip(),
        "search_depth": "basic",
        "topic": req.topic,
        "max_results": req.max_results,
        "include_answer": "basic",
    }
    if req.time_range:
        payload["time_range"] = req.time_range
    if req.include_domains:
        payload["include_domains"] = req.include_domains
    return payload


def _trim(text: Optional[str]) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= SNIPPET_CHARS else text[:SNIPPET_CHARS].rsplit(" ", 1)[0] + "…"


_ERRORS = {
    401: "The web search key was refused.",
    429: "Web search is busy; try again in a moment.",
    432: "The web search plan's limit is used up.",
    433: "The web search spending limit is reached.",
}


@router.post("/api/search")
async def search(req: SearchRequest):
    key = search_key()
    if not key:
        raise HTTPException(503, "Web search is not configured on the server (TAVILY_API_KEY).")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0), transport=transport) as client:
            resp = await client.post(TAVILY_URL, headers=headers, json=build_payload(req))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach web search: {e.__class__.__name__}")
    if resp.status_code >= 400:
        raise HTTPException(502, _ERRORS.get(resp.status_code, f"Web search error {resp.status_code}: {resp.text[:200]}"))
    data = resp.json()
    return {
        "query": data.get("query", req.query),
        "answer": data.get("answer") or "",
        "results": [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": _trim(r.get("content")),
                "published_date": r.get("published_date"),
            }
            for r in data.get("results", [])[: req.max_results]
        ],
    }
