"""Original music + Fruit-Ninja-style SFX + final mix for fruit-truth-90s.

Everything here is synthesized from scratch (no samples, no third-party
recordings), so the soundtrack is original work and free of copyright
claims. Deterministic: fixed RNG seed.

Outputs:
  assets/music/bgm.wav        original 112 BPM "kitchen pop" track
  assets/audio/sfx.wav        sound-effects stem
  public/mix.wav              narration + ducked music + sfx, loudness-normalized
"""
import json
import os
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
SR = 48000
rng = np.random.default_rng(7)

V = os.environ.get("V", "")
timing = json.loads((ROOT / ("artifacts/timing" + V + ".json")).read_text())
DUR = timing["durationInFrames"] / timing["fps"]
N = int(DUR * SR) + SR
SEGS = timing["segments"]
WORDS = timing["words"]

# Keep in sync with src/Composition.tsx
LEAD = 0.35
SLASH_LEAD = 0.15
SLASH_TO_OPEN = 0.24


def t_arr(d):
    return np.arange(int(d * SR)) / SR


def place(buf, x, at, gain=1.0, pan=0.0):
    """Add mono or stereo clip x into stereo buf at time `at` (sec)."""
    i = int(at * SR)
    if i >= buf.shape[0] or i + len(x) <= 0:
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], axis=1)
    j = min(buf.shape[0], i + len(x))
    buf[max(0, i):j] += x[max(0, -i):j - i] * gain


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ============================================================ instruments
def marimba(m, d=0.45):
    f = mtof(m); t = t_arr(d)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.13)
         + 0.28 * np.sin(2 * np.pi * 3.93 * f * t) * np.exp(-t / 0.035)
         + 0.08 * np.sin(2 * np.pi * 9.2 * f * t) * np.exp(-t / 0.012))
    return x * np.minimum(1, t / 0.002)


def pluck(m, d=0.5):
    f = mtof(m); t = t_arr(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.15)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    x = sum(np.sin(k * ph) / k ** 1.3 * np.exp(-t * (3 + 4 * k)) for k in range(1, 7))
    return x * np.minimum(1, t / 0.004)


def bass(m, d=0.26):
    f = mtof(m); t = t_arr(d)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05)
    x *= np.exp(-t / 0.22) * np.minimum(1, t / 0.003) * np.minimum(1, (d - t) / 0.01)
    return np.tanh(1.6 * x)


def kick(d=0.35):
    t = t_arr(d)
    f = 48 + 110 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    x[: int(0.003 * SR)] += rng.standard_normal(int(0.003 * SR)) * 0.3
    return np.tanh(1.5 * x)


def clap(d=0.25):
    t = t_arr(d)
    n = bp(rng.standard_normal(len(t)), 900, 3200)
    env = np.exp(-t / 0.07)
    for off in (0.0, 0.011, 0.022):
        env += 0.8 * np.exp(-np.maximum(0, t - off) / 0.006) * (t >= off)
    return n * env * 0.5


def hat(d=0.06, open_=False):
    t = t_arr(0.25 if open_ else d)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t / (0.08 if open_ else 0.018))


def pad(ms, d):
    t = t_arr(d)
    x = sum(np.sin(2 * np.pi * mtof(m) * (1 + det) * t) for m in ms for det in (-0.003, 0.003))
    env = np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.5)
    return lp(x, 1800) * env / (2 * len(ms))


# ============================================================ music
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORDS = [  # C - G - Am - F
    (36, [60, 64, 67]), (43, [59, 62, 67]), (45, [57, 60, 64]), (41, [57, 60, 65])]
LEAD_PHRASE = [  # (bar, eighth, midi, len_eighths)
    (0, 0, 76, 2), (0, 2, 79, 1), (0, 3, 81, 1), (0, 4, 79, 2), (0, 6, 76, 2),
    (1, 0, 74, 2), (1, 2, 79, 1), (1, 3, 83, 1), (1, 4, 81, 2), (1, 6, 79, 2),
    (2, 0, 84, 2), (2, 2, 83, 1), (2, 3, 81, 1), (2, 4, 76, 2), (2, 6, 81, 2),
    (3, 0, 81, 1), (3, 1, 79, 1), (3, 2, 77, 2), (3, 4, 76, 2), (3, 6, 72, 2)]
