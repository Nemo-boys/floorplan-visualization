# Demo video: Floorplan Intelligence

A keynote-style video for the **Nebius × NVIDIA Global AI Hackathon 2026**, presented by **Venu Arvind** and **Sarvesh Arunachalam M**. Two narrators talk to each other: **James** (British, lead) and **Ava** (American). They go deep on the technology first, then demo the clinic and the data center, then cover results and use cases.

**To finish the video, follow [AGENT.md](AGENT.md).** It covers recordings, voices and the final cut.

## The story (script.json)

| # | Segment | Visual | Short cut |
|---|---|---|---|
| 1 | Opening: every building starts with a sentence | Manim `Opening` | ✓ |
| 2 | Title: Floorplan Intelligence | slide `01-title` | ✓ |
| 3 | Problem: LLMs hallucinate geometry, solvers can't read | Manim `Problem` | ✓ |
| 4 | The idea: split the work (Nemotron → CP-SAT → checker → browser) | Manim `Pipeline` | ✓ |
| 5 | Nemotron Nano 9B v2: hybrid Mamba-2, QLoRA, GRPO with 4 verifiable rewards | Manim `Nemotron` | ✓ |
| 6 | Grammar-constrained decoding, and the honest finding: program-first | Manim `Grammar` | ✓ |
| 7 | CP-SAT: NoOverlap2D, locks, minimal moves, infeasibility proof | Manim `Solver` | ✓ |
| 8 | Nine cited rules | slide `05-checks` | |
| 9 | Rooms + doors → walls, windows, walkable grid, A*, 3D | Manim `PlanTo3D` | |
| 10 | Discrete-event clinic simulation, seeded, 20 days | Manim `ClinicSim` | |
| 11 | The amount of work: LOC, 210 tests, engines | slide `06-engineering` | ✓ |
| 12 | "Enough diagrams. Let's see it." | slide `07-demo-clinic` | |
| 13–19 | **Clinic demo:** generate, review/tour, simulate flu day, assistant, compare, edit (+ impossible), export | recordings `clinic_*` | mostly ✓ |
| 20 | Same model, same solver, same viewer: a different building | Manim `SameEngine` | ✓ |
| 21 | **Data center demo:** brief → 3 designs, CP-SAT proof, lenses | recording `dc_design` | ✓ |
| 22 | N+1 capacity arithmetic + SOR thermal estimate | Manim `Redundancy` | |
| 23–25 | Break it (grid down, worst day), cost and Sankey, OpenUSD | recordings `dc_*` | ✓ / ✓ / |
| 26 | Measured numbers | slide `10-numbers` | ✓ |
| 27 | Use cases and next domain packs | slide `11-use-cases` | ✓ |
| 28 | Close | slide `12-closing` | ✓ |

Estimated length: **about 8.6 min** for the full cut and **about 6.7 min** for `--short`. The real length comes from the generated voices. To get shorter, flip `"short"` on more segments or trim lines in `script.json`.

All numbers come from [`../11-key-numbers.md`](../11-key-numbers.md). The clinic generation recording is made with the model off, and an on-screen caption says so.

## What's in this folder

| Path | What | Status |
|---|---|---|
| `script.json` | The single source: segments, both voices' lines, visuals, captions, short-cut flags, ElevenLabs voice ids | done |
| `animations/scenes.py`, `common.py` | 10 Manim scenes (3Blue1Brown style, Inter, dark) | done |
| `animations/mp4/*.mp4` | Rendered at 1920×1080, 30 fps | done |
| `animations/render_all.py` | Re-render all or some scenes (`--draft` for 480p) | done |
| `slides/slides.mjs` → `slides/png/*.png` | 12 keynote slides (title, problem, idea, model, checks, engineering, demo dividers, both apps, numbers, use cases, closing) | done |
| `screenshots/*.png` | App stills (data center: all real; clinic: stand-ins copied from `viz/docs/screenshots`, re-shoot with `tools/screenshots.mjs`) | partial |
| `tools/record.mjs` | Scripted screen recordings with a visible cursor, CDP screencast → MP4 | written; smoke-tested in the container (works, but the container has no GPU) |
| `recordings/` | The 11 screen recordings | **to do (local)** |
| `tools/voice.py` | ElevenLabs TTS, two voices, `eleven_v3` (or v4 when listed), optional music bed | written; not run (ElevenLabs was blocked in the cloud container) |
| `voice/` | One MP3 per line | **to do (local)** |
| `tools/assemble.py` | ffmpeg cut: timing from the voices, slow push-in on slides, gentle slow-down of animations, captions, fades between acts, SRT, music ducking, loudness | done; tested |
| `out/floorplan-intelligence-draft.mp4` | Silent 720p draft with subtitles burned in, made from stand-ins (for timing review) | done |
| `out/floorplan-intelligence.mp4` | **The final video** | **to do (local)** |

## Work log (cloud session, 2026-10-26)

- Read the whole repo and `presentation/`, and wrote the two-voice keynote script with a deep-tech act and the clinic and data center demos.
- Built and rendered 10 Manim explainers. The data behind them is real where it matters: A* paths and nurse-walk distances computed on the illustrated plan, a seeded mini discrete-event simulation for the Gantt chart, and a red-black SOR solve for the thermal field, calibrated like the studio (warmest inlet 25 °C).
- Rendered 12 slides in Apple-keynote dark style with Inter.
- Captured Data Center Studio screenshots (describe, design, power, backup, test, worst day, cost, export).
- Wrote the recorder, the voice generator and the assembler, and cut a silent draft.
- Not done here: the screen recordings (this container renders WebGL at about 1 fps with no GPU) and the voices (`api.elevenlabs.io` was blocked by the container's network policy). Both run locally; see AGENT.md.
