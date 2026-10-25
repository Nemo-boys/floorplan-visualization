"""Room programs and the double-loaded-corridor layout synthesizer.

A room program is what a brief asks for: room types and how many of each. Nemotron (or, without
a model, a simple brief parser) produces the program; ``layout_program`` turns it into FML-DSL
geometry the CP-SAT repair and validator then check. This keeps the language model on the part
it is good at (interpreting the brief) and the geometry deterministic.

Layout (AegisPlan coordinates: origin top-left, y down):

    y = 0      ┌ front row: waiting (entrance on y = 0), reception, restroom, offices ┐
    y = cy     ├──────────────── corridor_1, full width, 2000 mm ─────────────────────┤
    y = cy+2000└ clinical row: exam rooms, procedure, nurse station, utilities      ┘ y = h
"""

import re
from typing import Dict, List, Optional, Tuple

CORRIDOR_MM = 2000  # >= 1830 mm (ADA 403.5.1 / VA criteria)
GRID_MM = 100

# type -> (row, preferred width, minimum width, door width)
ROOM_SPECS: Dict[str, Tuple[str, int, int, int]] = {
    "waiting": ("front", 6000, 4000, 1065),
    "reception": ("front", 3500, 2500, 915),
    "restroom": ("front", 2500, 2200, 915),
    "consult": ("front", 3000, 2400, 915),
    "staff_break": ("front", 3500, 2400, 915),
    "lab": ("front", 3000, 2400, 915),
    "storage": ("front", 2000, 1600, 915),
    "exam": ("clinical", 3200, 3100, 915),
    "procedure": ("clinical", 4000, 3400, 1065),
    "nurse_station": ("clinical", 3000, 2400, 915),
    "clean_util": ("clinical", 2400, 1800, 915),
    "soiled_util": ("clinical", 2400, 1800, 915),
}
# Rooms that may move to the other row when theirs is full, most movable first.
MOVABLE = ["storage", "lab", "staff_break", "consult", "clean_util", "soiled_util", "nurse_station", "restroom", "exam"]
MAX_COUNT = {"exam": 16}
DEFAULT_MAX = 4
# Without a number in the brief, a model's repeats of these are capped (it tends to over-generate).
UNSTATED_MAX = {"exam": 16, "restroom": 2}
UNSTATED_DEFAULT_MAX = 1

VARIANTS = ("entrance_west", "entrance_center", "entrance_east")

_WORD_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}
# Brief phrases -> room type. A number right before the phrase sets the count.
_BRIEF_PATTERNS: List[Tuple[str, str]] = [
    (r"exam(?:ination)?\s*rooms?|exams?\b", "exam"),
    (r"procedure|observation", "procedure"),
    (r"consult\w*|provider\s+offices?", "consult"),
    (r"nurse\s*stations?|nursing\s+stations?", "nurse_station"),
    (r"reception|check-?in", "reception"),
    (r"restrooms?|toilets?|bathrooms?|wcs?\b", "restroom"),
    (r"staff\s+(?:break\s*rooms?|breakrooms?|lounges?|rooms?)|break\s*rooms?|breakrooms?", "staff_break"),
    (r"\blabs?\b|laborator(?:y|ies)|phlebotomy", "lab"),
    (r"storage|store\s*rooms?", "storage"),
    (r"clean\s+(?:and\s+soiled\s+)?util\w*|clean\s+supply", "clean_util"),
    (r"(?:clean\s+and\s+)?soiled\s+util\w*|soiled\b", "soiled_util"),
]
# "a nurse station" and "an ADA restroom" count as one; "a few exam rooms" does not.
_NUM = r"\b(\d+|" + "|".join(_WORD_NUM) + r"|an?(?!\s+(?:few|couple|number|range|mix)\b)|single)"


def _count(word: str) -> int:
    if word.isdigit():
        return int(word)
    return _WORD_NUM.get(word, 1)


def _clamp(program: Dict[str, int]) -> Dict[str, int]:
    return {t: max(0, min(n, MAX_COUNT.get(t, DEFAULT_MAX))) for t, n in program.items() if t in ROOM_SPECS and n > 0}


