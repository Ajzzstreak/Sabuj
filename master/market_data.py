"""
market_data.py — Kraken market data. No API key required.

KrakenFeed    : REST polling (https://api.kraken.com/0/public/)
KrakenWSFeed  : WebSocket push (wss://ws.kraken.com/v2), ticker + OHLC.
                Bootstraps history over REST, then streams. Falls back to
                REST automatically if the socket drops.

Both expose the same sync read API used by the scanner/orchestrator:
    get_candles(instrument, interval=1) -> list[Candle]   (last may be forming)
    get_tick(instrument)                -> Tick(price, bid, ask)
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

import config

log = logging.getLogger("market_data")

REST_SYMBOLS = {"BTC": "XBTUSD", "ETH": "ETHUSD", "SOL": "SOLUSD"}
WS_SYMBOLS   = {"BTC": "BTC/USD", "ETH": "ETH/USD", "SOL": "SOL/USD"}
WS_TO_INST   = {v: k for k, v in WS_SYMBOLS.items()}


@dataclass
class Candle:
    time: int            # epoch seconds, candle OPEN time (UTC)
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    interval: int = 1    # minutes
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


# ════════════════════════════════════════════════════════════════
# REST
# ════════════════════════════════════════════════════════════════
class KrakenFeed:
    """Kraken public REST. ~1 req/sec per endpoint is the safe public limit."""

    def __init__(self, base_url: str = config.KRAKEN_REST_URL, timeout: float = 8.0):
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "ict-paper-bot/1.0"

    def _get(self, endpoint: str, params: dict) -> dict:
        r = self.session.get(self.base_url + endpoint, params=params, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        if data.get("error"):
            raise RuntimeError(f"Kraken {endpoint} error: {data['error']}")
        return data["result"]

    @staticmethod
    def _first_pair(result: dict):
        for k, v in result.items():
            if k != "last":
                return v
        raise RuntimeError("Kraken: empty result")

    def get_candles(self, instrument: str, interval: int = 1) -> list[Candle]:
        res = self._get("OHLC", {"pair": REST_SYMBOLS[instrument], "interval": interval})
        rows = self._first_pair(res)
        now = time.time()
        out = []
        for r in rows:  # [time, open, high, low, close, vwap, volume, count]
            t = int(r[0])
            out.append(Candle(t, float(r[1]), float(r[2]), float(r[3]), float(r[4]),
                              float(r[6]), interval, closed=(t + interval * 60) <= now))
        return out

    def get_tick(self, instrument: str) -> Tick:
        res = self._get("Ticker", {"pair": REST_SYMBOLS[instrument]})
        t = self._first_pair(res)
        return Tick(price=float(t["c"][0]), bid=float(t["b"][0]), ask=float(t["a"][0]))

    def get_prices(self, instruments) -> dict[str, float]:
        out = {}
        for inst in instruments:
            try:
                out[inst] = self.get_tick(inst).price
            except Exception as e:  # noqa: BLE001
                log.warning("tick %s failed: %s", inst, e)
        return out


# ════════════════════════════════════════════════════════════════
# WEBSOCKET
# ════════════════════════════════════════════════════════════════
class KrakenWSFeed:
    """
    Push feed. Ticks arrive in tens of ms instead of the 6-8s REST cycle.
    Reads are served from memory, so get_candles/get_tick never block.
    """

    MAX_BARS = 1500

    def __init__(self, instruments, interval: int = config.CANDLE_INTERVAL_MIN,
                 url: str = config.KRAKEN_WS_URL):
        self.instruments = list(instruments)
        self.interval = interval
        self.url = url
        self.rest = KrakenFeed()
        self._candles: dict[str, dict[int, Candle]] = {i: {} for i in self.instruments}
        self._ticks: dict[str, Tick] = {}
        self._connected = asyncio.Event()
        self._stop = False
        self._task: asyncio.Task | None = None
        self.last_msg_ts = 0.0
        self.on_tick = None   # optional callback(instrument, Tick)

    # ── lifecycle ──────────────────────────────────────────────
    async def start(self):
        await asyncio.to_thread(self._bootstrap)
        self._task = asyncio.create_task(self._run(), name="kraken-ws")
        try:
            await asyncio.wait_for(self._connected.wait(), timeout=10)
        except asyncio.TimeoutError:
            log.warning("WebSocket not connected after 10s — serving REST until it is.")

    async def stop(self):
        self._stop = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    @property
    def live(self) -> bool:
        return self._connected.is_set() and (time.time() - self.last_msg_ts) < 30

    def _bootstrap(self):
        for inst in self.instruments:
            try:
                for c in self.rest.get_candles(inst, self.interval):
                    self._candles[inst][c.time] = c
                self._ticks[inst] = self.rest.get_tick(inst)
            except Exception as e:  # noqa: BLE001
                log.warning("REST bootstrap %s failed: %s", inst, e)

    async def _run(self):
        import websockets  # imported lazily so REST-only installs still work
        backoff = 1
        while not self._stop:
            try:
                async with websockets.connect(self.url, ping_interval=20, max_size=2**22) as ws:
                    syms = [WS_SYMBOLS[i] for i in self.instruments]
                    await ws.send(json.dumps({"method": "subscribe",
                                              "params": {"channel": "ticker", "symbol": syms}}))
                    await ws.send(json.dumps({"method": "subscribe",
                                              "params": {"channel": "ohlc", "symbol": syms,
                                                         "interval": self.interval, "snapshot": True}}))
                    self._connected.set()
                    backoff = 1
                    log.info("Kraken WS connected: %s", ", ".join(syms))
                    async for raw in ws:
                        self.last_msg_ts = time.time()
                        self._handle(raw)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                self._connected.clear()
                log.warning("Kraken WS dropped (%s). Reconnecting in %ss", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
                await asyncio.to_thread(self._bootstrap)   # resync gaps

    def _handle(self, raw: str):
        msg = json.loads(raw)
        ch = msg.get("channel")
        if ch == "ticker":
            for d in msg.get("data", []):
                inst = WS_TO_INST.get(d.get("symbol"))
                if inst:
                    tk = Tick(price=float(d["last"]), bid=float(d["bid"]), ask=float(d["ask"]))
                    self._ticks[inst] = tk
                    if self.on_tick:
                        self.on_tick(inst, tk)
        elif ch == "ohlc":
            for d in msg.get("data", []):
                inst = WS_TO_INST.get(d.get("symbol"))
                if not inst:
                    continue
                # Kraken sends nanosecond precision; trim for Python < 3.11 compatibility
                t = int(datetime.fromisoformat(d["interval_begin"][:19] + "+00:00").timestamp())
                c = Candle(t, float(d["open"]), float(d["high"]), float(d["low"]), float(d["close"]),
                           float(d.get("volume", 0.0)), self.interval,
                           closed=(t + self.interval * 60) <= time.time())
                book = self._candles[inst]
                book[t] = c
                if len(book) > self.MAX_BARS:
                    for k in sorted(book)[: len(book) - self.MAX_BARS]:
                        del book[k]

    # ── reads ──────────────────────────────────────────────────
    def get_candles(self, instrument: str, interval: int | None = None) -> list[Candle]:
        interval = interval or self.interval
        if interval != self.interval:
            return self.rest.get_candles(instrument, interval)
        if not self.live:  # socket down → REST
            try:
                for c in self.rest.get_candles(instrument, interval):
                    self._candles[instrument][c.time] = c
            except Exception as e:  # noqa: BLE001
                log.warning("REST fallback candles %s failed: %s", instrument, e)
        now = time.time()
        out = []
        for t in sorted(self._candles[instrument]):
            c = self._candles[instrument][t]
            c.closed = c.end_time <= now
            out.append(c)
        return out

    def get_tick(self, instrument: str) -> Tick:
        tk = self._ticks.get(instrument)
        if tk is None or (not self.live and time.time() - tk.ts > 5):
            tk = self.rest.get_tick(instrument)
            self._ticks[instrument] = tk
        return tk

    def get_prices(self, instruments) -> dict[str, float]:
        out = {}
        for inst in instruments:
            try:
                out[inst] = self.get_tick(inst).price
            except Exception as e:  # noqa: BLE001
                log.warning("tick %s failed: %s", inst, e)
        return out
