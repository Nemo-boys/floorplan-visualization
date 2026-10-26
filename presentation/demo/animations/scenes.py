"""Manim explainers for the Floorplan Intelligence demo video.

Render one scene:   manim -r 1920,1080 --fps 30 scenes.py Opening
Render all:         python render_all.py
Every timing below is paced to the narration in ../script.json (about 2.5 words a second).
"""
from __future__ import annotations

import random

from common import *  # noqa: F401,F403

random.seed(7)
np.random.seed(7)


# ======================================================================= helpers
def chip(label: str, color: str, w: float | None = None, size: float = 22) -> VGroup:
    t = T(label, size, INK)
    box = RoundedRectangle(corner_radius=0.14, width=w or t.width + 0.5, height=t.height + 0.34,
                           stroke_color=color, stroke_width=2, fill_color=color, fill_opacity=0.14)
    t.move_to(box)
    return VGroup(box, t)


def node(head: str, sub: str, color: str, w: float = 2.45, h: float = 1.55) -> VGroup:
    box = RoundedRectangle(corner_radius=0.22, width=w, height=h, stroke_color=color, stroke_width=2.5,
                           fill_color=color, fill_opacity=0.10)
    a = T(head, 26, INK, weight=BOLD)
    b = T(sub, 17, MUTED)
    for t in (a, b):
        if t.width > w - 0.3:
            t.scale_to_fit_width(w - 0.3)
    VGroup(a, b).arrange(DOWN, buff=0.14).move_to(box)
    g = VGroup(box, a, b)
    g.box, g.head, g.sub, g.color = box, a, b, color
    return g


def padlock(color=YELLOW, s: float = 0.22) -> VGroup:
    body = RoundedRectangle(corner_radius=0.03, width=s, height=s * 0.8, stroke_color=color, stroke_width=2,
                            fill_color=color, fill_opacity=0.9)
    shackle = Arc(radius=s * 0.32, start_angle=0, angle=PI, stroke_color=color, stroke_width=3)
    shackle.next_to(body, UP, buff=-0.02)
    return VGroup(body, shackle)


def cross(m: Mobject, color=RED) -> VGroup:
    return VGroup(Line(m.get_corner(UL), m.get_corner(DR), color=color, stroke_width=5),
                  Line(m.get_corner(DL), m.get_corner(UR), color=color, stroke_width=5))


def tick(color=GREEN, s: float = 0.28) -> VMobject:
    return VMobject(stroke_color=color, stroke_width=5).set_points_as_corners(
        [LEFT * s * 0.5 + UP * s * 0.05, DOWN * s * 0.35, RIGHT * s * 0.6 + UP * s * 0.55])


# ======================================================================= 1. Opening (~19 s)
class Opening(Scene):
    def construct(self):
        q = T("“Primary-care clinic with 6 exam rooms, a nurse station,\nan ADA restroom, clean and soiled utility.”", 34, INK)
        self.play(AddTextLetterByLetter(q, run_time=2.6))
        self.wait(1.0)
        self.play(q.animate.scale(0.62).to_edge(UP, buff=0.55).set_color(MUTED), run_time=0.9)

        plan = clinic_mob(0.36, DOWN * 0.35, label_size=14)
        site = boundary_mob(0.36, DOWN * 0.35)
        self.play(Create(site, run_time=0.6))
        self.play(LaggedStart(*[DrawBorderThenFill(m) for m in plan], lag_ratio=0.12, run_time=2.4))
        self.wait(0.6)

        # second building
        dc_q = T("“20 MW AI factory, liquid cooled, N+1 cooling, 2N power.”", 34, INK)
        dc_q.to_edge(UP, buff=0.55).scale(0.62).set_color(MUTED)
        self.play(FadeOut(VGroup(plan, site), shift=LEFT * 0.4), FadeOut(q, shift=UP * 0.2), run_time=0.7)
        self.play(AddTextLetterByLetter(dc_q, run_time=1.6))
        racks = VGroup()
        for hall in range(2):
            for row in range(6):
                for k in range(14):
                    r = Rectangle(width=0.22, height=0.34, stroke_width=1, stroke_color=BLUE,
                                  fill_color=BLUE, fill_opacity=0.55)
                    r.move_to(np.array([-4.6 + hall * 4.9 + k * 0.3, 1.25 - row * 0.62 - (row % 2) * 0.06, 0]))
                    racks.add(r)
        hall_frames = VGroup(*[RoundedRectangle(corner_radius=0.08, width=4.6, height=4.0, stroke_color=MUTED, stroke_width=1.5)
                               .move_to(np.array([-2.65 + h * 4.9, -0.35, 0])) for h in range(2)])
        coolers = VGroup(*[Square(0.32, stroke_color=TEAL, fill_color=TEAL, fill_opacity=0.5, stroke_width=1)
                           .move_to(np.array([-4.8 + i * 0.5, -2.75, 0])) for i in range(20)])
        self.play(Create(hall_frames), run_time=0.6)
        self.play(LaggedStart(*[FadeIn(r, scale=0.4) for r in racks], lag_ratio=0.006, run_time=1.8),
                  LaggedStart(*[GrowFromCenter(c) for c in coolers], lag_ratio=0.04, run_time=1.8))
        dc = VGroup(racks, hall_frames, coolers)

        # ... and then weeks of drawings
        self.play(dc.animate.scale(0.45).to_edge(RIGHT, buff=0.9).set_opacity(0.35), FadeOut(dc_q), run_time=0.8)
        plan2 = clinic_mob(0.2, ORIGIN, label=False).to_edge(LEFT, buff=0.9).set_opacity(0.35)
        self.play(FadeIn(plan2), run_time=0.4)
        sheets = VGroup(*[Rectangle(width=1.5, height=2.0, stroke_color=MUTED, stroke_width=1.2, fill_color=BG, fill_opacity=1)
                          .shift(RIGHT * 0.07 * i + UP * 0.05 * i) for i in range(6)]).move_to(DOWN * 0.1)
        lab = T("days of drawings", 24, MUTED).next_to(sheets, DOWN, buff=0.35)
        vt = ValueTracker(1)
        day = live_text(vt, lambda v: f"day {int(round(v))}", lambda m: m.next_to(lab, DOWN, buff=0.12), 44, YELLOW, BOLD)
        self.play(LaggedStart(*[FadeIn(s, shift=UP * 0.2) for s in sheets], lag_ratio=0.15), FadeIn(lab), FadeIn(day), run_time=1.0)
        self.play(vt.animate.set_value(21), run_time=1.6, rate_func=linear)
        qm = T("does it work?", 26, RED).next_to(day, DOWN, buff=0.2)
        self.play(FadeIn(qm, shift=LEFT * 0.2), run_time=0.4)
        self.wait(0.6)

        self.play(FadeOut(VGroup(sheets, lab, day, qm, plan2, dc)), run_time=0.7)
        big = T("What if the sentence was enough?", 56, INK, weight=BOLD)
        self.play(Write(big), run_time=1.6)
        self.wait(2.4)
        self.play(FadeOut(big), run_time=0.6)