def mentioned_types(brief: str) -> List[str]:
    """Room types a brief names, with or without a count."""
    text = brief.lower()
    found = [t for pattern, t in _BRIEF_PATTERNS if re.search(pattern, text)]
    if "clean" in text and "soiled" in text:
        found += ["clean_util", "soiled_util"]
    return sorted(set(found))


def program_from_brief(brief: str) -> Dict[str, int]:
    """Read a room program from a plain-language brief (used when no model is available)."""
    program = {t: 1 for t in mentioned_types(brief)}
    stated = explicit_counts(brief)
    program.update(stated)
    # A clinic always gets exam rooms (four unless the brief says) and an accessible restroom.
    if "exam" not in stated:
        program["exam"] = 4
    program.setdefault("restroom", 1)
    program.pop("waiting", None)
    return _clamp(program)


def explicit_counts(brief: str) -> Dict[str, int]:
    """Room counts the brief states with a number ("6 exam rooms"); these override a model's program."""
    text = brief.lower()
    out = {}
    for pattern, room_type in _BRIEF_PATTERNS:
        m = re.search(_NUM + r"\s+(?:[\w-]+\s+){0,2}(?:" + pattern + ")", text)
        if m:
            out[room_type] = _count(m.group(1))
    return out


def merge_programs(model_program: Dict[str, int], brief: str) -> Dict[str, int]:
    """Combine a model's program with the brief: every type the brief names is included, counts
    the brief states win, and unstated repeats are capped."""
    stated = explicit_counts(brief)
    program = {
        t: (stated[t] if t in stated else min(n, UNSTATED_MAX.get(t, UNSTATED_DEFAULT_MAX)))
        for t, n in model_program.items()
    }
    for t in mentioned_types(brief):
        program.setdefault(t, stated.get(t, 1))
    program.setdefault("restroom", 1)
    return _clamp(program)


def program_from_fml(fml: str) -> Dict[str, int]:
    """Count the rooms in model output, leaving out the corridor and waiting room the layout adds."""
    program: Dict[str, int] = {}
    for line in fml.splitlines():
        m = re.match(r"^ROOM\s+\S+\s+TYPE\s+([a-z_]+)\s", line.strip())
        if m and m.group(1) not in ("corridor", "waiting"):
            program[m.group(1)] = program.get(m.group(1), 0) + 1
    return _clamp(program)


def _snap(v: float) -> int:
    return int(round(v / GRID_MM)) * GRID_MM


