"""
backtest.py — replay a year of 1m/5m data through the LIVE rule engine.

    python backtest/dukascopy.py --year 2025          # 1) free data (spot gold, NDX/SPX CFDs)
    python backtest/backtest.py --year 2025           # 2) run → backtest/results/

Any CSV works:  --data NQ=path.csv,ES=path.csv,GC=path.csv  (--tz for naive timestamps)
Accepted layouts: Dukascopy/dukascopy-node (epoch ms), generic datetime+OHLC,
Databento ohlcv (ts_event), HistData M1 ("YYYYMMDD HHMMSS;o;h;l;c;v", EST).

Same code path as live: SilverBulletEngine.evaluate() is called at every closed
5m bar inside a kill zone, exactly as the orchestrator does. Then:
  strategy mandatory rules → account gates (stop range, contract sizing, fees)
  → rule-based swarm chairman (score >= 7, the no-API-key live behaviour)
  → limit fill at zone edge → exit by stop / 2R target / 240-min time stop /
  16:00 NY flatten. Portfolio rules (daily loss -$300, 6 trades/day, 3 open,
  1 trade per window per instrument) applied chronologically across NQ/ES/GC.

Fill/exit model is deliberately conservative:
  * zone touch and stop in the same bar  → filled AND stopped (loss)
  * stop and target in the same bar       → stop
  * fill bar can stop out but never hits target
  * stop/time/flatten exits pay 1 tick slippage; $0.62/contract/side fees
"""
from __future__ import annotations

import argparse
import asyncio
import bisect
import csv
import json
import multiprocessing as mp
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "master"), str(ROOT / "trading_bot")]

import config  # noqa: E402
from market_data import Candle  # noqa: E402
from strategy import SilverBulletEngine, active_window, trading_day, ny_dt  # noqa: E402
from paper_trader import contracts_for  # noqa: E402
from swarm_engine import SwarmEngine  # noqa: E402

RESULTS = ROOT / "backtest" / "results"
EST_FIXED = timezone(timedelta(hours=-5))


# ════════════════════════════════════════════════════════════════
# DATA
# ════════════════════════════════════════════════════════════════
def _parse_ts(v: str, tz) -> int:
    v = v.strip()
    if v.replace(".", "", 1).isdigit():
        x = float(v)
        if x > 1e17:
            return int(x / 1e9)          # ns
        if x > 1e11:
            return int(x / 1e3)          # ms
        return int(x)                    # s
    v = v.replace("Z", "+00:00")
    if len(v) >= 15 and v[8] == " " and v[:8].isdigit():          # HistData 20250102 180000
        dt = datetime.strptime(v[:15], "%Y%m%d %H%M%S").replace(tzinfo=EST_FIXED)
        return int(dt.timestamp())
    dt = datetime.fromisoformat(v[:26] if "+" not in v[19:] else v)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return int(dt.timestamp())


def load_csv(path: Path, tz=timezone.utc) -> list[tuple[int, float, float, float, float]]:
    rows = []
    with open(path, newline="") as fh:
        sample = fh.readline()
        fh.seek(0)
        delim = ";" if sample.count(";") > sample.count(",") else ","
        rd = csv.reader(fh, delimiter=delim)
        first = next(rd)
        has_header = not any(ch.isdigit() for ch in first[0][:4])
        if has_header:
            h = [c.strip().lower() for c in first]
            def col(*names):
                return next((h.index(n) for n in names if n in h), None)
            it = col("timestamp", "ts_event", "datetime", "time", "date", "gmt time", "local time")
            idate, itime = col("date"), col("time")
            io, ih, il, ic = col("open"), col("high"), col("low"), col("close")
            split = idate is not None and itime is not None and it in (idate, itime)
        else:
            rd = [first] + list(rd)
            it, io, ih, il, ic, split = 0, 1, 2, 3, 4, False
        for r in rd:
            try:
                ts = _parse_ts(f"{r[idate]} {r[itime]}" if split else r[it], tz)
                o, hi, lo, c = float(r[io]), float(r[ih]), float(r[il]), float(r[ic])
            except (ValueError, IndexError):
                continue
            rows.append((ts, o, hi, lo, c))
    rows.sort()
    return rows


