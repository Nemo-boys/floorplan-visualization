"""Data Center Studio on the AegisPlan server: Nemotron reads the brief, CP-SAT checks the building program.

The browser generates the design (and still works with no server); these routes add the two parts that
need the server. Level 1 of the pipeline in handoff/DATACENTER.md: an LLM for intent, a solver for geometry.

  POST /api/dc/brief   Nemotron reads a one-line brief into the design basis (JSON). 503 with no model.
  POST /api/dc/check   CP-SAT proves the room layout is valid (no overlaps, inside the building, every
                       door joins rooms that touch, outside doors on outside walls) and searches for the
                       narrowest building that keeps all of that, to show how tight the layout is.
"""

import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel

from aegisplan import chat

router = APIRouter()

GRID = 100  # mm per CP-SAT unit


# ---------------------------------------------------------------------------- the brief

BRIEF_PROMPT = """You read data center briefs. Reply with one JSON object and nothing else:
{"it_mw": number or null, "cooling": "liquid" | "hybrid" | "air" | null, "cooling_redundancy": "N" | "N+1" | "2N" | null,
 "power_redundancy": "N" | "N+1" | "2N" | null, "price_kwh": number or null, "years": number or null, "notes": "one short sentence"}
- it_mw: IT (computing) load in megawatts. Convert GPU counts at about 1.8 kW per GB200/B200 GPU, 1.3 kW per H100/H200 GPU.
- cooling: liquid for GB200/NVL72/direct-to-chip/immersion, hybrid for rear-door, air for air-cooled or light inference; null if unsure or asked to compare.
- Tier IV means 2N for both; Tier III usually N+1.
- price_kwh in US dollars (7 cents = 0.07). Use null for anything the brief does not say.
- notes: what you inferred that was not stated, in plain words."""

COOLINGS = {"liquid", "hybrid", "air"}
REDUNDANCY = {"N", "N+1", "2N"}


class BriefRequest(BaseModel):
    brief: str


def parse_reading(text: str) -> Dict[str, Any]:
    """Pull the JSON object out of a model reply and keep only sane values."""
    text = re.sub(r"<think>[\s\S]*?</think>", "", text)
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("no JSON in the reply")
    raw = json.loads(m.group(0))
    out: Dict[str, Any] = {}
    mw = raw.get("it_mw")
    if isinstance(mw, (int, float)) and 0.2 <= mw <= 50:
        out["it_kw"] = round(mw * 1000)
    if raw.get("cooling") in COOLINGS:
        out["cooling"] = raw["cooling"]
    for key in ("cooling_redundancy", "power_redundancy"):
        v = str(raw.get(key) or "").upper().replace(" ", "")
        if v in REDUNDANCY:
            out[key] = v
    p = raw.get("price_kwh")
    if isinstance(p, (int, float)) and 0.01 <= p <= 1:
        out["price_kwh"] = p
    y = raw.get("years")
    if isinstance(y, (int, float)) and 1 <= y <= 30:
        out["years"] = int(y)
    if isinstance(raw.get("notes"), str):
        out["notes"] = raw["notes"][:240]
    return out


