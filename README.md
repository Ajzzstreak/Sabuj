# ICT PO3 + Silver Bullet / Unicorn — Crypto Paper Trader

A rule-based crypto paper-trading bot for BTC, ETH and SOL using Kraken data (no API key needed).
It ports the strategy from `ICT Silver Bullet v6.4` (Pine), checked against the ICT 2022 Mentorship notes and the Stat-Map Unicorn document.
It only enters during the London and NY AM kill zones, sizes every trade to risk $100, and exits on mechanical rules.

```bash
pip install -r requirements.txt
export OPENROUTER_API_KEY="your_key_here"     # optional — without it the swarm runs rule-based
cd master && python orchestrator.py           # WebSocket feed
python orchestrator.py --rest                 # REST polling fallback
python orchestrator.py --once                 # one scan, print every checklist, exit
python orchestrator.py --keep-open            # persist open positions across restart instead of closing
python ../tests/test_pipeline.py              # offline end-to-end test
```

## Layout
```
master/      config.py  orchestrator.py  swarm_engine.py  multi_scanner.py
             market_data.py  signal_monitor.py  briefings/ (HTML, never auto-opened)
trading_bot/ paper_trader.py  strategy.py  trade_log.json (auto, survives restarts)
tests/       test_pipeline.py
```

## Decision pipeline (no discretion anywhere)
| # | Gate | Type | Source |
|---|------|------|--------|
| 1 | Inside kill zone: LONDON 02:00–05:00, NY_AM 09:00–11:00 (NY time) | mandatory | Pine sessions / Mentorship ep. 3 |
| 2 | HTF daily bias allows direction (last completed daily candle) | mandatory | Pine HTF filter |
| 3 | Confirmed, still-unswept swing low/high is swept | mandatory | Pine step 2 |
| 4 | Breaker block = highest up-close (long) / lowest down-close (short) candle between the swing and the sweep | mandatory | Pine header, Unicorn doc |
| 5 | Displacement candle, body ≥ 50%, closes through the breaker | mandatory | Pine step 4 |
| 6 | FVG created by the displacement, ≥ `min_fvg` ("no FVG, no trade") | mandatory | Pine step 5, Mentorship |
| 7 | Zone in discount (long) / premium (short) of displacement leg | mandatory (`REQUIRE_DISCOUNT`) | Mentorship |
| 8 | Unicorn: FVG overlaps breaker | confluence (`REQUIRE_UNICORN`) | Unicorn doc |
| 9 | Session range sweep in favour (Asian for London, London for NY) | confluence | Pine layer 1 |
| 10 | Draw on liquidity beyond entry | confluence | Mentorship |
| 11 | PO3: long below / short above midnight open | confluence | PO3 |
| 12 | Inside Silver Bullet hour | confluence | Pine |
| 13 | Swarm council score ≥ 7 | veto only | swarm_engine |
| 14 | Account gates: stop 0.10–3%, fees ≤ 30% of risk, leverage ≤ 3×, ≤ 3 open, 1 per instrument, daily loss −$300, ≤ 6 trades/day, 1 trade per window per instrument | mandatory | paper_trader |

Entry is a limit at the zone's near edge, filled on the first touch. The stop goes just beyond the sweep extreme, with a buffer of 10% of the zone.
The target is 2R; 4R and 5R are recorded as reference levels.
Exits trigger on whichever comes first: stop, target, a 240-minute time stop, or a hard flatten at 16:00 NY. If one price range touches both stop and target, the stop counts (conservative).

## Where this differs from the Pine v6.4 source (bugs fixed)
1. **Step 2 never fires in Pine.** `isSwingLow` loops `i = 1..n`, so it compares against `low[0]`. That requires `low[n] < low[0]`, while the trigger needs `low[0] < low[n]`. Here swings are confirmed only by bars before the sweep.
2. **Pine step 3 picks the wrong candle.** The code takes the last *down*-close candle, which is an order block. The script's own header and ICT define the breaker as the highest *up*-close candle. The ICT definition is used.
3. **Pine invalidates at 2× zone size.** A 40-point unicorn zone dies on an 80-point drift. Here a zone is consumed when price reaches +2R before the retest.
4. **Pine flips London bias when price reaches the opposite side of the range,** which is the draw being delivered, not a reversal. Here the first sweep latches.
5. **The sweep extreme keeps updating until displacement,** so the stop sits beyond the real low or high.

## Other differences from the rebuild spec
- `force_close_all()` still takes no required arguments. At shutdown the orchestrator passes the last known prices, because closing at entry price records fake $0 P&L and corrupts the 50-trade evaluation.
- The rule-based chairman ignores direction words ("short", "bearish") on SHORT setups, so a short isn't penalised for describing itself.
- If no LLM answers, each agent writes a deterministic view from the checklist. Without that, the keyword chairman would see empty text and always score 5, so nothing would ever trade.
- The WebSocket uses Kraken's v2 endpoint `wss://ws.kraken.com/v2` (ticker plus OHLC). It bootstraps history over REST and switches to REST automatically if no message arrives for 30 seconds.
- Spread arbitrage is implemented but `SPREAD_ENABLED = False`. It is not part of the ICT rule set.

## Fees decide whether this is viable
At $100 risk with a 0.3% stop on BTC, notional is about $33k.
| Venue | Fee/side | Round trip | Share of $100 risk |
|---|---|---|---|
| Kraken Futures (taker) | 0.05% | ~$33 | 33% |
| Kraken spot Pro, lowest tier (taker) | 0.40% | ~$265 | 265% |
| Kraken spot Pro, lowest tier (maker) | 0.25% | ~$165 | 165% |

The paper trader charges `FEE_RATE_PER_SIDE` (0.05% by default) and blocks trades whose fees exceed 30% of risk.
**Spot taker execution makes this strategy negative-expectancy by construction.** Live trading needs Kraken Futures or another perpetuals venue.

## Live-trading gate
`stats()["live_ready"]` turns True only after 50+ closed trades with a win rate above 50% and a profit factor above 1.5.
No live execution code is included.
