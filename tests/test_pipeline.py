"""
Offline end-to-end test: synthetic BTC 5m tape with a textbook NY AM unicorn
long. Verifies engine → checklist → swarm (rule-based) → fill → target exit
→ persistence. Run:  python tests/test_pipeline.py   (or pytest)
"""
import asyncio
import math
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "master"), str(ROOT / "trading_bot")]

import config  # noqa: E402
from market_data import Candle, Tick  # noqa: E402
from strategy import SilverBulletEngine  # noqa: E402
from paper_trader import PaperTrader  # noqa: E402
from swarm_engine import SwarmEngine, parse_score  # noqa: E402
from orchestrator import Orchestrator  # noqa: E402

NY = ZoneInfo("America/New_York")
DAY = (2026, 11, 3)


def ts(h, m, day=DAY):
    return int(datetime(*day, h, m, tzinfo=NY).timestamp())


KEY = {  # NY time: (o, h, l, c)
    (8, 25): (70250, 70270, 70180, 70200),
    (8, 30): (70200, 70210, 70100, 70150),   # swing low = sell-side liquidity
    (8, 35): (70150, 70260, 70140, 70250),
    (8, 40): (70250, 70320, 70240, 70310),   # breaker (highest up-close)
    (8, 45): (70310, 70315, 70220, 70230),
    (8, 50): (70230, 70240, 70160, 70170),
    (8, 55): (70170, 70190, 70150, 70180),
    (9, 0):  (70180, 70195, 70160, 70175),
    (9, 5):  (70175, 70185, 70155, 70160),
    (9, 10): (70160, 70170, 70040, 70080),   # sweep of 70100 + London low
    (9, 15): (70080, 70100, 70020, 70090),   # extreme 70020
    (9, 20): (70090, 70420, 70080, 70400),   # displacement through breaker
    (9, 25): (70400, 70520, 70280, 70500),   # FVG 70100-70280, overlaps breaker → unicorn
    (9, 30): (70500, 70510, 70400, 70420),
    (9, 35): (70420, 70430, 70270, 70300),   # retest
    (9, 40): (70300, 70700, 70290, 70680),
    (9, 45): (70680, 70900, 70660, 70880),   # 2R target ~70808
}


def tape(until=(9, 45)):
    out = []
    t = ts(18, 0, (2026, 11, 2))
    end = ts(*until)
    i = 0
    while t <= end:
        d = datetime.fromtimestamp(t, NY)
        k = (d.hour, d.minute)
        if d.date() == datetime(*DAY).date() and k in KEY:
            o, h, l, c = KEY[k]
        else:
            c = 70300 + 60 * math.sin(i / 5)
            o, h, l = c - 5, c + 30, c - 30
        out.append(Candle(t, o, h, l, c, 1.0, 5, closed=True))
        t += 300
        i += 1
    return out


DAILY = [Candle(ts(0, 0, (2026, 11, 2)) - 86400, 68000, 70500, 67800, 70200, 1, 1440, True)]


def test_engine_finds_unicorn():
    eng = SilverBulletEngine("BTC")
    st = eng.evaluate(tape((9, 30)), ts(9, 34), DAILY)
    assert st.status == "ARMED", (st.status, st.notes)
    s = st.signal
    assert s.direction == "LONG" and s.unicorn
    assert (s.zone_bot, s.zone_top) == (70240, 70280)
    assert s.entry == 70280 and abs(s.stop - 70016) < 1e-6
    assert s.hard_rules_pass(), s.failed_rules()
    st2 = eng.evaluate(tape((9, 35)), ts(9, 39), DAILY)
    assert st2.status == "TRIGGERED" and st2.setup_id == st.setup_id
    print(s.summary_text())


def test_htf_filter_blocks_counter_trend():
    bear_daily = [Candle(DAILY[0].time, 70200, 70500, 67800, 68000, 1, 1440, True)]
    st = SilverBulletEngine("BTC").evaluate(tape((9, 30)), ts(9, 34), bear_daily)
    assert st.status != "ARMED" or not st.signal.is_long


def test_rule_based_chairman_scores():
    st = SilverBulletEngine("BTC").evaluate(tape((9, 30)), ts(9, 34), DAILY)
    sw = SwarmEngine(api_key="")
    res = asyncio.run(sw.deliberate(st.signal))
    print(res["briefing"])
    assert res["source"] == "rule_based"
    assert parse_score(res["briefing"]) == res["score"]
    assert res["score"] >= config.AUTO_EXECUTE_SCORE


class FakeFeed:
    def __init__(self):
        self.until = (9, 30)
        self.price = 70420.0

    def get_candles(self, inst, interval=5):
        return DAILY if interval == 1440 else tape(self.until)

    def get_tick(self, inst):
        return Tick(self.price, self.price - 1, self.price + 1)

    def get_prices(self, insts):
        return {i: self.price for i in insts}


def test_orchestrator_end_to_end():
    with tempfile.TemporaryDirectory() as d:
        log = Path(d) / "log.json"
        clock = {"t": ts(9, 34)}
        feed = FakeFeed()
        orch = Orchestrator(feed=feed, trader=PaperTrader(log_path=log), swarm=SwarmEngine(api_key=""),
                            instruments=["BTC"], clock=lambda: clock["t"])
        from multi_scanner import MultiScanner
        orch.scanner = MultiScanner(feed, ["BTC"])

        async def run():
            await orch.step()                                  # ARMED, swarm spawned
            await asyncio.gather(*orch._tasks)
            ev = next(iter(orch.monitor.events.values()))
            assert ev.status == "APPROVED", (ev.status, ev.briefing)
            feed.until, feed.price, clock["t"] = (9, 35), 70275.0, ts(9, 36)
            await orch.step()                                  # touch → fill at limit
            assert ev.status == "FIRED", (ev.status, ev.reasons)
            pos = orch.trader.open_positions[0]
            assert pos.entry_price == 70280
            feed.until, feed.price, clock["t"] = (9, 45), 70880.0, ts(9, 49)
            await orch.step()                                  # target hit
        asyncio.run(run())
        assert not orch.trader.open_positions
        p = orch.trader.closed[0]
        assert p.exit_reason == "TARGET" and p.outcome == "WIN"
        assert abs(p.pnl_points / p.risk_points - 2.0) < 1e-9
        print(orch.trader.mark_to_market({"BTC": 70880.0}))
        orch.trader.print_trade_log()
        orch.trader.print_stats()
        # persistence
        again = PaperTrader(log_path=log)
        assert len(again.closed) == 1 and abs(again.balance - orch.trader.balance) < 1e-9
        # same setup can never be traded twice
        assert p.setup_id in again.taken_setups


def test_paper_trader_dual_style_and_force_close():
    t = PaperTrader(log_path=None)
    t.open_trade(instrument="ETH", direction="SELL", entry=3000, stop=3015, target=2970, label="kw")
    assert t.open_positions[0].direction == "SHORT"
    assert t.check_exits("ETH", 3020, 2960)[0].exit_reason == "STOP"   # both hit → stop
    t.open_trade(instrument="SOL", direction="BUY", entry=150, stop=148, target=154)
    t.force_close_all()
    assert t.closed[-1].close_price == 150 and t.closed[-1].exit_reason == "FORCED"
    s = t.stats()
    assert set(["trades", "wins", "losses", "win_pct", "avg_win", "avg_loss", "profit_factor",
                "net_pnl", "final_balance", "return_pct"]) <= set(s)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
