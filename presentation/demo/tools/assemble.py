"""Cut the demo video from script.json: slides, Manim animations, screen recordings and the two voices.

    python presentation/demo/tools/assemble.py                  # full cut  -> out/floorplan-intelligence.mp4
    python presentation/demo/tools/assemble.py --short          # short cut -> out/floorplan-intelligence-short.mp4
    python presentation/demo/tools/assemble.py --draft          # 720p, fast, subtitles burned in, for timing review

Timing: each segment lasts as long as its voices (lines in order, small gaps), or its visual if that is longer.
  slide -> still with a slow push-in
  anim  -> the Manim clip, slowed up to 1.5x if the voices run longer, then its last frame held
  rec   -> the screen recording at its real speed, last frame held; if the recording is missing, the segment's
           "still" screenshot (or a dark card) stands in, marked "recording to come"
Missing voices are replaced by silence of the estimated length, so the cut works before voice.py has run.
Writes an .srt next to the video. Music: audio/music.mp3, if present, is looped and ducked under the voices.
Needs ffmpeg and ffprobe.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import textwrap
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1]
BUILD = DEMO / "out" / "build"
FPS = 30
LEAD, GAP, TAIL = 0.35, 0.28, 0.65
FADE = 0.35


def run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("ffmpeg failed:\n" + " ".join(cmd) + "\n" + r.stderr[-3000:])


def duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def font() -> str:
    for name in ("Inter:style=SemiBold", "Inter", "DejaVu Sans"):
        r = subprocess.run(["fc-match", "-f", "%{file}", name], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout.strip()
    return ""


def esc(t: str) -> str:
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%").replace(",", "\\,")


def textfile(t: str, width: int) -> str:
    """drawtext reads wrapped text from a file, which avoids escaping and allows line breaks."""
    BUILD.mkdir(parents=True, exist_ok=True)
    textfile.n = getattr(textfile, "n", 0) + 1
    f = BUILD / f"text_{textfile.n:04d}.txt"
    f.write_text("\n".join(textwrap.wrap(t, width)))
    return str(f).replace(":", "\\:")


def words(t: str) -> int:
    return len(re.sub(r"\[[^\]]*\]", "", t).split())


def voice_file(seg_id: str, i: int, voice: str) -> Path:
    return DEMO / "voice" / f"{seg_id}_{i:02d}_{voice}.mp3"


def plan_segment(seg: dict) -> dict:
    """Line start times and the segment length."""
    t, lines = LEAD, []
    for i, ln in enumerate(seg["lines"]):
        f = voice_file(seg["id"], i, ln["voice"])
        d = duration(f) if f.exists() else words(ln["text"]) / 2.6 + 0.3
        lines.append({"start": t, "dur": d, "file": f if f.exists() else None, **ln})
        t += d + GAP
    voice_len = t - GAP + TAIL
    vis = DEMO / seg["visual"]["file"]
    kind = seg["visual"]["type"]
    vis_len = duration(vis) if kind in ("anim", "rec") and vis.exists() else 0.0
    if kind == "anim" and vis_len:
        stretch = min(1.5, max(1.0, voice_len / vis_len))
        length = max(voice_len, vis_len * stretch)
    else:
        stretch = 1.0
        length = max(voice_len, vis_len, 2.5)
    return {"lines": lines, "len": round(length, 3), "stretch": stretch, "vis": vis, "vis_ok": vis.exists() or kind == "slide"}


def video_filter(seg: dict, p: dict, W: int, H: int, fnt: str, fade_in: bool, fade_out: bool, subs: bool) -> tuple[list[str], str]:
    kind, L = seg["visual"]["type"], p["len"]
    inputs: list[str]
    chain: list[str] = []
    still = None
    if kind == "slide" or (kind == "rec" and not p["vis"].exists()):
        still = p["vis"] if kind == "slide" else DEMO / seg["visual"].get("still", "")
        if still and still.exists():
            inputs = ["-loop", "1", "-framerate", str(FPS), "-t", f"{L}", "-i", str(still)]
            n = int(L * FPS)
            chain.append(f"scale={W * 2}:{H * 2},zoompan=z='1+0.035*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}")
        else:
            inputs = ["-f", "lavfi", "-t", f"{L}", "-i", f"color=c=0x0E1117:s={W}x{H}:r={FPS}"]
        if kind == "rec" and fnt:
            label = esc("Screen recording to come: " + seg["visual"]["file"])
            chain.append(f"drawbox=x=0:y=0:w=iw:h={int(H * 0.07)}:color=black@0.55:t=fill,"
                         f"drawtext=fontfile='{fnt}':text='{label}':fontcolor=white@0.9:fontsize={int(H * 0.028)}:x=(w-tw)/2:y={int(H * 0.02)}")
    else:
        inputs = ["-i", str(p["vis"])]
        chain.append(f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x0E1117,fps={FPS}")
        if p["stretch"] > 1.001:
            chain.append(f"setpts={p['stretch']:.4f}*PTS")
        chain.append(f"tpad=stop_mode=clone:stop_duration={L}")
        chain.append(f"trim=duration={L},setpts=PTS-STARTPTS")
    if seg.get("caption") and fnt:
        fs = int(H * 0.022)
        chain.append(f"drawtext=fontfile='{fnt}':textfile='{textfile(seg['caption'], 110)}':fontcolor=white@0.92:fontsize={fs}:box=1:boxcolor=black@0.55:boxborderw={int(fs * 0.7)}"
                     f":x=(w-tw)/2:y=h-th-{int(H * 0.05)}:enable='gte(t,0.6)'")
    if subs and fnt:
        for ln in p["lines"]:
            who = "JAMES" if ln["voice"] == "james" else "AVA"
            fs = int(H * 0.026)
            tf = textfile(f"{who}:  " + re.sub(r"\[[^\]]*\]\s*", "", ln["text"]), 80)
            chain.append(f"drawtext=fontfile='{fnt}':textfile='{tf}':line_spacing=6:fontcolor=yellow:fontsize={fs}:box=1:boxcolor=black@0.6:boxborderw=8"
                         f":x=(w-tw)/2:y=h-th-{int(H * 0.13)}:enable='between(t,{ln['start']:.2f},{ln['start'] + ln['dur']:.2f})'")
    if fade_in:
        chain.append(f"fade=t=in:st=0:d={FADE}")
    if fade_out:
        chain.append(f"fade=t=out:st={max(0.0, L - FADE):.3f}:d={FADE}")
    chain.append("format=yuv420p")
    return inputs, ",".join(chain)


def render_segment(k: int, seg: dict, p: dict, a: argparse.Namespace, fnt: str, fade_in: bool, fade_out: bool) -> Path:
    W, H = (1280, 720) if a.draft else (1920, 1080)
    out = BUILD / f"{k:02d}_{seg['id']}.mp4"
    vin, vf = video_filter(seg, p, W, H, fnt, fade_in, fade_out, a.draft or a.subs)
    cmd = ["ffmpeg", "-v", "error", "-y", *vin]
    audio_in, mix = [], []
    for j, ln in enumerate([ln for ln in p["lines"] if ln["file"]]):
        audio_in += ["-i", str(ln["file"])]
        ms = int(ln["start"] * 1000)
        mix.append(f"[{j + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[a{j}]")
    cmd += audio_in + ["-f", "lavfi", "-t", f"{p['len']}", "-i", "anullsrc=r=48000:cl=stereo"]
    silent = len(mix) + 1
    fc = [f"[0:v]{vf}[v]"] + mix
    labels = "".join(f"[a{j}]" for j in range(len(mix))) + f"[{silent}:a]"
    fc.append(f"{labels}amix=inputs={len(mix) + 1}:normalize=0:duration=longest,atrim=0:{p['len']}[a]")
    cmd += ["-filter_complex", ";".join(fc), "-map", "[v]", "-map", "[a]", "-t", f"{p['len']}",
            "-c:v", "libx264", "-preset", "ultrafast" if a.draft else "medium", "-crf", "28" if a.draft else str(a.crf),
            "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(out)]
    run(cmd)
    return out


def srt_time(t: float) -> str:
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s - int(s)) * 1000):03d}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--short", action="store_true", help="only segments marked short: true")
    ap.add_argument("--draft", action="store_true", help="720p, fast, subtitles burned in")
    ap.add_argument("--subs", action="store_true", help="burn subtitles into the final too")
    ap.add_argument("--only", nargs="*", help="segment ids (for checking one part)")
    ap.add_argument("--out", help="output file")
    ap.add_argument("--crf", type=int, default=21, help="x264 quality (higher = smaller); GitHub rejects files over 100 MB")
    a = ap.parse_args()
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg not found")
    script = json.loads((DEMO / "script.json").read_text())
    segs = [s for s in script["segments"] if (not a.short or s.get("short", True)) and (not a.only or s["id"] in a.only)]
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)
    fnt = font()
    name = "floorplan-intelligence" + ("-short" if a.short else "") + ("-draft" if a.draft else "")
    out = Path(a.out) if a.out else DEMO / "out" / f"{name}.mp4"

    parts, srt, t0, missing = [], [], 0.0, []
    for k, seg in enumerate(segs):
        p = plan_segment(seg)
        prev_act = segs[k - 1]["act"] if k else None
        next_act = segs[k + 1]["act"] if k + 1 < len(segs) else None
        part = render_segment(k, seg, p, a, fnt, fade_in=seg["act"] != prev_act, fade_out=seg["act"] != next_act)
        parts.append(part)
        for ln in p["lines"]:
            srt.append((t0 + ln["start"], t0 + ln["start"] + ln["dur"], ("James: " if ln["voice"] == "james" else "Ava: ")
                        + re.sub(r"\[[^\]]*\]\s*", "", ln["text"])))
        if not p["vis"].exists() and seg["visual"]["type"] != "slide":
            missing.append(f"visual {seg['visual']['file']}")
        print(f"{seg['id']:22s} {p['len']:6.1f}s  {'x%.2f' % p['stretch'] if p['stretch'] > 1.001 else '     '}  "
              f"{'' if p['vis'].exists() else '(stand-in)'}", flush=True)
        t0 += p["len"]

    lst = BUILD / "concat.txt"
    lst.write_text("".join(f"file '{x.name}'\n" for x in parts))
    joined = BUILD / "joined.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])

    music = DEMO / "audio" / "music.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    if music.exists():
        fc = ("[1:a]aloop=loop=-1:size=2e9,volume=0.22,aresample=48000[m];"
              "[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];"
              f"[md]afade=t=out:st={max(0, t0 - 3):.2f}:d=3[mf];"
              "[0:a][mf]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[a]")
        run(["ffmpeg", "-v", "error", "-y", "-i", str(joined), "-i", str(music), "-filter_complex", fc,
             "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
    else:
        run(["ffmpeg", "-v", "error", "-y", "-i", str(joined), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
    out.with_suffix(".srt").write_text("".join(f"{i + 1}\n{srt_time(a_)} --> {srt_time(b_)}\n{txt}\n\n" for i, (a_, b_, txt) in enumerate(srt)))
    voices_missing = sum(1 for s in segs for i, ln in enumerate(s["lines"]) if not voice_file(s["id"], i, ln["voice"]).exists())
    vis_missing = [m for m in missing if m.startswith("visual")]
    print(f"\n{out}  {t0 / 60:.1f} min  ({out.stat().st_size / 1e6:.0f} MB)")
    if voices_missing:
        print(f"  {voices_missing} voice line(s) missing: silence stands in (run tools/voice.py)")
    for m in vis_missing:
        print("  stand-in for", m)


if __name__ == "__main__":
    main()