# ======================================================================= 2. Problem (~20 s)
class Problem(Scene):
    def construct(self):
        div = DashedLine(UP * 3.3, DOWN * 3.6, color=FAINT)
        self.add(div)
        s = 0.25
        lo, ro = LEFT * 3.55 + DOWN * 0.1, RIGHT * 3.55 + DOWN * 0.1
        lt = T("A language model alone", 32, INK, weight=BOLD).move_to(LEFT * 3.55 + UP * 2.9)
        rt = T("A constraint solver alone", 32, INK, weight=BOLD).move_to(RIGHT * 3.55 + UP * 2.9)
        self.play(FadeIn(lt, shift=DOWN * 0.15), run_time=0.6)

        # LLM plan: jittered rooms, overlaps and an oversized corridor
        jit = {"waiting": (0.8, -1.2), "reception": (-0.6, -0.5), "exam1": (-0.9, 0.3), "exam2": (0.4, -0.9),
               "exam3": (1.1, 0.4), "exam5": (0.5, 1.6), "nurse": (-1.2, 1.4), "wc": (0.9, 1.1), "office": (-1.5, 0.6)}
        rooms = []
        for r in CLINIC:
            rid, typ, name, x, y, w, h = r
            if typ == "corridor":
                continue
            dx, dy = jit.get(rid, (0, 0))
            rooms.append((rid, typ, name, x + dx, y + dy, w, h))
        site = boundary_mob(s, lo)
        llm = VGroup(*[room_mob(r, s, lo, label=False, fill=0.22) for r in rooms])
        self.play(Create(site), LaggedStart(*[FadeIn(m, scale=0.9) for m in llm], lag_ratio=0.08), run_time=1.8)

        # red overlap patches
        patches = VGroup()
        for i in range(len(rooms)):
            for j in range(i + 1, len(rooms)):
                a, b = rooms[i], rooms[j]
                x0, x1 = max(a[3], b[3]), min(a[3] + a[5], b[3] + b[5])
                y0, y1 = max(a[4], b[4]), min(a[4] + a[6], b[4] + b[6])
                if x1 - x0 > 0.15 and y1 - y0 > 0.15:
                    p = Rectangle(width=(x1 - x0) * s, height=(y1 - y0) * s, stroke_width=0, fill_color=RED, fill_opacity=0.85)
                    p.move_to(plan_to_scene((x0 + x1) / 2, (y0 + y1) / 2, s, lo))
                    patches.add(p)
        ov = T("rooms overlap", 22, RED).next_to(site, DOWN, buff=0.6).align_to(site, LEFT)
        self.play(LaggedStart(*[FadeIn(p) for p in patches], lag_ratio=0.1), FadeIn(ov), run_time=1.2)
        self.play(Indicate(patches, color=RED, scale_factor=1.06), run_time=0.8)

        corr = DashedVMobject(Rectangle(width=3.2 * s * 1.0 + 0.4, height=18.3 * s, stroke_color=ORANGE, stroke_width=3),
                              num_dashes=40)
        corr.move_to(lo + RIGHT * 0.6)
        corr_fill = Rectangle(width=3.2 * s + 0.4, height=18.3 * s, stroke_width=0, fill_color=ORANGE, fill_opacity=0.18).move_to(corr)
        corr = VGroup(corr_fill, corr)
        cl = T("corridor 18,300 mm wide  (asked: 1,830)", 20, ORANGE).next_to(ov, DOWN, buff=0.15).align_to(ov, LEFT)
        self.play(GrowFromEdge(corr, UP), FadeIn(cl), run_time=1.0)

        stamp = VGroup(tick(GREEN, 0.4), T("“code-compliant”", 30, GREEN, weight=BOLD)).arrange(RIGHT, buff=0.15)
        stamp.rotate(0.12).move_to(lo + UP * 1.0)
        box = SurroundingRectangle(stamp, color=GREEN, buff=0.15, corner_radius=0.1)
        self.play(FadeIn(VGroup(stamp, box), scale=1.4), run_time=0.5)
        self.play(Wiggle(VGroup(stamp, box)), run_time=0.8)
        self.play(Create(cross(VGroup(stamp, box))), VGroup(stamp, box).animate.set_opacity(0.4), run_time=0.6)
        self.wait(3.2)

        # Solver: perfect geometry, can't read the brief
        self.play(FadeIn(rt, shift=DOWN * 0.15), run_time=0.6)
        grid = NumberPlane(x_range=[-6, 6, 0.5], y_range=[-3.5, 3.5, 0.5], x_length=SITE_W * s, y_length=SITE_D * s,
                           background_line_style={"stroke_color": FAINT, "stroke_width": 1}, axis_config={"stroke_opacity": 0})
        grid.move_to(ro)
        good = clinic_mob(s, ro, label=False, fill=0.22)
        self.play(FadeIn(grid), Create(boundary_mob(s, ro)), LaggedStart(*[Create(m) for m in good], lag_ratio=0.05), run_time=1.6)
        ok = T("0 mm² overlap, every wall exact", 22, GREEN).next_to(boundary_mob(s, ro), DOWN, buff=0.6).align_to(boundary_mob(s, ro), LEFT)
        self.play(FadeIn(ok), run_time=0.4)
        bubble = VGroup(T("“nurse station among\nthe exam rooms”", 22, INK))
        bb = SurroundingRectangle(bubble, color=YELLOW, buff=0.2, corner_radius=0.15)
        brief = VGroup(bb, bubble).move_to(ro + UP * 2.05 + RIGHT * 0.9)
        self.play(FadeIn(brief, shift=LEFT * 0.3), run_time=0.6)
        marks = VGroup(*[T("?", 40, YELLOW, weight=BOLD).move_to(ro + np.array([x, y, 0]))
                         for x, y in [(-1.6, 0.8), (-0.3, 1.25), (1.0, 0.65), (-1.0, -0.6), (0.6, -0.4)]])
        self.play(LaggedStart(*[FadeIn(m, scale=1.8) for m in marks], lag_ratio=0.15), run_time=1.0)
        nb = T("but can’t read a word of the brief", 22, YELLOW).next_to(ok, DOWN, buff=0.15)
        self.play(FadeIn(nb), run_time=0.4)
        self.wait(4.0)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 3. Pipeline (~24 s)
class Pipeline(Scene):
    def construct(self):
        brief = node("Brief", "one sentence", MUTED, w=1.9)
        nem = node("Nemotron", "reads the intent", NV)
        sat = node("CP-SAT", "makes geometry exact", BLUE)
        chk = node("Checker", "cites what passed", YELLOW)
        web = node("Browser", "walk · stress · price", TEAL)
        row = VGroup(brief, nem, sat, chk, web).arrange(RIGHT, buff=0.55).move_to(UP * 0.7)
        arrows = VGroup(*[Arrow(row[i].get_right(), row[i + 1].get_left(), buff=0.06, stroke_width=3,
                                color=FAINT, max_tip_length_to_length_ratio=0.3) for i in range(4)])
        syn = T("synthesizer · 3 variants", 15, MUTED).next_to(arrows[1], DOWN, buff=0.12)
        def dim(n):
            n.box.set_fill(opacity=0.03).set_stroke(opacity=0.3)
            n.head.set_opacity(0.3)
            n.sub.set_opacity(0.3)

        def lit(n):
            return AnimationGroup(n.box.animate.set_fill(opacity=0.16).set_stroke(opacity=1),
                                  n.head.animate.set_opacity(1), n.sub.animate.set_opacity(1))

        for n in row:
            dim(n)
        self.play(LaggedStart(*[FadeIn(n, shift=UP * 0.2) for n in row], lag_ratio=0.12),
                  LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.12), run_time=1.6)
        self.play(lit(brief), run_time=0.4)
        self.wait(1.6)

        # icons under the nodes
        prog = VGroup(*[T(s, 20, NV) for s in ["EXAM × 6", "NURSE × 1", "WAITING × 1", "ADA WC × 1"]]).arrange(DOWN, buff=0.07, aligned_edge=LEFT)
        mini = clinic_mob(0.095, ORIGIN, label=False, fill=0.3)
        rules = VGroup(*[VGroup(tick(GREEN, 0.2), T(s, 20, INK)).arrange(RIGHT, buff=0.08)
                         for s in ["ADA 404.2.3", "FGI 2.1-2.2", "IBC 1017"]]).arrange(DOWN, buff=0.07, aligned_edge=LEFT)
        cube = VGroup(*[Square(0.5, stroke_color=TEAL, stroke_width=2, fill_color=TEAL, fill_opacity=0.15 + 0.15 * i)
                        .shift(RIGHT * 0.12 * i + UP * 0.12 * i) for i in range(3)])
        icons = [prog, mini, rules, cube]
        for ic, n in zip(icons, [nem, sat, chk, web]):
            ic.next_to(n, DOWN, buff=0.45)

        dot = Dot(color=INK, radius=0.07).move_to(brief.get_right())
        self.add(dot)
        for i, (n, ic) in enumerate(zip([nem, sat, chk, web], icons)):
            self.play(MoveAlongPath(dot, Line(row[i].get_right(), n.get_left())), arrows[i].animate.set_color(n.color),
                      run_time=0.55, rate_func=smooth)
            extra = [FadeIn(syn)] if n is sat else []
            self.play(lit(n), FadeIn(ic, shift=UP * 0.15), Flash(n.box.get_top(), color=n.color, line_length=0.15),
                      *extra, run_time=0.7)
            self.wait(2.0)
            dot.move_to(n.get_right())
        self.play(FadeOut(dot), run_time=0.3)

        lines = VGroup(T("The model proposes.", 34, NV, weight=BOLD), T("The solver proves.", 34, BLUE, weight=BOLD),
                       T("The simulator tells you if it works.", 34, TEAL, weight=BOLD)).arrange(DOWN, buff=0.2)
        lines.to_edge(DOWN, buff=0.45)
        self.play(VGroup(row, arrows, syn, *icons).animate.shift(UP * 0.55).scale(0.92), run_time=0.6)
        for l in lines:
            self.play(FadeIn(l, shift=UP * 0.15), run_time=0.6)
            self.wait(0.9)
        self.wait(1.6)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 4. Nemotron + fine-tuning (~33 s)