def resample(rows, minutes: int, year: int | None) -> list[Candle]:
    step = minutes * 60
    out: dict[int, list] = {}
    for ts, o, h, l, c in rows:
        b = ts - ts % step
        x = out.get(b)
        if x is None:
            out[b] = [o, h, l, c]
        else:
            x[1] = max(x[1], h); x[2] = min(x[2], l); x[3] = c
    bars = [Candle(t, *v, 0.0, minutes, True) for t, v in sorted(out.items())]
    if year:   # keep a week of the prior year for context, report only `year`
        lo = int(datetime(year, 1, 1, tzinfo=timezone.utc).timestamp()) - 7 * 86400
        hi = int(datetime(year + 1, 1, 1, tzinfo=timezone.utc).timestamp())
        bars = [b for b in bars if lo <= b.time < hi]
    return bars


def daily_bars(bars: list[Candle]) -> dict[str, Candle]:
    """CME trading-day candles (18:00 NY roll)."""
    d: dict[str, Candle] = {}
    for b in bars:
        k = trading_day(b.time)
        x = d.get(k)
        if x is None:
            d[k] = Candle(b.time, b.open, b.high, b.low, b.close, 0, 1440, True)
        else:
            x.high, x.low, x.close = max(x.high, b.high), min(x.low, b.low), b.close
    return d


# ════════════════════════════════════════════════════════════════
# SIMULATION
# ════════════════════════════════════════════════════════════════
def simulate(sig, bars: list[Candle], k: int, window_end: int) -> dict:
    bull, entry, stop, target = sig.is_long, sig.entry, sig.stop, sig.target
    r = abs(entry - stop)
    away = r * config.INVALIDATION_R
    fill = None
    for j in range(k + 1, len(bars)):
        b = bars[j]
        if b.time >= window_end:
            return {"fill": "EXPIRED"}
        touched = b.low <= entry if bull else b.high >= entry
        if not touched and (b.high >= entry + away if bull else b.low <= entry - away):
            return {"fill": "RAN_WITHOUT_FILL"}
        if touched:
            fill = j
            break
    if fill is None:
        return {"fill": "NO_DATA"}

    spec = config.INSTRUMENT_UNIVERSE[sig.instrument]
    slip = config.SLIPPAGE_TICKS * spec["tick"]
    fb = bars[fill]
    fill_ts = fb.time
    ny_fill_date = ny_dt(fill_ts).date()
    exit_px = reason = None
    xi = fill
    for j in range(fill, len(bars)):
        b = bars[j]
        xi = j
        nyb = ny_dt(b.time)
        if j > fill and nyb.hour >= config.FLATTEN_HOUR_NY and nyb.date() == ny_fill_date:
            exit_px, reason = (b.open - slip if bull else b.open + slip), "FLATTEN"
            break
        hit_stop = b.low <= stop if bull else b.high >= stop
        hit_tgt = (b.high >= target if bull else b.low <= target) and j > fill
        if hit_stop:
            exit_px, reason = (stop - slip if bull else stop + slip), "STOP"
            break
        if hit_tgt:
            exit_px, reason = target, "TARGET"
            break
        if b.end_time - fill_ts >= config.MAX_HOLD_MINUTES * 60:
            exit_px, reason = (b.close - slip if bull else b.close + slip), "TIME"
            break
    if exit_px is None:
        exit_px, reason = bars[-1].close, "END_OF_DATA"
    pts = exit_px - entry if bull else entry - exit_px
    n = contracts_for(sig.instrument, r)
    fees = n * config.FEE_PER_CONTRACT_SIDE * 2
    return {"fill": "FILLED", "fill_ts": fill_ts, "exit_ts": bars[xi].end_time, "exit_px": exit_px,
            "reason": reason, "pts": pts, "r": pts / r, "contracts": n,
            "usd": pts * n * spec["point_value"] - fees, "fees": fees,
            "risk_usd": r * n * spec["point_value"]}


