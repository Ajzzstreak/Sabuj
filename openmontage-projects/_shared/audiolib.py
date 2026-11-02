"""Shared synth instruments, moods, SFX and mixing for OpenMontage projects (all original, code-generated audio)."""
import subprocess
from pathlib import Path
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(1912)


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




def bed(mood, dur):
    """Music bed of `dur` seconds in a mood, with short fades."""
    clip = render_mood(mood, dur + 0.6)[: int(dur * SR)]
    f = np.ones(len(clip)); k = int(0.4 * SR)
    f[:k] = np.linspace(0, 1, k); f[-k:] = np.linspace(1, 0, k)
    return clip * f[:, None]


def mix_and_write(voice_path, music, sfx, dur, out_path, music_db=-25.0, sfx_peak_db=-6.0, duck=0.5, loop_fade=0.4):
    N = int(dur * SR)
    _, v = wavfile.read(voice_path)
    v = v.astype(np.float64) / 32768.0
    if v.ndim == 1:
        v = np.stack([v, v], 1)
    pad = lambda x: np.pad(x, ((0, max(0, N - len(x))), (0, 0)))[:N]
    v, music, sfx = pad(v), pad(music), pad(sfx)
    m = np.abs(music).sum(1) > 1e-4
    music = music * 10 ** ((music_db - 20 * np.log10(np.sqrt(np.mean(music[m] ** 2)) + 1e-12)) / 20)
    env = signal.sosfilt(signal.butter(1, 6, fs=SR, output="sos"), np.abs(v).mean(1))
    d = signal.sosfilt(signal.butter(1, 4, fs=SR, output="sos"), 1 - duck * np.clip(env / 0.03, 0, 1))
    music = music * d[:, None]
    fz = np.ones(N); a = int((dur - loop_fade) * SR); fz[a:] = np.linspace(1, 0, N - a); music = music * fz[:, None]
    if np.abs(sfx).max() > 0:
        sfx = sfx * 10 ** ((sfx_peak_db - 20 * np.log10(np.abs(sfx).max())) / 20)
    x = v + music + sfx
    x = x / max(1.0, np.abs(x).max() / 0.98)
    raw = Path(str(out_path) + ".raw.wav")
    wavfile.write(raw, SR, (x * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "alimiter=limit=0.89:attack=3:release=60,loudnorm=I=-14:TP=-1.5:LRA=11",
                    "-ar", "48000", str(out_path)], check=True)
    raw.unlink()