class Nemotron(Scene):
    def construct(self):
        head = title("NVIDIA Nemotron Nano 9B v2", "hybrid Mamba-2 + Transformer, fine-tuned for floor plans", NV)
        self.play(FadeIn(head, shift=DOWN * 0.15), run_time=0.8)

        # --- the hybrid stack: mostly Mamba-2 blocks, attention in a few places
        n = 42
        attn_at = {6, 17, 28, 38}
        bars = VGroup()
        for i in range(n):
            kind = "attn" if i in attn_at else ("mlp" if i % 2 else "mamba")
            c = {"attn": YELLOW, "mlp": PURPLE, "mamba": BLUE}[kind]
            b = RoundedRectangle(corner_radius=0.04, width=0.2, height=2.3 if kind != "mlp" else 1.6, stroke_width=0,
                                 fill_color=c, fill_opacity=0.9 if kind == "attn" else 0.65)
            bars.add(b)
        bars.arrange(RIGHT, buff=0.07).move_to(UP * 0.2)
        legend = VGroup(*[VGroup(Square(0.2, fill_color=c, fill_opacity=0.85, stroke_width=0), T(t, 22, MUTED)).arrange(RIGHT, buff=0.12)
                          for c, t in [(BLUE, "Mamba-2 state-space: long context, linear time"), (YELLOW, "attention, where it matters"),
                                       (PURPLE, "MLP")]]).arrange(RIGHT, buff=0.6).next_to(bars, DOWN, buff=0.55)
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars], lag_ratio=0.03), run_time=1.8)
        self.play(FadeIn(legend, shift=UP * 0.1), run_time=0.6)
        toks = VGroup(*[Square(0.22, stroke_color=INK, stroke_width=1.5, fill_color=INK, fill_opacity=0.15) for _ in range(10)]).arrange(RIGHT, buff=0.06)
        toks.next_to(bars, LEFT, buff=0.3).shift(LEFT * 6)
        self.add(toks)
        self.play(toks.animate.next_to(bars, LEFT, buff=0.25), run_time=1.0)
        sweep = Rectangle(width=0.32, height=2.6, stroke_width=0, fill_color=WHITE, fill_opacity=0.25).move_to(bars[0])
        self.play(FadeIn(sweep, run_time=0.2))
        self.play(sweep.animate.move_to(bars[-1]), run_time=2.0, rate_func=linear)
        self.play(*[Indicate(bars[i], color=YELLOW, scale_factor=1.25) for i in attn_at], FadeOut(sweep), run_time=0.9)
        lap = T("small enough to run on a laptop · 5.5 GB GGUF", 24, NV).next_to(legend, DOWN, buff=0.45)
        self.play(FadeIn(lap, shift=UP * 0.1), run_time=0.5)
        self.wait(4.0)
        self.play(FadeOut(lap), run_time=0.3)
        self.play(FadeOut(VGroup(bars, legend, toks)), run_time=0.6)

        # --- stage 1: QLoRA
        st1 = T("Stage 1 · supervised fine-tuning with QLoRA", 30, INK, weight=BOLD).next_to(head, DOWN, buff=0.5).align_to(head, LEFT)
        W = Square(2.6, stroke_color=MUTED, stroke_width=2, fill_color=MUTED, fill_opacity=0.2)
        Wl = VGroup(T("W", 40, INK, weight=BOLD), T("frozen · 4-bit", 20, MUTED)).arrange(DOWN, buff=0.1).move_to(W)
        plus = T("+", 56, INK)
        B = Rectangle(width=0.45, height=2.6, stroke_color=NV, stroke_width=2, fill_color=NV, fill_opacity=0.35)
        A = Rectangle(width=2.6, height=0.45, stroke_color=NV, stroke_width=2, fill_color=NV, fill_opacity=0.35)
        Bl, Al = T("B", 30, INK, weight=BOLD).move_to(B), T("A", 30, INK, weight=BOLD).move_to(A)
        BA = VGroup(VGroup(B, Bl), VGroup(A, Al)).arrange(RIGHT, buff=0.15, aligned_edge=UP)
        eq = VGroup(VGroup(W, Wl), plus, BA).arrange(RIGHT, buff=0.45).move_to(LEFT * 3.0 + DOWN * 0.3)
        hp = VGroup(T("rank r = 32", 26, NV), T("α = 64", 26, NV), T("lr 2e-4", 26, MUTED)).arrange(RIGHT, buff=0.5)
        hp.next_to(eq, DOWN, buff=0.45)
        self.play(FadeIn(st1, shift=RIGHT * 0.2), run_time=0.6)
        self.play(FadeIn(VGroup(W, Wl)), run_time=0.5)
        self.play(FadeIn(plus), GrowFromEdge(VGroup(B, Bl), UP), GrowFromEdge(VGroup(A, Al), LEFT), run_time=0.9)
        self.play(FadeIn(hp, shift=LEFT * 0.2), run_time=0.5)

        data = VGroup(*[clinic_mob(0.035, ORIGIN, label=False, fill=0.4) for _ in range(12)]).arrange_in_grid(3, 4, buff=0.12)
        data.to_edge(RIGHT, buff=0.9).shift(DOWN * 0.2)
        dl = T("400 train · 50 val plans\nsolver-certified, written in FML", 20, MUTED).next_to(data, DOWN, buff=0.25)
        self.play(LaggedStart(*[FadeIn(d, shift=DOWN * 0.2) for d in data], lag_ratio=0.06), FadeIn(dl), run_time=1.2)
        self.play(LaggedStart(*[d.animate.move_to(BA.get_center()).scale(0.2).set_opacity(0) for d in data], lag_ratio=0.05),
                  run_time=1.4)
        self.wait(3.5)
        self.play(FadeOut(VGroup(st1, eq, hp, dl)), run_time=0.5)

        # --- stage 2: GRPO with verifiable rewards
        st2 = T("Stage 2 · GRPO, reinforcement learning with verifiable rewards", 30, INK, weight=BOLD)
        st2.next_to(head, DOWN, buff=0.5).align_to(head, LEFT)
        self.play(FadeIn(st2, shift=RIGHT * 0.2), run_time=0.6)
        prompt = chip("500 clinic prompts", MUTED, size=22).move_to(LEFT * 4.9 + UP * 0.85)
        model = chip("Nemotron", NV, size=26).move_to(LEFT * 4.9 + DOWN * 0.45)
        self.play(FadeIn(prompt), FadeIn(model), GrowArrow(Arrow(prompt.get_bottom(), model.get_top(), buff=0.06, color=MUTED, stroke_width=3)), run_time=0.6)

        names = ["format", "overlap", "connectivity", "regulatory"]
        cols = [BLUE, RED, TEAL, YELLOW]
        scores = np.array([[1.0, 0.92, 1.0, 0.75], [1.0, 0.40, 0.67, 0.50], [0.0, 0.0, 0.0, 0.0], [1.0, 1.0, 1.0, 1.0]])
        samples = VGroup()
        for k in range(4):
            mini = clinic_mob(0.04, ORIGIN, label=False, fill=0.35)
            if k == 1:
                for j, m in enumerate(mini):
                    m.shift(np.array([(j % 3 - 1) * 0.08, (j % 2) * 0.08, 0]))
            if k == 2:
                mini = VGroup(T("Sure! Here is a\nlovely clinic…", 16, MUTED))
            bars_k = VGroup(*[Rectangle(width=0.22, height=max(0.02, 0.62 * scores[k, i]), stroke_width=0, fill_color=cols[i], fill_opacity=0.9)
                              for i in range(4)]).arrange(RIGHT, buff=0.06, aligned_edge=DOWN)
            tot = T(f"{scores[k].mean():.2f}", 22, INK)
            row = VGroup(mini, bars_k, tot).arrange(RIGHT, buff=0.35)
            samples.add(row)
        samples.arrange(DOWN, buff=0.22, aligned_edge=LEFT).move_to(LEFT * 1.35 + DOWN * 0.45)
        fan = VGroup(*[Arrow(model.get_right(), s[0].get_left(), buff=0.08, stroke_width=2, color=FAINT, max_tip_length_to_length_ratio=0.12) for s in samples])
        self.play(LaggedStart(*[GrowArrow(a) for a in fan], lag_ratio=0.1), LaggedStart(*[FadeIn(s[0]) for s in samples], lag_ratio=0.1), run_time=1.0)
        gl = T("a group of drafts per prompt", 18, MUTED).next_to(samples, DOWN, buff=0.2).align_to(samples, LEFT)
        self.play(FadeIn(gl), run_time=0.3)

        qs = ["Does it parse?", "Do rooms overlap?", "Can you reach every room?", "Does it meet the code?"]
        leg = VGroup()
        for i in range(4):
            leg.add(VGroup(Square(0.18, fill_color=cols[i], fill_opacity=0.9, stroke_width=0), T(f"r_{names[i]}", 20, cols[i]),
                           T(qs[i], 20, MUTED)).arrange(RIGHT, buff=0.15))
        leg.arrange(DOWN, aligned_edge=LEFT, buff=0.2).to_edge(RIGHT, buff=0.35).shift(DOWN * 0.35)
        for i in range(4):
            self.play(FadeIn(leg[i], shift=LEFT * 0.15), *[GrowFromEdge(s[1][i], DOWN) for s in samples], run_time=0.75)
            self.wait(1.0)
        self.play(LaggedStart(*[FadeIn(s[2]) for s in samples], lag_ratio=0.1), run_time=0.5)
        f = T("r_overlap = max(0, 1 − 8 · overlap area / total area)", 22, RED).to_edge(DOWN, buff=0.75)
        adv = T("advantage = (r − mean) / std  →  push the model toward the better drafts", 22, NV).next_to(f, DOWN, buff=0.15)
        self.play(FadeIn(f, shift=UP * 0.1), run_time=0.5)
        self.play(FadeIn(adv, shift=UP * 0.1), Indicate(samples[3], color=GREEN, scale_factor=1.06), run_time=0.8)
        loop = CurvedArrow(samples.get_left() + DOWN * 1.2, model.get_bottom() + DOWN * 0.05, angle=-TAU / 6, color=NV, stroke_width=3)
        self.play(Create(loop), Flash(model, color=NV), run_time=0.9)
        grade = T("The plan itself grades the model.", 30, NV, weight=BOLD).move_to(st2, aligned_edge=LEFT)
        self.play(FadeOut(st2, shift=UP * 0.2), FadeIn(grade, shift=UP * 0.2), run_time=0.6)
        self.wait(3.0)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 5. Grammar-constrained decoding (~24 s)
