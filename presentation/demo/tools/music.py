"""Synthesize a quiet keynote underscore (soft piano + airy pads) into presentation/demo/audio/music.mp3.

    aegis/.venv/bin/python presentation/demo/tools/music.py [--minutes 10]

Used when Eleven Music isn't available on the account. Slow I-V-vi-IV in D major, felt-piano arpeggios,
detuned pads, a convolution reverb. assemble.py ducks it under the voices.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import numpy as np

SR = 44100
DEMO = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(7)


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    f = np.fft.rfftfreq(len(x), 1 / SR)  # gentle 12 dB/oct roll-off, done in the frequency domain
    return np.fft.irfft(np.fft.rfft(x) / (1 + (f / cutoff) ** 2), len(x))


def pad(notes: list[int], dur: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for n in notes:
        for det in (-0.06, 0.0, 0.07):
            f = hz(n + det)
            out += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) + 0.25 * np.sin(4 * np.pi * f * t)
    env = np.minimum(1, t / 2.5) * np.minimum(1, (dur - t) / 2.5)
    return out * env / (len(notes) * 3)


def piano(note: int, dur: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    f = hz(note)
    tone = sum(np.sin(2 * np.pi * f * k * t) * (0.55 ** (k - 1)) * np.exp(-t * (1.2 + 0.9 * k)) for k in range(1, 6))
    attack = np.minimum(1, t / 0.008)
    return tone * attack * 0.5


def reverb(x: np.ndarray, seconds: float = 3.2, mix: float = 0.35) -> np.ndarray:
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.5 / seconds)
    ir = lowpass(ir, 5000)
    wet = np.fft.irfft(np.fft.rfft(x, len(x) + n) * np.fft.rfft(ir, len(x) + n))[: len(x)]
    wet *= np.max(np.abs(x)) / (np.max(np.abs(wet)) + 1e-9)
    return (1 - mix) * x + mix * wet


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=10)
    a = ap.parse_args()
    bar = 4.8  # seconds per chord, about 50 bpm in 4/4
    # D, A, Bm, G (voicings around middle C) and their arpeggio tones
    chords = [[50, 57, 62, 66], [45, 57, 61, 64], [47, 54, 59, 62], [43, 55, 59, 62]]
    arps = [[74, 78, 81, 78], [73, 76, 81, 76], [71, 74, 78, 74], [71, 74, 79, 74]]
    total = int(a.minutes * 60 * SR)
    mix = np.zeros(total + SR * 8)
    i, t0 = 0, 0.0
    while int(t0 * SR) < total:
        c = i % 4
        s = int(t0 * SR)
        p = pad(chords[c], bar + 2.4)
        mix[s:s + len(p)] += 0.22 * p
        # piano: starts sparse, a quiet arpeggio enters after the first phrase
        density = 1 if i < 4 else (2 if i < 12 else 4)
        for k in range(density):
            note = arps[c][k % 4] if density > 1 else arps[c][0]
            on = s + int(k * bar / density * SR)
            pn = piano(note, 4.0) * rng.uniform(0.75, 1.0)
            mix[on:on + len(pn)] += 0.16 * pn
        bass = piano(chords[c][0] - 12, 4.5)
        mix[s:s + len(bass)] += 0.10 * bass
        i += 1
        t0 += bar
    mix = mix[:total]
    mix = lowpass(mix, 7000)
    mix = reverb(mix)
    fade = int(4 * SR)
    mix[:fade] *= np.linspace(0, 1, fade)
    mix[-fade:] *= np.linspace(1, 0, fade)
    mix = mix / np.max(np.abs(mix)) * 0.8
    stereo = np.stack([mix, np.roll(mix, int(0.011 * SR))], axis=1)
    out = DEMO / "audio" / "music.mp3"
    out.parent.mkdir(exist_ok=True)
    pcm = (stereo * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-b:a", "192k", str(out)], input=pcm, check=True)
    print("music bed ->", out)


if __name__ == "__main__":
    main()
