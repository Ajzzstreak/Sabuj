# TradingView: ICT Silver Bullet v7 Strategy

`ICT_SB_Strategy_v7.pine` is a Pine v6 port of the Python engine (`trading_bot/strategy.py`), with the same rules, the same bug fixes and the same risk gates.
It's a `strategy()`, not an `indicator()`, so TradingView's Strategy Tester runs the backtest.

## Install (2 minutes)
1. Open TradingView → Pine Editor (bottom panel) → **Open → New strategy**. Delete the template.
2. Paste the whole `ICT_SB_Strategy_v7.pine` → **Save** → **Add to chart**.
3. Chart: **MNQ1!**, **MES1!** or **MGC1!**, on the **5-minute** timeframe. For spot gold use OANDA:XAUUSD; sizing then uses units, so untick *Whole contracts only*.
4. Settings (gear icon): set *From/To* to 2025-01-01 → 2025-12-31.

## What you see on the chart
| Marking | Meaning |
|---|---|
| Blue / teal shading | London / NY AM kill zones; darker teal = Silver Bullet hour |
| Yellow / orange dashed boxes | Asian range / London range (liquidity pools) |
| Gray dotted line | Midnight open (PO3: discount below, premium above) |
| `ASIAN/LONDON LOW SWEPT` | Session context bias, which latches for the window |
| Dashed line + `SSL/BSL SWEPT` | The swing liquidity that was taken |
| Gray `BREAKER` box | Breaker block |
| `DISP` | Displacement candle |
| Green / red `FVG` box | Fair value gap; magenta `UNICORN` = FVG ∩ breaker |
| Blue / red / lime lines | Entry (limit), stop, 2R target; dotted = 4R and 5R |
| `BLOCKED …` | Setup formed, but a rule or gate failed (reason shown); no order |
| `RAN — NO FILL`, `EXPIRED`, `NO FVG — NO TRADE` | Setup ended without a trade |
| Strategy arrows | Actual fills and exits (SL / TP / TIME / FLATTEN) |
| Table | Live checklist (12 items), gates, levels, status line, day P&L, backtest summary |

## Reading the backtest
Strategy Tester tab → **Overview** (net P&L, profit factor, drawdown), **Performance Summary** (win %, average win/loss, ratio of average win to average loss = realised RR) and **List of Trades** (every entry and exit).
Commission ($0.62/contract/side) and 1 tick of slippage are preset in the script properties.

### Bar history limits
A full year of 5m futures is about 70,000 bars. TradingView loads only a capped number of bars per chart, and the cap depends on your plan. Only higher tiers offer **Deep Backtesting**, which runs over the full date range.
Check your plan's bar limit. If 2025 doesn't fit, either:
- run the Python backtester (`backtest/backtest.py`, no limit), or
- use the bar-replay button to step through specific days and watch the markings form bar by bar.

## Differences from the Python bot
- There's no LLM swarm, because Pine can't call APIs. *Min confluence* (0–5) is the stand-in filter. Default is 0, which is the "rules only" variant.
- TradingView's broker emulator fills limits intrabar. With *Bar Magnifier* (Premium) it uses lower-timeframe data to order stop/target hits inside a bar. Without it, results can differ slightly from the Python model, where a stop and target in the same bar always count as the stop.
- Time stop and flatten fire at the next bar open.

## Automating from TradingView (optional, later)
Every order carries a JSON `alert_message` (`action`, `symbol`, `qty`, `limit`, `stop`, `target`).
Create an alert on the strategy → *Order fills* → set a Webhook URL (paid plan required). A relay such as TradersPost, PickMyTrade or CrossTrade can forward it to Tradovate, NinjaTrader or a prop-firm account.
Run it on a demo account first.