class Grammar(Scene):
    def construct(self):
        head = title("Grammar-constrained decoding", "a GBNF grammar runs inside llama.cpp: only legal tokens can be sampled", BLUE)
        self.play(FadeIn(head, shift=DOWN * 0.15), run_time=0.7)

        line_y = UP * 1.4
        prefix = T("ROOM", 30, INK, font="DejaVu Sans Mono")
        prefix.move_to(LEFT * 5.2 + line_y, aligned_edge=LEFT)
        self.play(FadeIn(prefix), run_time=0.3)
        steps = [
            (["exam_1", "Exam", "{", "Sure"], [True, False, False, False]),
            (["TYPE", "is", "-", "TYPE:"], [True, False, False, False]),
            (["EXAM", "EXAM ROOM", "exam", "OFFICE"], [True, False, False, True]),
            (["RECT", "at", "(", "SIZE"], [True, False, False, False]),
        ]
        probs = [[0.31, 0.27, 0.22, 0.20], [0.24, 0.30, 0.18, 0.28], [0.29, 0.34, 0.21, 0.16], [0.26, 0.31, 0.25, 0.18]]
        cur = prefix
        for (cands, legal), pr in zip(steps, probs):
            bars = VGroup()
            for c, ok, p in zip(cands, legal, pr):
                lab = T(c, 22, INK, font="DejaVu Sans Mono")
                bar = Rectangle(width=4.0 * p / 0.34, height=0.34, stroke_width=0, fill_color=BLUE, fill_opacity=0.7)
                r = VGroup(lab, bar).arrange(RIGHT, buff=0.25)
                lab.align_to(r, LEFT)
                bars.add(r)
            bars.arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to(DOWN * 1.2 + RIGHT * 0.5)
            for r in bars:
                r[1].align_to(bars, LEFT).shift(RIGHT * 2.2)
            self.play(FadeIn(bars, shift=UP * 0.1), run_time=0.35)
            masks = [cross(r[1], RED) for r, ok in zip(bars, legal) if not ok]
            self.play(*[r.animate.set_opacity(0.2) for r, ok in zip(bars, legal) if not ok], *[Create(m) for m in masks], run_time=0.4)
            pick = max([i for i in range(4) if legal[i]], key=lambda i: pr[i])
            tok = T(cands[pick], 30, GREEN, font="DejaVu Sans Mono").next_to(cur, RIGHT, buff=0.25)
            self.play(TransformFromCopy(bars[pick][0], tok), run_time=0.45)
            self.play(FadeOut(bars), *[FadeOut(m) for m in masks], tok.animate.set_color(INK), run_time=0.25)
            cur = tok
        rest = T("12 0 36 40 FREE", 30, INK, font="DejaVu Sans Mono").next_to(cur, RIGHT, buff=0.25)
        self.play(FadeIn(rest, shift=LEFT * 0.1), run_time=0.4)
        line0 = VGroup(*[m for m in self.mobjects if isinstance(m, Text) and m not in head])

        more = ["ROOM exam_2 TYPE EXAM RECT 48 0 36 40 FREE", "ROOM nurse TYPE NURSE_STATION RECT 84 0 30 40 FREE",
                "ROOM wc_1 TYPE ADA_RESTROOM RECT 114 0 24 40 LOCKED", "DOOR d1 CONNECT corridor exam_1 AT 30 40 WIDTH 9",
                "END_PLAN"]
        lines = VGroup(*[T(m, 26, INK, font="DejaVu Sans Mono") for m in more]).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
        lines.next_to(prefix, DOWN, buff=0.22).align_to(prefix, LEFT)
        ticks = VGroup(*[tick(GREEN, 0.26).next_to(l, LEFT, buff=0.2) for l in [prefix, *lines]])
        self.play(LaggedStart(*[FadeIn(l, shift=UP * 0.1) for l in lines], lag_ratio=0.15), run_time=1.0)
        self.play(LaggedStart(*[Create(t) for t in ticks], lag_ratio=0.1), run_time=0.8)
        every = T("every line parses", 30, GREEN, weight=BOLD).to_edge(DOWN, buff=0.7)
        self.play(FadeIn(every, shift=UP * 0.15), run_time=0.5)
        self.wait(3.0)
        self.play(FadeOut(VGroup(line0, lines, ticks, every)), run_time=0.5)

        # --- what the test showed: program right, coordinates wrong
        lt = VGroup(T("The room program", 30, INK, weight=BOLD), tick(GREEN, 0.34)).arrange(RIGHT, buff=0.25).move_to(LEFT * 3.6 + UP * 1.4)
        rt = VGroup(T("The coordinates", 30, INK, weight=BOLD), cross(Square(0.3), RED)).arrange(RIGHT, buff=0.25).move_to(RIGHT * 3.6 + UP * 1.4)
        prog = VGroup(*[T(s, 24, NV, font="DejaVu Sans Mono") for s in
                        ["EXAM          × 6", "NURSE_STATION × 1", "WAITING       × 1", "RECEPTION     × 1", "ADA_RESTROOM  × 1",
                         "CLEAN_UTILITY × 1", "SOILED_UTILITY × 1"]]).arrange(DOWN, aligned_edge=LEFT, buff=0.1).next_to(lt, DOWN, buff=0.4)
        self.play(FadeIn(lt[0]), run_time=0.4)
        self.play(LaggedStart(*[FadeIn(p, shift=RIGHT * 0.1) for p in prog], lag_ratio=0.08), Create(lt[1]), run_time=1.1)
        self.play(FadeIn(rt[0]), run_time=0.4)
        s = 0.17
        site = boundary_mob(s, RIGHT * 3.6 + DOWN * 0.45)
        ok_corr = Rectangle(width=SITE_W * s, height=1.83 * s, stroke_color=GREEN, stroke_width=2).move_to(site)
        bad = Rectangle(width=SITE_W * s, height=18.3 * s, stroke_color=RED, stroke_width=3, fill_color=RED, fill_opacity=0.15).move_to(site)
        cap = T("corridor: asked 1,830 mm, wrote 18,300", 20, RED).next_to(site, DOWN, buff=0.55)
        self.play(Create(site), Create(ok_corr), run_time=0.6)
        self.play(ReplacementTransform(ok_corr, bad), FadeIn(cap), Create(rt[1]), run_time=1.0)
        self.wait(3.4)

        # --- so: program-first
        flow = VGroup(chip("Nemotron: which rooms, how many", NV, size=21), chip("synthesizer: 3 layouts", MUTED, size=21),
                      chip("CP-SAT: exactly where", BLUE, size=21)).arrange(RIGHT, buff=0.5).to_edge(DOWN, buff=0.4)
        arr = VGroup(*[Arrow(flow[i].get_right(), flow[i + 1].get_left(), buff=0.08, color=MUTED, stroke_width=3) for i in range(2)])
        self.play(FadeIn(flow[0], shift=UP * 0.2), run_time=0.5)
        self.play(GrowArrow(arr[0]), FadeIn(flow[1], shift=UP * 0.2), run_time=0.5)
        self.play(GrowArrow(arr[1]), FadeIn(flow[2], shift=UP * 0.2), run_time=0.5)
        self.wait(3.2)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 6. CP-SAT (~22 s)
