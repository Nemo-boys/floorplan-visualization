"""FastAPI Server for AegisPlan: Neuro-Symbolic Healthcare Spatial Synthesis."""

from typing import List, Dict, Any, Optional
import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from aegisplan.schemas import PlanDocument
from aegisplan.fml_parser import parse_fml, serialize_to_fml
from aegisplan.validator import validate_plan
from aegisplan.cpsat_repair import repair_plan
from aegisplan.router import GenerationRouter, FEW_SHOT_EXEMPLAR
from aegisplan.export_viz import to_viz_plan
from aegisplan.edits import apply_edit
from aegisplan.gguf_engine import find_gguf_model_path, is_gguf_available, remote_model_url
from aegisplan.chat import router as chat_router
from aegisplan.datacenter import router as dc_router
from aegisplan.search import router as search_router

# The viewer's production build (viz/dist), served at / when it exists.
VIZ_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "viz", "dist"))


def load_env_file(path: str) -> None:
    """KEY=value lines from aegis/.env (gitignored) for server-side keys; real environment variables win."""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


load_env_file(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(
    title="AegisPlan API",
    description="Neuro-Symbolic Healthcare Spatial Synthesis Engine",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = GenerationRouter()
# The in-app assistants' model proxy (/api/chat).
app.include_router(chat_router)
# Data Center Studio: Nemotron reads the brief, CP-SAT checks the building program (/api/dc/*).
app.include_router(dc_router)
# Web search for the assistants, through Tavily (/api/search).
app.include_router(search_router)


class GenerateRequest(BaseModel):
    brief: str
    boundary_w: int = 16000
    boundary_h: int = 12000
    locked_rooms: Optional[List[Dict[str, Any]]] = None
    mode: str = "local"  # "local" | "cloud"
    num_candidates: int = 3
    enable_geometric_masking: bool = False


class RepairRequest(BaseModel):
    plan: Optional[PlanDocument] = None
    fml_text: Optional[str] = None
    enforce_door_adjacencies: bool = True
    max_time_seconds: float = 2.0


class EditTextRequest(BaseModel):
    plan: PlanDocument
    text: str
    name: str = ""


class EditRoomRequest(BaseModel):
    plan: PlanDocument
    room_id: str
    delta_w: int = 0
    delta_h: int = 0
    toggle_lock: Optional[bool] = None


@app.get("/api/health")
async def health():
    model_path = find_gguf_model_path()
    remote = bool(remote_model_url())
    return {
        "status": "healthy",
        "service": "AegisPlan",
        "version": "0.1.0",
        "engine": "CP-SAT + Nemotron Nano 9B v2 (fine-tuned)",
        "model": {
            "gguf": os.path.basename(model_path) if model_path else ("nemotron_aegisplan_q4_k_m.gguf" if remote else None),
            "available": is_gguf_available(),
            "where": "remote" if remote else "local",
        },
    }


@app.get("/api/sample")
async def get_sample_plan():
    """Return the baseline validated outpatient clinic plan."""
    plan = parse_fml(FEW_SHOT_EXEMPLAR, plan_id="sample_clinic")
    plan = validate_plan(plan)
    return plan


@app.post("/api/generate")
async def generate_plans(req: GenerateRequest):
    """Generate candidates, repair with CP-SAT, and rank lexicographically."""
    try:
        candidates = await router.generate_candidates(
            brief=req.brief,
            boundary_w=req.boundary_w,
            boundary_h=req.boundary_h,
            locked_rooms=req.locked_rooms,
            mode=req.mode,
            num_candidates=req.num_candidates,
            enable_geometric_masking=req.enable_geometric_masking,
        )
        return {
            "mode": req.mode,
            "privacy_status": (
                "100% Confidential (Zero briefs leave workstation)"
                if req.mode == "local"
                else "Cloud-Burst (Pinned CoreWeave/DeepInfra)"
            ),
            "candidates": [
                {
                    "rank": c.rank,
                    "candidate_idx": c.candidate_idx,
                    "plan": c.repaired_plan,
                    "solver_status": c.solver_status,
                    "solve_time_ms": c.solve_time_ms,
                    "pre_repair_overlap_pct": c.pre_repair_overlap_pct,
                    "checks_passed": c.checks_passed,
                    "total_checks": c.total_checks,
                    "travel_distance_mm": c.travel_distance_mm,
                    "raw_fml": c.raw_fml,
                }
                for c in candidates
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/pipeline")
async def pipeline(req: GenerateRequest):
    """Brief to ranked, validated and repaired candidates in the viewer's plan.json v0.1 format."""
    try:
        candidates = await router.generate_candidates(
            brief=req.brief,
            boundary_w=req.boundary_w,
            boundary_h=req.boundary_h,
            locked_rooms=req.locked_rooms,
            mode=req.mode,
            num_candidates=req.num_candidates,
            enable_geometric_masking=req.enable_geometric_masking,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    out = []
    for c in candidates:
        viz = to_viz_plan(
            c.repaired_plan,
            name=f"Candidate {c.rank}",
            blurb=f"{c.checks_passed} of {c.total_checks} checks pass, {c.solver_status.lower()} after repair",
        )
        viz["provenance"].update({"brief": req.brief, "source": c.source, "rank": c.rank})
        out.append({
            "rank": c.rank,
            "source": c.source,
            "solver_status": c.solver_status,
            "solve_time_ms": c.solve_time_ms,
            "checks_passed": c.checks_passed,
            "total_checks": c.total_checks,
            "pre_repair_overlap_pct": c.pre_repair_overlap_pct,
            "travel_distance_mm": c.travel_distance_mm,
            "raw_fml": c.raw_fml,
            "plan": c.repaired_plan,
            "viz_plan": viz,
        })
    return {"mode": req.mode, "candidates": out}


@app.post("/api/edit_text")
async def edit_text(req: EditTextRequest):
    """Plain-language edit ("Make the waiting room 20% bigger, keep the restrooms fixed"), repaired by CP-SAT."""
    res = apply_edit(req.plan, req.text)
    return {
        "status": res.status,
        "summary": res.summary,
        "explanation": res.explanation,
        "conflict_rooms": res.conflict_rooms,
        "solve_time_ms": res.solve_time_ms,
        "plan": res.plan,
        "viz_plan": to_viz_plan(res.plan, name=req.name) if res.status in ("OPTIMAL", "FEASIBLE") else None,
    }


@app.post("/api/validate")
async def validate_endpoint(plan: PlanDocument):
    """Validate a plan.json against ADA, FGI, and IBC codes."""
    return validate_plan(plan)


@app.post("/api/repair")
async def repair_endpoint(req: RepairRequest):
    """Execute CP-SAT combinatorial geometry repair on a plan or raw FML."""
    if req.plan:
        plan = req.plan
    elif req.fml_text:
        plan = parse_fml(req.fml_text)
    else:
        raise HTTPException(status_code=400, detail="Must provide plan or fml_text")

    result = repair_plan(
        plan,
        max_time_seconds=req.max_time_seconds,
        enforce_door_adjacencies=req.enforce_door_adjacencies,
    )
    validated = validate_plan(result.plan)
    return {
        "status": result.status,
        "solve_time_ms": result.solve_time_ms,
        "conflict_core": result.conflict_core,
        "plan": validated,
    }


@app.post("/api/edit")
async def edit_room(req: EditRoomRequest):
    """Interactive room modification with immediate sub-50ms CP-SAT re-solve."""
    plan = req.plan
    target_room = next((r for r in plan.rooms if r.id == req.room_id), None)
    if not target_room:
        raise HTTPException(status_code=404, detail=f"Room {req.room_id} not found")

    if req.toggle_lock is not None:
        target_room.locked = req.toggle_lock

    target_room.bbox.w = max(1500, target_room.bbox.w + req.delta_w)
    target_room.bbox.h = max(1500, target_room.bbox.h + req.delta_h)
    target_room.polygon = [
        [target_room.bbox.x, target_room.bbox.y],
        [target_room.bbox.x + target_room.bbox.w, target_room.bbox.y],
        [target_room.bbox.x + target_room.bbox.w, target_room.bbox.y + target_room.bbox.h],
        [target_room.bbox.x, target_room.bbox.y + target_room.bbox.h],
    ]
    target_room.area_actual_m2 = round((target_room.bbox.w * target_room.bbox.h) / 1_000_000.0, 2)

    # Re-run CP-SAT to resolve any overlaps caused by the edit
    res = repair_plan(plan, max_time_seconds=1.0)
    validated = validate_plan(res.plan)
    return {
        "status": res.status,
        "solve_time_ms": res.solve_time_ms,
        "conflict_core": res.conflict_core,
        "plan": validated,
    }


# Static assets directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/aegis")
async def aegis_ui():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(
                content=f.read(),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
    return HTMLResponse("<h1>AegisPlan API running</h1>")


@app.get("/datacenter")
async def datacenter_page():
    """Data Center Studio, the viewer's second page."""
    return RedirectResponse("/datacenter.html")


if os.path.isdir(VIZ_DIST):
    # Registered last so the API routes above win.
    app.mount("/", StaticFiles(directory=VIZ_DIST, html=True), name="viz")
else:
    app.add_api_route("/", aegis_ui, methods=["GET"])
