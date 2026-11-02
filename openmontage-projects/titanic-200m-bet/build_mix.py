"""Original score + SFX + final mix for titanic-200m-bet.

Everything is synthesized here (no samples, no film music), so the soundtrack is
original and free of Content-ID matches. Mood changes per act.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
SR = 48000
rng = np.random.default_rng(1912)
T = json.loads((ROOT / "artifacts/timing.json").read_text())
DUR = T["durationInFrames"] / T["fps"]
N = int(DUR * SR) + SR
SEGS = T["segments"]
LEAD = 0.45  # keep in sync with src/Composition.tsx


def ta(d):
    return np.arange(int(d * SR)) / SR


def place(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        x = np.stack([x * l, x * r], 1)
    if i >= len(buf) or i + len(x) <= 0:
        return
    j = min(len(buf), i + len(x))
    buf[max(0, i):j] += x[max(0, -i):j - i] * gain


def filt(x, kind, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype=kind, fs=SR, output="sos"), x)


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


noise = lambda d: rng.standard_normal(int(d * SR))

# ------------------------------------------------------------------ instruments
def marimba(m, d=0.5):
    f, t = mtof(m), ta(d)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.14) + 0.25 * np.sin(2 * np.pi * 3.93 * f * t) * np.exp(-t / 0.03)) * np.minimum(1, t / 0.002)


def piano(m, d=2.0):
    f, t = mtof(m), ta(d)
    x = sum(np.sin(2 * np.pi * k * f * t * (1 + 0.0004 * k)) * np.exp(-t * (0.9 + 1.2 * k)) / k ** 1.1 for k in range(1, 7))
    return x * np.minimum(1, t / 0.003) * 0.6


def pluck(m, d=0.35):
    f, t = mtof(m), ta(d)
    x = sum(np.sin(2 * np.pi * k * f * t) / k * np.exp(-t * (8 + 6 * k)) for k in range(1, 6))
    return x * np.minimum(1, t / 0.002)


def bass(m, d=0.3):
    f, t = mtof(m), ta(d)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05)
    return np.tanh(1.5 * x * np.exp(-t / 0.25) * np.minimum(1, t / 0.004) * np.minimum(1, (d - t) / 0.01))


def pad(ms, d, bright=1500):
    t = ta(d)
    x = sum(np.sin(2 * np.pi * mtof(m) * (1 + dt) * t) + 0.3 * np.sin(4 * np.pi * mtof(m) * (1 + dt) * t) for m in ms for dt in (-0.003, 0.0, 0.003))
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
    return filt(x, "low", bright) * env / (3 * len(ms))


def kick(d=0.35):
    t = ta(d)
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(48 + 110 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.16))


def snare(d=0.22):
    t = ta(d)
    return filt(noise(d), "band", [900, 4000]) * np.exp(-t / 0.06) * 0.6 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04) * 0.4


def hat(d=0.05):
    t = ta(d)
    return filt(noise(d), "high", 7000) * np.exp(-t / 0.015)


# ------------------------------------------------------------------ moods
MOODS = {
    #           bpm   chords (root, triad)                                                     style
    "mystery": (70, [(38, [62, 65, 69]), (34, [58, 62, 65]), (41, [60, 65, 69]), (36, [60, 64, 67])], "mystery"),
    "curious": (96, [(38, [62, 65, 69]), (34, [58, 62, 65]), (41, [60, 65, 69]), (36, [60, 64, 67])], "curious"),
    "deep":    (60, [(38, [62, 65, 69]), (43, [62, 67, 70]), (34, [58, 62, 65]), (33, [57, 61, 64])], "deep"),
    "tension": (120, [(45, [57, 60, 64]), (41, [57, 60, 65]), (43, [59, 62, 67]), (40, [56, 59, 64])], "tension"),
    "voyage":  (84, [(36, [60, 64, 67]), (41, [60, 65, 69]), (45, [60, 64, 69]), (43, [59, 62, 67])], "voyage"),
    "somber":  (66, [(45, [57, 60, 64]), (41, [57, 60, 65]), (36, [55, 60, 64]), (43, [55, 59, 62])], "somber"),
    "triumph": (112, [(36, [60, 64, 67]), (43, [59, 62, 67]), (45, [57, 60, 64]), (41, [57, 60, 65])], "triumph"),
    "groove":  (100, [(41, [57, 60, 65]), (36, [55, 60, 64]), (38, [57, 62, 65]), (34, [58, 62, 65])], "groove"),
    "quirky":  (110, [(41, [57, 60, 65]), (36, [55, 60, 64]), (38, [57, 62, 65]), (34, [58, 62, 65])], "quirky"),
}
KIND_MOOD = {"cold": "mystery", "pitch": "curious", "dive": "deep", "build": "tension", "money": "tension", "headlines": "tension",
             "voyage": "voyage", "lifeboats": "somber", "sinking": "somber", "compare": "somber", "boxoffice": "triumph",
             "oscars": "triumph", "reasons": "groove", "flaws": "quirky", "door": "curious", "verdict": "triumph"}


def render_mood(mood, d):
    bpm, chords, style = MOODS[mood]
    beat = 60 / bpm
    bar = 4 * beat
    out = np.zeros((int(d * SR) + SR * 3, 2))
    nb = int(np.ceil(d / bar))
    for b in range(nb):
        t0 = b * bar
        root, tri = chords[b % 4]
        tones = tri + [tri[0] + 12, tri[1] + 12]
        if style in ("mystery", "deep", "somber", "voyage"):
            place(out, pad([n - 12 for n in tri], bar + 0.6, 900 if style != "voyage" else 1600), t0, 0.5)
        if style == "mystery":
            for k in range(2):
                place(out, kick(), t0 + k * 2 * beat, 0.35); place(out, kick(), t0 + k * 2 * beat + 0.18, 0.2)  # heartbeat
            place(out, piano(tri[0] + 12, 3), t0, 0.12, pan=0.2)
        elif style == "deep":
            place(out, piano(tri[2] + 12, 4), t0 + beat, 0.08, pan=-0.3)
        elif style == "somber":
            for e, k in enumerate([0, 2, 1, 2]):
                place(out, piano(tones[k], 2.5), t0 + e * beat, 0.11 if e else 0.15, pan=0.15)
            place(out, piano(root, 4), t0, 0.12)
        elif style == "voyage":
            for e in range(8):
                place(out, marimba(tones[[0, 1, 2, 3, 2, 1, 4, 2][e]] + 12), t0 + e * beat / 2, 0.06, pan=0.3)
            place(out, bass(root, beat * 2), t0, 0.15); place(out, bass(root + 7, beat * 2), t0 + 2 * beat, 0.12)
        elif style == "curious":
            for e in range(8):
                if e % 3 != 2:
                    place(out, pluck(tones[[0, 2, 1, 3, 2, 4, 1, 2][e]] + 12), t0 + e * beat / 2, 0.12, pan=0.25)
            place(out, bass(root, beat), t0, 0.2); place(out, bass(root, beat), t0 + 2.5 * beat, 0.16)
            for k in range(4):
                place(out, hat(), t0 + k * beat + beat / 2, 0.05, pan=0.4)
            place(out, pad([n - 12 for n in tri], bar + 0.4, 1200), t0, 0.22)
        elif style == "tension":
            for e in range(8):
                place(out, bass(root + (12 if e % 4 == 3 else 0), beat / 2), t0 + e * beat / 2, 0.24)
            for k in range(4):
                place(out, kick(), t0 + k * beat, 0.4)
                place(out, hat(), t0 + k * beat + beat / 2, 0.09, pan=0.4)
            place(out, snare(), t0 + 3 * beat, 0.18)
            for e in range(16):
                if e % 2 == 0:
                    place(out, pluck(tones[[0, 1, 2, 1][e // 2 % 4]] + 12, 0.2), t0 + e * beat / 4, 0.07, pan=-0.3)
            place(out, pad([n - 12 for n in tri], bar + 0.4, 1000), t0, 0.25)
        elif style in ("triumph", "groove"):
            for i, k in enumerate([0, 1, 2, 3, 2, 1, 4, 3, 0, 1, 2, 3, 4, 3, 2, 1]):
                place(out, marimba(tones[k] + 12), t0 + i * beat / 4, 0.08 if i % 4 else 0.12, pan=0.3)
            for k in range(4):
                place(out, kick(), t0 + k * beat, 0.45 if style == "triumph" else 0.35)
                if k in (1, 3):
                    place(out, snare(), t0 + k * beat, 0.22)
                place(out, hat(), t0 + k * beat + beat / 2, 0.09, pan=0.45)
            for e, off in enumerate([0, 0, 12, 0, 7, 0, 12, 7]):
                place(out, bass(root + off, beat / 2), t0 + e * beat / 2, 0.24 if e % 2 == 0 else 0.16)
            place(out, pad([n - 12 for n in tri], bar + 0.4, 1800), t0, 0.28)
        elif style == "quirky":
            for e in range(8):
                if e in (0, 3, 4, 6):
                    place(out, pluck(tones[[0, 2, 4, 1][e % 4]] + 12, 0.15), t0 + e * beat / 2, 0.16, pan=0.3)
            for k in range(4):
                place(out, bass(root + (7 if k % 2 else 0), beat * 0.4), t0 + k * beat, 0.24)
                place(out, hat(), t0 + k * beat + beat / 2, 0.06)
            place(out, snare(0.1), t0 + 3 * beat + beat / 2, 0.1)
    return out[: int(d * SR)]


music = np.zeros((N, 2))
for i, s in enumerate(SEGS):
    if s["kind"] == "title":
        continue
    t0 = 0 if i == 0 else s["start"] - LEAD
    # extend this mood across a following title card
    j = i + 1
    while j < len(SEGS) and SEGS[j]["kind"] == "title":
        j += 1
    nxt = SEGS[i + 1]["start"] - LEAD if i + 1 < len(SEGS) else DUR
    t1 = nxt if (i + 1 < len(SEGS) and SEGS[i + 1]["kind"] != "title") else nxt + 0.6
    clip = render_mood(KIND_MOOD[s["kind"]], t1 - t0 + 0.6)
    fade = np.ones(len(clip)); fi = int(0.5 * SR)
    fade[:fi] = np.linspace(0, 1, fi); fade[-fi:] = np.linspace(1, 0, fi)
    place(music, clip * fade[:, None], t0)

# ------------------------------------------------------------------ SFX bank
def whoosh(d=0.45, f0=300, f1=2600):
    t = ta(d); n = noise(d); out = np.zeros_like(n); blk = 256
    for s0 in range(0, len(n), blk):
        fc = f0 * (f1 / f0) ** (s0 / len(n))
        seg = filt(n[max(0, s0 - 2048):s0 + blk], "band", [fc / 1.6, min(fc * 1.6, SR / 2 - 100)])
        out[s0:s0 + blk] = seg[-len(n[s0:s0 + blk]):]
    return out * np.sin(np.pi * t / d) ** 2


def boom(d=1.2):
    t = ta(d)
    return np.tanh(2.2 * np.sin(2 * np.pi * (38 + 80 * np.exp(-t / 0.05)) * t) * np.exp(-t / 0.35)) + 0.3 * filt(noise(d), "low", 700) * np.exp(-t / 0.12)


def riser(d=1.2):
    t = ta(d)
    return filt(noise(d), "high", 1500) * (t / d) ** 2.5


def ching():
    t = ta(1.0)
    bell = lambda f, st: np.where(t >= st, np.sin(2 * np.pi * f * (t - st)) * np.exp(-(t - st) / 0.35), 0)
    return 0.4 * filt(noise(1.0), "band", [1500, 7000]) * np.exp(-t / 0.02) + 0.45 * (bell(2093, 0.06) + 0.6 * bell(4186, 0.06) + bell(2637, 0.18))


def thud():
    t = ta(0.35)
    return np.sin(2 * np.pi * (55 + 60 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.1) + 0.2 * filt(noise(0.35), "band", [1500, 5000]) * np.exp(-t / 0.01)


def pop(f0=350, f1=1100, d=0.09):
    t = ta(d)
    return np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** (t / d)) / SR) * np.exp(-t / 0.03)


def horn(d=2.6):
    t = ta(d)
    x = sum(np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t) for f in (98, 123.5, 147))
    env = np.minimum(1, t / 0.25) * np.minimum(1, (d - t) / 0.5)
    return filt(x, "low", 700) * env * 0.25


def sonar():
    t = ta(2.0)
    p = np.sin(2 * np.pi * 1150 * t) * np.exp(-t / 0.5)
    e = np.zeros_like(p); k = int(0.45 * SR); e[k:] = p[:-k] * 0.35
    return p + e


def creak(d=1.2):
    t = ta(d)
    f = 120 + 60 * np.sin(2 * np.pi * 0.8 * t) + 30 * np.sin(2 * np.pi * 7 * t)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 23 * t))
    return filt(x, "band", [200, 1800]) * np.sin(np.pi * t / d) * 0.5


def crash(d=1.6):
    t = ta(d)
    return 0.8 * boom(d) + 0.6 * filt(noise(d), "band", [600, 6000]) * np.exp(-t / 0.25) + 0.4 * creak(d)


def crowd(d=3.0, cheer=False):
    t = ta(d)
    x = filt(noise(d), "band", [300, 3000]) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t + rng.uniform(0, 6)))
    env = np.minimum(1, t / (0.4 if cheer else 1.0)) * np.minimum(1, (d - t) / 0.8)
    return x * env * (0.5 if cheer else 0.25)


def applause(d=3.0):
    out = np.zeros(int(d * SR))
    for _ in range(int(d * 60)):
        i = int(rng.uniform(0, d - 0.02) * SR); cl = filt(noise(0.015), "band", [1000, 6000]) * np.exp(-ta(0.015) / 0.003)
        out[i:i + len(cl)] += cl * rng.uniform(0.3, 1)
    return out * np.minimum(1, ta(d) / 0.5) * np.minimum(1, (d - ta(d)) / 1.0) * 0.5


def drumroll(d=1.2):
    out = np.zeros(int(d * SR)); k = 0.0
    while k < d - 0.05:
        place_i = int(k * SR); s = snare(0.08)
        out[place_i:place_i + len(s)] += s[: len(out) - place_i] * (0.3 + 0.7 * k / d)
        k += 0.045
    return out


def tick():
    return filt(noise(0.02), "band", [2500, 6000]) * np.exp(-ta(0.02) / 0.004)


def splash(d=0.9):
    t = ta(d)
    return filt(noise(d), "low", 2500) * np.exp(-t / 0.25) + 0.4 * np.sin(2 * np.pi * 80 * t) * np.exp(-t / 0.08)


def heartbeat():
    return np.concatenate([kick(0.2) * 0.8, np.zeros(int(0.08 * SR)), kick(0.3) * 0.6])


def bubbles(d=1.5):
    out = np.zeros(int(d * SR))
    for _ in range(14):
        i = int(rng.uniform(0, d - 0.1) * SR); b = pop(rng.uniform(300, 700), rng.uniform(900, 1600), 0.06)
        out[i:i + len(b)] += b * rng.uniform(0.2, 0.6)
    return out


sfx = np.zeros((N, 2))
S = {s["id"]: s for s in SEGS}
st = lambda sid, k: S[sid]["sentences"][min(k, len(S[sid]["sentences"]) - 1)]["start"]

for i, s in enumerate(SEGS):
    t0 = 0 if i == 0 else s["start"] - LEAD
    if i > 0:
        place(sfx, whoosh(), t0 - 0.15, 0.35)
    if s["kind"] == "title":
        place(sfx, riser(), t0 - 1.1, 0.25)
        place(sfx, boom(), t0 + 0.1, 0.6)

# cold open
place(sfx, horn(), 1.0, 0.5)
place(sfx, boom(), st("cold", 1), 0.55)
place(sfx, pop(), st("cold", 2), 0.3, -0.4); place(sfx, pop(), st("cold", 2) + 1.4, 0.3, 0.4)
place(sfx, whoosh(0.35, 1500, 300), st("cold", 3), 0.3); place(sfx, ching(), st("cold", 3) + 0.35, 0.4, 0.4)
place(sfx, boom(), st("cold", 4), 0.45); place(sfx, boom(), st("cold", 4) + 1.2, 0.45)
# pitch
for d in (0, 1.6, 2.6):
    place(sfx, pop(600, 1400, 0.06), st("pitch", 1) + d, 0.2)
for k in range(4):
    place(sfx, thud(), st("pitch", 4) + 1.5 + k * 1.3 + 0.5, 0.35)
place(sfx, boom(0.8), st("pitch", 7) + 0.4, 0.5); place(sfx, ching(), st("pitch", 7) + 0.5, 0.3)
# dive
k = st("dive", 0)
while k < st("dive", 4) + 3:
    place(sfx, sonar(), k, 0.12, 0.3); k += 3.2
place(sfx, bubbles(2.5), st("dive", 0), 0.25)
for j in range(12):
    place(sfx, tick(), st("dive", 2) + 0.6 + j * 0.12, 0.4)
# build
place(sfx, filt(noise(3.5), "low", 600) * np.minimum(1, ta(3.5) / 0.5) * 0.6, st("build", 2), 0.4)
for d in [0, 0.8] + [1.5 + j * 0.35 for j in range(4)]:
    place(sfx, thud(), st("build", 3) + d + 0.4, 0.45); place(sfx, ching(), st("build", 3) + d + 0.42, 0.05)
place(sfx, boom(0.8), st("build", 4) + 0.2, 0.45)
for j in range(3):
    place(sfx, pop(), st("build", 5) + 1.6 + j * 0.6, 0.3)
# money
for d in (0, 1.6, 3.2):
    place(sfx, ching(), st("money", 1) + d + 0.4, 0.35)
place(sfx, boom(0.8), st("money", 1) + 3.4, 0.5)
place(sfx, whoosh(1.2, 200, 900), st("money", 2), 0.3)
place(sfx, boom(0.8), st("money", 4) + 2.6, 0.5)
# headlines
for j in range(18):
    place(sfx, tick(), st("headlines", 0) + j * 0.07, 0.25)
place(sfx, boom(0.8), st("headlines", 1) + 2.4, 0.5)
for j in range(3):
    place(sfx, whoosh(0.4, 600, 3000), st("headlines", 2) + j * 1.1, 0.3)
place(sfx, crash(1.0), st("headlines", 4) + 1.5, 0.35)
# voyage
place(sfx, horn(3.0), st("voyage", 1) + 1.2, 0.45)
place(sfx, sonar(), st("voyage", 4) + 1.4, 0.2)
# lifeboats
place(sfx, boom(0.8), st("lifeboats", 4) + 1.0, 0.45)
# sinking
place(sfx, crash(2.2), st("sinking", 0) + 0.6, 0.85)
place(sfx, creak(2.5), st("sinking", 1), 0.4); place(sfx, creak(2.5), st("sinking", 2), 0.45)
place(sfx, crash(2.5), st("sinking", 3), 0.8)
place(sfx, splash(2.0), st("sinking", 4), 0.4)
place(sfx, piano(84, 3) + piano(88, 3), st("sinking", 5), 0.12)
# compare
place(sfx, ching(), st("compare", 3) + 1.6, 0.35); place(sfx, boom(0.8), st("compare", 3) + 2.4, 0.45)
# box office
place(sfx, crowd(4.0), st("boxoffice", 0), 0.6)
place(sfx, boom(0.8), st("boxoffice", 2) + 1.4, 0.45)
for j in range(15):
    place(sfx, pop(400, 1200, 0.07), st("boxoffice", 6) + 0.6 + j * 0.22, 0.25, -0.5 + j / 15)
place(sfx, riser(2.5), st("boxoffice", 7) + 0.5, 0.25)
for j in range(6):
    place(sfx, boom(0.6) * 0.4 + filt(noise(0.6), "high", 2000) * np.exp(-ta(0.6) / 0.2), st("boxoffice", 7) + 2.4 + j * 0.25, 0.3, -0.6 + 0.24 * j)
place(sfx, crowd(3.5, cheer=True), st("boxoffice", 7) + 2.6, 0.7)
place(sfx, ching(), st("boxoffice", 8) + 1.0, 0.35)
# oscars
place(sfx, drumroll(1.2), st("oscars", 1), 0.35)
for j in range(11):
    place(sfx, ching() * 0.5, st("oscars", 1) + 1.2 + j * 0.22, 0.25, -0.6 + j * 0.12)
place(sfx, applause(3.5), st("oscars", 1) + 1.4, 0.6)
place(sfx, applause(3.0), st("oscars", 4) + 0.3, 0.5)
# reasons
for j in range(10):
    place(sfx, tick(), st("reasons", 2) + j * 0.83, 0.5)
place(sfx, filt(noise(3.5), "low", 500) * np.minimum(1, ta(3.5)), st("reasons", 4) + 2.5, 0.3)
for j in range(4):
    place(sfx, heartbeat(), st("reasons", 6) + 2.6 + j * 0.9, 0.5)
# flaws
for k in (1, 2, 3):
    place(sfx, pop(), st("flaws", k), 0.3)
place(sfx, whoosh(1.0, 400, 3000), st("flaws", 5), 0.3)
# door
place(sfx, creak(1.5), st("door", 2), 0.3)
for j in range(4):
    place(sfx, pop(), st("door", 4) + j * 0.6, 0.25)
place(sfx, splash(), st("door", 6) + 2.4, 0.45)
place(sfx, boom(0.8), st("door", 9), 0.4)
# verdict
place(sfx, ching(), st("verdict", 2) + 0.9, 0.3); place(sfx, riser(2.0), st("verdict", 3), 0.2)
place(sfx, boom(0.8), st("verdict", 4) + 0.4, 0.5); place(sfx, ching(), st("verdict", 4) + 0.45, 0.35)
for j in range(10):
    place(sfx, tick(), st("verdict", 6) + 0.2 + j * 0.06, 0.4)
place(sfx, boom(1.0), st("verdict", 6) + 1.4, 0.55); place(sfx, crowd(2.5, cheer=True), st("verdict", 6) + 1.4, 0.45)
place(sfx, horn(2.0), st("verdict", 9) + 0.3, 0.35)

# ------------------------------------------------------------------ mix
_, voice = wavfile.read(ROOT / "assets/audio/narration.wav")
voice = voice.astype(np.float64) / 32768.0
if voice.ndim == 1:
    voice = np.stack([voice, voice], 1)
voice = np.pad(voice, ((0, max(0, N - len(voice))), (0, 0)))[:N]


def rms_db(x):
    m = np.abs(x).sum(1) > 1e-4
    return 20 * np.log10(np.sqrt(np.mean(x[m] ** 2)) + 1e-12)


music *= 10 ** ((-26 - rms_db(music)) / 20)
env = signal.sosfilt(signal.butter(1, 6, fs=SR, output="sos"), np.abs(voice).mean(1))
duck = signal.sosfilt(signal.butter(1, 4, fs=SR, output="sos"), 1 - 0.5 * np.clip(env / 0.03, 0, 1))
music *= duck[:, None]
fade = np.ones(N); a, z = int((DUR - 2.5) * SR), int(DUR * SR); fade[a:z] = np.linspace(1, 0, z - a); fade[z:] = 0
music *= fade[:, None]
sfx *= 10 ** ((-6 - 20 * np.log10(np.abs(sfx).max())) / 20)
mix = (voice + music + sfx)[: int(DUR * SR)]


def write(p, x):
    p.parent.mkdir(parents=True, exist_ok=True)
    x = x / max(1.0, np.abs(x).max() / 0.98)
    wavfile.write(p, SR, (x * 32767).astype(np.int16))


write(ROOT / "assets/music/score.wav", music[: int(DUR * SR)])
write(ROOT / "assets/audio/sfx.wav", sfx[: int(DUR * SR)])
raw = ROOT / "assets/audio/mix_raw.wav"
write(raw, mix)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "alimiter=limit=0.89:attack=3:release=60,loudnorm=I=-14:TP=-1.5:LRA=11",
                "-ar", "48000", str(ROOT / "public/mix.wav")], check=True)
print("ok", round(DUR, 1))