ARP = [0, 1, 2, 3, 2, 1, 4, 3, 0, 1, 2, 3, 4, 3, 2, 1]

hook_end = next(s for s in SEGS if s["kind"] == "fruit")["start"] - LEAD
outro_start = SEGS[-1]["start"] - LEAD
music = np.zeros((N, 2))
nbars = int(np.ceil(DUR / BAR))
for b in range(nbars):
    t0 = b * BAR
    if t0 > DUR - 0.8:
        break
    root, ch = CHORDS[b % 4]
    tones = ch + [ch[0] + 12, ch[1] + 12]
    intro = t0 < hook_end - 0.01
    big = t0 >= outro_start - BAR
    # arp (16ths)
    for i, k in enumerate(ARP):
        at = t0 + i * BEAT / 4
        vel = 0.55 if i % 4 == 0 else 0.35
        place(music, marimba(tones[k] + 12), at, 0.22 * vel, pan=0.35)
    # drums
    for beat in range(4):
        at = t0 + beat * BEAT
        place(music, kick(), at, 0.55 if not intro else (0.45 if beat in (0, 2) else 0))
        if not intro and beat in (1, 3):
            place(music, clap(), at, 0.32, pan=-0.1)
        for half in (0, 1):
            place(music, hat(), at + half * BEAT / 2, 0.06 if half == 0 else 0.11, pan=0.45)
        if not intro and beat == 3 and b % 2 == 1:
            place(music, hat(open_=True), at + BEAT / 2, 0.07, pan=0.45)
    if not intro:
        # bass: bouncy 8ths
        for e, off in enumerate([0, 0, 12, 0, 7, 0, 12, 7]):
            place(music, bass(root + off), t0 + e * BEAT / 2, 0.33 if e % 2 == 0 else 0.22)
        place(music, pad([n - 12 for n in ch], BAR), t0, 0.35, pan=0)
    # lead melody: phrases on alternate 4-bar blocks, always in the outro
    if not intro and ((b // 4) % 2 == 1 or big):
        for (pb, e, m, ln) in LEAD_PHRASE:
            if pb == b % 4:
                place(music, pluck(m, ln * BEAT / 2 + 0.2), t0 + e * BEAT / 2, 0.16, pan=-0.3)

# riser into the first fruit + final hit
rt = t_arr(1.2)
riser = hp(rng.standard_normal(len(rt)), 2000) * (rt / 1.2) ** 2
place(music, riser, hook_end - 1.2, 0.12)
LOOP = bool(V)
if not LOOP:
    end_hit = DUR - 1.4
    place(music, kick(), end_hit, 0.7)
    for m in (60, 64, 67, 72):
        place(music, marimba(m, 1.5), end_hit, 0.2)
# fade the bed out at the end (short fade when the video loops)
fade = np.ones(N)
fs, fe = int((DUR - (0.35 if LOOP else 0.9)) * SR), int(DUR * SR)
fade[fs:fe] = np.linspace(1, 0, fe - fs); fade[fe:] = 0
music *= fade[:, None]


# ============================================================ SFX
def sweep_noise(d, f0, f1, q=1.5):
    """Noise through a band-pass whose centre glides f0 -> f1 (block-wise)."""
    t = t_arr(d)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(n)
    blk = 256
    for s in range(0, len(n), blk):
        fc = f0 * (f1 / f0) ** (s / len(n))
        lo, hi = fc / (1 + 1 / q), min(fc * (1 + 1 / q), SR / 2 - 100)
        out[s:s + blk] = bp(n[max(0, s - 2048):s + blk], lo, hi)[-len(n[s:s + blk]):]
    return out


def whoosh(d=0.4):
    t = t_arr(d)
    return sweep_noise(d, 300, 2400) * np.sin(np.pi * t / d) ** 2


def knife_swish():
    d = 0.22; t = t_arr(d)
    sw = sweep_noise(d, 1800, 9000, q=2.5) * np.sin(np.pi * np.minimum(1, t / d)) ** 1.5
    return sw


def blade_shing():
    t = t_arr(0.6)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dcy)
            for f, a, dcy in ((3150, 1, 0.18), (4870, 0.7, 0.12), (6930, 0.5, 0.08), (8410, 0.3, 0.05)))
    return x * np.minimum(1, t / 0.002) * 0.4


