"""
strategy.py — ICT PO3 + Silver Bullet / Unicorn rule engine (CME futures: NQ, ES, GC).

A deterministic port of "ICT Silver Bullet v6.4" (Pine) cross-referenced with
the ICT 2022 Mentorship notes and the Stat-Map Unicorn document.

Two layers (same as the Pine script):
  LAYER 1  Context — Asian range (for London) / London range (for NY) sweep
           gives directional bias + draw-on-liquidity target. HTF daily
           candle filters direction. PO3 midnight open = premium/discount of day.
  LAYER 2  Core setup, evaluated bar-by-bar inside a trade window:
           1 liquidity sweep of a confirmed, still-unswept swing
           2 breaker block (highest up-close candle between swept low and sweep
             for longs / lowest down-close candle for shorts)
           3 displacement candle (body >= 50%) closing through the breaker
           4 FVG created by the displacement ("no FVG, no trade")
           5 unicorn = FVG overlapping breaker (optional, highest conviction)
           6 FVG in discount (long) / premium (short) of the displacement leg
           7 retest of the zone = entry (limit at zone edge)

Fixes vs the Pine v6.4 source (documented so results are comparable):
  * Pine Step 2 can never fire: `isSwingLow` loops i=1..n and so includes
    low[0] (i=n), requiring low[n] < low[0], while the trigger needs
    low[0] < low[n]. Here swings are confirmed with bars strictly before the
    sweep bar and tracked as an unswept liquidity list.
  * Pine Step 3 code takes the last *down*-close candle (an order block) while
    its header says "highest up-close candle" (ICT breaker). ICT definition used.
  * Pine invalidates at 2x zone size; a 40-pt unicorn zone dies on an 80-pt
    drift. Here a zone is consumed when price reaches +2R before the retest.
  * Pine flips London bias when price later trades through the opposite side
    of the range — i.e. when the draw on liquidity is *delivered*. Here the
    first sweep latches for the window.
  * Sweep extreme keeps updating until displacement, so the stop sits beyond the
    true low/high of the manipulation leg.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

_MASTER = Path(__file__).resolve().parent.parent / "master"
if str(_MASTER) not in sys.path:
    sys.path.insert(0, str(_MASTER))

import config  # noqa: E402

NY = ZoneInfo(config.NY_TZ)


# ════════════════════════════════════════════════════════════════
# DATA CLASSES
# ════════════════════════════════════════════════════════════════
@dataclass
class FVG:
    direction: str          # "BULL" / "BEAR"
    top: float
    bottom: float
    created_ts: int         # open time of candle 3
    middle_ts: int          # open time of the displacement (middle) candle

    @property
    def size(self) -> float:
        return self.top - self.bottom

    @property
    def mid(self) -> float:
        return (self.top + self.bottom) / 2


@dataclass
class PO3State:
    trading_day: str
    midnight_open: float | None = None
    asian_hi: float | None = None
    asian_lo: float | None = None
    london_hi: float | None = None
    london_lo: float | None = None
    phase: str = "ACCUMULATION"       # ACCUMULATION / MANIPULATION / DISTRIBUTION
    day_high: float | None = None
    day_low: float | None = None

    def location(self, price: float) -> str:
        if self.midnight_open is None:
            return "UNKNOWN"
        return "DISCOUNT" if price < self.midnight_open else "PREMIUM"


@dataclass
class CheckItem:
    name: str
    passed: bool
    hard: bool
    detail: str = ""


@dataclass
class TradeSignal:
    instrument: str
    direction: str                      # "LONG" / "SHORT"
    entry: float
    stop: float
    target: float
    label: str = ""
    session: str = ""
    setup_id: str = ""
    created_ts: float = 0.0
    zone_top: float = 0.0
    zone_bot: float = 0.0
    fvg: FVG | None = None
    bb_hi: float | None = None
    bb_lo: float | None = None
    unicorn: bool = False
    sweep_level: float | None = None
    sweep_extreme: float | None = None
    context_bias: str = "NONE"
    context_target: float | None = None
    htf_bias: str = "NEUTRAL"
    po3: PO3State | None = None
    checklist: list[CheckItem] = field(default_factory=list)
    tp_levels: list[float] = field(default_factory=list)

    @property
    def risk_points(self) -> float:
        return abs(self.entry - self.stop)

    @property
    def is_long(self) -> bool:
        return self.direction == "LONG"

    @property
    def confluence(self) -> int:
        return sum(1 for c in self.checklist if c.passed and not c.hard)

    @property
    def confluence_max(self) -> int:
        return sum(1 for c in self.checklist if not c.hard)

    def hard_rules_pass(self) -> bool:
        return all(c.passed for c in self.checklist if c.hard)

    def failed_rules(self) -> list[str]:
        return [c.name for c in self.checklist if c.hard and not c.passed]

    def reprice(self, entry: float) -> None:
        """Fill happened at `entry`: keep the structural stop, rebuild targets in R."""
        self.entry = entry
        r = self.risk_points
        sgn = 1 if self.is_long else -1
        self.tp_levels = [entry + sgn * r * m for m in config.TP_LEVELS_R]
        self.target = entry + sgn * r * config.TARGET_R
        tick = config.INSTRUMENT_UNIVERSE.get(self.instrument, {}).get("tick")
        if tick:   # target rounded toward entry so it is a reachable price
            self.target = round_tick(self.target, tick, "down" if self.is_long else "up")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["risk_points"] = self.risk_points
        d["confluence"] = self.confluence
        return d

    def summary_text(self) -> str:
        """Plain-text brief handed to the LLM council."""
        rr = abs(self.target - self.entry) / self.risk_points if self.risk_points else 0
        lines = [
            f"INSTRUMENT: {self.instrument}   DIRECTION: {self.direction}   SESSION: {self.session}",
            f"SETUP: {'UNICORN (breaker + FVG overlap)' if self.unicorn else 'Silver Bullet FVG'}",
            f"ENTRY {self.entry:.2f}  STOP {self.stop:.2f}  TARGET {self.target:.2f}  (R:R {rr:.1f})",
            f"ZONE {self.zone_bot:.2f} - {self.zone_top:.2f}   FVG size {self.fvg.size if self.fvg else 0:.2f}",
            f"BREAKER {self.bb_lo} - {self.bb_hi}",
            f"LIQUIDITY SWEPT {self.sweep_level}  (extreme {self.sweep_extreme})",
            f"HTF DAILY BIAS: {self.htf_bias}   SESSION CONTEXT: {self.context_bias}"
            f" (draw on liquidity {self.context_target})",
        ]
        if self.po3:
            lines.append(f"PO3: phase {self.po3.phase}, midnight open {self.po3.midnight_open}, "
                         f"entry is in {self.po3.location(self.entry)} of the day")
        lines.append("CHECKLIST:")
        for c in self.checklist:
            lines.append(f"  [{'PASS' if c.passed else 'FAIL'}]{'*' if c.hard else ' '} {c.name}: {c.detail}")
        lines.append(f"CONFLUENCE: {self.confluence}/{self.confluence_max} (* = mandatory rule)")
        return "\n".join(lines)


@dataclass
class SetupState:
    instrument: str
    window: str
    status: str = "SCANNING"     # SCANNING SWEPT DISPLACED ARMED TRIGGERED EXPIRED
    setup_id: str = ""
    signal: TradeSignal | None = None
    touch_ts: int | None = None
    notes: list[str] = field(default_factory=list)


# ════════════════════════════════════════════════════════════════
# TIME HELPERS
# ════════════════════════════════════════════════════════════════
def _hm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def ny_dt(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(NY)


def trading_day(ts: float) -> str:
    return (ny_dt(ts) + timedelta(hours=24 - config.TRADING_DAY_ROLL_HOUR)).date().isoformat()


def _bounds(day: datetime, start: str, end: str) -> tuple[int, int]:
    """Epoch bounds of a NY-time window anchored on calendar `day`. end<=start ⇒ crosses midnight."""
    sh, sm = _hm(start)
    eh, em = _hm(end)
    s = day.replace(hour=sh, minute=sm, second=0, microsecond=0)
    e = day.replace(hour=eh, minute=em, second=0, microsecond=0)
    if e <= s:
        e += timedelta(days=1)
    return int(s.timestamp()), int(e.timestamp())


def market_open(ts: float) -> bool:
    """CME Globex: Sun 18:00 → Fri 17:00 NY, daily break 17:00-18:00. (Holidays not modelled.)"""
    d = ny_dt(ts)
    wd, h = d.weekday(), d.hour            # Mon=0 … Sun=6
    if wd == 5:                            # Saturday
        return False
    if wd == 6:                            # Sunday opens 18:00
        return h >= config.TRADING_DAY_ROLL_HOUR
    if wd == 4 and h >= config.GLOBEX_CLOSE_HOUR:
        return False
    return not (config.GLOBEX_CLOSE_HOUR <= h < config.TRADING_DAY_ROLL_HOUR)


def round_tick(price: float, tick: float, mode: str = "near") -> float:
    import math
    n = price / tick
    n = math.floor(n + 1e-9) if mode == "down" else math.ceil(n - 1e-9) if mode == "up" else round(n)
    return round(n * tick, 10)


def active_window(ts: float) -> tuple[str, int, int] | None:
    if not market_open(ts):
        return None
    d = ny_dt(ts)
    for name, w in config.TRADE_WINDOWS.items():
        if not w["enabled"]:
            continue
        s, e = _bounds(d, w["start"], w["end"])
        if s <= ts < e:
            return name, s, e
    return None


def in_silver_bullet(window: str, ts: float) -> bool:
    if window not in config.SILVER_BULLET:
        return False
    s, e = _bounds(ny_dt(ts), *config.SILVER_BULLET[window])
    return s <= ts < e


def context_range_bounds(window: str, window_start: int) -> tuple[str, int, int]:
    d = ny_dt(window_start)
    ctx = config.TRADE_WINDOWS[window]["context"]
    if ctx == "ASIAN":
        s, e = _bounds(d - timedelta(days=1), *config.ASIAN_RANGE)
    else:
        s, e = _bounds(d, *config.LONDON_RANGE)
    return ctx, s, e


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════
class SilverBulletEngine:
    """
    Stateless evaluation: feed it closed candles, it replays the current trade
    window bar by bar and returns where the setup stands. Replaying from scratch
    makes the result identical after a restart and impossible to desync.
    """

    def __init__(self, instrument: str):
        self.instrument = instrument
        spec = config.INSTRUMENT_UNIVERSE[instrument]
        self.min_fvg = spec["min_fvg"]
        self.tick = spec.get("tick", 0.01)

    # ── HTF + PO3 ──────────────────────────────────────────────
    @staticmethod
    def htf_bias(daily) -> str:
        """Direction of the last *completed* daily candle (non-repainting)."""
        closed = [c for c in (daily or []) if c.closed]
        if not closed:
            return "NEUTRAL"
        c = closed[-1]
        return "BULLISH" if c.close > c.open else "BEARISH" if c.close < c.open else "NEUTRAL"

    @staticmethod
    def _range(candles, s: int, e: int):
        bars = [c for c in candles if s <= c.time < e]
        if not bars:
            return None, None
        return max(c.high for c in bars), min(c.low for c in bars)

    def po3_state(self, candles, now_ts: float) -> PO3State:
        d = ny_dt(now_ts)
        st = PO3State(trading_day=trading_day(now_ts))
        mid = int(d.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        for c in candles:
            if c.time <= mid < c.end_time:
                st.midnight_open = c.open
                break
        st.asian_hi, st.asian_lo = self._range(candles, *_bounds(d - timedelta(days=1), *config.ASIAN_RANGE))
        st.london_hi, st.london_lo = self._range(candles, *_bounds(d, *config.LONDON_RANGE))
        day_start = int((d - timedelta(hours=(d.hour - config.TRADING_DAY_ROLL_HOUR) % 24,
                                       minutes=d.minute, seconds=d.second)).timestamp())
        st.day_high, st.day_low = self._range(candles, day_start, int(now_ts) + 1)
        h = d.hour + d.minute / 60
        st.phase = ("ACCUMULATION" if h >= 18 or h < 2 else
                    "MANIPULATION" if h < 9 else "DISTRIBUTION")
        return st

    # ── swings ─────────────────────────────────────────────────
    @staticmethod
    def _swings(c, i: int, n: int, lookback: int):
        """Confirmed swing lows/highs (index) usable as liquidity at bar i."""
        lows, highs = [], []
        lo_k = max(n, i - lookback)
        for k in range(lo_k, i - n):          # k+n < i  → confirmed before bar i
            if all(c[k].low < c[k - j].low and c[k].low < c[k + j].low for j in range(1, n + 1)):
                if min(x.low for x in c[k + 1:i]) >= c[k].low:      # still unswept
                    lows.append(k)
            if all(c[k].high > c[k - j].high and c[k].high > c[k + j].high for j in range(1, n + 1)):
                if max(x.high for x in c[k + 1:i]) <= c[k].high:
                    highs.append(k)
        return lows, highs

    # ── main ───────────────────────────────────────────────────
    def evaluate(self, candles, now_ts: float, daily=None) -> SetupState | None:
        win = active_window(now_ts)
        if win is None:
            return None
        wname, ws, we = win
        c = [x for x in candles if x.closed and x.time < we]
        state = SetupState(self.instrument, wname)
        if len(c) < config.SWING_LEN * 2 + 3:
            state.notes.append("not enough history")
            return state

        htf = self.htf_bias(daily) if config.HTF_BIAS_FILTER else "OFF"
        allow_bull = htf in ("BULLISH", "NEUTRAL", "OFF")
        allow_bear = htf in ("BEARISH", "NEUTRAL", "OFF")
        ctx_name, cs, ce = context_range_bounds(wname, ws)
        ctx_hi, ctx_lo = self._range(c, cs, ce)
        po3 = self.po3_state(candles, now_ts)

        n = config.SWING_LEN
        first = next((i for i, x in enumerate(c) if x.time >= ws), None)
        if first is None:
            state.notes.append("window open, waiting for first closed bar")
            return state

        ctx_bias, ctx_target = "NONE", None
        self._reset(state)
        s = state._s  # type: ignore[attr-defined]

        for i in range(max(first, n * 2 + 1), len(c)):
            bar = c[i]
            # LAYER 1 — context sweep. First sweep of the session range latches
            # (the Judas swing); reaching the opposite side is the draw, not a flip.
            if ctx_hi is not None and ctx_bias == "NONE":
                if bar.low < ctx_lo:
                    ctx_bias, ctx_target = "BULL", ctx_hi
                elif bar.high > ctx_hi:
                    ctx_bias, ctx_target = "BEAR", ctx_lo

            if state.status == "SCANNING":
                lows, highs = self._swings(c, i, n, config.SWING_LOOKBACK_BARS)
                swept_lo = [k for k in lows if bar.low < c[k].low]
                swept_hi = [k for k in highs if bar.high > c[k].high]
                if swept_lo and allow_bull and ctx_bias in ("BULL", "NONE"):
                    k = min(swept_lo, key=lambda k: c[k].low)
                    s.update(dir="BULL", sweep_i=i, swing_k=k, level=c[k].low, extreme=bar.low)
                elif swept_hi and allow_bear and ctx_bias in ("BEAR", "NONE"):
                    k = max(swept_hi, key=lambda k: c[k].high)
                    s.update(dir="BEAR", sweep_i=i, swing_k=k, level=c[k].high, extreme=bar.high)
                else:
                    continue
                state.status = "SWEPT"
                self._breaker(c, s)
                continue

            if state.status == "SWEPT":
                bull = s["dir"] == "BULL"
                # extend manipulation leg until displacement
                rng = (bar.high - bar.low) or 1e-9
                body_pct = abs(bar.close - bar.open) / rng * 100
                disp = (bull and bar.close > bar.open and bar.close > s["bb_hi"] or
                        not bull and bar.close < bar.open and bar.close < s["bb_lo"])
                if disp and body_pct >= config.DISP_BODY_PCT:
                    s.update(disp_i=i, body_pct=body_pct)
                    state.status = "DISPLACED"
                else:
                    s["extreme"] = min(s["extreme"], bar.low) if bull else max(s["extreme"], bar.high)
                    if i - s["sweep_i"] > 12:
                        state.notes.append("no displacement within 12 bars — reset")
                        self._reset(state)
                continue

            if state.status == "DISPLACED":
                bull = s["dir"] == "BULL"
                m = i - 1                      # candidate middle candle
                if m >= s["disp_i"] and m - 1 >= 0:
                    if bull and c[m - 1].high < c[i].low:
                        top, bot = c[i].low, c[m - 1].high
                    elif not bull and c[m - 1].low > c[i].high:
                        top, bot = c[m - 1].low, c[i].high
                    else:
                        top = bot = None
                    if top is not None and top - bot >= self.min_fvg:
                        s["fvg"] = FVG("BULL" if bull else "BEAR", top, bot, c[i].time, c[m].time)
                        s["fvg_i"] = i
                        self._arm(state, c, i, wname, htf, ctx_bias, ctx_target, po3, now_ts)
                        continue
                if i - s["disp_i"] >= config.FVG_SEARCH_BARS:
                    state.notes.append("displacement left no qualifying FVG — no trade")
                    self._reset(state)
                continue

            if state.status == "ARMED":
                sig = state.signal
                bull = sig.is_long
                away = sig.risk_points * config.INVALIDATION_R
                if bull:
                    invalid = bar.high >= sig.entry + away or bar.low <= sig.stop
                    touch = bar.low <= sig.zone_top
                else:
                    invalid = bar.low <= sig.entry - away or bar.high >= sig.stop
                    touch = bar.high >= sig.zone_bot
                if bar.low <= sig.stop <= bar.high:
                    invalid = True
                if touch and not (bull and bar.low <= sig.stop) and not (not bull and bar.high >= sig.stop):
                    state.status = "TRIGGERED"
                    state.touch_ts = bar.time
                    break
                if invalid:
                    state.notes.append("zone invalidated before retest — re-scanning")
                    self._reset(state)
                continue

        if state.status in ("SWEPT", "DISPLACED", "ARMED") and now_ts >= we:
            state.status = "EXPIRED"
        state.notes.append(f"context {ctx_name} {ctx_lo}-{ctx_hi} bias {ctx_bias}; HTF {htf}")
        return state

    # ── internals ──────────────────────────────────────────────
    @staticmethod
    def _reset(state: SetupState):
        state.status = "SCANNING"
        state.signal = None
        state.setup_id = ""
        # clear IN PLACE: evaluate() holds a reference to this dict across resets
        if hasattr(state, "_s"):
            state._s.clear()  # type: ignore[attr-defined]
        else:
            state._s = {}  # type: ignore[attr-defined]

    @staticmethod
    def _breaker(c, s):
        """ICT breaker: highest up-close candle between the swept swing low and the sweep (bull)."""
        bull = s["dir"] == "BULL"
        lo = max(s["swing_k"] + 1, s["sweep_i"] - config.BB_LOOKBACK)
        cand = c[lo:s["sweep_i"]] or c[max(0, s["sweep_i"] - config.BB_LOOKBACK):s["sweep_i"]]
        if bull:
            pick = [x for x in cand if x.close > x.open] or cand
            b = max(pick, key=lambda x: x.high)
        else:
            pick = [x for x in cand if x.close < x.open] or cand
            b = min(pick, key=lambda x: x.low)
        s.update(bb_hi=b.high, bb_lo=b.low, bb_ts=b.time)

    def _arm(self, state, c, i, wname, htf, ctx_bias, ctx_target, po3, now_ts):
        s = state._s
        bull = s["dir"] == "BULL"
        fvg: FVG = s["fvg"]
        # Unicorn overlap
        o_top, o_bot = min(fvg.top, s["bb_hi"]), max(fvg.bottom, s["bb_lo"])
        uni = o_top > o_bot
        z_top, z_bot = (o_top, o_bot) if uni else (fvg.top, fvg.bottom)
        size = z_top - z_bot
        buf = size * config.SL_BUFFER
        tk = self.tick
        buf = max(buf, tk)                            # at least one tick beyond the extreme
        entry = round_tick(z_top if bull else z_bot, tk, "down" if bull else "up")  # limit at near edge
        if bull:
            stop = round_tick(min(s["extreme"] - buf, entry - buf * 2), tk, "down")
        else:
            stop = round_tick(max(s["extreme"] + buf, entry + buf * 2), tk, "up")

        leg = c[s["sweep_i"]:i + 1]
        leg_hi, leg_lo = max(x.high for x in leg), min(x.low for x in leg)
        eq = (leg_hi + leg_lo) / 2
        zmid = (z_top + z_bot) / 2
        in_pd = zmid <= eq if bull else zmid >= eq

        direction = "LONG" if bull else "SHORT"
        sig = TradeSignal(
            instrument=self.instrument, direction=direction, entry=entry, stop=stop, target=entry,
            session=wname, created_ts=now_ts, zone_top=z_top, zone_bot=z_bot, fvg=fvg,
            bb_hi=s["bb_hi"], bb_lo=s["bb_lo"], unicorn=uni, sweep_level=s["level"],
            sweep_extreme=s["extreme"], context_bias=ctx_bias, context_target=ctx_target,
            htf_bias=htf, po3=po3,
        )
        sig.reprice(entry)
        sig.label = f"{'UNICORN ' if uni else ''}{'BUY' if bull else 'SELL'} {wname}"
        sig.setup_id = f"{self.instrument}-{po3.trading_day}-{wname}-{fvg.created_ts}"

        po3_loc = po3.location(entry)
        ctx_ok = (ctx_bias == "BULL") if bull else (ctx_bias == "BEAR")
        target_ok = ctx_target is None or (ctx_target > entry if bull else ctx_target < entry)
        allowed = htf in ("OFF", "NEUTRAL") or (htf == "BULLISH") == bull
        sig.checklist = [
            CheckItem("session_window", True, True, f"{wname} kill zone active"),
            CheckItem("htf_bias", allowed, config.HTF_BIAS_FILTER, f"daily {htf}"),
            CheckItem("liquidity_sweep", True, True,
                      f"swept swing {'low' if bull else 'high'} {s['level']:.2f} (extreme {s['extreme']:.2f})"),
            CheckItem("breaker_block", True, True, f"{s['bb_lo']:.2f}-{s['bb_hi']:.2f}"),
            CheckItem("displacement", True, True, f"body {s['body_pct']:.0f}% closed through breaker"),
            CheckItem("fair_value_gap", True, True, f"{fvg.bottom:.2f}-{fvg.top:.2f} size {fvg.size:.2f}"),
            CheckItem("premium_discount", in_pd, config.REQUIRE_DISCOUNT,
                      f"zone mid {zmid:.2f} vs leg EQ {eq:.2f} → {'discount' if zmid <= eq else 'premium'}"),
            CheckItem("unicorn", uni, config.REQUIRE_UNICORN, "FVG overlaps breaker" if uni else "no overlap"),
            CheckItem("session_context_sweep", ctx_ok, False, f"{ctx_bias} target {ctx_target}"),
            CheckItem("draw_on_liquidity", target_ok, False, "context target beyond entry" if target_ok
                      else "context target behind entry"),
            CheckItem("po3_open", (po3_loc == "DISCOUNT") == bull and po3_loc != "UNKNOWN", False,
                      f"entry in {po3_loc} vs midnight open {po3.midnight_open}"),
            CheckItem("silver_bullet_hour", in_silver_bullet(wname, now_ts), False,
                      "inside Silver Bullet hour" if in_silver_bullet(wname, now_ts) else "outside Silver Bullet hour"),
        ]
        state.signal = sig
        state.setup_id = sig.setup_id
        state.status = "ARMED"
