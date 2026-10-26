"""Shared look and geometry for the Manim explainers (3Blue1Brown-style: dark ground, thin strokes, calm motion)."""
from __future__ import annotations

import heapq

import numpy as np
from manim import *  # noqa: F401,F403

# ---------------------------------------------------------------- palette
BG = "#0E1117"
INK = "#ECEFF4"
MUTED = "#8A93A6"
FAINT = "#2A3040"
BLUE = "#58C4DD"
TEAL = "#3CC8BB"
GREEN = "#83C167"
NV = "#76B900"  # NVIDIA green, used for Nemotron
YELLOW = "#F4D35E"
ORANGE = "#F59E4C"
RED = "#FC6255"
PURPLE = "#B18CFE"
PINK = "#E88AC6"
FONT = "Inter"

config.background_color = BG

ROOM_COLORS = {
    "exam": GREEN,
    "waiting": BLUE,
    "reception": YELLOW,
    "nurse": PURPLE,
    "restroom": TEAL,
    "clean": "#9FB3C8",
    "soiled": "#C8A99F",
    "office": ORANGE,
    "corridor": "#5B6478",
}


def T(s: str, size: float = 36, color: str = INK, weight=NORMAL, font: str = FONT, **kw) -> Text:
    return Text(s, font=font, font_size=size, color=color, weight=weight, **kw)


def title(s: str, sub: str | None = None, color: str = INK) -> VGroup:
    g = VGroup(T(s, 44, color, weight=BOLD))
    if sub:
        g.add(T(sub, 26, MUTED))
    g.arrange(DOWN, aligned_edge=LEFT, buff=0.15)
    g.to_corner(UL, buff=0.6)
    return g


# ---------------------------------------------------------------- the demo clinic (24 m x 14 m)
# (id, type, label, x, y, w, h) in metres, origin bottom-left, y north.
CLINIC = [
    ("waiting", "waiting", "Waiting", 0, 8, 6, 6),
    ("reception", "reception", "Reception", 6, 8, 3, 6),
    ("exam1", "exam", "Exam 1", 9, 8, 3.75, 6),
    ("exam2", "exam", "Exam 2", 12.75, 8, 3.75, 6),
    ("exam3", "exam", "Exam 3", 16.5, 8, 3.75, 6),
    ("exam4", "exam", "Exam 4", 20.25, 8, 3.75, 6),
    ("corridor", "corridor", "Corridor", 0, 6, 24, 2),
    ("exam5", "exam", "Exam 5", 0, 0, 3.75, 6),
    ("exam6", "exam", "Exam 6", 3.75, 0, 3.75, 6),
    ("nurse", "nurse", "Nurse", 7.5, 0, 3.5, 6),
    ("wc", "restroom", "ADA WC", 11, 0, 2.5, 6),
    ("clean", "clean", "Clean", 13.5, 0, 2.5, 6),
    ("soiled", "soiled", "Soiled", 16, 0, 2.5, 6),
    ("office", "office", "Office", 18.5, 0, 5.5, 6),
]
SITE_W, SITE_D = 24.0, 14.0


def plan_to_scene(x: float, y: float, s: float, origin=ORIGIN) -> np.ndarray:
    return np.array([(x - SITE_W / 2) * s, (y - SITE_D / 2) * s, 0.0]) + origin


def room_mob(r, s: float, origin=ORIGIN, label: bool = True, fill: float = 0.28, label_size: float = 16) -> VGroup:
    rid, typ, name, x, y, w, h = r
    c = ROOM_COLORS[typ]
    rect = Rectangle(width=w * s, height=h * s, stroke_color=c, stroke_width=2.2, fill_color=c, fill_opacity=fill)
    rect.move_to(plan_to_scene(x + w / 2, y + h / 2, s, origin))
    g = VGroup(rect)
    if label and typ != "corridor":
        t = T(name, label_size, INK)
        if t.width > w * s * 0.9:
            t.scale_to_fit_width(w * s * 0.9)
        t.move_to(rect)
        g.add(t)
    g.rid = rid
    return g