def account_gates(sig) -> list[str]:
    sp = config.INSTRUMENT_UNIVERSE[sig.instrument]
    r = sig.risk_points
    n = contracts_for(sig.instrument, r)
    fails = []
    if not sp["min_stop"] <= r <= sp["max_stop"]:
        fails.append("stop_distance")
    if n < config.MIN_CONTRACTS:
        fails.append("contract_sizing")
    elif n * config.FEE_PER_CONTRACT_SIDE * 2 > r * n * sp["point_value"] * config.MAX_FEE_TO_RISK:
        fails.append("fee_drag")
    return fails


def run_instrument(args) -> list[dict]:
    inst, path, year, tz_name = args
    tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    rows = load_csv(Path(path), tz)
    bars = resample(rows, config.CANDLE_INTERVAL_MIN, year)
    if not bars:
        return []
    times = [b.time for b in bars]
    days = daily_bars(bars)
    day_keys = sorted(days)
    eng = SilverBulletEngine(inst)
    swarm = SwarmEngine(api_key="")
    y0 = int(datetime(year, 1, 1, tzinfo=timezone.utc).timestamp())
    seen, done_windows, windows_seen, out = set(), set(), set(), []
    for k, bar in enumerate(bars):
        if bar.time < y0:
            continue
        now = bar.end_time - 1
        win = active_window(now)
        if win is None:
            continue
        wname, ws, we = win
        wkey = (trading_day(now), wname)
        windows_seen.add(wkey)
        if wkey in done_windows:
            continue
        lo = bisect.bisect_left(times, now - 36 * 3600)
        td = trading_day(now)
        i = bisect.bisect_left(day_keys, td)
        daily = [days[day_keys[i - 1]]] if i > 0 else []
        st = eng.evaluate(bars[lo:k + 1], now, daily)
        if st is None:
            continue
        if st.status == "TRIGGERED":
            done_windows.add(wkey)
        if st.status != "ARMED" or st.setup_id in seen:
            continue
        seen.add(st.setup_id)
        sig = st.signal
        rec = {"instrument": inst, "setup_id": sig.setup_id, "session": wname, "day": td,
               "armed_ts": now, "direction": sig.direction, "unicorn": sig.unicorn,
               "entry": sig.entry, "stop": sig.stop, "target": sig.target, "risk_pts": sig.risk_points,
               "confluence": sig.confluence, "rule_fail": sig.failed_rules(), "gate_fail": [],
               "score": None}
        if not rec["rule_fail"]:
            rec["gate_fail"] = account_gates(sig)
            res = asyncio.run(swarm.deliberate(sig))
            rec["score"] = res["score"]
            rec.update(simulate(sig, bars, k, we))
        out.append(rec)
    for wkey in windows_seen:
        out.append({"instrument": inst, "window_marker": True, "day": wkey[0], "session": wkey[1]})
    return out


# ════════════════════════════════════════════════════════════════
# PORTFOLIO + REPORT
# ════════════════════════════════════════════════════════════════
def portfolio(cands: list[dict], use_swarm: bool) -> list[dict]:
    """Apply account rules chronologically across instruments."""
    elig = [c for c in cands if not c["rule_fail"] and not c["gate_fail"] and c.get("fill") == "FILLED"
            and (not use_swarm or (c["score"] or 0) >= config.AUTO_EXECUTE_SCORE)]
    elig.sort(key=lambda c: c["fill_ts"])
    taken, used_windows = [], set()
    for c in elig:
        day = c["day"]
        wkey = (c["instrument"], day, c["session"])
        if config.ONE_TRADE_PER_WINDOW and wkey in used_windows:
            continue
        today = [t for t in taken if t["day"] == day]
        realized = sum(t["usd"] for t in today if t["exit_ts"] <= c["fill_ts"])
        open_now = [t for t in taken if t["fill_ts"] <= c["fill_ts"] < t["exit_ts"]]
        if realized <= -config.MAX_DAILY_LOSS or len(today) >= config.MAX_TRADES_PER_DAY \
                or len(open_now) >= config.MAX_OPEN_POSITIONS \
                or any(t["instrument"] == c["instrument"] for t in open_now):
            continue
        used_windows.add(wkey)
        taken.append(c)
    return taken


