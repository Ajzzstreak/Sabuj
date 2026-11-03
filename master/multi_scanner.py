"""
multi_scanner.py — runs the Silver Bullet engine across NQ / ES / GC
(CME futures). Spread code is dormant (SPREAD_PAIRS empty).
"""
from __future__ import annotations

import logging
import time

import config
from strategy import SilverBulletEngine, SetupState, active_window

log = logging.getLogger("scanner")


class MultiScanner:
    def __init__(self, feed, instruments=None):
        self.feed = feed
        self.instruments = list(instruments or config.INSTRUMENT_UNIVERSE)
        self.engines = {i: SilverBulletEngine(i) for i in self.instruments}
        self._daily: dict[str, tuple[float, list]] = {}
        self._last_bar: dict[str, int] = {}
        self.states: dict[str, SetupState | None] = {}
        self._spread_last_fire = 0.0

    def daily(self, inst: str):
        ts, rows = self._daily.get(inst, (0.0, []))
        if time.time() - ts > 900:
            try:
                rows = self.feed.get_candles(inst, 1440)
                self._daily[inst] = (time.time(), rows)
            except Exception as e:  # noqa: BLE001
                log.warning("daily candles %s failed: %s", inst, e)
        return rows

    def scan(self, inst: str, now: float | None = None, force: bool = False) -> SetupState | None:
        """Re-evaluate only when a new closed candle exists (or force)."""
        now = now or time.time()
        if active_window(now) is None:
            self.states[inst] = None
            return None
        candles = self.feed.get_candles(inst, config.CANDLE_INTERVAL_MIN)
        closed = [c for c in candles if c.closed]
        if not closed:
            return None
        last = closed[-1].time
        if not force and self._last_bar.get(inst) == last and inst in self.states:
            return self.states[inst]
        self._last_bar[inst] = last
        st = self.engines[inst].evaluate(candles, now, self.daily(inst))
        self.states[inst] = st
        return st

    def scan_all(self, now: float | None = None) -> dict[str, SetupState | None]:
        out = {}
        for inst in self.instruments:
            try:
                out[inst] = self.scan(inst, now)
            except Exception as e:  # noqa: BLE001
                log.exception("scan %s failed: %s", inst, e)
                out[inst] = None
        return out

    @staticmethod
    def touched(state: SetupState, price: float) -> bool:
        sig = state.signal
        if sig is None:
            return False
        if sig.is_long:
            return sig.stop < price <= sig.zone_top
        return sig.zone_bot <= price < sig.stop

    # ── optional pair trade ────────────────────────────────────
    def scan_spreads(self, now: float | None = None) -> list[dict]:
        if not config.SPREAD_ENABLED:
            return []
        now = now or time.time()
        if now - self._spread_last_fire < config.SPREAD_COOLDOWN_MIN * 60:
            return []
        out = []
        for pair in config.SPREAD_PAIRS:
            a = [c for c in self.feed.get_candles(pair["leg1"], config.CANDLE_INTERVAL_MIN) if c.closed]
            b = {c.time: c for c in self.feed.get_candles(pair["leg2"], config.CANDLE_INTERVAL_MIN) if c.closed}
            ratios = [x.close / b[x.time].close for x in a if x.time in b][-config.SPREAD_LOOKBACK_BARS:]
            if len(ratios) < 50:
                continue
            mean = sum(ratios) / len(ratios)
            p1 = self.feed.get_tick(pair["leg1"]).price
            p2 = self.feed.get_tick(pair["leg2"]).price
            dev = (p1 / p2 - mean) / mean * 100
            if abs(dev) >= pair["threshold_pct"]:
                rich = dev > 0          # leg1 rich vs leg2 → short leg1, long leg2
                move = abs(dev) / 100
                stop_pct = max(2 * move, 0.004)
                out.append({"pair": pair["name"], "dev_pct": dev, "legs": [
                    dict(instrument=pair["leg1"], direction="SHORT" if rich else "LONG", entry=p1,
                         stop=p1 * (1 + stop_pct) if rich else p1 * (1 - stop_pct),
                         target=p1 * (1 - move / 2) if rich else p1 * (1 + move / 2),
                         label=f"SPREAD {pair['name']} {dev:+.2f}%"),
                    dict(instrument=pair["leg2"], direction="LONG" if rich else "SHORT", entry=p2,
                         stop=p2 * (1 - stop_pct) if rich else p2 * (1 + stop_pct),
                         target=p2 * (1 + move / 2) if rich else p2 * (1 - move / 2),
                         label=f"SPREAD {pair['name']} {dev:+.2f}%"),
                ]})
                self._spread_last_fire = now
        return out
