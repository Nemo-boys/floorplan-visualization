"""Chat proxy for the in-app assistants (the data center studio now, the clinic viewer next).

The browser runs the agent loop and every tool against its own live state; this route only forwards
OpenAI-format chat requests (with tool definitions) to a model and streams the answer back, so API keys
never reach the page. Any OpenAI-compatible endpoint works: NVIDIA's API (build.nvidia.com / NIM),
OpenRouter, or a local vLLM or llama.cpp server running Nemotron.

Configuration, first match wins:
  AEGIS_CHAT_URL (+ AEGIS_CHAT_KEY, AEGIS_CHAT_MODEL)   any OpenAI-compatible /v1 endpoint
  NVIDIA_API_KEY                                        https://integrate.api.nvidia.com/v1
  OPENROUTER_API_KEY                                    https://openrouter.ai/api/v1
Optional: AEGIS_CHAT_LABEL (shown in the panel), AEGIS_CHAT_NO_THINK=0 to let Nemotron reason before
answering (slower), AEGIS_CHAT_EXTRA (JSON merged into every request, e.g. provider routing).
"""

import json
import os
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

DEFAULT_MODEL = "nvidia/nvidia-nemotron-nano-9b-v2"
MAX_MESSAGES = 80
MAX_CHARS = 200_000

# Tests replace this with an httpx.MockTransport.
transport: Optional[httpx.AsyncBaseTransport] = None


def chat_config() -> Optional[Dict[str, str]]:
    model = os.environ.get("AEGIS_CHAT_MODEL")
    label = os.environ.get("AEGIS_CHAT_LABEL", "Nemotron")
    if os.environ.get("AEGIS_CHAT_URL"):
        url, key = os.environ["AEGIS_CHAT_URL"], os.environ.get("AEGIS_CHAT_KEY", "")
    elif os.environ.get("NVIDIA_API_KEY"):
        url, key = "https://integrate.api.nvidia.com/v1", os.environ["NVIDIA_API_KEY"]
    elif os.environ.get("OPENROUTER_API_KEY"):
        url, key = "https://openrouter.ai/api/v1", os.environ["OPENROUTER_API_KEY"]
        model = model or "nvidia/nemotron-3.5-lightning"
    else:
        return None
    return {"url": url.rstrip("/"), "key": key, "model": model or DEFAULT_MODEL, "label": label}


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    tools: Optional[List[Dict[str, Any]]] = None
    stream: bool = True


@router.get("/api/chat/health")
async def chat_health():
    cfg = chat_config()
    if not cfg:
        return {"available": False, "label": "", "model": ""}
    return {"available": True, "label": cfg["label"], "model": cfg["model"]}


def build_payload(req: ChatRequest, cfg: Dict[str, str]) -> Dict[str, Any]:
    messages = [dict(m) for m in req.messages]
    # Nemotron answers straight away with /no_think in the system prompt; thinking adds seconds per turn.
    if os.environ.get("AEGIS_CHAT_NO_THINK", "1") != "0" and "nemotron" in cfg["model"].lower():
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = f"/no_think\n{messages[0].get('content') or ''}"
        else:
            messages.insert(0, {"role": "system", "content": "/no_think"})
    payload: Dict[str, Any] = {
        "model": cfg["model"],
        "messages": messages,
        "stream": req.stream,
        "temperature": 0.3,
        "max_tokens": 900,
    }
    if req.tools:
        payload["tools"] = req.tools
        payload["tool_choice"] = "auto"
    extra = os.environ.get("AEGIS_CHAT_EXTRA")
    if extra:
        payload.update(json.loads(extra))
    return payload


def _sse_error(message: str) -> bytes:
    return f"data: {json.dumps({'error': {'message': message}})}\n\n".encode()


@router.post("/api/chat")
async def chat(req: ChatRequest):
    cfg = chat_config()
    if not cfg:
        raise HTTPException(503, "No chat model is configured on the server.")
    if len(req.messages) > MAX_MESSAGES or len(json.dumps(req.messages)) > MAX_CHARS:
        raise HTTPException(413, "The conversation is too long; start a new chat.")
    payload = build_payload(req, cfg)
    headers = {"Content-Type": "application/json"}
    if cfg["key"]:
        headers["Authorization"] = f"Bearer {cfg['key']}"

    if not req.stream:
        async with httpx.AsyncClient(timeout=60.0, transport=transport) as client:
            resp = await client.post(f"{cfg['url']}/chat/completions", headers=headers, json=payload)
            if resp.status_code >= 400:
                raise HTTPException(502, f"Model error {resp.status_code}: {resp.text[:300]}")
            return resp.json()

    async def relay() -> AsyncIterator[bytes]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=8.0), transport=transport) as client:
                async with client.stream("POST", f"{cfg['url']}/chat/completions", headers=headers, json=payload) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode(errors="replace")[:300]
                        yield _sse_error(f"Model error {resp.status_code}: {body}")
                        return
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        except httpx.HTTPError as e:
            yield _sse_error(f"Could not reach the model: {e.__class__.__name__}")

    return StreamingResponse(
        relay(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