class Solver(Scene):
    def construct(self):
        head = title("OR-Tools CP-SAT", "integer geometry on a 100 mm grid", BLUE)
        self.play(FadeIn(head, shift=DOWN * 0.15), run_time=0.6)
        s = 0.33
        o = LEFT * 2.75 + DOWN * 0.25
        grid = NumberPlane(x_range=[-12, 12, 1], y_range=[-7, 7, 1], x_length=SITE_W * s, y_length=SITE_D * s,
                           background_line_style={"stroke_color": FAINT, "stroke_width": 1, "stroke_opacity": 0.8},
                           axis_config={"stroke_opacity": 0}).move_to(o)
        site = boundary_mob(s, o, INK)
        self.play(FadeIn(grid), Create(site), run_time=0.8)

        jit = {"waiting": (0.9, -0.8), "reception": (-0.7, -0.4), "exam1": (-0.6, 0.5), "exam2": (0.5, -0.7), "exam3": (0.8, 0.3),
               "exam4": (-0.4, -0.6), "exam5": (0.6, 0.9), "exam6": (-0.5, 0.7), "nurse": (-0.9, 0.8), "clean": (0.5, 0.6),
               "soiled": (-0.6, 0.5), "office": (-0.8, 0.9)}
        rooms = [r for r in CLINIC if r[1] != "corridor"]
        mobs = VGroup()
        for r in rooms:
            dx, dy = jit.get(r[0], (0, 0))
            m = room_mob((r[0], r[1], r[2], r[3] + dx, r[4] + dy, r[5], r[6]), s, o, label=True, label_size=15)
            mobs.add(m)
        corr = room_mob(CLINIC[6], s, o, label=False, fill=0.15)
        self.play(FadeIn(corr), LaggedStart(*[FadeIn(m, scale=0.95) for m in mobs], lag_ratio=0.05), run_time=1.2)
        ovl = ValueTracker(14.2)
        meter = live_text(ovl, lambda v: f"overlap  {v:.1f} m²", lambda m: m.next_to(site, DOWN, buff=0.3).align_to(site, LEFT), 26, RED)
        self.add(meter)

        cons = VGroup(T("AddNoOverlap2D", 24, BLUE, font="DejaVu Sans Mono"),
                      T("locked rooms: fixed", 24, YELLOW, font="DejaVu Sans Mono"),
                      T("doors ⇒ walls touch", 24, TEAL, font="DejaVu Sans Mono"),
                      T("minimize Σ |Δx| + |Δy|", 24, GREEN, font="DejaVu Sans Mono")).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        cons.to_edge(RIGHT, buff=0.45).shift(UP * 0.3)
        wc = next(m for m in mobs if m.rid == "wc")
        lock = padlock().move_to(wc[0].get_top() + DOWN * 0.3)
        self.wait(2.0)
        self.play(FadeIn(cons[0], shift=LEFT * 0.2), run_time=0.5)
        self.wait(1.0)
        self.play(FadeIn(cons[1], shift=LEFT * 0.2), FadeIn(lock, scale=1.5), wc[0].animate.set_stroke(YELLOW, width=4), run_time=0.6)
        self.wait(1.0)
        self.play(FadeIn(cons[2], shift=LEFT * 0.2), run_time=0.5)
        self.wait(1.4)
        self.play(FadeIn(cons[3], shift=LEFT * 0.2), run_time=0.5)

        targets = []
        for m, r in zip(mobs, rooms):
            targets.append(m.animate.move_to(plan_to_scene(r[3] + r[5] / 2, r[4] + r[6] / 2, s, o)))
        self.play(*targets, ovl.animate.set_value(0.0), run_time=2.2, rate_func=smooth)
        meter.clear_updaters()
        self.remove(meter)
        done = T("overlap  0.0 m²  ·  OPTIMAL  ·  minimal moves", 26, GREEN).next_to(site, DOWN, buff=0.3).align_to(site, LEFT)
        self.add(done)
        self.play(Indicate(done, color=GREEN, scale_factor=1.04), run_time=0.7)
        self.wait(2.6)

        # --- an impossible request returns a proof
        req = chip("“Make the waiting room\n250% bigger”", YELLOW, size=24).to_edge(RIGHT, buff=0.5).shift(UP * 1.2)
        self.play(FadeOut(cons), FadeIn(req, shift=LEFT * 0.2), run_time=0.6)
        wait_m = next(m for m in mobs if m.rid == "waiting")
        big = Rectangle(width=35 * s * 0.42 * 2.4 / 2.4, height=6 * s, stroke_color=RED, stroke_width=3, fill_color=RED, fill_opacity=0.25)
        big.stretch_to_fit_width(35 * s * 0.42)
        big.move_to(wait_m[0].get_left(), aligned_edge=LEFT)
        self.play(Transform(wait_m[0], big), run_time=1.2)
        ex = DashedLine(site.get_corner(UR) + UP * 0.2, site.get_corner(DR) + DOWN * 0.2, color=RED)
        self.play(Create(ex), site.animate.set_stroke(RED, width=3), run_time=0.5)
        self.play(FadeOut(done), run_time=0.2)
        inf = T("INFEASIBLE", 36, RED, weight=BOLD).next_to(req, DOWN, buff=0.5).align_to(req, LEFT)
        core = T("minimal conflict core:\nWaiting Area + building width", 22, RED).next_to(inf, DOWN, buff=0.2).align_to(inf, LEFT)
        why = T("Waiting Area would be 35 m wide,\nand the building is 24 m wide.", 24, INK).next_to(core, DOWN, buff=0.35).align_to(inf, LEFT)
        self.play(FadeIn(inf, shift=UP * 0.1), run_time=0.4)
        self.play(FadeIn(core), run_time=0.4)
        self.play(Write(why), run_time=1.2)
        self.wait(4.0)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 7. Rooms + doors → walls, grid, A*, 3D (~17 s)
