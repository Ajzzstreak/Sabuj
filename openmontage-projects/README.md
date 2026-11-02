# Sabuj The Analyst — "GOOD or BAD?" video system

Source for the channel's animated videos, built with [OpenMontage](https://github.com/calesthio/OpenMontage) + Remotion.
All visuals are hand-coded SVG/React animation; all music and sound effects are synthesized in code (original, no samples).

## Projects
| Folder | Output | Format |
|---|---|---|
| `fruit-truth-90s/` | Mango "45g SUGAR?!" Short (v3), plus v1/v2 and thumbnails A/B/C | 1080×1920 |
| `titanic-200m-bet/` | Titanic: The $200M Bet (8:22) + "Could Jack Fit?" Short (`DoorShort`) + thumbnail | 1920×1080 / 1080×1920 |
| `oj-vs-soda/` | Juice vs Soda Short | 1080×1920 |
| `channel-brand/` | Banner (2560×1440), avatar (800×800), Short thumbnails | stills |
| `_shared/audiolib.py` | Synth instruments, music moods, SFX, ducking/loudness mix | — |
| `deliverables/` | Final thumbnails, banner, avatar | images |

## Rebuild from scratch
```bash
git clone https://github.com/calesthio/OpenMontage.git && cd OpenMontage && make setup
.venv/bin/python -m pip install kokoro-onnx soundfile scipy
# Kokoro voice (default narrator: af_heart, Apache-2.0)
mkdir -p ~/.kokoro && cd ~/.kokoro
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd -
# put these project folders under OpenMontage/projects/, then for each project:
ln -s ../../remotion-composer/node_modules projects/<project>/node_modules
ln -s ../../projects/<project> remotion-composer/projects/<project>
```
Per project:
```bash
.venv/bin/python projects/<project>/build_audio.py     # narration + timing (ENGINE=kokoro default; ENGINE=piper for old voice)
.venv/bin/python projects/<project>/build_mix.py       # music + SFX + final mix (-14 LUFS)
cd remotion-composer && npx remotion render projects/<project>/src/index.tsx <CompositionId> out.mp4 \
   --public-dir=../projects/<project>/public
```
Composition IDs: `FruitShortV3`, `TitanicReview`, `DoorShort`, `OJShort`; stills: `TitanicThumb`, `Banner`, `Avatar`, `ThumbJack`, `ThumbJuice`.
`tools/stills.cjs` renders many check-frames from one bundle.

Narration env options (`build_audio.py`): `V` (version suffix), `KOKORO_VOICE`, `LENGTH_SCALE`, `GAP_SENT`, `GAP_SEG`, `LEAD_IN`, `TAIL`.

## Notes
- Facts and prices in scripts are from general knowledge and must be verified before publishing (see `facts_to_verify` in the Titanic script).
- Fonts: Space Grotesk / Playfair Display (SIL OFL).
- Videos and audio are not committed (regenerable; large).