def _fit_row(rooms: List[str], width: int, depth: int) -> Optional[List[int]]:
    """Widths for a row of rooms within `width`, or None if their minimums don't fit.

    Rooms stretch to fill the row, but no further than a 2.5:1 aspect ratio (the CP-SAT
    repair's bound) or twice their preferred width; any space left stays unassigned.
    """
    pref = [ROOM_SPECS[t][1] for t in rooms]
    mins = [ROOM_SPECS[t][2] for t in rooms]
    if sum(mins) > width:
        return None
    cap = [max(m, min(2 * p, int(depth * 2.5) // GRID_MM * GRID_MM)) for p, m in zip(pref, mins)]
    if sum(pref) <= width:
        scale = width / sum(pref)
        widths = [min(_snap(p * scale), c) for p, c in zip(pref, cap)]
    else:
        # Shrink toward the minimums by the same fraction.
        f = (sum(pref) - width) / (sum(pref) - sum(mins))
        widths = [max(m, _snap(p - (p - m) * f)) for p, m in zip(pref, mins)]
    # Settle rounding on the rooms with the most room to give or take.
    while sum(widths) > width:
        i = max(range(len(widths)), key=lambda k: widths[k] - mins[k])
        widths[i] -= min(sum(widths) - width, widths[i] - mins[i])
    spare = width - sum(widths)
    for i in sorted(range(len(widths)), key=lambda k: widths[k] - cap[k]):
        add = min(spare, cap[i] - widths[i])
        widths[i] += add
        spare -= add
    return widths


def _order(rooms: List[str], variant: str, row: str) -> List[str]:
    """Order a row for a variant. Clean and soiled utilities go to opposite ends of the clinical row."""
    rank = {
        "front": ["reception", "restroom", "consult", "staff_break", "lab", "storage"],
        "clinical": ["clean_util", "exam", "procedure", "nurse_station", "soiled_util"],
    }[row]
    ordered = sorted(rooms, key=lambda t: rank.index(t) if t in rank else len(rank))
    if row == "clinical" and "nurse_station" in ordered and variant != "entrance_west":
        # Put the nurse station among the exam rooms.
        ordered.remove("nurse_station")
        exams = [i for i, t in enumerate(ordered) if t == "exam"]
        ordered.insert(exams[len(exams) // 2] if exams else len(ordered) // 2, "nurse_station")
    return ordered


def layout_program(program: Dict[str, int], w: int, h: int, variant: str = "entrance_west") -> str:
    """Lay a room program out as FML-DSL on a double-loaded corridor inside a w x h boundary."""
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    rows: Dict[str, List[str]] = {"front": [], "clinical": []}
    for t, n in program.items():
        rows[ROOM_SPECS[t][0]] += [t] * n

    # Move rooms out of an overfull row while the other row has space.
    def overfull(row: str, extra: int = 0) -> bool:
        return sum(ROOM_SPECS[t][2] for t in rows[row]) + extra > w

    waiting_min = ROOM_SPECS["waiting"][2]
    for row, other in (("clinical", "front"), ("front", "clinical")):
        for t in MOVABLE:
            while (
                overfull(row, waiting_min if row == "front" else 0)
                and t in rows[row]
                and not overfull(other, ROOM_SPECS[t][2] + (waiting_min if other == "front" else 0))
            ):
                rows[row].remove(t)
                rows[other].append(t)

    front = _order(rows["front"], variant, "front")
    clinical = _order(rows["clinical"], variant, "clinical")
    if variant == "entrance_west":
        front = ["waiting"] + front
    elif variant == "entrance_east":
        front = front + ["waiting"]
        clinical = clinical[::-1]
    else:
        mid = (len(front) + 1) // 2
        front = front[:mid] + ["waiting"] + front[mid:]

    clinical_depth = max(3700, _snap((h - CORRIDOR_MM) * 0.55))
    cy = h - CORRIDOR_MM - clinical_depth
    cy2 = cy + CORRIDOR_MM

    lines = [f"BOUNDARY RECT 0 0 {w} {h}", f"ROOM corridor_1 TYPE corridor RECT 0 {cy} {w} {CORRIDOR_MM} LOCKED"]
    doors: List[str] = []
    counter: Dict[str, int] = {}
    entrance = None

    def place(row_rooms: List[str], y: int, depth: int, door_y: int) -> None:
        nonlocal entrance
        widths = _fit_row(row_rooms, w, depth) or [ROOM_SPECS[t][2] for t in row_rooms]
        x = 0
        for t, rw in zip(row_rooms, widths):
            counter[t] = counter.get(t, 0) + 1
            rid = f"{t}_{counter[t]}"
            lock = "LOCKED" if t == "waiting" else "FREE"
            lines.append(f"ROOM {rid} TYPE {t} RECT {x} {y} {rw} {depth} {lock}")
            mid = x + _snap(rw / 2)
            doors.append(f"CONNECT {rid} corridor_1 AT {mid} {door_y} WIDTH {ROOM_SPECS[t][3]}")
            if t == "waiting":
                entrance = f"CONNECT {rid} OUTSIDE AT {mid} 0 WIDTH 1220"
            x += rw

    place(front, 0, cy, cy)
    place(clinical, cy2, clinical_depth, cy2)

    n = 1
    for d in doors:
        lines.append(f"DOOR door_{n} {d}")
        n += 1
    lines.append(f"FDOOR door_{n} {entrance}")
    lines.append("END_PLAN")
    return "\n".join(lines)