def stats(trades: list[dict]) -> dict:
    n = len(trades)
    wins = [t for t in trades if t["usd"] > 0]
    losses = [t for t in trades if t["usd"] <= 0]
    gw, gl = sum(t["usd"] for t in wins), -sum(t["usd"] for t in losses)
    eq = peak = dd = 0.0
    for t in sorted(trades, key=lambda t: t["exit_ts"]):
        eq += t["usd"]; peak = max(peak, eq); dd = max(dd, peak - eq)
    return {
        "trades": n, "wins": len(wins), "losses": len(losses),
        "win_pct": round(100 * len(wins) / n, 1) if n else 0.0,
        "planned_rr": f"1:{config.TARGET_R:g}",
        "avg_win_r": round(sum(t["r"] for t in wins) / len(wins), 2) if wins else 0.0,
        "avg_loss_r": round(sum(t["r"] for t in losses) / len(losses), 2) if losses else 0.0,
        "expectancy_r": round(sum(t["r"] for t in trades) / n, 3) if n else 0.0,
        "total_r": round(sum(t["r"] for t in trades), 2),
        "profit_factor": round(gw / gl, 2) if gl else (float("inf") if gw else 0.0),
        "net_usd": round(gw - gl, 2), "fees_usd": round(sum(t["fees"] for t in trades), 2),
        "max_dd_usd": round(dd, 2),
        "exits": dict(Counter(t["reason"] for t in trades)),
    }


