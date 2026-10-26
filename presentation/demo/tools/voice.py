"""Generate the two narrator voices with ElevenLabs, one MP3 per line, into presentation/demo/voice/.

    export ELEVENLABS_API_KEY=sk_...           # never commit the key
    python presentation/demo/tools/voice.py              # every line that has no MP3 yet
    python presentation/demo/tools/voice.py --force s05_nemotron s07_solver
    python presentation/demo/tools/voice.py --list-models
    python presentation/demo/tools/voice.py --music      # optional: a quiet music bed via Eleven Music

Model: --model auto (default) picks the newest of eleven_v4* > eleven_v3 > eleven_multilingual_v2 that the account
lists. v3/v4 read [audio tags] such as [warmly]; for older models the tags are stripped.
Voices and their settings live in script.json ("voices"). Standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1]
API = "https://api.elevenlabs.io"


def call(method: str, path: str, key: str, body: dict | None = None, accept: str = "application/json") -> bytes:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": accept})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:400]
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** (attempt + 1))
                continue
            raise SystemExit(f"ElevenLabs {e.code} on {path}: {msg}")
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(2 ** (attempt + 1))
                continue
            raise SystemExit(f"Cannot reach {API}: {e}")
    raise SystemExit("unreachable")


def pick_model(key: str, want: str) -> str:
    if want != "auto":
        return want
    ids = [m.get("model_id", "") for m in json.loads(call("GET", "/v1/models", key))]
    for pat in (r"^eleven_v4", r"^eleven_v3$", r"^eleven_v3", r"^eleven_multilingual_v2$"):
        hits = sorted(i for i in ids if re.search(pat, i))
        if hits:
            return hits[-1]
    return "eleven_multilingual_v2"


def supports_tags(model: str) -> bool:
    return bool(re.match(r"eleven_v[34]", model))


def clean(text: str, model: str) -> str:
    return text if supports_tags(model) else re.sub(r"\s*\[[^\]]*\]\s*", " ", text).strip()


def line_path(seg_id: str, i: int, voice: str) -> Path:
    return DEMO / "voice" / f"{seg_id}_{i:02d}_{voice}.mp3"


def settings_for(model: str, s: dict) -> dict:
    s = dict(s)
    if supports_tags(model):  # v3 accepts stability 0.0 (creative), 0.5 (natural) or 1.0 (robust)
        s["stability"] = min((0.0, 0.5, 1.0), key=lambda v: abs(v - s.get("stability", 0.5)))
    return s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("segments", nargs="*", help="segment ids to (re)generate; default all")
    ap.add_argument("--model", default=os.environ.get("ELEVEN_MODEL", "auto"))
    ap.add_argument("--force", action="store_true", help="regenerate even if the MP3 exists")
    ap.add_argument("--list-models", action="store_true")
    ap.add_argument("--music", action="store_true", help="also compose audio/music.mp3 (Eleven Music)")
    a = ap.parse_args()
    key = os.environ.get("ELEVENLABS_API_KEY") or sys.exit("Set ELEVENLABS_API_KEY")

    if a.list_models:
        for m in json.loads(call("GET", "/v1/models", key)):
            print(m.get("model_id"), "-", m.get("name"))
        return

    script = json.loads((DEMO / "script.json").read_text())
    model = pick_model(key, a.model)
    print("model:", model)
    (DEMO / "voice").mkdir(exist_ok=True)
    voices = script["voices"]
    n = 0
    for seg in script["segments"]:
        if a.segments and seg["id"] not in a.segments:
            continue
        for i, line in enumerate(seg["lines"]):
            out = line_path(seg["id"], i, line["voice"])
            if out.exists() and not a.force:
                continue
            v = voices[line["voice"]]
            body = {"text": clean(line["text"], model), "model_id": model, "voice_settings": settings_for(model, v["settings"])}
            audio = call("POST", f"/v1/text-to-speech/{v['voice_id']}?output_format=mp3_44100_128", key, body, accept="audio/mpeg")
            out.write_bytes(audio)
            n += 1
            print(f"  {out.name}  ({len(audio) // 1024} KB)  {line['text'][:60]}")
    print(f"{n} line(s) generated into {DEMO / 'voice'}")

    if a.music:
        (DEMO / "audio").mkdir(exist_ok=True)
        body = {"prompt": "Minimal, warm, modern product-keynote underscore. Soft felt piano and airy synth pads, slow pulse, "
                          "hopeful and confident, no drums at the start, gentle build, no vocals. Sits quietly under narration.",
                "music_length_ms": 180000}
        audio = call("POST", "/v1/music?output_format=mp3_44100_128", key, body, accept="audio/mpeg")
        (DEMO / "audio" / "music.mp3").write_bytes(audio)
        print("music bed -> audio/music.mp3 (assemble.py loops it and ducks it under the voices)")


if __name__ == "__main__":
    main()