def slice_splat():
    t = t_arr(0.45)
    crunch = bp(rng.standard_normal(len(t)), 1200, 5000) * np.exp(-t / 0.03)
    thump = np.sin(2 * np.pi * (70 + 60 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.09)
    wet = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t / 0.12)
    wet *= 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 38 * t))  # squelchy flutter
    drips = np.zeros_like(t)
    for k in range(6):
        at = 0.08 + 0.05 * k + rng.uniform(0, 0.03)
        i = int(at * SR); tt = t_arr(0.04)
        dr = np.sin(2 * np.pi * (900 + 700 * rng.uniform()) * tt * (1 + 3 * tt)) * np.exp(-tt / 0.01)
        drips[i:i + len(tt)] += dr[: len(drips) - i] * 0.25
    return 0.7 * crunch + 0.9 * thump + 0.5 * wet + drips


def pop(f0=350, f1=1100, d=0.09):
    t = t_arr(d)
    f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)


def thud():
    t = t_arr(0.3)
    return np.sin(2 * np.pi * (55 + 50 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.1) + \
        0.15 * bp(rng.standard_normal(len(t)), 2000, 6000) * np.exp(-t / 0.01)


def tick():
    t = t_arr(0.02)
    return bp(rng.standard_normal(len(t)), 2500, 6000) * np.exp(-t / 0.004)


def cha_ching():
    t = t_arr(1.0)
    clank = bp(rng.standard_normal(len(t)), 1500, 7000) * np.exp(-t / 0.025)
    bell = lambda f, st: np.where(t >= st, np.sin(2 * np.pi * f * (t - st)) * np.exp(-(t - st) / 0.35), 0)
    return 0.5 * clank + 0.45 * (bell(2093, 0.08) + 0.7 * bell(4186, 0.08) + bell(2637, 0.2) + 0.6 * bell(5274, 0.2))


def boom():
    t = t_arr(0.7)
    return np.tanh(2 * np.sin(2 * np.pi * (40 + 90 * np.exp(-t / 0.04)) * t) * np.exp(-t / 0.25)) + \
        0.3 * lp(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.08)


sfx = np.zeros((N, 2))
fruit_segs = [s for s in SEGS if s["kind"] == "fruit"]
hook = next(s for s in SEGS if s["kind"] == "hook")
hw = [w for w in WORDS if w["seg"] == "hook"]
wat = lambda p: next((w for w in hw if w["text"].lower().startswith(p)), {"start": None})["start"]
NMINI = 4 if V else 6

# hook: mini fruits drop, GOOD / BAD slams, crack
hs = hook["start"] - LEAD if V else hook["start"]
for i in range(NMINI):
    place(sfx, pop(260, 600, 0.07), hs + (0.12 if V else 0.15) * i + 0.25, 0.25, pan=-0.6 + 1.2 * i / max(1, NMINI - 1))
place(sfx, boom(), wat("good"), 0.5)
place(sfx, boom(), wat("bad"), 0.55)
place(sfx, pop(500, 1500, 0.12), wat("cost"), 0.3)
if wat("crack") is not None:
    place(sfx, slice_splat(), wat("crack"), 0.5)

cold = next((s for s in SEGS if s["kind"] == "cold"), None)
if cold:  # frame-0 knife hit (COLD_SLASH = 0.1 in CompositionV3.tsx)
    place(sfx, knife_swish(), 0.08, 0.6, pan=-0.3)
    place(sfx, blade_shing(), 0.15, 0.3, pan=0.3)
    place(sfx, slice_splat(), 0.22, 0.75)
    place(sfx, pop(300, 950, 0.1), 0.39, 0.35)
    place(sfx, boom(), 0.42, 0.45)

for s in SEGS:
    if s["kind"] in ("cold",):
        continue
    place(sfx, whoosh(), s["start"] - LEAD - 0.12, 0.35)

for s in fruit_segs:
    r = {x["role"]: x for x in s["sentences"]}
    intro, nutr, ver, price = r["intro"], r["nutr"], r["verdict"], r["price"]
    place(sfx, thud(), intro["start"] + 0.15, 0.55)
    slash = nutr["start"] - SLASH_LEAD
    place(sfx, knife_swish(), slash - 0.02, 0.55, pan=-0.3)
    place(sfx, blade_shing(), slash + 0.05, 0.28, pan=0.3)
    place(sfx, slice_splat(), slash + 0.12, 0.65)
    place(sfx, pop(300, 950, 0.1), slash + SLASH_TO_OPEN + 0.05, 0.35)
    if s["id"] == "avocado":
        place(sfx, pop(180, 700, 0.15), slash + SLASH_TO_OPEN + 0.5, 0.4)  # pit pops out
    if s["id"] == "mango":
        for k in range(8):
            place(sfx, pop(700, 1600, 0.05), slash + SLASH_TO_OPEN + 0.35 + 0.06 * k, 0.12, pan=-0.5 + 0.14 * k)
    if s["id"] == "blueberries":
        for k in range(8):
            place(sfx, pop(500, 1300, 0.05), slash + SLASH_TO_OPEN + 0.02 * k, 0.12, pan=-0.6 + 0.17 * k)
    nd = nutr["end"] - nutr["start"]
    for i in range(4):
        place(sfx, pop(420, 1250, 0.07), nutr["start"] + 0.5 + i * max(0.6, nd - 0.8) / 4, 0.22, pan=-0.4 if i % 2 == 0 else 0.4)
    for k in range(9):  # gauge ratchet
        place(sfx, tick(), ver["start"] + 0.25 + k * 0.055, 0.3, pan=-0.3)
    place(sfx, thud(), ver["start"] + 0.7, 0.45, pan=-0.3)
    place(sfx, whoosh(0.3), price["start"] - 0.05, 0.2, pan=0.4)
    place(sfx, cha_ching(), price["start"] + 0.3, 0.32, pan=0.35)

out = SEGS[-1]
nf = len(fruit_segs)
for i in range(nf):
    place(sfx, pop(300 + 60 * i, 900 + 120 * i, 0.08), out["start"] - LEAD + (0.1 if V else 0.12) * (nf - i), 0.18)
place(sfx, cha_ching(), out["start"] - LEAD + (0.7 if V else 1.2), 0.3)
if V:
    place(sfx, boom(), out["sentences"][0]["start"] + 0.1, 0.35)
    place(sfx, whoosh(0.45), out["sentences"][1]["start"] - 0.2, 0.4)
else:
    place(sfx, boom(), out["sentences"][1]["start"], 0.35)

# ============================================================ mix
sr, voice = wavfile.read(ROOT / ("assets/audio/narration" + V + ".wav"))
voice = voice.astype(np.float64) / 32768.0
if voice.ndim == 1:
    voice = np.stack([voice, voice], 1)
voice = np.pad(voice, ((0, max(0, N - len(voice))), (0, 0)))[:N]


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x[np.abs(x).sum(1) > 1e-4] ** 2)) + 1e-12)