async def _ask_remote(brief: str, cfg: Dict[str, str]) -> str:
    system = BRIEF_PROMPT
    if "nemotron" in cfg["model"].lower():
        system = "/no_think\n" + system
    headers = {"Content-Type": "application/json"}
    if cfg["key"]:
        headers["Authorization"] = f"Bearer {cfg['key']}"
    payload = {
        "model": cfg["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": brief}],
        "temperature": 0,
        "max_tokens": 300,
    }
    async with httpx.AsyncClient(timeout=20.0, transport=chat.transport) as client:
        resp = await client.post(f"{cfg['url']}/chat/completions", headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"] or ""


def _ask_local(brief: str) -> Optional[Tuple[str, str]]:
    """The local GGUF Nemotron, when it is downloaded, with output held to a JSON object by a grammar."""
    try:
        from aegisplan.gguf_engine import get_gguf_engine, is_gguf_available

        if not is_gguf_available():
            return None
        engine = get_gguf_engine()
        if not engine:
            return None
        from llama_cpp import LlamaGrammar  # noqa: F401  (generate_chat builds it)

        grammar = r'''root ::= "{" ws "\"it_mw\":" ws num "," ws "\"cooling\":" ws cool "," ws "\"cooling_redundancy\":" ws red "," ws "\"power_redundancy\":" ws red "," ws "\"price_kwh\":" ws num "," ws "\"years\":" ws num "," ws "\"notes\":" ws str ws "}"
num ::= "null" | [0-9]+ ("." [0-9]+)?
cool ::= "null" | "\"liquid\"" | "\"hybrid\"" | "\"air\""
red ::= "null" | "\"N\"" | "\"N+1\"" | "\"2N\""
str ::= "\"" [^"\n]{0,200} "\""
ws ::= [ ]?'''
        messages = [{"role": "system", "content": BRIEF_PROMPT + "/no_think"}, {"role": "user", "content": brief}]
        return engine.generate_chat(messages, grammar=grammar, max_tokens=200), "Nemotron Nano 9B (local)"
    except Exception:
        return None


@router.post("/api/dc/brief")
async def read_brief(req: BriefRequest):
    brief = req.brief.strip()[:2000]
    if not brief:
        raise HTTPException(400, "Empty brief")
    t0 = time.perf_counter()
    cfg = chat.chat_config()
    text, model = None, ""
    if cfg:
        try:
            text, model = await _ask_remote(brief, cfg), cfg["model"]
        except (httpx.HTTPError, KeyError, ValueError):
            text = None
    if text is None:
        local = _ask_local(brief)
        if local:
            text, model = local
    if text is None:
        raise HTTPException(503, "No model is available to read the brief.")
    try:
        reading = parse_reading(text)
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(502, "The model's reply was not valid JSON.")
    return {"source": "nemotron", "model": model, "reading": reading, "ms": round((time.perf_counter() - t0) * 1000)}


# ---------------------------------------------------------------------------- the building program

class DcRoom(BaseModel):
    id: str
    type: str
    name: str = ""
    x: float
    y: float
    w: float
    h: float
    outdoor: bool = False


class DcDoor(BaseModel):
    id: str
    rooms: List[str]
    width: float


class DcBuilding(BaseModel):
    x: float
    y: float
    w: float
    h: float


class CheckRequest(BaseModel):
    building: DcBuilding
    rooms: List[DcRoom]
    doors: List[DcDoor]
    max_time_seconds: float = 3.0


def _shared(a: DcRoom, b: DcRoom) -> float:
    """Length of the wall two rooms share (0 if they don't touch)."""
    eps = 1.0
    if abs(a.x + a.w - b.x) < eps or abs(b.x + b.w - a.x) < eps:
        return max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    if abs(a.y + a.h - b.y) < eps or abs(b.y + b.h - a.y) < eps:
        return max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    return 0.0


def _overlap(a: DcRoom, b: DcRoom) -> bool:
    return a.x < b.x + b.w - 1 and b.x < a.x + a.w - 1 and a.y < b.y + b.h - 1 and b.y < a.y + a.h - 1


def _model(req: CheckRequest, fixed: bool) -> Tuple[cp_model.CpModel, Dict[str, Any], int]:
    """Rooms keep their sizes; positions are free (or fixed to the design's, to prove it). The building
    keeps its depth; its length is what the solver minimises."""
    b = req.building
    rooms = [r for r in req.rooms if not r.outdoor]
    H = round(b.h / GRID)
    W_max = round(b.w / GRID)
    m = cp_model.CpModel()
    W = m.NewIntVar(0, W_max, "W")
    v: Dict[str, Any] = {"W": W, "rooms": {}}
    xs, ys = [], []
    n_constraints = 0
    for r in rooms:
        w, h = round(r.w / GRID), round(r.h / GRID)
        x = m.NewIntVar(0, max(0, W_max - w), f"x_{r.id}")
        y = m.NewIntVar(0, max(0, H - h), f"y_{r.id}")
        m.Add(x + w <= W)
        x0, y0 = round((r.x - b.x) / GRID), round((r.y - b.y) / GRID)
        if fixed:
            m.Add(x == x0)
            m.Add(y == y0)
        else:
            m.AddHint(x, x0)
            m.AddHint(y, y0)
        xs.append(m.NewFixedSizeIntervalVar(x, w, f"ix_{r.id}"))
        ys.append(m.NewFixedSizeIntervalVar(y, h, f"iy_{r.id}"))
        v["rooms"][r.id] = (x, y, w, h)
    m.AddNoOverlap2D(xs, ys)
    n_constraints += 1 + len(rooms)
    for d in req.doors:
        a_id, b_id = d.rooms[0], d.rooms[1]
        L = max(1, round(d.width / GRID))
        if a_id not in v["rooms"]:
            continue
        xa, ya, wa, ha = v["rooms"][a_id]
        if b_id == "outside":
            lits = [m.NewBoolVar(f"{d.id}_{k}") for k in range(4)]
            m.Add(xa == 0).OnlyEnforceIf(lits[0])
            m.Add(ya == 0).OnlyEnforceIf(lits[1])
            m.Add(xa + wa == W).OnlyEnforceIf(lits[2])
            m.Add(ya + ha == H).OnlyEnforceIf(lits[3])
            m.AddBoolOr(lits)
            n_constraints += 1
            continue
        if b_id not in v["rooms"]:
            continue
        xb, yb, wb, hb = v["rooms"][b_id]
        lits = [m.NewBoolVar(f"{d.id}_{k}") for k in range(4)]
        # a west of b, b west of a: touching vertical walls with at least L of overlap in y
        for lit, (left_x, left_w, right_x) in zip(lits[:2], [(xa, wa, xb), (xb, wb, xa)]):
            m.Add(left_x + left_w == right_x).OnlyEnforceIf(lit)
            m.Add(ya + ha - yb >= L).OnlyEnforceIf(lit)
            m.Add(yb + hb - ya >= L).OnlyEnforceIf(lit)
        # a south of b, b south of a
        for lit, (low_y, low_h, high_y) in zip(lits[2:], [(ya, ha, yb), (yb, hb, ya)]):
            m.Add(low_y + low_h == high_y).OnlyEnforceIf(lit)
            m.Add(xa + wa - xb >= L).OnlyEnforceIf(lit)
            m.Add(xb + wb - xa >= L).OnlyEnforceIf(lit)
        m.AddBoolOr(lits)
        n_constraints += 1
    m.Minimize(W)
    return m, v, n_constraints


def _solve(m: cp_model.CpModel, seconds: float) -> Tuple[cp_model.CpSolver, int]:
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = seconds
    s.parameters.num_search_workers = 8
    s.parameters.random_seed = 7
    return s, s.Solve(m)


@router.post("/api/dc/check")
async def check_program(req: CheckRequest):
    t0 = time.perf_counter()
    b = req.building
    rooms = [r for r in req.rooms if not r.outdoor]
    by_id = {r.id: r for r in rooms}
    if not rooms:
        raise HTTPException(400, "No rooms")

    # Plain geometry first, so a failure can be named.
    overlaps = [(a.id, c.id) for i, a in enumerate(rooms) for c in rooms[i + 1:] if _overlap(a, c)]
    outside = [r.id for r in rooms if r.x < b.x - 1 or r.y < b.y - 1 or r.x + r.w > b.x + b.w + 1 or r.y + r.h > b.y + b.h + 1]
    inner = [d for d in req.doors if d.rooms[0] in by_id and d.rooms[1] in by_id]
    bad_doors = [d.id for d in inner if _shared(by_id[d.rooms[0]], by_id[d.rooms[1]]) + 1 < d.width]
    ext = [d for d in req.doors if d.rooms[1] == "outside" and d.rooms[0] in by_id]

    def on_edge(r: DcRoom) -> bool:
        return abs(r.x - b.x) < 1 or abs(r.y - b.y) < 1 or abs(r.x + r.w - b.x - b.w) < 1 or abs(r.y + r.h - b.y - b.h) < 1

    bad_ext = [d.id for d in ext if not on_edge(by_id[d.rooms[0]])]

    # CP-SAT proves the design's own positions satisfy the whole program...
    fixed_model, _, n_constraints = _model(req, fixed=True)
    _, fixed_status = _solve(fixed_model, 2.0)
    proven = fixed_status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    # ...then looks for the shortest building that keeps every room and door.
    free_model, v, _ = _model(req, fixed=False)
    solver, status = _solve(free_model, max(0.5, min(req.max_time_seconds, 8.0)))
    best_w = None
    layout: List[Dict[str, Any]] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_w = solver.Value(v["W"]) * GRID
        for rid, (x, y, _, _) in v["rooms"].items():
            layout.append({"id": rid, "x": b.x + solver.Value(x) * GRID, "y": b.y + solver.Value(y) * GRID})
    ours_w = max(r.x + r.w for r in rooms) - b.x
    checks = [
        {"title": "No two rooms overlap", "pass": not overlaps, "detail": "none" if not overlaps else f"{len(overlaps)} pairs, e.g. {overlaps[0][0]} / {overlaps[0][1]}"},
        {"title": "Every room is inside the building", "pass": not outside, "detail": "all inside" if not outside else ", ".join(outside[:4])},
        {"title": "Every door joins two rooms that touch", "pass": not bad_doors, "detail": f"{len(inner)} doors" if not bad_doors else ", ".join(bad_doors[:4])},
        {"title": "Outside doors are on outside walls", "pass": not bad_ext, "detail": f"{len(ext)} doors" if not bad_ext else ", ".join(bad_ext[:4])},
    ]
    return {
        "valid": proven and all(c["pass"] for c in checks),
        "proven_by": "CP-SAT" if proven else None,
        "checks": checks,
        "rooms": len(rooms),
        "doors": len(req.doors),
        "constraints": n_constraints,
        "status": solver.StatusName(status),
        "ours_length_mm": ours_w,
        "best_length_mm": best_w,
        "saving_pct": round(100 * (ours_w - best_w) / ours_w, 1) if best_w else None,
        "layout": layout,
        "ms": round((time.perf_counter() - t0) * 1000),
    }


@router.get("/api/dc/health")
async def dc_health():
    from aegisplan.gguf_engine import is_gguf_available

    cfg = chat.chat_config()
    model = cfg["model"] if cfg else ("Nemotron Nano 9B (local)" if is_gguf_available() else None)
    return {"cpsat": True, "brief_model": model}
