# Runbook for the local agent: finish the demo video

Goal: `presentation/demo/out/floorplan-intelligence.mp4`, a keynote-style video with two voices (James, British male; Ava, American female) talking to each other, built from the slides, Manim animations and screen recordings already in this folder. Read [README.md](README.md) for the story and the file map. Everything is driven by `script.json`.

Work from the repo root on a machine with a GPU and Chrome (a Mac is ideal). Paths below are relative to the repo root.

## 0. Prerequisites

```bash
make setup                       # Python 3.12 venv for aegis + npm install for viz
brew install ffmpeg              # or apt; ffmpeg and ffprobe must be on PATH
npm i -g playwright@1 && npx playwright install chromium     # the recorder uses the global Playwright
# Manim is only needed to re-render animations (already rendered in animations/mp4):
#   python3 -m venv .mvenv && .mvenv/bin/pip install manim   (needs pango and cairo: brew install pango)
```

`presentation/demo/tools/lib.mjs` loads Playwright with `require('playwright')`. If yours is installed somewhere else, set `NODE_PATH` to its `node_modules`.

## 1. Run the app

```bash
make dev                         # builds viz, serves app + API on http://127.0.0.1:8000 (clinic) and /datacenter
```

Leave it running in its own terminal. Check that `curl -s 127.0.0.1:8000/api/health` returns `healthy`. If the local Nemotron GGUF is present, generation takes about 47 s per request. For the recording, start the server **without** the model (or move the GGUF away) so "Generate 3 plans" answers in about 0.5 s. The video carries a caption saying the recording is model-off.

## 2. Screen recordings → `presentation/demo/recordings/`

```bash
node presentation/demo/tools/record.mjs                      # all 11 shots, headless, real GPU (WebGPU)
HEADED=1 CHROME_CHANNEL=chrome node presentation/demo/tools/record.mjs clinic_edit   # one shot, visible, in real Chrome
```

Each shot opens a fresh page, does its setup off-camera (`prep`), then records the action (`act`) with a visible cursor, click ripples and typed text. Frames come from a CDP screencast (JPEG q95) and are encoded to 1920×1080, 30 fps H.264.

Check every file and re-record any that look wrong. The assembler plays recordings at their real speed and holds the last frame if a recording is shorter than its dialogue. If a recording is much longer than its dialogue, trim it (`ffmpeg -ss A -to B -i in.mp4 -c:v libx264 -crf 18 out.mp4`) or shorten waits in `record.mjs`.

| File | Show (in order) | Dialogue ≈ |
|---|---|---|
| `clinic_generate.mp4` | Import step. Type the brief (6 exam rooms, nurse station, ADA restroom, clean/soiled utility), click **Generate 3 plans**, rest the cursor on Candidate 1 "9 of 9 checks pass". | 13 s |
| `clinic_review.mp4` | **Open this plan** → **Next: Review**. Orbit the 3D slowly, then **Guided tour** for two stops. | 14 s |
| `clinic_simulate.mp4` | **Next: Simulate**, tap **Flu-season Monday**, **Run 20 days**, then the verdict and bottleneck with the 3D playing the day. | 14 s |
| `clinic_assistant.mp4` | Results visible. Open **Assistant**, type "What if we add a nurse?", and let it run and answer. | 16 s |
| `clinic_compare.mp4` | Ask "Compare the layouts" and the table opens. | 7 s |
| `clinic_edit.mp4` | **Edit plan** → ask the plan generator "Make the waiting room 20% bigger, keep the restrooms fixed" → new version. Then "Make the waiting room 250% bigger" → rooms turn red with the reason. | 19 s |
| `clinic_export.mp4` | **Looks good: finalize** → Export page → **Download .zip**. | 8 s |
| `dc_design.mp4` | `/datacenter`: type "20 MW AI factory, liquid cooled, N+1 cooling, 2N power", Enter. Three designs appear; orbit; lenses **Power**, **Heat**, **Backup**. | 25 s |
| `dc_test.mp4` | **Test this design** → **The grid goes down** → **Worst day** (red racks) → ask the assistant "Why?" | 16 s |
| `dc_cost.mp4` | **Cost** step: build bar, Sankey; ask "Electricity at 15 cents" and watch it recompute. | 12 s |
| `dc_export.mp4` | Design panel → **OpenUSD for Omniverse** (download starts). Make sure the "Room layout proven by CP-SAT" card is visible. | 7 s |