music *= 10 ** ((-25 - rms_db(music)) / 20)
# side-chain duck: -7 dB under narration, smooth attack/release
env = np.abs(voice).mean(1)
env = signal.sosfilt(signal.butter(1, 6, fs=SR, output="sos"), env)
ducking = 1 - 0.55 * np.clip(env / 0.03, 0, 1)
ducking = signal.sosfilt(signal.butter(1, 4, fs=SR, output="sos"), ducking)
music_d = music * ducking[:, None]
sfx *= 10 ** ((-7 - 20 * np.log10(np.abs(sfx).max())) / 20)

mix = voice + music_d + sfx
mix = mix[: int(DUR * SR)]


def write(p, x):
    p.parent.mkdir(parents=True, exist_ok=True)
    x = x / max(1.0, np.abs(x).max() / 0.98)
    wavfile.write(p, SR, (x * 32767).astype(np.int16))


write(ROOT / ("assets/music/bgm" + V + ".wav"), music[: int(DUR * SR)])
write(ROOT / ("assets/audio/sfx" + V + ".wav"), sfx[: int(DUR * SR)])
raw = ROOT / ("assets/audio/mix_raw" + V + ".wav")
write(raw, mix)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af",
                "alimiter=limit=0.89:attack=3:release=60,loudnorm=I=-14:TP=-1.5:LRA=11",
                "-ar", "48000", str(ROOT / ("public/mix" + V + ".wav"))], check=True)
print("ok", round(DUR, 2), "s")