class PlanTo3D(ThreeDScene):
    def construct(self):
        s = 0.42
        o = ORIGIN + DOWN * 0.25
        self.set_camera_orientation(phi=0, theta=-90 * DEGREES)
        cap = T("rooms + doors", 30, INK, weight=BOLD).to_corner(UL, buff=0.6)
        self.add_fixed_in_frame_mobjects(cap)
        rooms = [r for r in CLINIC]
        floor = VGroup(*[room_mob(r, s, o, label=False, fill=0.22 if r[1] != "corridor" else 0.1) for r in rooms])
        for m in floor:
            m[0].set_stroke(width=1, opacity=0.5)
        doors = all_doors(rooms)
        door_m = VGroup(*[Line(plan_to_scene(dx - 0.45, dy, s, o), plan_to_scene(dx + 0.45, dy, s, o), color=YELLOW, stroke_width=6)
                          for dx, dy in doors])
        entry = Line(plan_to_scene(0, 6.5, s, o), plan_to_scene(0, 7.5, s, o), color=YELLOW, stroke_width=6)
        self.play(FadeIn(cap), LaggedStart(*[FadeIn(m) for m in floor], lag_ratio=0.04), run_time=1.2)
        self.play(LaggedStart(*[Create(d) for d in door_m], lag_ratio=0.04), Create(entry), run_time=0.8)

        # walls: every room edge, broken where a door opens
        def wall_segments():
            segs = []
            for _, typ, _, x, y, w, h in rooms:
                if typ == "corridor":
                    continue
                edges = [((x, y), (x + w, y)), ((x, y + h), (x + w, y + h)), ((x, y), (x, y + h)), ((x + w, y), (x + w, y + h))]
                for (a, b) in edges:
                    cut = None
                    for dx, dy in doors:
                        if a[1] == b[1] == dy and a[0] < dx < b[0]:
                            cut = dx
                    if cut is None:
                        segs.append((a, b))
                    else:
                        segs.append((a, (cut - 0.45, a[1])))
                        segs.append(((cut + 0.45, a[1]), b))
            # outer corridor ends, with the entrance on the west
            segs += [((0, 6), (0, 6.5)), ((0, 7.5), (0, 8)), ((24, 6), (24, 8))]
            return segs

        segs = wall_segments()
        walls2d = VGroup(*[Line(plan_to_scene(*a, s, o), plan_to_scene(*b, s, o), color=INK, stroke_width=4) for a, b in segs])
        cap2 = T("→ walls", 30, INK, weight=BOLD).next_to(cap, RIGHT, buff=0.3)
        self.add_fixed_in_frame_mobjects(cap2)
        self.play(FadeIn(cap2), LaggedStart(*[Create(w) for w in walls2d], lag_ratio=0.01), run_time=1.2)
        win = VGroup(*[Line(plan_to_scene(x + 0.6, yy, s, o), plan_to_scene(x + w - 0.6, yy, s, o), color=BLUE, stroke_width=7)
                       for _, typ, _, x, y, w, h in rooms if typ in ("exam", "waiting", "office")
                       for yy in ([14.0] if y >= 8 else [0.0])])
        cap3 = T("windows", 30, BLUE, weight=BOLD).next_to(cap2, RIGHT, buff=0.3)
        self.add_fixed_in_frame_mobjects(cap3)
        self.play(FadeIn(cap3), LaggedStart(*[Create(w) for w in win], lag_ratio=0.05), run_time=0.7)

        # walkable grid and an A* route (patient: entrance → Exam 3)
        g, res = walk_grid(rooms, 0.5, doors)
        dots = VGroup()
        for i in range(g.shape[0]):
            for j in range(g.shape[1]):
                if g[i, j]:
                    dots.add(Dot(plan_to_scene((i + 0.5) * res, (j + 0.5) * res, s, o), radius=0.025, color=MUTED))
        cap4 = T("walkable grid", 30, MUTED, weight=BOLD).to_edge(DOWN, buff=0.45).shift(LEFT * 2.5)
        self.add_fixed_in_frame_mobjects(cap4)
        self.play(FadeIn(cap4), FadeIn(dots, lag_ratio=0.002), run_time=0.9)
        start = (0, int(7 / res))
        ex3 = next(r for r in rooms if r[0] == "exam3")
        goal = cell((ex3[3] + ex3[5] / 2, 11.0), res)
        path, cost = astar(g, start, goal)
        pts = [plan_to_scene((i + 0.5) * res, (j + 0.5) * res, s, o) for i, j in path]
        route = VMobject(stroke_color=YELLOW, stroke_width=6).set_points_smoothly(pts[::2] + [pts[-1]])
        cap5 = T(f"A* route · {cost * res:.1f} m", 30, YELLOW, weight=BOLD).next_to(cap4, RIGHT, buff=0.3)
        self.add_fixed_in_frame_mobjects(cap5)
        walker = Dot(pts[0], radius=0.09, color=YELLOW)
        self.play(FadeIn(cap5), Create(route), MoveAlongPath(walker, route), run_time=1.6)

        # rise into 3D
        self.play(FadeOut(dots), FadeOut(VGroup(cap4, cap5)), run_time=0.4)
        hw = 1.2
        prisms = VGroup()
        for a, b in segs:
            pa, pb = plan_to_scene(*a, s, o), plan_to_scene(*b, s, o)
            L = np.linalg.norm(pb - pa)
            if L < 1e-3:
                continue
            horiz = abs(pb[1] - pa[1]) < 1e-6
            pr = Prism(dimensions=[L if horiz else 0.07, 0.07 if horiz else L, hw])
            pr.set_fill(INK, opacity=0.85).set_stroke(width=0)
            pr.move_to((pa + pb) / 2 + OUT * hw / 2)
            prisms.add(pr)
        self.remove(walls2d)
        self.move_camera(phi=58 * DEGREES, theta=-62 * DEGREES, zoom=0.95, run_time=1.6,
                         added_anims=[LaggedStart(*[GrowFromPoint(p, p.get_center() + IN * hw / 2) for p in prisms], lag_ratio=0.004)])
        # people walking real paths
        people = VGroup()
        anims = []
        rng = np.random.default_rng(3)
        for k, rid in enumerate(["exam1", "exam5", "exam4", "nurse", "wc"]):
            r = next(rr for rr in rooms if rr[0] == rid)
            gx, gy = door_of(r)
            gy2 = gy + (1.5 if gy >= 8 else -1.5)
            pth, _ = astar(g, (int(rng.integers(0, 3)), int(7 / res)), cell((gx, gy2), res))
            pp = [plan_to_scene((i + 0.5) * res, (j + 0.5) * res, s, o) + OUT * 0.25 for i, j in pth]
            curve = VMobject().set_points_smoothly(pp[::2] + [pp[-1]])
            col = [YELLOW, TEAL, PINK, PURPLE, ORANGE][k]
            body = Sphere(radius=0.13, resolution=(8, 8)).set_color(col).move_to(pp[0])
            people.add(body)
            anims.append(MoveAlongPath(body, curve, rate_func=smooth))
        self.add(people)
        self.begin_ambient_camera_rotation(rate=0.05)
        self.play(*anims, run_time=3.0)

        # the honesty point: move the nurse station, nurses walk further
        near = nurse_walk(rooms, "nurse")
        far_rooms = [(rid, typ, name, x, y, w, h) for rid, typ, name, x, y, w, h in rooms]
        swapped = []
        for r in far_rooms:
            if r[0] == "nurse":
                swapped.append(("office", "office", "Office", r[3], r[4], r[5], r[6]))
            elif r[0] == "office":
                swapped.append(("nurse", "nurse", "Nurse", 20.5, r[4], 3.5, r[6]))
            else:
                swapped.append(r)
        far = nurse_walk(swapped, "nurse")
        msg = T(f"nurse walk to the average exam room:  {near:.0f} m", 30, PURPLE, weight=BOLD).to_edge(DOWN, buff=0.45)
        msg2 = T(f"move the nurse station to the east end:  {far:.0f} m", 30, RED, weight=BOLD).to_edge(DOWN, buff=0.45)
        self.add_fixed_in_frame_mobjects(msg)
        self.play(FadeIn(msg), run_time=0.5)
        self.wait(1.4)
        nurse_floor = next(m for m in floor if m.rid == "nurse")
        office_floor = next(m for m in floor if m.rid == "office")
        self.play(nurse_floor[0].animate.set_fill(ROOM_COLORS["office"], 0.22), office_floor[0].animate.set_fill(ROOM_COLORS["nurse"], 0.5),
                  run_time=0.8)
        self.remove(msg)
        self.add_fixed_in_frame_mobjects(msg2)
        self.add(msg2)
        self.wait(2.4)
        self.stop_ambient_camera_rotation()
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 8. Same engine, a different building (~8 s)
class SameEngine(Scene):
    def construct(self):
        s = 0.3
        plan = clinic_mob(s, LEFT * 0.0 + UP * 0.25, label=False, fill=0.3)
        self.play(FadeIn(plan, scale=0.95), run_time=0.6)
        strip = VGroup(*[chip(t, c, size=22) for t, c in [("Nemotron", NV), ("CP-SAT", BLUE), ("checks", YELLOW), ("3D · simulate · export", TEAL)]])
        strip.arrange(RIGHT, buff=0.35).to_edge(DOWN, buff=0.6)
        lab = T("Same model · Same solver · Same viewer", 40, INK, weight=BOLD).to_edge(UP, buff=0.6)
        self.play(FadeIn(lab, shift=DOWN * 0.15), LaggedStart(*[FadeIn(c, shift=UP * 0.15) for c in strip], lag_ratio=0.15), run_time=1.2)
        self.wait(1.4)

        # morph the clinic into a data center: bands south → north, then rack rows in the halls
        bands = [("generator yard", ORANGE, -2.0, 0.5), ("support", MUTED, -1.45, 0.45), ("power: UPS · batteries", PURPLE, -0.85, 0.6),
                 ("data hall", BLUE, 0.45, 1.85), ("cooling yard", TEAL, 1.75, 0.6)]
        W = 7.6
        bmobs = VGroup(*[Rectangle(width=W, height=h, stroke_color=c, stroke_width=2, fill_color=c, fill_opacity=0.18).move_to(UP * (y + 0.25))
                         for _, c, y, h in bands])
        blabs = VGroup(*[T(n, 18, c).next_to(b, LEFT, buff=0.2) for (n, c, _, _), b in zip(bands, bmobs)])
        self.play(ReplacementTransform(plan, bmobs), run_time=1.2)
        racks = VGroup()
        hall = bmobs[3]
        for row in range(4):
            for k in range(30):
                r = Rectangle(width=0.16, height=0.26, stroke_width=0.6, stroke_color=BLUE, fill_color=BLUE, fill_opacity=0.7)
                r.move_to(hall.get_left() + RIGHT * (0.45 + k * 0.226) + UP * (0.62 - row * 0.42))
                racks.add(r)
        coolers = VGroup(*[Square(0.3, stroke_width=1, stroke_color=TEAL, fill_color=TEAL, fill_opacity=0.6)
                           .move_to(bmobs[4].get_left() + RIGHT * (0.4 + i * 0.45)) for i in range(16)])
        gens = VGroup(*[Rectangle(width=0.5, height=0.28, stroke_width=1, stroke_color=ORANGE, fill_color=ORANGE, fill_opacity=0.6)
                        .move_to(bmobs[0].get_left() + RIGHT * (0.5 + i * 0.66)) for i in range(11)])
        self.play(FadeIn(blabs), LaggedStart(*[FadeIn(r, scale=0.5) for r in racks], lag_ratio=0.004),
                  LaggedStart(*[GrowFromCenter(c) for c in coolers], lag_ratio=0.03), LaggedStart(*[GrowFromCenter(g) for g in gens], lag_ratio=0.03),
                  strip[0].animate.set_stroke(NV), run_time=1.6)
        lab2 = T("A completely different building.", 40, BLUE, weight=BOLD).to_edge(UP, buff=0.6)
        self.play(ReplacementTransform(lab, lab2), run_time=0.6)
        self.wait(1.6)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)


