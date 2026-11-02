import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "_shared"))
from audiolib import *  # noqa

T = json.loads((ROOT / "artifacts/timing_door.json").read_text())
DUR = T["durationInFrames"] / T["fps"]; N = int(DUR * SR) + SR
S = {s["id"]: s for s in T["segments"]}
st = lambda i, k: S[i]["sentences"][k]["start"]
music = np.zeros((N, 2)); place(music, bed("curious", DUR), 0)
sfx = np.zeros((N, 2))
place(sfx, boom(0.8), 0.02, 0.5); place(sfx, splash(0.8), 0.05, 0.25)
for sid in ("scene", "test", "exp", "end"):
    place(sfx, whoosh(0.4), S[sid]["start"] - 0.35, 0.3)
place(sfx, pop(), st("scene", 0) + 0.2, 0.3); place(sfx, pop(), st("scene", 0) + 2.6, 0.3)
place(sfx, creak(1.2), st("scene", 0) + 1.0, 0.2)
for j in range(5):
    place(sfx, pop(400, 1000, 0.06), st("scene", 1) + 0.3 + j * 0.5, 0.15, -0.5 + j * 0.25)
place(sfx, ching(), st("test", 0) + 0.35, 0.3)
place(sfx, splash(1.2), st("test", 1) + 1.4, 0.5); place(sfx, boom(0.6), st("test", 1) + 1.6, 0.35)
for j in range(12):
    place(sfx, tick(), st("exp", 0) + 0.5 + j * 0.3, 0.35)
place(sfx, boom(0.8), st("exp", 1) + 0.9, 0.4); place(sfx, pop(250, 600, 0.12), st("exp", 1) + 2.4, 0.35)
place(sfx, boom(0.7), st("end", 0), 0.4); place(sfx, ching(), st("end", 1) + 0.1, 0.35)
place(sfx, whoosh(0.45), st("end", 2) - 0.2, 0.4)
mix_and_write(ROOT / "assets/audio/narration_door.wav", music, sfx, DUR, ROOT / "public/mix_door.wav")
print("ok", DUR)
