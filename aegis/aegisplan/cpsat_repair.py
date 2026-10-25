"""Combinatorial Geometry Repair & Conflict Diagnostics using Google OR-Tools CP-SAT.

Formulates 2D interval packing, regulatory sizing, and adjacency on a 100mm grid.
Minimizes L1 perturbation from LLM initial layout and extracts Minimal Unsatisfiable Cores
on impossible design briefs.
"""

from typing import List, Dict, Tuple, Optional, Any
import time
from ortools.sat.python import cp_model

from aegisplan.schemas import (
    PlanDocument,
    Room,
    Door,
    BoundingBox,
    AdaTurningCircle,
    ValidationCheck,
)
from aegisplan.fml_parser import _compute_walls_and_topology, _compute_circulation_paths


class RepairResult:
    def __init__(
        self,
        plan: PlanDocument,
        status: str,
        solve_time_ms: int,
        conflict_core: List[str],
        objective_value: float = 0.0,
    ):
        self.plan = plan
        self.status = status
        self.solve_time_ms = solve_time_ms
        self.conflict_core = conflict_core
        self.objective_value = objective_value


def repair_plan(
    plan: PlanDocument,
    max_time_seconds: float = 2.0,
    enforce_door_adjacencies: bool = True,
) -> RepairResult:
    """Repair geometric overlaps, regulatory sizing, and wall alignments using CP-SAT.

    Scale: 1 unit = 100mm (grid_module_mm).
    """
    start_time = time.perf_counter()
    model = cp_model.CpModel()

    grid_mm = plan.metadata.grid_module_mm
    b_poly = plan.boundary.polygon
    W_bound = max(pt[0] for pt in b_poly) // grid_mm
    H_bound = max(pt[1] for pt in b_poly) // grid_mm

    rooms = plan.rooms
    n_rooms = len(rooms)
    if n_rooms == 0:
        return RepairResult(plan, "OPTIMAL", 0, [])

    # Map room indices
    room_idx_map = {r.id: idx for idx, r in enumerate(rooms)}

    # Variables for each room
    x_vars = []
    y_vars = []
    w_vars = []
    h_vars = []
    x_end_vars = []
    y_end_vars = []
    x_intervals = []
    y_intervals = []

    # Assumptions tracking for Unsatisfiable Core extraction
    assumptions_map = {}  # literal -> constraint description
    assumptions_list = []

    for i, r in enumerate(rooms):
        init_x = r.bbox.x // grid_mm
        init_y = r.bbox.y // grid_mm
        init_w = max(1, r.bbox.w // grid_mm)
        init_h = max(1, r.bbox.h // grid_mm)

        # Minimum dimension based on room type
        if r.type == "corridor":
            min_w = 19  # 1900mm >= 1830mm
            min_h = 19
        elif r.type in {"exam", "procedure"}:
            min_w = 31  # 3100mm >= 3048mm
            min_h = 31
        elif r.type == "restroom":
            min_w = 22  # 2200mm >= 2150mm
            min_h = 22
        elif r.type in {"consult", "staff_break", "nurse_station", "lab"}:
            min_w = 20  # 2000mm
            min_h = 20
        else:
            min_w = 15  # 1500mm
            min_h = 15

        xi = model.NewIntVar(0, W_bound - min_w, f"x_{i}_{r.id}")
        yi = model.NewIntVar(0, H_bound - min_h, f"y_{i}_{r.id}")
        wi = model.NewIntVar(min_w, W_bound, f"w_{i}_{r.id}")
        hi = model.NewIntVar(min_h, H_bound, f"h_{i}_{r.id}")

        x_end_i = model.NewIntVar(min_w, W_bound, f"x_end_{i}_{r.id}")
        y_end_i = model.NewIntVar(min_h, H_bound, f"y_end_{i}_{r.id}")

        model.Add(x_end_i == xi + wi)
        model.Add(y_end_i == yi + hi)

        int_x = model.NewIntervalVar(xi, wi, x_end_i, f"int_x_{i}_{r.id}")
        int_y = model.NewIntervalVar(yi, hi, y_end_i, f"int_y_{i}_{r.id}")

        x_vars.append(xi)
        y_vars.append(yi)
        w_vars.append(wi)
        h_vars.append(hi)
        x_end_vars.append(x_end_i)
        y_end_vars.append(y_end_i)
        x_intervals.append(int_x)
        y_intervals.append(int_y)

        # Aspect ratio bound: 2*w <= 5*h and 2*h <= 5*w (for non-corridor rooms)
        if r.type != "corridor":
            lit_ar = model.NewBoolVar(f"ar_{r.id}")
            model.Add(2 * wi <= 5 * hi).OnlyEnforceIf(lit_ar)
            model.Add(2 * hi <= 5 * wi).OnlyEnforceIf(lit_ar)
            assumptions_list.append(lit_ar)
            assumptions_map[lit_ar] = f"ASPECT_RATIO_{r.id}"

        # Clinical exam room minimum area: >= 11.15 m2 (112 grid units)
        if r.type in {"exam", "procedure"}:
            lit_area = model.NewBoolVar(f"area_{r.id}")
            area_var = model.NewIntVar(112, W_bound * H_bound, f"area_{r.id}")
            model.AddMultiplicationEquality(area_var, [wi, hi]).OnlyEnforceIf(lit_area)
            assumptions_list.append(lit_area)
            assumptions_map[lit_area] = f"MIN_AREA_FGI_{r.id}"

        # Hard lock preservation
        if r.locked:
            lit_lock = model.NewBoolVar(f"lock_{r.id}")
            model.Add(xi == init_x).OnlyEnforceIf(lit_lock)
            model.Add(yi == init_y).OnlyEnforceIf(lit_lock)
            model.Add(wi == init_w).OnlyEnforceIf(lit_lock)
            model.Add(hi == init_h).OnlyEnforceIf(lit_lock)
            assumptions_list.append(lit_lock)
            assumptions_map[lit_lock] = f"LOCKED_ROOM_{r.id}"

    # Global 2D Non-Overlap
    model.AddNoOverlap2D(x_intervals, y_intervals)

    # Door Adjacency & Clearance Constraints
    if enforce_door_adjacencies:
        for d in plan.doors:
            if len(d.connects) == 2 and "OUTSIDE" not in d.connects:
                r1_id, r2_id = d.connects[0], d.connects[1]
                if r1_id in room_idx_map and r2_id in room_idx_map:
                    i1 = room_idx_map[r1_id]
                    i2 = room_idx_map[r2_id]
                    # Required shared wall length: door width + 200mm jamb clearance
                    min_clearance = (d.width_mm + 200 + grid_mm - 1) // grid_mm

                    lit_door = model.NewBoolVar(f"door_conn_{d.id}")
                    d_east = model.NewBoolVar(f"d_east_{d.id}")
                    d_west = model.NewBoolVar(f"d_west_{d.id}")
                    d_north = model.NewBoolVar(f"d_north_{d.id}")
                    d_south = model.NewBoolVar(f"d_south_{d.id}")

                    # Exactly one direction if door connection holds
                    model.Add(d_east + d_west + d_north + d_south == 1).OnlyEnforceIf(lit_door)

                    # East: r1 right meets r2 left
                    model.Add(x_end_vars[i1] == x_vars[i2]).OnlyEnforceIf(d_east)
                    model.Add(y_end_vars[i1] - y_vars[i2] >= min_clearance).OnlyEnforceIf(d_east)
                    model.Add(y_end_vars[i2] - y_vars[i1] >= min_clearance).OnlyEnforceIf(d_east)

                    # West: r2 right meets r1 left
                    model.Add(x_end_vars[i2] == x_vars[i1]).OnlyEnforceIf(d_west)
                    model.Add(y_end_vars[i1] - y_vars[i2] >= min_clearance).OnlyEnforceIf(d_west)
                    model.Add(y_end_vars[i2] - y_vars[i1] >= min_clearance).OnlyEnforceIf(d_west)

                    # North: r1 top meets r2 bottom
                    model.Add(y_end_vars[i1] == y_vars[i2]).OnlyEnforceIf(d_north)
                    model.Add(x_end_vars[i1] - x_vars[i2] >= min_clearance).OnlyEnforceIf(d_north)
                    model.Add(x_end_vars[i2] - x_vars[i1] >= min_clearance).OnlyEnforceIf(d_north)

                    # South: r2 top meets r1 bottom
                    model.Add(y_end_vars[i2] == y_vars[i1]).OnlyEnforceIf(d_south)
                    model.Add(x_end_vars[i1] - x_vars[i2] >= min_clearance).OnlyEnforceIf(d_south)
                    model.Add(x_end_vars[i2] - x_vars[i1] >= min_clearance).OnlyEnforceIf(d_south)

                    assumptions_list.append(lit_door)
                    assumptions_map[lit_door] = f"DOOR_ADJACENCY_{d.id}_{r1_id}_{r2_id}"

    # Minimum L1 Perturbation Objective
    objective_terms = []
    for i, r in enumerate(rooms):
        init_x = r.bbox.x // grid_mm
        init_y = r.bbox.y // grid_mm
        init_w = max(1, r.bbox.w // grid_mm)
        init_h = max(1, r.bbox.h // grid_mm)

        # L1 distance for position: |x - init_x| + |y - init_y|
        dx = model.NewIntVar(0, W_bound, f"dx_{i}")
        dy = model.NewIntVar(0, H_bound, f"dy_{i}")
        model.Add(dx >= x_vars[i] - init_x)
        model.Add(dx >= init_x - x_vars[i])
        model.Add(dy >= y_vars[i] - init_y)
        model.Add(dy >= init_y - y_vars[i])

        # L1 distance for dimension with weight 2: 2*(|w - init_w| + |h - init_h|)
        dw = model.NewIntVar(0, W_bound, f"dw_{i}")
        dh = model.NewIntVar(0, H_bound, f"dh_{i}")
        model.Add(dw >= w_vars[i] - init_w)
        model.Add(dw >= init_w - w_vars[i])
        model.Add(dh >= h_vars[i] - init_h)
        model.Add(dh >= init_h - h_vars[i])

        objective_terms.append(1 * dx + 1 * dy + 2 * dw + 2 * dh)

    model.Minimize(sum(objective_terms))

    # Add assumptions for unsat core extraction
    model.AddAssumptions(assumptions_list)

    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.num_workers = 4

    solve_status = solver.Solve(model)
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    if solve_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Update rooms with solved coordinates
        repaired_rooms: List[Room] = []
        for i, r in enumerate(rooms):
            sx = solver.Value(x_vars[i]) * grid_mm
            sy = solver.Value(y_vars[i]) * grid_mm
            sw = solver.Value(w_vars[i]) * grid_mm
            sh = solver.Value(h_vars[i]) * grid_mm
            area_m2 = round((sw * sh) / 1_000_000.0, 2)

            ada_circle = None
            if r.type in {"restroom", "exam", "consult", "procedure"}:
                ada_circle = AdaTurningCircle(
                    center=[sx + sw // 2, sy + sh // 2],
                    diameter_mm=1525,
                )

            repaired_room = Room(
                id=r.id,
                type=r.type,
                label=r.label,
                locked=r.locked,
                bbox=BoundingBox(x=sx, y=sy, w=sw, h=sh),
                polygon=[[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]],
                area_actual_m2=area_m2,
                area_target_m2=r.area_target_m2,
                ada_turning_circle=ada_circle,
            )
            repaired_rooms.append(repaired_room)

        # Re-compute analytical door midpoints on shared walls
        repaired_doors = _place_analytical_doors(repaired_rooms, plan.doors, grid_mm)

        # Compute walls, topology, and paths
        b_w = max(pt[0] for pt in plan.boundary.polygon)
        b_h = max(pt[1] for pt in plan.boundary.polygon)
        walls, shares_wall, connected_by_door = _compute_walls_and_topology(
            repaired_rooms, repaired_doors, b_w, b_h
        )
        paths = _compute_circulation_paths(repaired_rooms, connected_by_door)

        plan.rooms = repaired_rooms
        plan.doors = repaired_doors
        plan.walls = walls
        plan.topology.shares_wall = shares_wall
        plan.topology.connected_by_door = connected_by_door
        plan.topology.computed_paths = paths
        plan.metadata.solver_status = "OPTIMAL" if solve_status == cp_model.OPTIMAL else "FEASIBLE"
        plan.metadata.solve_time_ms = elapsed_ms

        return RepairResult(
            plan=plan,
            status=plan.metadata.solver_status,
            solve_time_ms=elapsed_ms,
            conflict_core=[],
            objective_value=solver.ObjectiveValue(),
        )

    elif solve_status == cp_model.INFEASIBLE:
        # Extract Minimal Unsatisfiable Core from solver assumptions
        core_literals = solver.SufficientAssumptionsForInfeasibility()
        conflict_core = [
            assumptions_map[lit]
            for lit in core_literals
            if lit in assumptions_map
        ]

        # If base model without assumptions was already infeasible, diagnose footprint capacity
        if not conflict_core:
            boundary_area_m2 = (W_bound * H_bound * (grid_mm ** 2)) / 1_000_000.0
            min_room_areas = []
            for r in rooms:
                if r.locked:
                    m2 = (r.bbox.w * r.bbox.h) / 1_000_000.0
                    min_room_areas.append((r.id, m2, "LOCKED_ROOM"))
                elif r.type in {"exam", "procedure"}:
                    min_room_areas.append((r.id, 11.15, "MIN_AREA_FGI"))
                elif r.type == "corridor":
                    min_room_areas.append((r.id, (1.83 * 3.0), "MIN_CORRIDOR"))
                elif r.type == "restroom":
                    min_room_areas.append((r.id, (2.15 * 2.15), "MIN_ADA_RESTROOM"))
                else:
                    min_room_areas.append((r.id, (1.5 * 1.5), "MIN_ROOM"))

            total_min_m2 = sum(a[1] for a in min_room_areas)
            if total_min_m2 > boundary_area_m2:
                conflict_core.append(
                    f"BOUNDARY_CAPACITY_EXCEEDED: required min area {total_min_m2:.1f}m2 exceeds boundary {boundary_area_m2:.1f}m2"
                )
                for r_id, a_m2, reason in min_room_areas:
                    conflict_core.append(f"{reason}_{r_id} ({a_m2:.1f}m2)")
            else:
                conflict_core.append("GEOMETRIC_PACKING_CONSTRAINTS_CONTRADICTORY")

        plan.metadata.solver_status = "INFEASIBLE"
        plan.metadata.solve_time_ms = elapsed_ms
        plan.validation.conflict_core = conflict_core
        return RepairResult(
            plan=plan,
            status="INFEASIBLE",
            solve_time_ms=elapsed_ms,
            conflict_core=conflict_core,
        )

    else:  # cp_model.UNKNOWN (timeout)
        plan.metadata.solver_status = "TIMEOUT"
        plan.metadata.solve_time_ms = elapsed_ms
        return RepairResult(
            plan=plan,
            status="TIMEOUT",
            solve_time_ms=elapsed_ms,
            conflict_core=["SOLVER_TIMEOUT_EXCEEDED"],
        )


def _place_analytical_doors(rooms: List[Room], doors: List[Door], grid_mm: int) -> List[Door]:
    """Recalculate exact door positions at shared wall midpoints after room repositioning."""
    room_map = {r.id: r for r in rooms}
    updated_doors: List[Door] = []

    for d in doors:
        if len(d.connects) == 2 and "OUTSIDE" not in d.connects:
            r1 = room_map.get(d.connects[0])
            r2 = room_map.get(d.connects[1])
            if r1 and r2:
                b1 = r1.bbox
                b2 = r2.bbox
                dw = d.width_mm

                # Check vertical shared wall
                if b1.x + b1.w == b2.x or b2.x + b2.w == b1.x:
                    wall_x = b1.x + b1.w if b1.x + b1.w == b2.x else b2.x + b2.w
                    y_low = max(b1.y, b2.y)
                    y_high = min(b1.y + b1.h, b2.y + b2.h)
                    mid_y = (y_low + y_high) // 2
                    # Snap to 50mm / 100mm
                    mid_y = (mid_y // 50) * 50
                    updated_doors.append(
                        Door(
                            id=d.id,
                            connects=d.connects,
                            position=[wall_x, mid_y],
                            segment=[[wall_x, mid_y - dw // 2], [wall_x, mid_y + dw // 2]],
                            width_mm=dw,
                            height_mm=d.height_mm,
                            swing_dir=d.swing_dir,
                        )
                    )
                    continue

                # Check horizontal shared wall
                if b1.y + b1.h == b2.y or b2.y + b2.h == b1.y:
                    wall_y = b1.y + b1.h if b1.y + b1.h == b2.y else b2.y + b2.h
                    x_low = max(b1.x, b2.x)
                    x_high = min(b1.x + b1.w, b2.x + b2.w)
                    mid_x = (x_low + x_high) // 2
                    mid_x = (mid_x // 50) * 50
                    updated_doors.append(
                        Door(
                            id=d.id,
                            connects=d.connects,
                            position=[mid_x, wall_y],
                            segment=[[mid_x - dw // 2, wall_y], [mid_x + dw // 2, wall_y]],
                            width_mm=dw,
                            height_mm=d.height_mm,
                            swing_dir=d.swing_dir,
                        )
                    )
                    continue

        # Keep existing position for OUTSIDE door or fallback
        updated_doors.append(d)

    return updated_doors
