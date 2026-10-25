"""Pydantic schemas matching the plan.json shared semantic building contract."""

from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel, Field


class WallThickness(BaseModel):
    interior: int = 100
    exterior: int = 150


class PlanMetadata(BaseModel):
    plan_id: str = "clinic_candidate_1"
    building_type: str = "outpatient_clinic"
    units: str = "mm"
    grid_module_mm: int = 100
    wall_thickness_mm: WallThickness = Field(default_factory=WallThickness)
    generator_mode: str = "local_vllm_xgrammar"
    solver_status: str = "OPTIMAL"
    solve_time_ms: int = 0


class Boundary(BaseModel):
    polygon: List[List[int]]  # [[0, 0], [W, 0], [W, H], [0, H]]
    area_m2: float


class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class AdaTurningCircle(BaseModel):
    center: List[int]
    diameter_mm: int = 1525


class Room(BaseModel):
    id: str
    type: str  # waiting, reception, corridor, exam, consult, procedure, restroom, clean_util, soiled_util, staff_break, etc.
    label: str
    locked: bool = False
    bbox: BoundingBox
    polygon: List[List[int]]
    area_target_m2: Optional[List[float]] = None  # [min_m2, max_m2]
    area_actual_m2: float
    ada_turning_circle: Optional[AdaTurningCircle] = None


class Wall(BaseModel):
    id: str
    start: List[int]
    end: List[int]
    thickness_mm: int = 100
    is_exterior: bool = False
    adjacent_rooms: List[str] = Field(default_factory=list)
    openings: List[str] = Field(default_factory=list)


class Door(BaseModel):
    id: str
    wall_id: Optional[str] = None
    connects: List[str]  # e.g. ["exam_1", "corridor_1"] or ["waiting_1", "OUTSIDE"]
    position: List[int]  # [x, y] midpoint
    segment: List[List[int]]  # [[x1, y1], [x2, y2]]
    width_mm: int = 915
    height_mm: int = 2135
    swing_dir: str = "in_left"


class EgressMaxPath(BaseModel):
    rooms: List[str]
    distance_mm: float


class ComputedPaths(BaseModel):
    patient_flow: List[str] = Field(default_factory=list)
    staff_route: List[str] = Field(default_factory=list)
    egress_max_path: Optional[EgressMaxPath] = None


class Topology(BaseModel):
    shares_wall: List[List[str]] = Field(default_factory=list)
    connected_by_door: List[List[str]] = Field(default_factory=list)
    computed_paths: ComputedPaths = Field(default_factory=ComputedPaths)


class ValidationCheck(BaseModel):
    rule_id: str
    status: str  # "PASS" | "FAIL" | "WARNING"
    measured: str
    required: str
    citation: str


class ValidationReport(BaseModel):
    summary_statement: str = ""
    conflict_core: List[str] = Field(default_factory=list)
    checks: List[ValidationCheck] = Field(default_factory=list)


class PlanDocument(BaseModel):
    metadata: PlanMetadata = Field(default_factory=PlanMetadata)
    boundary: Boundary
    rooms: List[Room] = Field(default_factory=list)
    walls: List[Wall] = Field(default_factory=list)
    doors: List[Door] = Field(default_factory=list)
    topology: Topology = Field(default_factory=Topology)
    validation: ValidationReport = Field(default_factory=ValidationReport)


# DSL intermediate parsing structures
class ParsedFML(BaseModel):
    boundary: Boundary
    rooms: List[Room]
    doors: List[Door]
