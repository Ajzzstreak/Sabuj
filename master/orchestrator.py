"""
orchestrator.py — main async loop.

    cd master && python orchestrator.py            # WebSocket feed (default)
    python orchestrator.py --rest                  # REST polling only
    python orchestrator.py --no-swarm              # rules only, rule-based chairman
    python orchestrator.py --once                  # one scan pass, print checklist, exit

Pipeline per instrument:
  feed → scanner (rule engine replays current kill zone) → ARMED setup
  → mandatory-rule gate → swarm deliberation (background) → score >= 7
  → price touches zone → account risk gate → open_trade(signal)
  → exits by stop / target / time stop / NY flatten — no human input.
"""
from __future__ import annotations

import argparse
import asyncio
import html
import logging
import signal as _signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for p in (ROOT / "master", ROOT / "trading_bot"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import config  # noqa: E402
from market_data import KrakenFeed, KrakenWSFeed  # noqa: E402
from multi_scanner import MultiScanner  # noqa: E402
from paper_trader import PaperTrader  # noqa: E402
from signal_monitor import SignalMonitor, SignalEvent  # noqa: E402
from strategy import active_window, ny_dt  # noqa: E402
from swarm_engine import SwarmEngine  # noqa: E402

log = logging.getLogger("orchestrator")

auto_open_html = False   # never pop a browser


class Orchestrator:
    def __init__(self, feed=None, trader: PaperTrader | None = None, swarm: SwarmEngine | None = None,
                 instruments=None, clock=time.time, loop_sec: float = config.SCAN_LOOP_SEC):
        self.instruments = list(instruments or config.INSTRUMENT_UNIVERSE)
        self.feed = feed
        self.trader = trader or PaperTrader()
        self.swarm = swarm or SwarmEngine()
        self.scanner: MultiScanner | None = None
        self.monitor = SignalMonitor()
        self.clock = clock
        self.loop_sec = loop_sec
        self.stop_event = asyncio.Event()
        self._tasks: set[asyncio.Task] = set()
        self._last_prices: dict[str, float] = {}
        self._last_status: dict[str, str] = {}
        config.BRIEFINGS_DIR.mkdir(parents=True, exist_ok=True)

    # ── helpers ────────────────────────────────────────────────
    def _spawn(self, coro, name: str):
        t = asyncio.create_task(coro, name=name)
        self._tasks.add(t)
        t.add_done_callback(self._tasks.discard)
        return t

    def _prices(self) -> dict[str, float]:
        px = self.feed.get_prices(self.instruments)
        self._last_prices.update(px)
        return px

    def banner(self):
        wins = ", ".join(f"{k} {w['start']}-{w['end']}" for k, w in config.TRADE_WINDOWS.items() if w["enabled"])
        feed = type(self.feed).__name__
        print("═" * 78)
        print(" ICT PO3 + SILVER BULLET / UNICORN — CRYPTO PAPER TRADER")
        print(f" Instruments : {', '.join(self.instruments)}  (Kraken spot data, {feed})")
        print(f" Kill zones  : {wins} New York time")
        print(f" Risk        : ${config.RISK_PER_TRADE}/trade  balance ${self.trader.balance:,.2f}  "
              f"daily stop -${config.MAX_DAILY_LOSS}  fee {config.FEE_RATE_PER_SIDE * 100:.3f}%/side")
        print(f" Execution   : auto-fire at swarm score >= {config.AUTO_EXECUTE_SCORE}  target {config.TARGET_R}R  "
              f"time stop {config.MAX_HOLD_MINUTES}m")
        print(f" Swarm       : {'LLM council (OpenRouter)' if self.swarm.llm_enabled else 'rule-based (no API key)'}")
        print("═" * 78)

    # ── swarm ──────────────────────────────────────────────────
    async def _deliberate(self, ev: SignalEvent):
        t0 = time.time()
        try:
            res = await self.swarm.deliberate(ev.signal)
        except Exception as e:  # noqa: BLE001
            log.exception("swarm failed")
            res = {"briefing": self.swarm._rule_based_chairman(ev.signal, {}), "source": "rule_based",
                   "score": None, "consensus": "", "confidence": ""}
            from swarm_engine import parse_score
            res["score"] = parse_score(res["briefing"]) or 1
            ev.reasons.append(f"swarm error: {e}")
        ev.briefing, ev.score, ev.swarm_source = res["briefing"], res["score"], res["source"]
        ev.consensus, ev.confidence = res["consensus"], res["confidence"]
        ev.briefing_path = self._write_html(ev)
        if ev.terminal:
            return
        ev.status = "APPROVED" if ev.approved else "REJECTED"
        print(f"\n🧠 SWARM {ev.signal.instrument} {ev.signal.label}: {ev.score}/10 {ev.consensus} "
              f"[{ev.swarm_source}, {time.time() - t0:.1f}s] → {ev.status}")
        if ev.status == "APPROVED" and ev.touched_ts:
            px = self._last_prices.get(ev.instrument)
            if px:
                self._try_fire(ev, px, late=True)

    def _write_html(self, ev: SignalEvent) -> str:
        s = ev.signal
        rows = "".join(
            f"<tr><td>{'✅' if c.passed else '❌'}</td><td>{html.escape(c.name)}{' *' if c.hard else ''}</td>"
            f"<td>{html.escape(c.detail)}</td></tr>" for c in s.checklist)
        doc = f"""<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(s.label)}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;background:#0f1115;color:#e6e6e6}}
td{{padding:4px 8px;border-bottom:1px solid #333}}pre{{background:#1a1d24;padding:12px;white-space:pre-wrap}}</style></head><body>
<h2>{html.escape(s.instrument)} {s.direction} — {html.escape(s.label)}</h2>
<p>Entry {s.entry:,.2f} · Stop {s.stop:,.2f} · Target {s.target:,.2f} · Score {ev.score}/10 ({html.escape(ev.swarm_source)})</p>
<table>{rows}</table><h3>Briefing</h3><pre>{html.escape(ev.briefing)}</pre>
<p>Setup {html.escape(s.setup_id)} · created {ny_dt(ev.created_ts):%Y-%m-%d %H:%M:%S} NY</p></body></html>"""
        path = config.BRIEFINGS_DIR / f"{s.setup_id.replace(':', '-')}.html"
        path.write_text(doc)
        return str(path)

    # ── execution ──────────────────────────────────────────────
    def _try_fire(self, ev: SignalEvent, price: float, late: bool = False):
        if ev.terminal:
            return
        if not ev.deliberated:
            ev.touched_ts = ev.touched_ts or self.clock()
            return
        if not ev.approved:
            ev.status = "REJECTED"
            return
        sig = ev.signal
        if late:
            # zone was touched while the council deliberated: market fill only if still worth it
            if (sig.is_long and price <= sig.stop) or (not sig.is_long and price >= sig.stop):
                ev.status, _ = "EXPIRED", ev.reasons.append("price through stop before approval")
                return
            sig.reprice(price)
            if abs(sig.target - price) / sig.risk_points < config.TARGET_R * 0.75:
                ev.status = "EXPIRED"
                ev.reasons.append("late fill degrades R:R")
                return
        else:
            sig.reprice(sig.entry)          # resting limit at zone edge
        self._auto_fire(ev)

    def _auto_fire(self, ev: SignalEvent):
        checks = self.trader.pre_trade_checks(ev.signal, self.clock())
        failed = [c for c in checks if not c.passed]
        if failed:
            ev.status = "BLOCKED"
            ev.reasons += [f"{c.name}: {c.detail}" for c in failed]
            print(f"\n⛔ BLOCKED {ev.signal.instrument} {ev.signal.label}: "
                  + "; ".join(f"{c.name} ({c.detail})" for c in failed))
            return
        pos = self.trader.open_trade(ev.signal)
        ev.status = "FIRED"
        ev.position_id = pos.id

    # ── per-loop work ──────────────────────────────────────────
    def _check_exits(self, prices: dict[str, float]):
        for inst in {p.instrument for p in self.trader.open_positions}:
            px = prices.get(inst)
            if px is None:
                continue
            hi = lo = px
            if not isinstance(self.feed, KrakenWSFeed) or not self.feed.live:
                # REST is slow: include the forming candle's range since entry
                try:
                    c = self.feed.get_candles(inst, config.CANDLE_INTERVAL_MIN)[-1]
                    if any(p.instrument == inst and c.time >= p.open_time for p in self.trader.open_positions):
                        hi, lo = max(hi, c.high), min(lo, c.low)
                except Exception:  # noqa: BLE001
                    pass
            self.trader.check_exits(inst, hi, lo)
        self.trader.check_time_exits(prices, self.clock())

    def _process_state(self, inst: str, st, price: float | None):
        now = self.clock()
        status = st.status if st else "OFF-WINDOW"
        key = f"{status}|{st.setup_id if st else ''}"
        if self._last_status.get(inst) != key:
            self._last_status[inst] = key
            win = st.window if st else "-"
            print(f"[{ny_dt(now):%H:%M:%S}] {inst:<4} {win:<7} {status}"
                  + (f"  {st.signal.label} zone {st.signal.zone_bot:,.2f}-{st.signal.zone_top:,.2f}"
                     if st and st.signal else ""))

        if st is None or st.signal is None:
            self.monitor.expire_others(inst, None, "setup reset / window closed")
            return
        self.monitor.expire_others(inst, st.setup_id, "superseded")

        if st.status == "EXPIRED":
            ev = self.monitor.get(st.setup_id)
            if ev and not ev.terminal:
                ev.status, _ = "EXPIRED", ev.reasons.append("window closed before fill")
            return

        ev, new = self.monitor.register(st.signal)
        if new:
            if st.status == "TRIGGERED":
                ev.status = "EXPIRED"
                ev.reasons.append("zone already touched before the bot saw the setup")
                return
            if not st.signal.hard_rules_pass():
                ev.status = "BLOCKED"
                ev.reasons += st.signal.failed_rules()
                print(f"⛔ {inst} {st.signal.label} fails mandatory rules: {', '.join(st.signal.failed_rules())}")
                return
            print(f"\n🎯 ARMED {inst} {st.signal.label}  limit {st.signal.entry:,.2f}  SL {st.signal.stop:,.2f}  "
                  f"TP {st.signal.target:,.2f}  confluence {st.signal.confluence}/{st.signal.confluence_max}")
            self._spawn(self._deliberate(ev), f"swarm-{st.setup_id}")

        if ev.terminal:
            return
        if price is not None and self.scanner.touched(st, price):
            self._try_fire(ev, price, late=False)
        elif st.status == "TRIGGERED":
            ev.touched_ts = ev.touched_ts or now
            if ev.approved and price is not None:
                self._try_fire(ev, price, late=True)

    def _spreads(self, prices):
        for opp in self.scanner.scan_spreads(self.clock()):
            if len(self.trader.open_positions) + 2 > config.MAX_OPEN_POSITIONS or \
               self.trader.daily_pnl() <= -config.MAX_DAILY_LOSS:
                continue
            print(f"\n↔ SPREAD {opp['pair']} deviation {opp['dev_pct']:+.2f}%")
            for leg in opp["legs"]:
                self.trader.open_trade(instrument=leg["instrument"], direction=leg["direction"],
                                       entry=leg["entry"], stop=leg["stop"], target=leg["target"],
                                       label=leg["label"])

    async def step(self):
        prices = await asyncio.to_thread(self._prices)
        self._check_exits(prices)
        states = await asyncio.to_thread(self.scanner.scan_all, self.clock())
        for inst, st in states.items():
            self._process_state(inst, st, prices.get(inst))
        self._spreads(prices)

    async def _main_loop(self):
        while not self.stop_event.is_set():
            t0 = time.time()
            try:
                await self.step()
            except Exception as e:  # noqa: BLE001
                log.exception("loop error: %s", e)
            await asyncio.sleep(max(0.05, self.loop_sec - (time.time() - t0)))

    async def _pnl_monitor_task(self):
        while not self.stop_event.is_set():
            try:
                await asyncio.wait_for(self.stop_event.wait(), timeout=config.PNL_MONITOR_SEC)
                break
            except asyncio.TimeoutError:
                pass
            prices = {}
            for inst in self.instruments:
                try:
                    prices[inst] = (await asyncio.to_thread(self.feed.get_tick, inst)).price
                except Exception:  # noqa: BLE001
                    pass
            self._last_prices.update(prices)
            print(self.trader.mark_to_market(prices))
            w = active_window(self.clock())
            print(f" Window: {w[0] if w else 'OFF (no new entries)'}   "
                  f"Signals: {self.monitor.summary() or '-'}")
            for ev in self.monitor.live():
                print("  " + ev.line())

    # ── lifecycle ──────────────────────────────────────────────
    async def run(self, once: bool = False):
        if self.feed is None:
            self.feed = KrakenWSFeed(self.instruments) if config.USE_WEBSOCKET else KrakenFeed()
        if isinstance(self.feed, KrakenWSFeed):
            await self.feed.start()
        self.scanner = MultiScanner(self.feed, self.instruments)
        self.banner()

        if once:
            await self.step()
            for inst, st in self.scanner.states.items():
                print(f"\n── {inst}: {st.status if st else 'outside kill zone'}")
                if st and st.signal:
                    print(st.signal.summary_text())
                if st:
                    print("   notes: " + " | ".join(st.notes))
            await asyncio.gather(*self._tasks, return_exceptions=True)
            print(self.trader.mark_to_market(self._last_prices))
            await self._shutdown(close_positions=False)
            return

        loop = asyncio.get_running_loop()
        for sig in (_signal.SIGINT, _signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.stop_event.set)
            except NotImplementedError:   # Windows
                pass
        self._spawn(self._main_loop(), "main-loop")
        self._spawn(self._pnl_monitor_task(), "pnl-monitor")
        await self.stop_event.wait()
        print("\nShutdown requested — closing session.")
        await self._shutdown(close_positions=not ARGS_KEEP_OPEN)

    async def _shutdown(self, close_positions: bool = True):
        self.stop_event.set()
        for t in list(self._tasks):
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        if close_positions and self.trader.open_positions:
            try:
                self._prices()
            except Exception:  # noqa: BLE001
                pass
            # last known market price; entry_price only if no price was ever seen
            self.trader.force_close_all(self._last_prices or None)
        if isinstance(self.feed, KrakenWSFeed):
            await self.feed.stop()
        self.trader.print_trade_log()
        self.trader.print_stats()


ARGS_KEEP_OPEN = False


def main():
    global ARGS_KEEP_OPEN
    ap = argparse.ArgumentParser(description="ICT Silver Bullet crypto paper trader")
    ap.add_argument("--rest", action="store_true", help="REST polling instead of WebSocket")
    ap.add_argument("--no-swarm", action="store_true", help="skip LLMs, rule-based chairman only")
    ap.add_argument("--once", action="store_true", help="single scan pass then exit")
    ap.add_argument("--keep-open", action="store_true", help="persist open positions on exit instead of closing")
    ap.add_argument("--instruments", default=",".join(config.INSTRUMENT_UNIVERSE))
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.WARNING,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    if a.rest:
        config.USE_WEBSOCKET = False
    if a.no_swarm:
        config.SWARM_ENABLED = False
    ARGS_KEEP_OPEN = a.keep_open
    insts = [i.strip().upper() for i in a.instruments.split(",") if i.strip()]
    loop_sec = config.SCAN_LOOP_SEC if config.USE_WEBSOCKET else 5.0
    orch = Orchestrator(instruments=insts, swarm=SwarmEngine(), loop_sec=loop_sec)
    asyncio.run(orch.run(once=a.once))


if __name__ == "__main__":
    main()
