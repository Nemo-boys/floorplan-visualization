"""Plain-language plan edits: "Make the waiting room 20% bigger, keep the restrooms fixed".

``parse_edit`` turns the sentence into rooms to resize and rooms to lock. ``apply_edit`` makes
the change, holds the edited rooms at their new size while CP-SAT repairs the rest (so the
solver can't quietly undo the request), and either returns the repaired plan or says which
rooms make the request impossible.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

from aegisplan.cpsat_repair import repair_plan
from aegisplan.program import _BRIEF_PATTERNS, ROOM_SPECS
from aegisplan.schemas import PlanDocument
from aegisplan.validator import validate_plan

_ROOM_PATTERNS = _BRIEF_PATTERNS + [
    (r"waiting(?:\s+(?:room|area))?|lobby", "waiting"),
    (r"corridors?|hallways?", "corridor"),
]
_KEEP = re.compile(
    r"\b(?:keep|lock|hold|don'?t\s+(?:move|touch|change)|do\s+not\s+(?:move|touch|change)|leave)\s+(.+?)"
    r"(?:\s+(?:fixed|locked|in\s+place|as\s+(?:it\s+is|they\s+are)|where\s+(?:it\s+is|they\s+are)|alone))?"
    r"\s*(?=[,.;]|\bbut\b|\band\s+(?:make|grow|shrink)\b|$)"
)
_SMALLER = re.compile(r"\b(?:smaller|shrink|reduce|narrower|decrease|less)\b")
DEFAULT_PCT = 20


@dataclass
class EditSpec:
    resize: List[str] = field(default_factory=list)
    delta_pct: Optional[float] = None
    delta_mm: Optional[int] = None
    lock: List[str] = field(default_factory=list)

    def amount_text(self) -> str:
        if self.delta_mm is not None:
            return f"{abs(self.delta_mm) / 1000:g} m {'wider' if self.delta_mm > 0 else 'narrower'}"
        return f"{abs(self.delta_pct):g}% {'bigger' if self.delta_pct > 0 else 'smaller'}"


def _rooms_in(phrase: str, plan: PlanDocument) -> List[str]:
    """Room ids a phrase refers to: "exam room 3" is one room, "the exam rooms" all of them."""
    ids: List[str] = []
    for pattern, room_type in _ROOM_PATTERNS:
        # A number right after the room is its number ("exam room 3"), not an amount ("20%", "1 m").
        for m in re.finditer(r"(?:" + pattern + r")(?:\s*(\d+)(?![\d.]|\s*(?:%|percent|m\b|metres?|meters?)))?", phrase):
            of_type = [r.id for r in plan.rooms if r.type == room_type]
            if m.group(1):
                ids += [i for i in of_type if i == f"{room_type}_{m.group(1)}"]
            else:
                ids += of_type
    return list(dict.fromkeys(ids))


def parse_edit(text: str, plan: PlanDocument) -> EditSpec:
    t = text.lower().strip()
    spec = EditSpec()
    rest = t
    for m in _KEEP.finditer(t):
        spec.lock += _rooms_in(m.group(1), plan)
        rest = rest.replace(m.group(0), " ")
    spec.lock = list(dict.fromkeys(spec.lock))

    sign = -1 if _SMALLER.search(rest) else 1
    pct = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent)", rest)
    metres = re.search(r"(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b", rest)
    if pct:
        spec.delta_pct = sign * float(pct.group(1))
    elif metres:
        spec.delta_mm = sign * int(round(float(metres.group(1)) * 10)) * 100
    elif re.search(r"\b(?:bigger|larger|wider|grow|enlarge|expand|increase|smaller|shrink|reduce|narrower)\b", rest):
        spec.delta_pct = sign * DEFAULT_PCT
    spec.resize = [i for i in _rooms_in(rest, plan) if i not in spec.lock]
    return spec


def _label(plan: PlanDocument, ids: List[str]) -> str:
    names = [next((r.label for r in plan.rooms if r.id == i), i) for i in ids]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


@dataclass
class EditResult:
    status: str
    summary: str
    plan: PlanDocument
    conflict_rooms: List[str] = field(default_factory=list)
    explanation: str = ""
    solve_time_ms: int = 0


def apply_edit(plan: PlanDocument, text: str, max_time_seconds: float = 2.0) -> EditResult:
    spec = parse_edit(text, plan)
    if not spec.resize and not spec.lock:
        return EditResult(
            "NOT_UNDERSTOOD",
            "",
            plan,
            explanation="I couldn’t tell which room to change. Name it, for example “Make the waiting room 20% bigger”.",
        )

    work = plan.model_copy(deep=True)
    rooms = {r.id: r for r in work.rooms}
    was_locked = {r.id: r.locked for r in work.rooms}
    for rid in spec.lock:
        rooms[rid].locked = True
    for rid in spec.resize:
        r = rooms[rid]
        delta = spec.delta_mm if spec.delta_mm is not None else int(round(r.bbox.w * spec.delta_pct / 100 / 100)) * 100
        r.bbox.w = max(1500, r.bbox.w + delta)
        r.polygon = [[r.bbox.x, r.bbox.y], [r.bbox.x + r.bbox.w, r.bbox.y],
                     [r.bbox.x + r.bbox.w, r.bbox.y + r.bbox.h], [r.bbox.x, r.bbox.y + r.bbox.h]]
        r.area_actual_m2 = round(r.bbox.w * r.bbox.h / 1_000_000, 2)
        r.locked = True  # hold the requested size while the solver moves the others

    parts = []
    if spec.resize:
        parts.append(f"Made {_label(plan, spec.resize)} {spec.amount_text()}")
    if spec.lock:
        parts.append(f"kept {_label(plan, spec.lock)} fixed")
    summary = ", ".join(parts)
    summary = summary[0].upper() + summary[1:]

    too_small = [rid for rid in spec.resize if rooms[rid].type in ROOM_SPECS and rooms[rid].bbox.w < ROOM_SPECS[rooms[rid].type][2]]
    if too_small:
        r = rooms[too_small[0]]
        return EditResult(
            "INFEASIBLE",
            summary,
            plan,
            conflict_rooms=too_small,
            explanation=f"{summary} doesn’t work: {_label(plan, too_small)} would be narrower than the "
            f"{ROOM_SPECS[r.type][2] / 1000:g} m minimum for this room type.",
        )

    # Rooms held in place (resized or locked) that share a row must fit side by side.
    width = max(p[0] for p in work.boundary.polygon)
    held = [rooms[i] for i in dict.fromkeys(spec.resize + spec.lock + [r.id for r in work.rooms if was_locked[r.id]])]
    for a in held:
        row = [b for b in held if b.bbox.y < a.bbox.y + a.bbox.h and a.bbox.y < b.bbox.y + b.bbox.h]
        if sum(b.bbox.w for b in row) > width:
            if len(row) == 1:
                why = f"{a.label} would be {a.bbox.w / 1000:g} m wide"
            else:
                parts_m = ", ".join(f"{b.label} {b.bbox.w / 1000:g} m" for b in row)
                why = f"side by side, {parts_m} need {sum(b.bbox.w for b in row) / 1000:g} m"
            return EditResult(
                "INFEASIBLE",
                summary,
                plan,
                conflict_rooms=[b.id for b in row],
                explanation=f"{summary} doesn’t fit: {why}, and the building is {width / 1000:g} m wide.",
            )

    result = repair_plan(work, max_time_seconds=max_time_seconds)
    if result.status == "INFEASIBLE":
        held = list(dict.fromkeys(spec.resize + spec.lock))
        locked_elsewhere = [rid for rid, r in rooms.items() if was_locked[rid] and rid not in held]
        capacity = next((c for c in result.conflict_core if c.startswith("BOUNDARY_CAPACITY_EXCEEDED")), "")
        why = ""
        m = re.search(r"required min area ([\d.]+)m2 exceeds boundary ([\d.]+)m2", capacity)
        if m:
            why = f" With every other room at its minimum size the plan needs {m.group(1)} m², but the building has {m.group(2)} m²."
        explanation = (
            f"{summary} doesn’t fit."
            + why
            + (f" Fixed rooms in the way: {_label(plan, locked_elsewhere)}." if locked_elsewhere else "")
        )
        return EditResult(
            "INFEASIBLE",
            summary,
            plan,
            conflict_rooms=held + locked_elsewhere,
            explanation=explanation,
            solve_time_ms=result.solve_time_ms,
        )

    for r in result.plan.rooms:
        r.locked = was_locked.get(r.id, r.locked) or r.id in spec.lock
    return EditResult(result.status, summary, validate_plan(result.plan), solve_time_ms=result.solve_time_ms)
