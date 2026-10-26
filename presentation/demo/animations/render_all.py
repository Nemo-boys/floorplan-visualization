"""Render every explainer at 1920x1080, 30 fps, into animations/mp4/.

    python render_all.py               # all scenes, 4 at a time
    python render_all.py Solver Grammar
    python render_all.py --draft       # 480p previews into animations/mp4-draft/
Needs manim (pip install manim) with Pango and Cairo, plus the Inter font.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCENES = ["Opening", "Problem", "Pipeline", "Nemotron", "Grammar", "Solver", "PlanTo3D", "ClinicSim", "SameEngine", "Redundancy"]


def render(name: str, draft: bool) -> str:
    media = HERE / "build"
    q = ["-ql"] if draft else ["-r", "1920,1080", "--fps", "30"]
    cmd = [sys.executable, "-m", "manim", *q, "--media_dir", str(media), "--disable_caching", "scenes.py", name]
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    if r.returncode:
        return f"{name}: FAILED\n{r.stdout[-2500:]}\n{r.stderr[-2500:]}"
    sub = "480p15" if draft else "1080p30"
    out = HERE / ("mp4-draft" if draft else "mp4")
    out.mkdir(exist_ok=True)
    shutil.copy(media / "videos" / "scenes" / sub / f"{name}.mp4", out / f"{name}.mp4")
    return f"{name}: ok"


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or SCENES
    draft = "--draft" in sys.argv
    with ThreadPoolExecutor(max_workers=4) as ex:
        for line in ex.map(lambda n: render(n, draft), names):
            print(line, flush=True)