If a selector in `record.mjs` no longer matches, read `presentation/demo/tools/screenshots.mjs` and `viz/index.html` for the ids, or find the button by its visible text. Don't change the app to make a shot work.

Optional: re-shoot the clinic stills with the current look (`node presentation/demo/tools/screenshots.mjs clinic`). The clinic stills in `screenshots/` are stand-ins copied from `viz/docs/screenshots`.

GIFs (for the README or a submission page), e.g.:

```bash
for f in clinic_simulate dc_test; do
  ffmpeg -y -i presentation/demo/recordings/$f.mp4 -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" presentation/demo/recordings/$f.gif
done
```

## 3. Voices → `presentation/demo/voice/`

```bash
export ELEVENLABS_API_KEY=sk_...           # the key from the chat; never commit it (consider rotating it, it was pasted in chat)
python3 presentation/demo/tools/voice.py --list-models     # confirm eleven_v3 (or a v4) is available
python3 presentation/demo/tools/voice.py                   # one MP3 per line, ~95 lines; skips files that exist
python3 presentation/demo/tools/voice.py --music           # optional: a quiet keynote music bed (Eleven Music)
```

- Voices are set in `script.json → voices`: **James = George** (`JBFqnCBsd6RMkjVDRZzb`, warm British) and **Ava = Sarah** (`EXAVITQu4vr4xnSDxMaL`, American). To try others (e.g. Daniel `onwK4e9ZLuTAKqWW03F9` for James, Jessica `cgSgspJ2msm6clMCkdW9` for Ava), change the ids and run `voice.py --force`.
- `--model auto` picks `eleven_v4*` when the account lists it, then `eleven_v3`. v3 reads the `[warmly]`, `[excited]`, `[laughs]` tags; for older models they're stripped.
- Listen to a few lines first (`s05_nemotron_*`, `s07_solver_*`). Fix pronunciation by editing the text in `script.json` (e.g. "llama-C-P-P", "Q-LoRA"), then `voice.py --force <segment id>`.

## 4. Cut the video

```bash
python3 presentation/demo/tools/assemble.py --draft          # 720p, subtitles burned in: check timing and sync
python3 presentation/demo/tools/assemble.py                  # full cut  → presentation/demo/out/floorplan-intelligence.mp4 (+ .srt)
python3 presentation/demo/tools/assemble.py --short          # short cut → …-short.mp4
python3 presentation/demo/tools/assemble.py --only s19_dc_design s21_dc_test --draft   # check one part
```

The assembler prints each segment's length and whether it used a stand-in. When you're done, no line should say "(stand-in)" and no voice lines should be missing.

Review checklist (watch the whole thing):
- Voices alternate naturally, and no line overlaps the next (spacing: `LEAD`, `GAP`, `TAIL` in `assemble.py`).
- Each animation beat lands roughly on its words. Animations are slowed up to 1.5× to fit. If one still sits on a held frame too long, add `self.wait(...)` in `animations/scenes.py` and re-render it (`python presentation/demo/animations/render_all.py Nemotron`).
- Recordings: no long dead waits, and the cursor stays visible.
- The model-off caption shows on the clinic generation shot.
- The file must be under **100 MB** for GitHub. If it's larger, re-run with `--crf 24` (or 26), or track `presentation/demo/out/*.mp4` with Git LFS.

## 5. Commit

```bash
git add presentation/demo/recordings presentation/demo/voice presentation/demo/out/*.mp4 presentation/demo/out/*.srt presentation/demo/audio
git commit -m "docs(demo): recordings, voices and the final cut"
git push
```

Never commit the API key. `out/build/` and `animations/build/` are ignored.

## Rules (from presentation/README.md)

Quote only numbers from `presentation/11-key-numbers.md`. Say "passes N implemented checks", never "code-compliant"; "thermal estimate", never "CFD"; costs are planning estimates.
