"""
dukascopy.py — free 1-minute history downloader (no account, no key).

    python backtest/dukascopy.py --year 2025                # NQ, ES, GC proxies
    python backtest/dukascopy.py --year 2025 --inst GC

Sources (Dukascopy Swiss bank datafeed, BID 1m candles, one file per UTC day):
    NQ → USATECHIDXUSD  (Nasdaq-100 cash CFD — tracks NQ minus futures basis)
    ES → USA500IDXUSD   (S&P 500 cash CFD — tracks ES minus futures basis)
    GC → XAUUSD         (spot gold)
Output: data/<INST>_<YEAR>_m1.csv  (epoch_ms,open,high,low,close,volume, UTC)

File format (.bi5 = LZMA): 24-byte big-endian records
    uint32 seconds-from-day-start, uint32 open, close, low, high, float32 volume
Prices are integers / point factor. The factor is auto-detected and every
candle is validated (low <= open/close <= high) so a wrong guess fails loudly.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import lzma
import struct
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
URL = "https://datafeed.dukascopy.com/datafeed/{sym}/{y:04d}/{m:02d}/{d:02d}/BID_candles_min_1.bi5"

SYMBOLS = {"NQ": "USATECHIDXUSD", "ES": "USA500IDXUSD", "GC": "XAUUSD"}
# plausible 2020s price bands used to auto-detect the integer→price factor
BANDS = {"NQ": (5000, 40000), "ES": (2000, 10000), "GC": (1000, 6000)}
FACTORS = (1000, 100, 10, 1, 10000, 100000)


def _day(sym: str, d: date, session: requests.Session, retries: int = 4) -> bytes:
    url = URL.format(sym=sym, y=d.year, m=d.month - 1, d=d.day)   # month is 0-based
    for i in range(retries):
        try:
            r = session.get(url, timeout=20)
            if r.status_code == 404:
                return b""
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            time.sleep(2 ** i)
    raise RuntimeError(f"failed {url}")


def _decode(raw: bytes, d: date):
    if not raw:
        return []
    buf = lzma.decompress(raw)
    day0 = int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())
    out = []
    for off in range(0, len(buf) - 23, 24):
        t, o, c, lo, hi, v = struct.unpack(">IIIIIf", buf[off:off + 24])
        out.append((day0 + t, o, hi, lo, c, v))
    return out


def download(inst: str, year: int, workers: int = 8) -> Path:
    sym = SYMBOLS[inst]
    days = [date(year, 1, 1) + timedelta(n) for n in range((date(year + 1, 1, 1) - date(year, 1, 1)).days)]
    days = [d for d in days if d <= date.today()]
    s = requests.Session()
    rows = []
    with cf.ThreadPoolExecutor(workers) as ex:
        for i, (d, raw) in enumerate(zip(days, ex.map(lambda d: _day(sym, d, s), days)), 1):
            rows += _decode(raw, d)
            if i % 30 == 0:
                print(f"  {inst} {d}  {len(rows):,} bars", flush=True)
    if not rows:
        raise RuntimeError(f"{inst}: no data returned")
    lo_b, hi_b = BANDS[inst]
    mid = sorted(r[4] for r in rows)[len(rows) // 2]
    factor = next((f for f in FACTORS if lo_b <= mid / f <= hi_b), None)
    if factor is None:
        raise RuntimeError(f"{inst}: cannot infer price factor (median raw {mid})")
    DATA.mkdir(exist_ok=True)
    path = DATA / f"{inst}_{year}_m1.csv"
    bad = 0
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for t, o, h, l, c, v in sorted(rows):
            o, h, l, c = o / factor, h / factor, l / factor, c / factor
            if not (l <= min(o, c) and h >= max(o, c)):
                bad += 1
                continue
            if v == 0 and o == h == l == c:
                continue               # flat filler minutes while the market is closed
            w.writerow([t * 1000, o, h, l, c, round(v, 4)])
    if bad > len(rows) * 0.01:
        raise RuntimeError(f"{inst}: {bad} malformed candles — record layout changed?")
    print(f"✔ {inst} ({sym}) → {path}  factor 1/{factor}  {len(rows):,} raw bars, {bad} rejected")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--inst", default="NQ,ES,GC")
    a = ap.parse_args()
    for inst in a.inst.split(","):
        try:
            download(inst.strip().upper(), a.year)
        except Exception as e:  # noqa: BLE001
            print(f"✘ {inst}: {e}", file=sys.stderr)
