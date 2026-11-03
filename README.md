# ICT PO3 + Silver Bullet / Unicorn — CME Futures Paper Trader

A rule-based futures paper-trading bot for Nasdaq-100 (NQ), S&P 500 (ES) and Gold (GC).
Orders are sized in micro contracts (MNQ $2/pt, MES $5/pt, MGC $10/pt), so $100 risk works with whole contracts.
Price data comes from Yahoo Finance's free chart API (no key). **CME data there is delayed about 10 minutes**: fine for validating the rules on paper, not for live execution.
It ports the strategy from `ICT Silver Bullet v6.4` (Pine), checked against the ICT 2022 Mentorship notes and the Stat-Map Unicorn document.
It only enters during the London and NY AM kill zones, sizes every trade to risk $100, and exits on mechanical rules.

```bash
pip install -r requirements.txt
export OPENROUTER_API_KEY="your_key_here"     # optional — without it the swarm runs rule-based
cd master && python orchestrator.py           # NQ, ES, GC
python orchestrator.py --instruments NQ,GC    # subset
python orchestrator.py --once                 # one scan, print every checklist, exit
python orchestrator.py --keep-open            # persist open positions across restart instead of closing
python ../tests/test_pipeline.py              # offline end-to-end test
```

## Layout
```
master/      config.py  orchestrator.py  swarm_engine.py  multi_scanner.py
             market_data.py  signal_monitor.py  briefings/ (HTML, never auto-opened)
trading_bot/ paper_trader.py  strategy.py  futures_trade_log.json (auto, survives restarts)
tests/       test_pipeline.py
```

## Decision pipeline (no discretion anywhere)
| # | Gate | Type | Source |
|---|------|------|--------|
| 1 | CME Globex open (Sun 18:00 → Fri 17:00 NY, 17–18 break) and inside kill zone: LONDON 02:00–05:00, NY_AM 09:00–11:00 | mandatory | Pine sessions / Mentorship ep. 3 |
| 2 | HTF daily bias allows direction (last completed daily candle) | mandatory | Pine HTF filter |
| 3 | Confirmed, still-unswept swing low/high is swept | mandatory | Pine step 2 |
| 4 | Breaker block = highest up-close (long) / lowest down-close (short) candle between the swing and the sweep | mandatory | Pine header, Unicorn doc |
| 5 | Displacement candle, body ≥ 50%, closes through the breaker | mandatory | Pine step 4 |
| 6 | FVG created by the displacement, ≥ `min_fvg` (NQ 5, ES 1.25, GC 1.0 pts) ("no FVG, no trade") | mandatory | Pine step 5, Mentorship |
| 7 | Zone in discount (long) / premium (short) of displacement leg | mandatory (`REQUIRE_DISCOUNT`) | Mentorship |
| 8 | Unicorn: FVG overlaps breaker | confluence (`REQUIRE_UNICORN`) | Unicorn doc |
| 9 | Session range sweep in favour (Asian for London, London for NY) | confluence | Pine layer 1 |
| 10 | Draw on liquidity beyond entry | confluence | Mentorship |
| 11 | PO3: long below / short above midnight open | confluence | PO3 |
| 12 | Inside Silver Bullet hour | confluence | Pine |
| 13 | Swarm council score ≥ 7 | veto only | swarm_engine |
| 14 | Account gates: stop within per-instrument limits (NQ 8–60, ES 2–20, GC 2–10 pts); at least 1 micro contract fits in $100 risk; fees ≤ 15% of risk; ≤ 3 open; 1 per instrument; daily loss −$300; ≤ 6 trades/day; 1 trade per window per instrument | mandatory | paper_trader |

Entry is a limit at the zone's near edge, rounded to the contract tick (0.25 index, 0.10 gold), filled on the first touch.
Contracts = floor($100 ÷ (stop points × $/point)). Rounding down means real risk is often $50–100, never more.
Stop, time, flatten and forced exits fill 1 tick worse (slippage). The stop goes just beyond the sweep extreme, with a buffer of 10% of the zone.
The target is 2R; 4R and 5R are recorded as reference levels.
Exits trigger on whichever comes first: stop, target, a 240-minute time stop, or a hard flatten at 16:00 NY. If one price range touches both stop and target, the stop counts (conservative).

## Where this differs from the Pine v6.4 source (bugs fixed)
1. **Step 2 never fires in Pine.** `isSwingLow` loops `i = 1..n`, so it compares against `low[0]`. That requires `low[n] < low[0]`, while the trigger needs `low[0] < low[n]`. Here swings are confirmed only by bars before the sweep.
2. **Pine step 3 picks the wrong candle.** The code takes the last *down*-close candle, which is an order block. The script's own header and ICT define the breaker as the highest *up*-close candle. The ICT definition is used.
3. **Pine invalidates at 2× zone size.** A 40-point unicorn zone dies on an 80-point drift. Here a zone is consumed when price reaches +2R before the retest.
4. **Pine flips London bias when price reaches the opposite side of the range,** which is the draw being delivered, not a reversal. Here the first sweep latches.
5. **The sweep extreme keeps updating until displacement,** so the stop sits beyond the real low or high.

## Fees: why futures instead of crypto
| Trade ($100 risk) | Round-trip cost | Share of risk |
|---|---|---|
| 1–2 micro futures @ $0.62/side | $1.24–2.48 | 1–2.5% |
| Kraken Futures BTC, 0.3% stop (0.05%/side) | ~$33 | 33% |
| Kraken spot BTC, 0.3% stop (0.40%/side) | ~$265 | 265% |

## Data feed
`FuturesFeed` in `market_data.py` uses one HTTP call per symbol for both candles and last price, cached for 8 seconds.
Any real-time source can replace it as long as it provides `get_candles`, `get_tick` and `get_prices`. Real-time options: Tradovate API, Rithmic, IBKR (CME data roughly $1–11/month), Databento.
Gold here is COMEX GC futures, which track spot XAU/USD apart from a small carry basis.
CME holidays and early closes are not modelled.

## Live-trading gate
`stats()["live_ready"]` turns True only after 50+ closed trades with a win rate above 50% and a profit factor above 1.5.
No live execution code is included.

## Backtesting a full year
```bash
python backtest/dukascopy.py --year 2025     # free 1m data → data/{NQ,ES,GC}_2025_m1.csv
python backtest/backtest.py  --year 2025     # → backtest/results/report_2025.md, trades_2025.csv
```
- Data sources: Dukascopy `USATECHIDXUSD` (Nasdaq-100 cash, NQ proxy), `USA500IDXUSD` (S&P 500 cash, ES proxy) and `XAUUSD` (spot gold). They're free and need no account.
- Any other CSV works too: `--data NQ=nq.csv,ES=es.csv,GC=gc.csv` (Databento, HistData, generic OHLC; add `--tz` for naive timestamps).
- The backtest calls the live `SilverBulletEngine.evaluate()` on every closed 5m bar and then applies the same rules, gates, rule-based swarm, sizing and fees as the live bot.
- Fills and exits are modelled conservatively: a touch and a stop in the same bar counts as a loss, a stop and a target in the same bar counts as a stop, and stop exits pay 1 tick of slippage.
- The report covers the funnel (sessions → setups found → rule and gate failures → swarm → fills), trades, wins and losses, win %, planned versus realised R, expectancy, profit factor, max drawdown and a monthly breakdown. It shows the live config (swarm ≥ 7) and a rules-only variant.
