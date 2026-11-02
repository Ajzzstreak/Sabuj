import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "_shared"))
from audiolib import *  # noqa
T = json.loads((ROOT / "artifacts/timing.json").read_text())
DUR = T["durationInFrames"] / T["fps"]; N = int(DUR * SR) + SR
S = {s["id"]: s for s in T["segments"]}
st = lambda i, k: S[i]["sentences"][k]["start"]
W = T["words"]
wa = lambda seg, w: next(x["start"] for x in W if x["seg"] == seg and "".join(c for c in x["text"].lower() if c.isalpha()) == w)
def cube():
    x = thud() * 0.6; p = pop(500, 900, 0.05); x[:len(p)] += p; return x
music = np.zeros((N, 2)); place(music, bed("quirky", DUR), 0)
sfx = np.zeros((N, 2))
place(sfx, boom(0.7), 0.02, 0.45)
for sid in ("sugar", "nutr", "orange", "verdict", "end"):
    place(sfx, whoosh(0.4), S[sid]["start"] - 0.4, 0.3)
place(sfx, thud(), S["sugar"]["start"] + 0.2, 0.4)
place(sfx, thud(), st("sugar", 1) + 0.1, 0.4)
for j in range(6):
    place(sfx, cube(), st("sugar", 0) + 1.6 + 0.25 * j + 0.15, 0.25, -0.5)
for j in range(7):
    place(sfx, cube(), st("sugar", 1) + 1.4 + 0.25 * j + 0.15, 0.25, 0.0)
place(sfx, boom(0.6), st("sugar", 2), 0.35)
for d in (1.6, 2.3, 3.6):
    place(sfx, pop(), st("nutr", 0) + d, 0.3)
place(sfx, riser(1.4), st("nutr", 1) + 1.4, 0.3)
place(sfx, thud(), S["orange"]["start"], 0.45)
for j in range(3):
    place(sfx, cube(), st("orange", 0) + 1.6 + 0.25 * j + 0.15, 0.25, 0.5)
place(sfx, pop(), st("orange", 0) + 2.6, 0.3); place(sfx, pop(), st("orange", 0) + 3.6, 0.3)
for w in ("bad", "out", "good"):
    place(sfx, boom(0.6), wa("verdict", w), 0.4)
place(sfx, ching(), st("verdict", 1) + 0.4, 0.3); place(sfx, ching(), st("verdict", 1) + 1.1, 0.3)
place(sfx, ching(), S["end"]["start"] + 0.1, 0.3)
place(sfx, whoosh(0.45), st("end", 1) - 0.2, 0.4)
mix_and_write(ROOT / "assets/audio/narration.wav", music, sfx, DUR, ROOT / "public/mix.wav")
print("ok", DUR)
