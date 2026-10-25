"""Object-level geometric and U.S. regulatory validator.

Evaluates floorplans against ADA Accessibility Standards, FGI Outpatient Guidelines,
and IBC/NFPA-101 egress rules. Emits machine-checkable pass/fail reports with legal citations.
"""

from typing import List, Dict, Tuple, Set, Optional
import networkx as nx
from shapely.geometry import Polygon, box

from aegisplan.schemas import PlanDocument, ValidationReport, ValidationCheck


def validate_plan(plan: PlanDocument) -> PlanDocument:
    """Run all geometric and U.S. regulatory checks on the given plan.

    Updates and returns plan.validation in-place.
    """
    checks: List[ValidationCheck] = []
    conflict_core: List[str] = []

    # 1. Boundary Containment
    b_poly = Polygon(plan.boundary.polygon)
    out_of_bounds_rooms: List[str] = []
    for r in plan.rooms:
        r_poly = box(r.bbox.x, r.bbox.y, r.bbox.x + r.bbox.w, r.bbox.y + r.bbox.h)
        if not b_poly.contains(r_poly) and not b_poly.equals(r_poly):
            # check intersection area
            inter_area = b_poly.intersection(r_poly).area
            if inter_area < r_poly.area - 1e-4:
                out_of_bounds_rooms.append(r.id)

    if out_of_bounds_rooms:
        checks.append(
            ValidationCheck(
                rule_id="GEOM-BOUNDARY-01",
                status="FAIL",
                measured=f"Rooms out of boundary: {', '.join(out_of_bounds_rooms)}",
                required="100% room containment inside boundary polygon",
                citation="Architectural Standard Footprint Containment",
            )
        )
        conflict_core.append(f"OUT_OF_BOUNDS_{','.join(out_of_bounds_rooms)}")
    else:
        checks.append(
            ValidationCheck(
                rule_id="GEOM-BOUNDARY-01",
                status="PASS",
                measured="All rooms strictly inside boundary",
                required="100% room containment inside boundary polygon",
                citation="Architectural Standard Footprint Containment",
            )
        )

    # 2. Polygon Non-Overlap Check
    total_room_area = 0.0
    overlap_area = 0.0
    overlapping_pairs: List[Tuple[str, str]] = []

    room_polys = {
        r.id: box(r.bbox.x, r.bbox.y, r.bbox.x + r.bbox.w, r.bbox.y + r.bbox.h)
        for r in plan.rooms
    }

    for i in range(len(plan.rooms)):
        r1 = plan.rooms[i]
        p1 = room_polys[r1.id]
        total_room_area += p1.area
        for j in range(i + 1, len(plan.rooms)):
            r2 = plan.rooms[j]
            p2 = room_polys[r2.id]
            if p1.intersects(p2):
                inter = p1.intersection(p2)
                if inter.area > 10.0:  # ignore 0-width line touch
                    overlap_area += inter.area
                    overlapping_pairs.append((r1.id, r2.id))

    overlap_pct = (overlap_area / total_room_area * 100.0) if total_room_area > 0 else 0.0
    if overlapping_pairs:
        pairs_str = ", ".join(f"({p[0]}, {p[1]})" for p in overlapping_pairs)
        checks.append(
            ValidationCheck(
                rule_id="GEOM-OVERLAP-02",
                status="FAIL",
                measured=f"{overlap_pct:.2f}% overlap ({pairs_str})",
                required="0.0% overlap between distinct rooms",
                citation="Building Code Architectural Separation & 2D Interval Disjointness",
            )
        )
        for p in overlapping_pairs:
            conflict_core.append(f"OVERLAP_{p[0]}_{p[1]}")
    else:
        checks.append(
            ValidationCheck(
                rule_id="GEOM-OVERLAP-02",
                status="PASS",
                measured="0.0% overlap",
                required="0.0% overlap between distinct rooms",
                citation="Building Code Architectural Separation & 2D Interval Disjointness",
            )
        )

    # 3. ADA-404.2.3: Door Clear Width
    min_general_door_w = 815
    min_clinical_door_w = 915
    failing_doors: List[str] = []

    for d in plan.doors:
        is_clinical = any("exam" in c or "procedure" in c for c in d.connects)
        req_w = min_clinical_door_w if is_clinical else min_general_door_w
        if d.width_mm < req_w:
            failing_doors.append(f"{d.id} ({d.width_mm}mm < {req_w}mm)")

    if failing_doors:
        checks.append(
            ValidationCheck(
                rule_id="ADA-404.2.3",
                status="FAIL",
                measured=f"Deficient doors: {', '.join(failing_doors)}",
                required=">= 815mm general; >= 915mm exam/patient doors",
                citation="ADA Accessibility Standards, Chapter 4 §404.2.3 Clear Width",
            )
        )
        conflict_core.append("DOOR_WIDTH_DEFICIENT")
    else:
        checks.append(
            ValidationCheck(
                rule_id="ADA-404.2.3",
                status="PASS",
                measured=f"All {len(plan.doors)} doors meet required clear width (>= 915mm clinical, >= 815mm general)",
                required=">= 815mm general; >= 915mm exam/patient doors",
                citation="ADA Accessibility Standards, Chapter 4 §404.2.3 Clear Width",
            )
        )

    # 4. ADA-403.5.1: Accessible Route / Corridor Width
    corridors = [r for r in plan.rooms if r.type == "corridor"]
    corridor_failures: List[str] = []
    for c in corridors:
        min_dim = min(c.bbox.w, c.bbox.h)
        if min_dim < 1830:  # 72 inches for outpatient clinics
            corridor_failures.append(f"{c.id} ({min_dim}mm < 1830mm)")

    if corridor_failures:
        checks.append(
            ValidationCheck(
                rule_id="ADA-403.5.1",
                status="FAIL",
                measured=f"Deficient corridor width: {', '.join(corridor_failures)}",
                required=">= 1830mm (72 in) for outpatient clinic primary circulation",
                citation="ADA Accessibility Standards §403.5.1 / VA Space Planning Criteria",
            )
        )
        conflict_core.append("CORRIDOR_WIDTH_DEFICIENT")
    elif corridors:
        min_dim = min(min(c.bbox.w, c.bbox.h) for c in corridors)
        checks.append(
            ValidationCheck(
                rule_id="ADA-403.5.1",
                status="PASS",
                measured=f"Corridor width: {min_dim}mm >= 1830mm",
                required=">= 1830mm (72 in) for outpatient clinic primary circulation",
                citation="ADA Accessibility Standards §403.5.1 / VA Space Planning Criteria",
            )
        )

    # 5. ADA-304.3: Turning Circle (60 in / 1525mm) & Restroom Fixture Clearance
    turning_failures: List[str] = []
    restrooms = [r for r in plan.rooms if r.type == "restroom"]
    for r in plan.rooms:
        if r.type in {"exam", "consult", "procedure"}:
            if r.bbox.w < 1525 or r.bbox.h < 1525:
                turning_failures.append(f"{r.id} ({r.bbox.w}x{r.bbox.h} < 1525mm)")
    for rr in restrooms:
        # Single-occupancy ADA restroom requires >= 2150mm x 2150mm for circle + fixtures
        if rr.bbox.w < 2150 or rr.bbox.h < 2150:
            turning_failures.append(f"{rr.id} ({rr.bbox.w}x{rr.bbox.h} < 2150mm for toilet/sink fixtures)")

    if turning_failures:
        checks.append(
            ValidationCheck(
                rule_id="ADA-304.3",
                status="FAIL",
                measured=f"Insufficient turning clearance: {', '.join(turning_failures)}",
                required=">= 1525mm (60 in) clear diameter; >= 2150mm min dim for single-user ADA restroom",
                citation="ADA Accessibility Standards, Chapter 3 §304.3 Turning Space",
            )
        )
        conflict_core.append("TURNING_CLEARANCE_DEFICIENT")
    else:
        checks.append(
            ValidationCheck(
                rule_id="ADA-304.3",
                status="PASS",
                measured="All accessible rooms accommodate 1525mm diameter turning circle",
                required=">= 1525mm (60 in) clear diameter; >= 2150mm min dim for single-user ADA restroom",
                citation="ADA Accessibility Standards, Chapter 3 §304.3 Turning Space",
            )
        )

    # 6. FGI-2.1-2.2: Exam Room Area & Minimum Dimension
    exam_rooms = [r for r in plan.rooms if r.type in {"exam", "procedure"}]
    exam_failures: List[str] = []
    for er in exam_rooms:
        min_dim = min(er.bbox.w, er.bbox.h)
        if er.area_actual_m2 < 11.15 or min_dim < 3048:
            exam_failures.append(f"{er.id} (area={er.area_actual_m2}m2, min_dim={min_dim}mm)")

    if exam_failures:
        checks.append(
            ValidationCheck(
                rule_id="FGI-2.1-2.2",
                status="FAIL",
                measured=f"Deficient exam rooms: {', '.join(exam_failures)}",
                required="Area >= 11.15 m2 (120 sq ft) and min dimension >= 3048mm (10 ft)",
                citation="FGI Guidelines for Design and Construction of Outpatient Facilities, §2.1-2.2",
            )
        )
        conflict_core.append("EXAM_ROOM_SIZING_DEFICIENT")
    elif exam_rooms:
        checks.append(
            ValidationCheck(
                rule_id="FGI-2.1-2.2",
                status="PASS",
                measured=f"All {len(exam_rooms)} exam rooms exceed 11.15 m2 and 3048mm minimum dimension",
                required="Area >= 11.15 m2 (120 sq ft) and min dimension >= 3048mm (10 ft)",
                citation="FGI Guidelines for Design and Construction of Outpatient Facilities, §2.1-2.2",
            )
        )

    # 7. FGI Clean / Soiled Utility Separation
    clean_utils = {r.id for r in plan.rooms if r.type == "clean_util"}
    soiled_utils = {r.id for r in plan.rooms if r.type == "soiled_util"}
    forbidden_doors: List[str] = []
    for d in plan.doors:
        if (d.connects[0] in clean_utils and d.connects[1] in soiled_utils) or (
            d.connects[1] in clean_utils and d.connects[0] in soiled_utils
        ):
            forbidden_doors.append(d.id)

    if forbidden_doors:
        checks.append(
            ValidationCheck(
                rule_id="FGI-UTIL-SEP",
                status="FAIL",
                measured=f"Direct door connection between clean and soiled utility ({', '.join(forbidden_doors)})",
                required="Clean and soiled utility rooms must have strict physical door separation",
                citation="FGI Guidelines Section 2.1-3 Support Areas & Infection Prevention",
            )
        )
        conflict_core.append("CLEAN_SOILED_CROSS_CONTAMINATION")
    elif clean_utils and soiled_utils:
        checks.append(
            ValidationCheck(
                rule_id="FGI-UTIL-SEP",
                status="PASS",
                measured="Strict physical separation maintained between clean and soiled utilities",
                required="Clean and soiled utility rooms must have strict physical door separation",
                citation="FGI Guidelines Section 2.1-3 Support Areas & Infection Prevention",
            )
        )

    # 8. IBC-1017 / NFPA-101: 100% Door Reachability & Max Egress Distance
    G = nx.Graph()
    for pair in plan.topology.connected_by_door:
        G.add_edge(pair[0], pair[1])

    unreachable_rooms: List[str] = []
    if "OUTSIDE" in G:
        for r in plan.rooms:
            if r.id not in G or not nx.has_path(G, "OUTSIDE", r.id):
                unreachable_rooms.append(r.id)
    else:
        unreachable_rooms = [r.id for r in plan.rooms]

    if unreachable_rooms:
        checks.append(
            ValidationCheck(
                rule_id="IBC-1017-REACH",
                status="FAIL",
                measured=f"Unreachable rooms: {', '.join(unreachable_rooms)}",
                required="100% of rooms must be reachable from exterior exit (OUTSIDE)",
                citation="IBC Chapter 10 / NFPA-101 Means of Egress Reachability",
            )
        )
        conflict_core.append(f"UNREACHABLE_{','.join(unreachable_rooms)}")
    else:
        checks.append(
            ValidationCheck(
                rule_id="IBC-1017-REACH",
                status="PASS",
                measured="100% of rooms reachable via BFS door traversal",
                required="100% of rooms must be reachable from exterior exit (OUTSIDE)",
                citation="IBC Chapter 10 / NFPA-101 Means of Egress Reachability",
            )
        )

    # Max Egress Travel Distance Check (max 45,720 mm unsprinklered)
    max_egress = plan.topology.computed_paths.egress_max_path
    if max_egress:
        if max_egress.distance_mm > 45720:
            checks.append(
                ValidationCheck(
                    rule_id="IBC-1017-DIST",
                    status="FAIL",
                    measured=f"Max travel distance {max_egress.distance_mm:.0f}mm > 45,720mm (150 ft)",
                    required="<= 45,720mm (150 ft unsprinklered) or <= 60,960mm (200 ft sprinklered)",
                    citation="IBC Table 1017.2 / NFPA-101 Exit Access Travel Distance",
                )
            )
            conflict_core.append("EGRESS_TRAVEL_DISTANCE_EXCEEDED")
        else:
            checks.append(
                ValidationCheck(
                    rule_id="IBC-1017-DIST",
                    status="PASS",
                    measured=f"Max travel distance {max_egress.distance_mm:.0f}mm <= 45,720mm limit",
                    required="<= 45,720mm (150 ft unsprinklered) or <= 60,960mm (200 ft sprinklered)",
                    citation="IBC Table 1017.2 / NFPA-101 Exit Access Travel Distance",
                )
            )

    # Summary statement
    passed_count = sum(1 for c in checks if c.status == "PASS")
    total_count = len(checks)
    summary = (
        f"Passed {passed_count} of {total_count} implemented geometry and code checks; "
        "MEP, fire-resistance ratings, and acoustic STC requirements were not evaluated."
    )

    plan.validation = ValidationReport(
        summary_statement=summary,
        conflict_core=conflict_core,
        checks=checks,
    )
    return plan
