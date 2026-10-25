"""GBNF grammar for constrained FML-DSL decoding (llama.cpp).

The grammar is built per request: the boundary line is fixed to the requested size, and room
ids are tied to their types (``ROOM exam_3 TYPE exam ...``), so the decoder can only emit
lines the parser accepts. It enforces syntax and vocabulary, not geometry: overlaps and sizes
are left to the validator and the CP-SAT repair.
"""

from typing import Iterable

CLINIC_ROOM_TYPES = (
    "waiting",
    "reception",
    "corridor",
    "exam",
    "consult",
    "procedure",
    "restroom",
    "clean_util",
    "soiled_util",
    "staff_break",
    "nurse_station",
    "lab",
    "storage",
)
DOOR_WIDTHS = ("815", "900", "915", "1000", "1065", "1220")


def _rule_name(room_type: str) -> str:
    return "room-" + room_type.replace("_", "-")


SCHEMAS = ("free", "single_corridor", "program")


def build_gbnf(
    boundary_w: int,
    boundary_h: int,
    room_types: Iterable[str] = CLINIC_ROOM_TYPES,
    door_widths: Iterable[str] = DOOR_WIDTHS,
    schema: str = "single_corridor",
    max_rooms: int = 30,
    max_doors: int = 40,
) -> str:
    """Return a GBNF grammar for one FML-DSL plan inside a boundary_w x boundary_h boundary.

    schema="free": any rooms and doors in the vocabulary.
    schema="single_corridor": the layout the model was fine-tuned on. A full-width locked
    corridor_1 and a locked waiting_1 at the north-west corner come first; door_1 joins them,
    FDOOR door_2 is the entrance from waiting_1; every other door opens onto corridor_1.
    schema="program": only the room list. The corridor and waiting lines are fixed as in the
    training data, and the model writes the other rooms; the layout synthesizer places them.
    """
    if schema not in SCHEMAS:
        raise ValueError(f"unknown schema {schema!r}, expected one of {SCHEMAS}")
    types = list(room_types)
    alt = lambda items: " | ".join(f'"{i}"' for i in items)
    boundary = f'"BOUNDARY RECT 0 0 {boundary_w} {boundary_h}\\n"'

    if schema == "free":
        room_types_used = types
        lines = [
            f"root ::= {boundary} room{{2,{max_rooms}}} door{{0,{max_doors}}} fdoor{{1,3}} \"END_PLAN\"",
            'door ::= "DOOR door_" num " CONNECT " rid " " rid " AT " coord " " coord " WIDTH " dw "\\n"',
            'fdoor ::= "FDOOR door_" num " CONNECT " rid " OUTSIDE AT " coord " " coord " WIDTH " dw "\\n"',
        ]
    elif schema == "program":
        room_types_used = [t for t in types if t not in ("corridor", "waiting")]
        fixed = (
            f'"ROOM corridor_1 TYPE corridor RECT 0 5000 {boundary_w} 2000 LOCKED\\n'
            f'ROOM waiting_1 TYPE waiting RECT 0 0 6000 5000 LOCKED\\n"'
        )
        lines = [f"root ::= {boundary} {fixed} room{{1,{max_rooms}}} \"END_PLAN\""]
    else:
        room_types_used = [t for t in types if t not in ("corridor", "waiting")]
        lines = [
            f"root ::= {boundary} corridor waiting room{{1,{max_rooms}}} entry door{{0,{max_doors}}} \"END_PLAN\"",
            f'corridor ::= "ROOM corridor_1 TYPE corridor RECT 0 " coord " {boundary_w} " dim " LOCKED\\n"',
            'waiting ::= "ROOM waiting_1 TYPE waiting RECT 0 0 " dim " " dim " LOCKED\\n"',
            'entry ::= "DOOR door_1 CONNECT waiting_1 corridor_1 AT " coord " " coord " WIDTH " dw "\\n" '
            '"FDOOR door_2 CONNECT waiting_1 OUTSIDE AT " coord " 0 WIDTH " dw "\\n"',
            'door ::= "DOOR door_" num " CONNECT " rid " corridor_1 AT " coord " " coord " WIDTH " dw "\\n"',
        ]

    lines.append("room ::= " + " | ".join(_rule_name(t) for t in room_types_used))
    for t in room_types_used:
        lines.append(
            f'{_rule_name(t)} ::= "ROOM {t}_" num " TYPE {t} RECT " coord " " coord " " dim " " dim " " lock "\\n"'
        )
    lines += [
        f'rid ::= ({alt(room_types_used)}) "_" num',
        f"dw ::= {alt(door_widths)}",
        'lock ::= "LOCKED" | "FREE"',
        'num ::= [1-9] [0-9]?',
        # 100 mm grid (50 mm allowed): 0, 100, 150, ... 99950
        'coord ::= "0" | [1-9] [0-9]? [0-9]? ("00" | "50")',
        'dim ::= [1-9] [0-9]? [0-9]? ("00" | "50")',
    ]
    return "\n".join(lines) + "\n"
