"""
Offline end-to-end test: synthetic NQ 5m tape with a textbook NY AM unicorn
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
from strategy import SilverBulletEngine, market_open  # noqa: E402
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


def f(p):
    """Rescale the template (drawn at 70000) to NQ ~21000 with 1/10 the range."""
    return 21000 + (p - 70000) / 10


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
        out.append(Candle(t, f(o), f(h), f(l), f(c), 1.0, 5, closed=True))
        t += 300
        i += 1
    return out


DAILY = [Candle(ts(0, 0, (2026, 11, 2)) - 86400, f(68000), f(70500), f(67800), f(70200), 1, 1440, True)]


def test_engine_finds_unicorn():
    eng = SilverBulletEngine("NQ")
    st = eng.evaluate(tape((9, 30)), ts(9, 34), DAILY)
    assert st.status == "ARMED", (st.status, st.notes)
    s = st.signal
    assert s.direction == "LONG" and s.unicorn
    assert (s.zone_bot, s.zone_top) == (21024, 21028)
    assert s.entry == 21028.0 and s.stop == 21001.5          # tick-rounded (0.25)
    assert s.target == 21081.0
    assert s.hard_rules_pass(), s.failed_rules()
    st2 = eng.evaluate(tape((9, 35)), ts(9, 39), DAILY)
    assert st2.status == "TRIGGERED" and st2.setup_id == st.setup_id
    print(s.summary_text())


def test_htf_filter_blocks_counter_trend():
    bear_daily = [Candle(DAILY[0].time, f(70200), f(70500), f(67800), f(68000), 1, 1440, True)]
    st = SilverBulletEngine("NQ").evaluate(tape((9, 30)), ts(9, 34), bear_daily)
    assert st.status != "ARMED" or not st.signal.is_long


def test_rule_based_chairman_scores():
    st = SilverBulletEngine("NQ").evaluate(tape((9, 30)), ts(9, 34), DAILY)
    sw = SwarmEngine(api_key="")
    res = asyncio.run(sw.deliberate(st.signal))
    print(res["briefing"])
    assert res["source"] == "rule_based"
    assert parse_score(res["briefing"]) == res["score"]
    assert res["score"] >= config.AUTO_EXECUTE_SCORE


class FakeFeed:
    def __init__(self):
        self.until = (9, 30)
        self.price = 21042.0

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
                            instruments=["NQ"], clock=lambda: clock["t"])
        from multi_scanner import MultiScanner
        orch.scanner = MultiScanner(feed, ["NQ"])

        async def run():
            await orch.step()                                  # ARMED, swarm spawned
            await asyncio.gather(*orch._tasks)
            ev = next(iter(orch.monitor.events.values()))
            assert ev.status == "APPROVED", (ev.status, ev.briefing)
            feed.until, feed.price, clock["t"] = (9, 35), 21027.5, ts(9, 36)
            await orch.step()                                  # touch → fill at limit
            assert ev.status == "FIRED", (ev.status, ev.reasons)
            pos = orch.trader.open_positions[0]
            assert pos.entry_price == 21028.0 and pos.contracts == 1 and pos.contract == "MNQ"
            feed.until, feed.price, clock["t"] = (9, 45), 21088.0, ts(9, 49)
            await orch.step()                                  # target hit
        asyncio.run(run())
        assert not orch.trader.open_positions
        p = orch.trader.closed[0]
        assert p.exit_reason == "TARGET" and p.outcome == "WIN"
        assert abs(p.pnl_points / p.risk_points - 2.0) < 1e-9
        assert abs(p.pnl_dollars - (53.0 * 2.0 - 4 * 0.0 - 2 * config.FEE_PER_CONTRACT_SIDE)) < 1e-9
        print(orch.trader.mark_to_market({"NQ": 21088.0}))
        orch.trader.print_trade_log()
        orch.trader.print_stats()
        # persistence
        again = PaperTrader(log_path=log)
        assert len(again.closed) == 1 and abs(again.balance - orch.trader.balance) < 1e-9
        # same setup can never be traded twice
        assert p.setup_id in again.taken_setups


def test_paper_trader_dual_style_and_force_close():
    t = PaperTrader(log_path=None)
    t.open_trade(instrument="ES", direction="SELL", entry=6000, stop=6010, target=5980, label="kw")
    pos = t.open_positions[0]
    assert pos.direction == "SHORT" and pos.contracts == 2 and pos.contract == "MES"   # 10pt x $5 x 2 = $100
    c = t.check_exits("ES", 6012, 5975)[0]                       # both hit → stop
    assert c.exit_reason == "STOP" and c.close_price == 6010.25  # 1 tick slippage
    assert abs(c.pnl_dollars - (-10.25 * 10 - 4 * config.FEE_PER_CONTRACT_SIDE)) < 1e-9
    t.open_trade(instrument="GC", direction="BUY", entry=2400, stop=2395, target=2410)
    assert t.open_positions[0].contracts == 2 and t.open_positions[0].contract == "MGC"
    t.force_close_all()
    assert abs(t.closed[-1].close_price - 2399.9) < 1e-9 and t.closed[-1].exit_reason == "FORCED"
    s = t.stats()
    assert set(["trades", "wins", "losses", "win_pct", "avg_win", "avg_loss", "profit_factor",
                "net_pnl", "final_balance", "return_pct"]) <= set(s)


def test_cme_calendar_and_sizing_gates():
    assert market_open(ts(9, 30))                                   # Tuesday NY AM
    assert not market_open(ts(17, 30))                              # daily maintenance break
    assert not market_open(ts(10, 0, (2026, 11, 7)))                # Saturday
    assert not market_open(ts(12, 0, (2026, 11, 8)))                # Sunday before 18:00
    assert market_open(ts(19, 0, (2026, 11, 8)))                    # Sunday Globex open
    assert SilverBulletEngine("NQ").evaluate(tape((9, 30)), ts(10, 0, (2026, 11, 7)), DAILY) is None
    st = SilverBulletEngine("NQ").evaluate(tape((9, 30)), ts(9, 34), DAILY)
    sig = st.signal
    sig.stop = sig.entry - 55                                       # 1 MNQ = $110 > $100 risk
    sig.reprice(sig.entry)
    t = PaperTrader(log_path=None)
    failed = {c.name for c in t.pre_trade_checks(sig, ts(9, 36)) if not c.passed}
    assert "contract_sizing" in failed, failed


def test_engine_survives_reset_then_new_setup():
    """Regression: _reset() used to swap the state dict while evaluate() held the old one (KeyError)."""
    import random
    random.seed(7)
    eng, p, bars = SilverBulletEngine("NQ"), 21000.0, []
    t0 = ts(18, 0, (2026, 10, 25))
    for m in range(0, 7 * 288):
        o = p
        c = p + random.gauss(0, 12) + (random.random() < 0.05) * random.choice([-1, 1]) * 60
        bars.append(Candle(t0 + m * 300, o, max(o, c) + abs(random.gauss(0, 6)),
                           min(o, c) - abs(random.gauss(0, 6)), c, 1, 5, True))
        p = c
    for k in range(300, len(bars)):
        eng.evaluate(bars[max(0, k - 432):k + 1], bars[k].end_time - 1, DAILY)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
