"""FML-DSL parser and serializer.

Parses compact Floorplan Markup Language streams into the shared plan.json schema,
computing walls, topology (shares_wall, connected_by_door), ADA turning circles,
and shortest clinical circulation paths.
"""

from typing import List, Dict, Tuple, Optional, Set
import re
import networkx as nx

from aegisplan.schemas import (
    PlanDocument,
    PlanMetadata,
    Boundary,
    Room,
    BoundingBox,
    AdaTurningCircle,
    Wall,
    Door,
    Topology,
    ComputedPaths,
    EgressMaxPath,
    ValidationReport,
)

ACCESSIBLE_ROOM_TYPES = {"restroom", "exam", "consult", "procedure"}


def parse_fml(text: str, plan_id: str = "clinic_candidate_1") -> PlanDocument:
    """Parse FML-DSL text stream into a structured PlanDocument."""
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]

    boundary_w = 0
    boundary_h = 0
    rooms: List[Room] = []
    doors: List[Door] = []

    for line in lines:
        if line == "END_PLAN":
            break

        # BOUNDARY RECT 0 0 <W> <H>
        m_b = re.match(r"^BOUNDARY\s+RECT\s+0\s+0\s+(\d+)\s+(\d+)$", line)
        if m_b:
            boundary_w = int(m_b.group(1))
            boundary_h = int(m_b.group(2))
            continue

        # ROOM <id> TYPE <type> RECT <x> <y> <w> <h> [LOCKED|FREE]
        m_r = re.match(
            r"^ROOM\s+([a-zA-Z0-9_]+)\s+TYPE\s+([a-zA-Z0-9_]+)\s+RECT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(LOCKED|FREE))?$",
            line,
            re.IGNORECASE,
        )
        if m_r:
            r_id, r_type_raw, x_s, y_s, w_s, h_s, lock_s = m_r.groups()
            x, y, w, h = int(x_s), int(y_s), int(w_s), int(h_s)
            locked = bool(lock_s and lock_s.upper() == "LOCKED")
            area_m2 = round((w * h) / 1_000_000.0, 2)

            type_map = {
                "waitingroom": "waiting",
                "examroom": "exam",
                "toilet": "restroom",
                "bathroom": "restroom",
                "hallway": "corridor",
                "breakroom": "staff_break",
                "utility": "clean_util",
            }
            r_type = type_map.get(r_type_raw.lower(), r_type_raw.lower())

            ada_circle = None
            if r_type in ACCESSIBLE_ROOM_TYPES:
                ada_circle = AdaTurningCircle(
                    center=[x + w // 2, y + h // 2],
                    diameter_mm=1525,
                )

            # Generate pretty label, e.g. "exam_1" -> "Exam Room 1"
            parts = r_id.split("_")
            num = parts[-1] if len(parts) > 1 and parts[-1].isdigit() else ""
            base_name = " ".join(parts[:-1] if num else parts).capitalize()
            label = f"{base_name} {num}".strip()
            if r_type == "exam":
                label = f"Exam Room {num}".strip()
            elif r_type == "waiting":
                label = f"Waiting Area {num}".strip()
            elif r_type == "clean_util":
                label = f"Clean Utility {num}".strip()
            elif r_type == "soiled_util":
                label = f"Soiled Utility {num}".strip()
            elif r_type == "staff_break":
                label = f"Staff Breakroom {num}".strip()

            room = Room(
                id=r_id,
                type=r_type,
                label=label,
                locked=locked,
                bbox=BoundingBox(x=x, y=y, w=w, h=h),
                polygon=[[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
                area_actual_m2=area_m2,
                ada_turning_circle=ada_circle,
            )
            rooms.append(room)
            continue

        # DOOR <id> CONNECT <r1> <r2> AT <x> <y> WIDTH <w>
        m_d = re.match(
            r"^DOOR\s+([a-zA-Z0-9_]+)\s+CONNECT\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)\s+AT\s+(\d+)\s+(\d+)\s+WIDTH\s+(\d+)$",
            line,
        )
        if m_d:
            d_id, r1, r2, dx_s, dy_s, dw_s = m_d.groups()
            dx, dy, dw = int(dx_s), int(dy_s), int(dw_s)
            door = Door(
                id=d_id,
                connects=[r1, r2],
                position=[dx, dy],
                segment=[[dx, dy - dw // 2], [dx, dy + dw // 2]],  # default vertical; refined later
                width_mm=dw,
                height_mm=2135,
                swing_dir="in_left",
            )
            doors.append(door)
            continue

        # FDOOR <id> CONNECT <r1> OUTSIDE AT <x> <y> WIDTH <w>
        m_fd = re.match(
            r"^FDOOR\s+([a-zA-Z0-9_]+)\s+CONNECT\s+([a-zA-Z0-9_]+)\s+OUTSIDE\s+AT\s+(\d+)\s+(\d+)\s+WIDTH\s+(\d+)$",
            line,
        )
        if m_fd:
            d_id, r1, dx_s, dy_s, dw_s = m_fd.groups()
            dx, dy, dw = int(dx_s), int(dy_s), int(dw_s)
            door = Door(
                id=d_id,
                connects=[r1, "OUTSIDE"],
                position=[dx, dy],
                segment=[[dx - dw // 2, dy], [dx + dw // 2, dy]],  # default horizontal; refined later
                width_mm=dw,
                height_mm=2135,
                swing_dir="out_right",
            )
            doors.append(door)
            continue

    boundary_area_m2 = round((boundary_w * boundary_h) / 1_000_000.0, 2)
    boundary = Boundary(
        polygon=[[0, 0], [boundary_w, 0], [boundary_w, boundary_h], [0, boundary_h]],
        area_m2=boundary_area_m2,
    )

    # Compute walls, topology, and door segments
    walls, shares_wall, connected_by_door = _compute_walls_and_topology(rooms, doors, boundary_w, boundary_h)

    # Compute circulation paths
    computed_paths = _compute_circulation_paths(rooms, connected_by_door)

    topology = Topology(
        shares_wall=shares_wall,
        connected_by_door=connected_by_door,
        computed_paths=computed_paths,
    )

    metadata = PlanMetadata(
        plan_id=plan_id,
        building_type="outpatient_clinic",
        units="mm",
        grid_module_mm=100,
        generator_mode="local_vllm_xgrammar",
        solver_status="OPTIMAL",
    )

    return PlanDocument(
        metadata=metadata,
        boundary=boundary,
        rooms=rooms,
        walls=walls,
        doors=doors,
        topology=topology,
        validation=ValidationReport(),
    )


def serialize_to_fml(plan: PlanDocument) -> str:
    """Serialize a PlanDocument back into standard FML-DSL text stream."""
    lines: List[str] = []

    # Boundary
    # polygon is [[0, 0], [W, 0], [W, H], [0, H]]
    p = plan.boundary.polygon
    w = max(pt[0] for pt in p)
    h = max(pt[1] for pt in p)
    lines.append(f"BOUNDARY RECT 0 0 {w} {h}")

    # Rooms: LOCKED rooms first (as per FMLM conditional generation), then FREE
    sorted_rooms = sorted(plan.rooms, key=lambda r: (not r.locked, r.id))
    for r in sorted_rooms:
        lock_str = "LOCKED" if r.locked else "FREE"
        b = r.bbox
        lines.append(f"ROOM {r.id} TYPE {r.type} RECT {b.x} {b.y} {b.w} {b.h} {lock_str}")

    # Doors
    for d in plan.doors:
        if len(d.connects) == 2 and d.connects[1] == "OUTSIDE":
            lines.append(f"FDOOR {d.id} CONNECT {d.connects[0]} OUTSIDE AT {d.position[0]} {d.position[1]} WIDTH {d.width_mm}")
        elif len(d.connects) == 2:
            lines.append(f"DOOR {d.id} CONNECT {d.connects[0]} {d.connects[1]} AT {d.position[0]} {d.position[1]} WIDTH {d.width_mm}")

    lines.append("END_PLAN")
    return "\n".join(lines)


def _compute_walls_and_topology(
    rooms: List[Room], doors: List[Door], boundary_w: int, boundary_h: int
) -> Tuple[List[Wall], List[List[str]], List[List[str]]]:
    """Derive walls, shares_wall adjacency, and connected_by_door connections."""
    shares_wall: List[List[str]] = []
    connected_by_door: List[List[str]] = []

    # Map doors for quick lookup
    door_pairs: Set[Tuple[str, str]] = set()
    for d in doors:
        if len(d.connects) == 2:
            r1, r2 = d.connects[0], d.connects[1]
            connected_by_door.append([r1, r2])
            door_pairs.add((r1, r2))
            door_pairs.add((r2, r1))

    # Detect shared walls between rooms
    wall_segments: Dict[str, Dict] = {}
    wall_idx = 1

    for i in range(len(rooms)):
        r1 = rooms[i]
        b1 = r1.bbox
        for j in range(i + 1, len(rooms)):
            r2 = rooms[j]
            b2 = r2.bbox

            # Check vertical shared wall (r1 right meets r2 left or r2 right meets r1 left)
            if b1.x + b1.w == b2.x or b2.x + b2.w == b1.x:
                y_low = max(b1.y, b2.y)
                y_high = min(b1.y + b1.h, b2.y + b2.h)
                if y_high > y_low:
                    wall_x = b1.x + b1.w if b1.x + b1.w == b2.x else b2.x + b2.w
                    wall_id = f"wall_{wall_idx}"
                    wall_idx += 1
                    wall_segments[wall_id] = {
                        "start": [wall_x, y_low],
                        "end": [wall_x, y_high],
                        "thickness_mm": 100,
                        "is_exterior": False,
                        "adjacent_rooms": [r1.id, r2.id],
                        "openings": [],
                        "orientation": "vertical",
                    }
                    shares_wall.append([r1.id, r2.id])

            # Check horizontal shared wall (r1 bottom meets r2 top or r2 bottom meets r1 top)
            if b1.y + b1.h == b2.y or b2.y + b2.h == b1.y:
                x_low = max(b1.x, b2.x)
                x_high = min(b1.x + b1.w, b2.x + b2.w)
                if x_high > x_low:
                    wall_y = b1.y + b1.h if b1.y + b1.h == b2.y else b2.y + b2.h
                    wall_id = f"wall_{wall_idx}"
                    wall_idx += 1
                    wall_segments[wall_id] = {
                        "start": [x_low, wall_y],
                        "end": [x_high, wall_y],
                        "thickness_mm": 100,
                        "is_exterior": False,
                        "adjacent_rooms": [r1.id, r2.id],
                        "openings": [],
                        "orientation": "horizontal",
                    }
                    shares_wall.append([r1.id, r2.id])

    # Assign doors to matching walls and refine door segment coordinates
    walls_list: List[Wall] = []
    for wid, wdata in wall_segments.items():
        adj = set(wdata["adjacent_rooms"])
        for d in doors:
            if len(d.connects) == 2:
                r_a, r_b = d.connects[0], d.connects[1]
                if r_a in adj and r_b in adj:
                    wdata["openings"].append(d.id)
                    d.wall_id = wid
                    # Refine door segment orientation
                    dw = d.width_mm
                    dx, dy = d.position[0], d.position[1]
                    if wdata["orientation"] == "vertical":
                        d.segment = [[dx, dy - dw // 2], [dx, dy + dw // 2]]
                    else:
                        d.segment = [[dx - dw // 2, dy], [dx + dw // 2, dy]]

        walls_list.append(
            Wall(
                id=wid,
                start=wdata["start"],
                end=wdata["end"],
                thickness_mm=wdata["thickness_mm"],
                is_exterior=wdata["is_exterior"],
                adjacent_rooms=wdata["adjacent_rooms"],
                openings=wdata["openings"],
            )
        )

    # Also handle exterior boundary doors (FDOOR)
    for d in doors:
        if "OUTSIDE" in d.connects:
            # Check if door lies on boundary
            dx, dy = d.position[0], d.position[1]
            dw = d.width_mm
            if dy == 0 or dy == boundary_h:
                d.segment = [[dx - dw // 2, dy], [dx + dw // 2, dy]]
            elif dx == 0 or dx == boundary_w:
                d.segment = [[dx, dy - dw // 2], [dx, dy + dw // 2]]

    return walls_list, shares_wall, connected_by_door


def _compute_circulation_paths(rooms: List[Room], connected_by_door: List[List[str]]) -> ComputedPaths:
    """Precompute patient_flow, staff_route, and egress_max_path via graph BFS."""
    G = nx.Graph()
    for pair in connected_by_door:
        G.add_edge(pair[0], pair[1])

    # 1. Patient Flow: OUTSIDE -> waiting -> corridor -> first exam room
    patient_flow: List[str] = []
    exam_rooms = [r.id for r in rooms if r.type == "exam"]
    target_exam = exam_rooms[0] if exam_rooms else None

    if "OUTSIDE" in G and target_exam and target_exam in G:
        try:
            patient_flow = nx.shortest_path(G, source="OUTSIDE", target=target_exam)
        except nx.NetworkXNoPath:
            patient_flow = []

    # 2. Staff Route: staff_break -> clean_util (or corridor) -> first exam room
    staff_route: List[str] = []
    staff_breaks = [r.id for r in rooms if r.type == "staff_break"]
    clean_utils = [r.id for r in rooms if r.type == "clean_util"]

    start_staff = staff_breaks[0] if staff_breaks else None
    mid_util = clean_utils[0] if clean_utils else None

    if start_staff and target_exam and start_staff in G and target_exam in G:
        try:
            if mid_util and mid_util in G:
                p1 = nx.shortest_path(G, source=start_staff, target=mid_util)
                p2 = nx.shortest_path(G, source=mid_util, target=target_exam)
                staff_route = p1 + p2[1:]
            else:
                staff_route = nx.shortest_path(G, source=start_staff, target=target_exam)
        except nx.NetworkXNoPath:
            staff_route = []

    # 3. Egress Max Path: room with maximum Manhattan travel distance to OUTSIDE
    room_centers = {r.id: (r.bbox.x + r.bbox.w / 2, r.bbox.y + r.bbox.h / 2) for r in rooms}
    # For OUTSIDE, pick exit door position or fallback to center (0, 0)
    out_pos = (0.0, 0.0)

    egress_max_path: Optional[EgressMaxPath] = None
    if "OUTSIDE" in G:
        max_dist = -1.0
        worst_path: List[str] = []
        for r in rooms:
            if r.id in G:
                try:
                    path = nx.shortest_path(G, source=r.id, target="OUTSIDE")
                    # Compute Manhattan distance along room centers in path
                    dist = 0.0
                    for k in range(len(path) - 1):
                        p_a = room_centers.get(path[k], out_pos)
                        p_b = room_centers.get(path[k + 1], out_pos)
                        dist += abs(p_a[0] - p_b[0]) + abs(p_a[1] - p_b[1])
                    if dist > max_dist:
                        max_dist = dist
                        worst_path = path
                except nx.NetworkXNoPath:
                    continue

        if worst_path:
            egress_max_path = EgressMaxPath(
                rooms=worst_path,
                distance_mm=round(max_dist, 1),
            )

    return ComputedPaths(
        patient_flow=patient_flow,
        staff_route=staff_route,
        egress_max_path=egress_max_path,
    )
