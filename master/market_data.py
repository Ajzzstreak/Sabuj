"""
market_data.py — CME futures market data (NQ / ES / GC).

FuturesFeed : Yahoo Finance chart API, no API key. One HTTP call per symbol
              returns candles AND the last price, cached FEED_CACHE_SEC.
              CME data on this source is delayed (~10 min). Good enough to
              paper-validate the rules; swap in a real-time feed for live.

Interface used by scanner / orchestrator (any replacement feed must match):
    get_candles(instrument, interval=5) -> list[Candle]   (last may be forming)
    get_tick(instrument)                -> Tick(price, bid, ask)
    get_prices(instruments)             -> dict[str, float]
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

import config

log = logging.getLogger("market_data")

_INTERVALS = {1: ("1m", "5d"), 2: ("2m", "5d"), 5: ("5m", "5d"), 15: ("15m", "30d"),
              60: ("60m", "60d"), 1440: ("1d", "3mo")}


@dataclass
class Candle:
    time: int            # epoch seconds, candle OPEN time (UTC)
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    interval: int = 5    # minutes
    closed: bool = True

    @property
    def end_time(self) -> int:
        return self.time + self.interval * 60

    @property
    def dt(self) -> datetime:
        return datetime.fromtimestamp(self.time, tz=timezone.utc)


@dataclass
class Tick:
    price: float
    bid: float
    ask: float
    ts: float = field(default_factory=time.time)


class FuturesFeed:
    def __init__(self, base_url: str = config.DATA_SOURCE_URL, timeout: float = 8.0,
                 cache_sec: float = config.FEED_CACHE_SEC):
        self.base_url = base_url
        self.timeout = timeout
        self.cache_sec = cache_sec
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "Mozilla/5.0 (futures-paper-bot)"
        self._cache: dict[tuple[str, int], tuple[float, list[Candle], Tick | None]] = {}
        self._lock = threading.Lock()

    def _symbol(self, instrument: str) -> str:
        return config.INSTRUMENT_UNIVERSE[instrument]["data_symbol"]

    def _fetch(self, instrument: str, interval: int):
        key = (instrument, interval)
        with self._lock:
            hit = self._cache.get(key)
            if hit and time.time() - hit[0] < (self.cache_sec if interval < 1440 else 900):
                return hit[1], hit[2]
        iv, rng = _INTERVALS[interval]
        r = self.session.get(self.base_url + self._symbol(instrument),
                             params={"interval": iv, "range": rng, "includePrePost": "true"},
                             timeout=self.timeout)
        r.raise_for_status()
        res = r.json()["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        now = time.time()
        candles = []
        for i, t in enumerate(res.get("timestamp") or []):
            o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
            if None in (o, h, l, c):
                continue                         # Yahoo pads gaps with nulls
            candles.append(Candle(int(t), float(o), float(h), float(l), float(c),
                                  float(q["volume"][i] or 0), interval,
                                  closed=(int(t) + interval * 60) <= now))
        meta = res.get("meta", {})
        px = meta.get("regularMarketPrice") or (candles[-1].close if candles else None)
        tick = Tick(float(px), float(px), float(px)) if px else None
        with self._lock:
            self._cache[key] = (now, candles, tick)
        return candles, tick

    def get_candles(self, instrument: str, interval: int = config.CANDLE_INTERVAL_MIN) -> list[Candle]:
        return self._fetch(instrument, interval)[0]

    def get_tick(self, instrument: str) -> Tick:
        _, tick = self._fetch(instrument, config.CANDLE_INTERVAL_MIN)
        if tick is None:
            raise RuntimeError(f"no price for {instrument}")
        return tick

    def get_prices(self, instruments) -> dict[str, float]:
        out = {}
        for inst in instruments:
            try:
                out[inst] = self.get_tick(inst).price
            except Exception as e:  # noqa: BLE001
                log.warning("price %s failed: %s", inst, e)
        return out
