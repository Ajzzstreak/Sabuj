"""Narration build for fruit-truth-90s.

Generates one Piper clip per sentence via the registry's piper_tts tool,
stitches them with deliberate gaps, and writes Remotion props with
segment/sentence timing and approximate word-level caption timing
(proportional to word length within each sentence; no local aligner is
available on this machine).
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
sys.path.insert(0, str(REPO))
os.environ["PATH"] = f"{REPO / '.venv' / 'bin'}:{os.environ['PATH']}"

from tools.tool_registry import registry  # noqa: E402

FPS = 30
MODEL = str(Path.home() / ".piper/models/en-us-ryan-high.onnx")
LENGTH_SCALE = float(os.environ.get("LENGTH_SCALE", "1.0"))
GAP_SENT = 0.28      # pause between sentences
V = os.environ.get("V", "")  # version suffix, e.g. "_v3"
GAP_SEG = float(os.environ.get("GAP_SEG", "0.75"))  # pause between segments
LEAD_IN = float(os.environ.get("LEAD_IN", "0.4"))
TAIL = float(os.environ.get("TAIL", "1.6"))

script = json.loads((ROOT / ("artifacts/script" + V + ".json")).read_text())
seg_dir = ROOT / ("assets/audio/segments" + V)
seg_dir.mkdir(parents=True, exist_ok=True)

registry.discover()
tts = registry._tools["piper_tts"]

# ---- Kokoro engine (default). Apache-2.0 model, free for monetized use.
ENGINE = os.environ.get("ENGINE", "kokoro")
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "af_heart")
_kokoro = None
def kokoro_tts(text, out_path, speed):
    global _kokoro
    import soundfile as sf
    from kokoro_onnx import Kokoro
    if _kokoro is None:
        _kokoro = Kokoro(str(Path.home() / ".kokoro/kokoro-v1.0.onnx"), str(Path.home() / ".kokoro/voices-v1.0.bin"))
    a, sr = _kokoro.create(text, voice=KOKORO_VOICE, speed=speed, lang="en-gb" if KOKORO_VOICE.startswith("b") else "en-us")
    sf.write(str(out_path), a, sr)



def duration(p: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def trim_silence(src: Path, dst: Path) -> None:
    # Strip Piper's leading/trailing silence so our gaps are the only pauses.
    af = (
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
        "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse"
    )
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", af, "-ar", "48000", "-ac", "1", str(dst)], check=True)


t = LEAD_IN
segments_out, words_out, concat = [], [], []
for si, seg in enumerate(script["segments"]):
    seg_start = t
    sents_out = []
    for ji, sent in enumerate(seg["sentences"]):
        raw = seg_dir / f"{seg['id']}_{ji}_raw.wav"
        clean = seg_dir / f"{seg['id']}_{ji}.wav"
        if ENGINE == "kokoro":
            kokoro_tts(sent["text"], raw, 1.0 / LENGTH_SCALE)
        else:
            res = tts.execute({
                "text": sent["text"], "model": MODEL, "length_scale": LENGTH_SCALE,
                "sentence_silence": 0.1, "output_path": str(raw),
            })
            if not res.success:
                raise SystemExit(res.error)
        trim_silence(raw, clean)
        d = duration(clean)
        concat.append((clean, t))
        # proportional word timing
        words = sent["text"].split()
        weights = [len(re.sub(r"[^\w$]", "", w)) + 1.5 for w in words]
        total = sum(weights)
        wt = t
        for w, wgt in zip(words, weights):
            wd = d * wgt / total
            words_out.append({"text": w, "start": round(wt, 3), "end": round(wt + wd, 3), "seg": seg["id"]})
            wt += wd
        sents_out.append({"role": sent["role"], "text": sent["text"], "start": round(t, 3), "end": round(t + d, 3)})
        t += d + (GAP_SENT if ji < len(seg["sentences"]) - 1 else 0)
    seg_end = t
    t += GAP_SEG if si < len(script["segments"]) - 1 else TAIL
    segments_out.append({**{k: v for k, v in seg.items() if k != "sentences"},
                         "start": round(seg_start, 3), "end": round(seg_end, 3), "sentences": sents_out})

total_dur = t
# Build the narration track with adelay per clip.
inputs, filters = [], []
for i, (p, start) in enumerate(concat):
    inputs += ["-i", str(p)]
    ms = int(round(start * 1000))
    filters.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(concat)))
filters.append(f"{mix}amix=inputs={len(concat)}:normalize=0,apad,atrim=0:{total_dur:.3f},"
               f"loudnorm=I=-14:TP=-1.5:LRA=11[out]")
narr = ROOT / ("assets/audio/narration" + V + ".wav")
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filters),
                "-map", "[out]", "-ar", "48000", "-ac", "2", str(narr)], check=True)

public = ROOT / "public"
public.mkdir(exist_ok=True)
(public / ("narration" + V + ".wav")).write_bytes(narr.read_bytes())

props = {
    "fps": FPS,
    "durationInFrames": int(round(total_dur * FPS)),
    "segments": segments_out,
    "words": words_out,
}
(ROOT / ("artifacts/timing" + V + ".json")).write_text(json.dumps(props, indent=2))
(ROOT / ("src/timing" + V + ".json")).write_text(json.dumps(props, indent=2))
print(f"total {total_dur:.2f}s, {len(words_out)} words")
for s in segments_out:
    print(f"  {s['id']:12s} {s['start']:6.2f} -> {s['end']:6.2f}  ({s['end']-s['start']:.2f}s)")