# ======================================================================= 9. N+1 arithmetic + thermal estimate (~14 s)
def sor_field(nx, ny, sources, sinks, iters=3000, omega=1.9, t_sink=18.0, snaps=(5, 30, 120, 400, 1200)):
    """Steady-state diffusion in a sealed hall: heat enters at rack exhausts and leaves only through live
    coolers. Red-black successive over-relaxation (the same idea as the studio's thermal estimate, at toy size)."""
    T_ = np.full((nx + 2, ny + 2), t_sink)
    q = np.zeros_like(T_)
    for (i, j, p) in sources:
        q[i + 1, j + 1] += p
    sink = np.zeros_like(T_, dtype=bool)
    for (i, j) in sinks:
        sink[i + 1, j + 1] = True
    ii, jj = np.meshgrid(np.arange(nx + 2), np.arange(ny + 2), indexing="ij")
    inner = (ii > 0) & (ii < nx + 1) & (jj > 0) & (jj < ny + 1)
    colors = [inner & ((ii + jj) % 2 == c) & ~sink for c in (0, 1)]
    frames = []
    for it in range(iters):
        T_[0, :], T_[-1, :], T_[:, 0], T_[:, -1] = T_[1, :], T_[-2, :], T_[:, 1], T_[:, -2]  # insulated walls
        for m in colors:
            nb = 0.25 * (np.roll(T_, 1, 0) + np.roll(T_, -1, 0) + np.roll(T_, 1, 1) + np.roll(T_, -1, 1) + q)
            T_[m] += omega * (nb[m] - T_[m])
        T_[sink] = t_sink
        if it in snaps:
            frames.append(T_[1:-1, 1:-1].copy())
    frames.append(T_[1:-1, 1:-1].copy())
    return frames


def temp_color(t):
    stops = [(18, "#2B6CB0"), (20, "#3CC8BB"), (23, "#83C167"), (25.5, "#F4D35E"), (27, "#F59E4C"), (32, "#FC6255")]
    if t <= stops[0][0]:
        return stops[0][1]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            return interpolate_color(ManimColor(ca), ManimColor(cb), (t - a) / (b - a))
    return stops[-1][1]


class Redundancy(Scene):
    def construct(self):
        head = title("What keeps running?", "capacity arithmetic over every cooling and power path", BLUE)
        self.play(FadeIn(head, shift=DOWN * 0.15), run_time=0.6)

        # --- left: an N+1 cooling pool
        need = 2112
        unit = 800
        cool = VGroup(*[VGroup(RoundedRectangle(corner_radius=0.08, width=1.05, height=0.8, stroke_color=TEAL, stroke_width=2,
                                                fill_color=TEAL, fill_opacity=0.25), T(f"cooler {i + 1}", 16, INK), T("800 kW", 15, MUTED))
                        for i in range(4)])
        for c in cool:
            VGroup(c[1], c[2]).arrange(DOWN, buff=0.06).move_to(c[0])
        cool.arrange(RIGHT, buff=0.18).move_to(LEFT * 3.6 + UP * 1.0)
        nlab = T("N+1: three needed, one spare", 20, MUTED).next_to(cool, UP, buff=0.2)
        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.15) for c in cool], lag_ratio=0.1), FadeIn(nlab), run_time=0.9)

        axis_w = 5.0
        scale = axis_w / 3400
        base = LEFT * 6.1 + DOWN * 0.6
        cap_bar = Rectangle(width=4 * unit * scale, height=0.4, stroke_width=0, fill_color=TEAL, fill_opacity=0.7).move_to(base, aligned_edge=LEFT)
        need_bar = Rectangle(width=need * scale, height=0.4, stroke_width=0, fill_color=ORANGE, fill_opacity=0.75).move_to(base + DOWN * 0.7, aligned_edge=LEFT)
        cl = T("cooling 3,200 kW", 20, TEAL).next_to(cap_bar, RIGHT, buff=0.15)
        nl = T("hall needs 2,112 kW", 20, ORANGE).next_to(need_bar, RIGHT, buff=0.15)
        self.play(GrowFromEdge(cap_bar, LEFT), GrowFromEdge(need_bar, LEFT), FadeIn(cl), FadeIn(nl), run_time=0.9)
        self.wait(0.6)

        # break cooler 2
        x = cross(cool[1][0], RED)
        self.play(Create(x), cool[1][0].animate.set_stroke(RED).set_fill(RED, 0.25), run_time=0.5)
        cap3 = Rectangle(width=3 * unit * scale, height=0.4, stroke_width=0, fill_color=TEAL, fill_opacity=0.7).move_to(base, aligned_edge=LEFT)
        cl3 = T("cooling 2,400 kW", 20, TEAL).next_to(cap3, RIGHT, buff=0.15)
        self.play(Transform(cap_bar, cap3), Transform(cl, cl3), run_time=0.8)
        verdict = VGroup(
            T("The 3 remaining coolers carry 2,400 kW;", 22, INK),
            T("the hall needs 2,112 kW.", 22, INK),
            T("Running, with no backup left: at risk.", 22, YELLOW, weight=BOLD),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.1).next_to(need_bar, DOWN, buff=0.55).align_to(need_bar, LEFT)
        self.play(LaggedStart(*[FadeIn(v, shift=UP * 0.1) for v in verdict], lag_ratio=0.3), run_time=1.2)
        self.wait(3.0)

        # --- right: thermal estimate, SOR on a grid
        nx, ny = 30, 18
        racks = [(i, j) for j in (5, 6, 11, 12) for i in range(5, 25)]
        sources = [(i, j, 0.05) for i, j in racks]
        blocks = {1: [(1, j) for j in range(3, 8)], 2: [(nx - 2, j) for j in range(3, 8)],
                  3: [(1, j) for j in range(10, 15)], 4: [(nx - 2, j) for j in range(10, 15)]}
        sinks_all = [p for b in blocks.values() for p in b]
        frames_ok = sor_field(nx, ny, sources, sinks_all)
        failed = blocks[2]
        frames_bad = sor_field(nx, ny, sources, [p for p in sinks_all if p not in failed])
        # calibrate like the studio: warmest inlet 25 °C with everything running
        k = (25.0 - 18.0) / (frames_ok[-1].max() - 18.0)
        frames_ok = [18.0 + (f - 18.0) * k for f in frames_ok]
        frames_bad = [18.0 + (f - 18.0) * k for f in frames_bad]
        cs = 0.2
        origin = RIGHT * 3.7 + DOWN * 0.3
        cells = VGroup()
        for i in range(nx):
            for j in range(ny):
                sq = Square(cs, stroke_width=0, fill_color=temp_color(22), fill_opacity=1)
                sq.move_to(origin + RIGHT * (i - nx / 2) * cs + UP * (j - ny / 2) * cs)
                cells.add(sq)
        rk = VGroup(*[Rectangle(width=cs * 0.8, height=cs * 0.8, stroke_color=INK, stroke_width=0.8, fill_opacity=0)
                      .move_to(origin + RIGHT * (i - nx / 2) * cs + UP * (j - ny / 2) * cs) for i, j in racks])
        units = VGroup(*[Square(cs, stroke_color=TEAL, stroke_width=2.5, fill_opacity=0).move_to(origin + RIGHT * (i - nx / 2) * cs + UP * (j - ny / 2) * cs)
                         for i, j in sinks_all])
        tl = T("thermal estimate · successive over-relaxation", 20, MUTED).next_to(cells, UP, buff=0.2)
        tl2 = T("an estimate, not CFD", 18, MUTED).next_to(cells, DOWN, buff=0.2)
        self.play(FadeIn(cells), FadeIn(rk), FadeIn(units), FadeIn(tl), FadeIn(tl2), run_time=0.6)

        def paint(field):
            return [cells[i * ny + j].animate.set_fill(temp_color(field[i, j])) for i in range(nx) for j in range(ny)]

        for f in frames_ok:
            self.play(*paint(f), run_time=0.35)
        pk = T(f"warmest inlet {frames_ok[-1].max():.1f} °C", 22, GREEN).next_to(tl2, DOWN, buff=0.12)
        self.play(FadeIn(pk), run_time=0.3)
        b2 = VGroup(*[units[sinks_all.index(p)] for p in failed])
        xs = cross(b2, RED)
        self.play(Create(xs), run_time=0.4)
        for f in frames_bad[2:]:
            self.play(*paint(f), run_time=0.45)
        pk2 = T(f"warmest inlet {frames_bad[-1].max():.1f} °C · hot spot by cooler 2", 22, YELLOW).move_to(pk)
        self.play(ReplacementTransform(pk, pk2), run_time=0.4)
        hot = Circle(radius=0.9, color=RED, stroke_width=3).move_to(origin + RIGHT * (nx / 2 - 5) * cs + UP * (5 - ny / 2) * cs)
        ul = VGroup(*[T(str(n), 16, TEAL).next_to(VGroup(*[units[sinks_all.index(p)] for p in blocks[n]]), LEFT if n in (1, 3) else RIGHT, buff=0.08)
                      for n in blocks])
        self.add(ul)
        self.play(Create(hot), run_time=0.5)
        self.wait(1.6)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)