def clinic_mob(s: float = 0.4, origin=ORIGIN, label: bool = True, fill: float = 0.28, label_size: float = 16) -> VGroup:
    return VGroup(*[room_mob(r, s, origin, label, fill, label_size) for r in CLINIC])


def boundary_mob(s: float, origin=ORIGIN, color: str = MUTED) -> Rectangle:
    b = Rectangle(width=SITE_W * s, height=SITE_D * s, stroke_color=color, stroke_width=1.5)
    b.move_to(origin)
    return b


# ---------------------------------------------------------------- walkable grid + A*
def walk_grid(rooms, res: float = 0.5, doors=None):
    """A coarse walkable grid: corridor and room interiors are walkable, walls (room edges) are not,
    except where a door opens onto the corridor. Returns (grid, res)."""
    nx, ny = int(SITE_W / res), int(SITE_D / res)
    g = np.zeros((nx, ny), dtype=bool)
    for _, typ, _, x, y, w, h in rooms:
        i0, i1 = int(round(x / res)), int(round((x + w) / res))
        j0, j1 = int(round(y / res)), int(round((y + h) / res))
        g[i0 + 1:i1 - 1, j0 + 1:j1 - 1] = True
    # corridor spans the whole width
    g[:, int(6 / res):int(8 / res)] = True
    for (dx, dy) in (doors or []):
        i, j = int(dx / res), int(dy / res)
        g[i, j - 1:j + 2] = True
    return g, res


def door_of(r):
    """Door in the middle of the wall that faces the corridor."""
    _, _, _, x, y, w, h = r
    return (x + w / 2, 8.0 if y >= 8 else 6.0)


def astar(g, a, b):
    nx, ny = g.shape
    h = lambda p: abs(p[0] - b[0]) + abs(p[1] - b[1])
    openq = [(h(a), 0.0, a, None)]
    came, cost = {}, {a: 0.0}
    while openq:
        _, c, p, par = heapq.heappop(openq)
        if p in came:
            continue
        came[p] = par
        if p == b:
            break
        for d in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            q = (p[0] + d[0], p[1] + d[1])
            if not (0 <= q[0] < nx and 0 <= q[1] < ny) or not g[q]:
                continue
            if d[0] and d[1] and not (g[p[0] + d[0], p[1]] and g[p[0], p[1] + d[1]]):
                continue
            nc = c + (1.4142 if d[0] and d[1] else 1.0)
            if nc < cost.get(q, 1e9):
                cost[q] = nc
                heapq.heappush(openq, (nc + h(q), nc, q, p))
    path, p = [], b
    while p is not None:
        path.append(p)
        p = came.get(p)
    return path[::-1], cost.get(b, float("inf"))


def cell(pt, res):
    return (int(pt[0] / res), int(pt[1] / res))


def all_doors(rooms):
    return [door_of(r) for r in rooms if r[1] != "corridor"]


def nurse_walk(rooms, nurse_id="nurse"):
    """Mean walking distance (m) from the nurse station door to every exam-room door, via A*."""
    doors = all_doors(rooms)
    g, res = walk_grid(rooms, 0.5, doors)
    nr = next(r for r in rooms if r[0] == nurse_id)
    a = cell(door_of(nr), res)
    ds = []
    for r in rooms:
        if r[1] == "exam":
            _, c = astar(g, a, cell(door_of(r), res))
            ds.append(c * res)
    return float(np.mean(ds))


def live_text(vt: ValueTracker, fmt, place, size: float = 48, color: str = YELLOW, weight=NORMAL) -> Mobject:
    """A number that follows a ValueTracker, drawn with Text (no LaTeX needed). `place(m)` positions each redraw;
    `fmt` is a format string or a function of the value."""
    f = fmt if callable(fmt) else (lambda v: fmt.format(v))
    return always_redraw(lambda: place(T(f(vt.get_value()), size, color, weight=weight)))