def report(all_recs: list[dict], year: int, sources: dict) -> str:
    markers = [r for r in all_recs if r.get("window_marker")]
    recs = [r for r in all_recs if not r.get("window_marker")]
    insts = sorted({r["instrument"] for r in all_recs})
    L = [f"# Backtest {year} — ICT Silver Bullet / Unicorn (NQ, ES, GC)", "",
         "Data: " + ", ".join(f"{k}={Path(v).name}" for k, v in sources.items()),
         f"Sessions: " + ", ".join(f"{k} {w['start']}-{w['end']} NY" for k, w in config.TRADE_WINDOWS.items()
                                   if w["enabled"]),
         f"Risk ${config.RISK_PER_TRADE}/trade, target {config.TARGET_R:g}R, micro contracts, "
         f"${config.FEE_PER_CONTRACT_SIDE}/contract/side, {config.SLIPPAGE_TICKS} tick slippage on stops", ""]

    L += ["## Funnel", "",
          "| | " + " | ".join(insts) + " | Total |", "|---|" + "---|" * (len(insts) + 1)]

    def row(label, fn):
        vals = [fn([r for r in recs if r["instrument"] == i], i) for i in insts]
        tot = fn(recs, None)
        L.append(f"| {label} | " + " | ".join(str(v) for v in vals) + f" | {tot} |")

    row("Kill-zone sessions with data", lambda rs, i: sum(1 for m in markers if i is None or m["instrument"] == i))
    row("Setups found (sweep→disp→FVG armed)", lambda rs, i: len(rs))
    row("…of which LONDON", lambda rs, i: sum(1 for r in rs if r["session"] == "LONDON"))
    row("…of which NY_AM", lambda rs, i: sum(1 for r in rs if r["session"] == "NY_AM"))
    row("…unicorn (FVG ∩ breaker)", lambda rs, i: sum(1 for r in rs if r["unicorn"]))
    row("Failed a mandatory strategy rule", lambda rs, i: sum(1 for r in rs if r["rule_fail"]))
    row("Failed account gate (stop/size/fee)", lambda rs, i: sum(1 for r in rs if not r["rule_fail"] and r["gate_fail"]))
    ok = lambda r: not r["rule_fail"] and not r["gate_fail"]  # noqa: E731
    row("Valid setups", lambda rs, i: sum(1 for r in rs if ok(r)))
    row("Swarm score ≥ 7", lambda rs, i: sum(1 for r in rs if ok(r) and (r["score"] or 0) >= config.AUTO_EXECUTE_SCORE))
    row("Price never returned (no fill)", lambda rs, i: sum(1 for r in rs if ok(r) and r.get("fill") in ("RAN_WITHOUT_FILL", "EXPIRED")))
    L.append("")

    fails = Counter(f for r in recs for f in r["rule_fail"] + r["gate_fail"])
    L += ["Rejection reasons: " + ", ".join(f"{k} {v}" for k, v in fails.most_common()), ""]

    out_trades = {}
    for label, sw in (("LIVE CONFIG — rules + swarm ≥ 7 (taken trades)", True),
                      ("Rules only — no swarm filter", False)):
        taken = portfolio(recs, sw)
        out_trades[sw] = taken
        L += [f"## {label}", "", "| | " + " | ".join(insts) + " | Total |", "|---|" + "---|" * (len(insts) + 1)]
        per = {i: stats([t for t in taken if t["instrument"] == i]) for i in insts}
        tot = stats(taken)
        for key in ("trades", "wins", "losses", "win_pct", "planned_rr", "avg_win_r", "avg_loss_r",
                    "expectancy_r", "total_r", "profit_factor", "net_usd", "fees_usd", "max_dd_usd", "exits"):
            L.append(f"| {key} | " + " | ".join(str(per[i][key]) for i in insts) + f" | {tot[key]} |")
        L.append("")
        bys = defaultdict(list)
        for t in taken:
            bys[t["session"]].append(t)
        L.append("By session: " + "; ".join(f"{s}: {len(v)} trades, {stats(v)['win_pct']}% win, "
                                           f"{stats(v)['total_r']}R" for s, v in sorted(bys.items())))
        bym = defaultdict(list)
        for t in taken:
            bym[t["day"][:7]].append(t)
        L += ["", "| Month | Trades | W | L | R | $ |", "|---|---|---|---|---|---|"]
        for m in sorted(bym):
            s = stats(bym[m])
            L.append(f"| {m} | {s['trades']} | {s['wins']} | {s['losses']} | {s['total_r']} | {s['net_usd']} |")
        L.append("")
    return "\n".join(L), out_trades


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--data", default="", help="NQ=path,ES=path,GC=path (default data/<INST>_<YEAR>_m1.csv)")
    ap.add_argument("--tz", default="", help="IANA tz for naive timestamps (default UTC)")
    a = ap.parse_args()
    src = dict(kv.split("=", 1) for kv in a.data.split(",") if "=" in kv) or {
        i: str(ROOT / "data" / f"{i}_{a.year}_m1.csv") for i in config.INSTRUMENT_UNIVERSE}
    src = {k: v for k, v in src.items() if Path(v).exists()}
    if not src:
        sys.exit("No data files. Run: python backtest/dukascopy.py --year %d" % a.year)
    print(f"Backtesting {a.year}: {', '.join(src)} …")
    with mp.Pool(len(src)) as pool:
        parts = pool.map(run_instrument, [(i, p, a.year, a.tz) for i, p in src.items()])
    recs = [r for p in parts for r in p]
    md, taken = report(recs, a.year, src)
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / f"report_{a.year}.md").write_text(md)
    (RESULTS / f"setups_{a.year}.json").write_text(json.dumps(recs, indent=1, default=str))
    with open(RESULTS / f"trades_{a.year}.csv", "w", newline="") as fh:
        cols = ["instrument", "day", "session", "direction", "unicorn", "entry", "stop", "target", "risk_pts",
                "contracts", "fill_ts", "exit_ts", "exit_px", "reason", "r", "usd", "score", "confluence"]
        w = csv.DictWriter(fh, cols, extrasaction="ignore")
        w.writeheader()
        for t in taken[True]:
            w.writerow(dict(t, fill_ts=ny_dt(t["fill_ts"]).strftime("%Y-%m-%d %H:%M"),
                            exit_ts=ny_dt(t["exit_ts"]).strftime("%Y-%m-%d %H:%M")))
    print(md)
    print(f"\nSaved → {RESULTS}")


if __name__ == "__main__":
    main()