# ======================================================================= 10. Discrete-event clinic day (~27 s)
def mini_clinic_day(seed: int, n: int = 12):
    """A tiny seeded discrete-event clinic (event heap, mulberry-style seeded RNG) for the illustration:
    arrive -> check in -> wait -> nurse intake -> provider -> checkout. Returns per-patient phase intervals (minutes)."""
    rng = random.Random(seed)
    events = []  # (time, seq, kind, patient)
    seq = 0
    for p in range(n):
        heapq.heappush(events, (p * 6 + rng.uniform(-2, 2), seq, "arrive", p)); seq += 1
    free = {"desk": [0.0], "nurse": [0.0, 0.0], "prov": [0.0, 0.0, 0.0]}
    phases = {p: [] for p in range(n)}
    log = []

    def take(pool, t):
        i = min(range(len(free[pool])), key=lambda k: free[pool][k])
        start = max(t, free[pool][i])
        return i, start

    while events:
        t, _, kind, p = heapq.heappop(events)
        log.append((t, kind, p))
        if kind == "arrive":
            i, st = take("desk", t)
            d = rng.uniform(2, 4)
            free["desk"][i] = st + d
            phases[p].append(("checkin", st, st + d))
            heapq.heappush(events, (st + d, seq, "wait", p)); seq += 1
        elif kind == "wait":
            i, st = take("nurse", t)
            if st > t:
                phases[p].append(("wait", t, st))
            d = rng.uniform(6, 10)
            free["nurse"][i] = st + d
            phases[p].append(("intake", st, st + d))
            heapq.heappush(events, (st + d, seq, "provider", p)); seq += 1
        elif kind == "provider":
            i, st = take("prov", t)
            if st > t:
                phases[p].append(("wait", t, st))
            d = rng.uniform(15, 26)
            free["prov"][i] = st + d
            phases[p].append(("provider", st, st + d))
            heapq.heappush(events, (st + d, seq, "checkout", p)); seq += 1
        elif kind == "checkout":
            phases[p].append(("checkout", t, t + 2))
    return phases, log


class ClinicSim(Scene):
    def construct(self):
        head = title("A clinic day, simulated", "discrete events on a timeline · seeded, so every run is reproducible", TEAL)
        self.play(FadeIn(head, shift=DOWN * 0.15), run_time=0.6)
        cols = {"checkin": YELLOW, "wait": MUTED, "intake": PURPLE, "provider": GREEN, "checkout": ORANGE}
        names = {"checkin": "check in", "wait": "waiting", "intake": "nurse intake", "provider": "provider", "checkout": "checkout"}
        legend = VGroup(*[VGroup(Square(0.18, fill_color=cols[k], fill_opacity=0.9, stroke_width=0), T(names[k], 20, MUTED)).arrange(RIGHT, buff=0.1)
                          for k in cols]).arrange(RIGHT, buff=0.45).next_to(head, DOWN, buff=0.35).align_to(head, LEFT)
        self.play(FadeIn(legend), run_time=0.5)

        phases, log = mini_clinic_day(42)
        t_max = max(b for ph in phases.values() for _, _, b in ph)
        x0, x1 = -6.3, 2.3
        X = lambda t: x0 + (x1 - x0) * t / t_max
        rows = VGroup()
        ys = [1.05 - k * 0.34 for k in range(len(phases))]
        axis = Line([x0, ys[-1] - 0.32, 0], [x1, ys[-1] - 0.32, 0], color=FAINT, stroke_width=2)
        ticks_ = VGroup(*[T(lbl, 16, MUTED).move_to([X(t_max * f), ys[-1] - 0.55, 0]) for f, lbl in [(0, "8:00"), (0.5, "late morning"), (1, "last patient out")]])
        self.play(Create(axis), FadeIn(ticks_), run_time=0.5)

        # event heap on the right
        heap_t = T("event heap", 22, INK, weight=BOLD).move_to([4.7, 1.35, 0])
        self.play(FadeIn(heap_t), run_time=0.3)
        shown = log[:28]
        cards = VGroup()
        for t, kind, p in shown:
            hh, mm = divmod(int(8 * 60 + t), 60)
            c = chip(f"{hh}:{mm:02d}  {kind:<8s} patient {p + 1}", MUTED, w=3.6, size=17)
            cards.add(c)

        anims_by_patient = {p: [] for p in phases}
        for p, ph in phases.items():
            for kind, a, b in ph:
                r = Rectangle(width=max(0.02, X(b) - X(a)), height=0.24, stroke_width=0, fill_color=cols[kind], fill_opacity=0.9)
                r.move_to([(X(a) + X(b)) / 2, ys[p], 0])
                anims_by_patient[p].append(r)
                rows.add(r)
        plabels = VGroup(*[T(f"P{p + 1}", 14, MUTED).move_to([x0 - 0.3, ys[p], 0]) for p in phases])
        self.play(FadeIn(plabels), run_time=0.3)

        # pop events one by one (fast), drawing bars as their phases start
        stack = VGroup()
        for k, (t, kind, p) in enumerate(shown):
            c = cards[k].copy().move_to([4.7, 0.85 - min(k, 6) * 0.0, 0])
            if k < 14:
                self.play(FadeIn(c, shift=DOWN * 0.2), run_time=0.12)
                self.play(c.animate.shift(DOWN * 0.45).set_opacity(0.0), run_time=0.12)
                self.remove(c)
        self.play(LaggedStart(*[GrowFromEdge(r, LEFT) for r in rows], lag_ratio=0.02), run_time=2.6)
        q = T("grey: waiting.\nQueues form where a\nresource is busiest.", 22, MUTED).move_to([4.6, 0.4, 0])
        self.play(FadeOut(heap_t), FadeIn(q), run_time=0.4)
        self.wait(1.6)

        # determinism: same seed, same day
        phases2, _ = mini_clinic_day(42)
        same = all(abs(a[1] - b[1]) < 1e-9 for p in phases for a, b in zip(phases[p], phases2[p]))
        seed = VGroup(chip("seed 42", TEAL, size=22), T("→", 30, MUTED), chip("seed 42", TEAL, size=22), T("=", 30, MUTED),
                      T("identical day" if same else "different", 26, GREEN, weight=BOLD)).arrange(RIGHT, buff=0.22).move_to([4.6, 0.3, 0])
        seed.scale_to_fit_width(4.2)
        self.play(FadeOut(q), FadeIn(seed, shift=LEFT * 0.2), run_time=0.6)
        ghost = rows.copy().set_opacity(0.35).shift(UP * 0.06 + RIGHT * 0.03)
        self.play(FadeIn(ghost), run_time=0.4)
        self.play(ghost.animate.shift(DOWN * 0.06 + LEFT * 0.03), run_time=0.8)
        self.wait(1.6)

        # 20 days → a range and a verdict
        days = VGroup()
        waits = []
        for d in range(20):
            ph, _ = mini_clinic_day(100 + d, 12 + d % 4)
            w = [b - a for v in ph.values() for k, a, b in v if k == "wait"]
            waits.append(np.mean(w) if w else 0.0)
        lo_, hi_ = min(waits), max(waits)
        base = np.array([3.0, -1.5, 0])
        for d, w in enumerate(waits):
            dot = Dot(base + RIGHT * (d * 0.14) + UP * (0.15 + 1.1 * (w - lo_) / max(1e-6, hi_ - lo_)), radius=0.05, color=TEAL)
            days.add(dot)
        dl = T("20 seeded days", 20, MUTED).next_to(days, DOWN, buff=0.2)
        rng_br = Brace(days, RIGHT, color=MUTED)
        rl = T("a range,\nnot a guess", 20, MUTED).next_to(rng_br, RIGHT, buff=0.1)
        self.play(LaggedStart(*[FadeIn(dd, scale=2) for dd in days], lag_ratio=0.05), FadeIn(dl), run_time=1.2)
        self.play(GrowFromCenter(rng_br), FadeIn(rl), run_time=0.5)
        verdicts = VGroup(chip("Handles it · 1-in-10 wait ≤ 15 min", GREEN, size=18), chip("Busy, but it copes · ≤ 40 min", YELLOW, size=18),
                          chip("Struggles", RED, size=18)).arrange(DOWN, buff=0.12, aligned_edge=LEFT).move_to([4.6, -3.0, 0])
        self.play(LaggedStart(*[FadeIn(v, shift=UP * 0.15) for v in verdicts], lag_ratio=0.2), run_time=0.9)
        self.wait(2.6)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)
