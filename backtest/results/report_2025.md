# Backtest 2025 — ICT Silver Bullet / Unicorn (NQ, ES, GC)

Data: NQ=NQ.csv, ES=ES.csv, GC=GC.csv
Sessions: LONDON 02:00-05:00 NY, NY_AM 09:00-11:00 NY
Risk $100/trade, target 2R, micro contracts, $0.62/contract/side, 1 tick slippage on stops

## Funnel

| | ES | GC | NQ | Total |
|---|---|---|---|---|
| Kill-zone sessions with data | 90 | 90 | 90 | 270 |
| Setups found (sweep→disp→FVG armed) | 16 | 14 | 19 | 49 |
| …of which LONDON | 11 | 8 | 11 | 30 |
| …of which NY_AM | 5 | 6 | 8 | 19 |
| …unicorn (FVG ∩ breaker) | 11 | 9 | 13 | 33 |
| Failed a mandatory strategy rule | 8 | 10 | 10 | 28 |
| Failed account gate (stop/size/fee) | 1 | 2 | 2 | 5 |
| Valid setups | 7 | 2 | 7 | 16 |
| Swarm score ≥ 7 | 5 | 2 | 7 | 14 |
| Price never returned (no fill) | 4 | 1 | 5 | 10 |

Rejection reasons: premium_discount 28, stop_distance 5, contract_sizing 5

## LIVE CONFIG — rules + swarm ≥ 7 (taken trades)

| | ES | GC | NQ | Total |
|---|---|---|---|---|
| trades | 1 | 1 | 2 | 4 |
| wins | 0 | 0 | 1 | 1 |
| losses | 1 | 1 | 1 | 3 |
| win_pct | 0.0 | 0.0 | 50.0 | 25.0 |
| planned_rr | 1:2 | 1:2 | 1:2 | 1:2 |
| avg_win_r | 0.0 | 0.0 | 2.0 | 2.0 |
| avg_loss_r | -1.01 | -1.01 | -1.01 | -1.01 |
| expectancy_r | -1.015 | -1.014 | 0.496 | -0.259 |
| total_r | -1.01 | -1.01 | 0.99 | -1.04 |
| profit_factor | 0.0 | 0.0 | 3.08 | 0.88 |
| net_usd | -86.24 | -75.24 | 133.52 | -27.96 |
| fees_usd | 1.24 | 1.24 | 2.48 | 4.96 |
| max_dd_usd | 86.24 | 75.24 | 64.24 | 161.48 |
| exits | {'STOP': 1} | {'STOP': 1} | {'TARGET': 1, 'STOP': 1} | {'STOP': 3, 'TARGET': 1} |

By session: LONDON: 4 trades, 25.0% win, -1.04R

| Month | Trades | W | L | R | $ |
|---|---|---|---|---|---|
| 2025-01 | 2 | 0 | 2 | -2.03 | -161.48 |
| 2025-02 | 2 | 1 | 1 | 0.99 | 133.52 |

## Rules only — no swarm filter

| | ES | GC | NQ | Total |
|---|---|---|---|---|
| trades | 3 | 1 | 2 | 6 |
| wins | 0 | 0 | 1 | 1 |
| losses | 3 | 1 | 1 | 5 |
| win_pct | 0.0 | 0.0 | 50.0 | 16.7 |
| planned_rr | 1:2 | 1:2 | 1:2 | 1:2 |
| avg_win_r | 0.0 | 0.0 | 2.0 | 2.0 |
| avg_loss_r | -1.03 | -1.01 | -1.01 | -1.02 |
| expectancy_r | -1.027 | -1.014 | 0.496 | -0.517 |
| total_r | -3.08 | -1.01 | 0.99 | -3.1 |
| profit_factor | 0.0 | 0.0 | 3.08 | 0.46 |
| net_usd | -288.69 | -75.24 | 133.52 | -230.41 |
| fees_usd | 7.44 | 1.24 | 2.48 | 11.16 |
| max_dd_usd | 288.69 | 75.24 | 64.24 | 258.95 |
| exits | {'STOP': 3} | {'STOP': 1} | {'TARGET': 1, 'STOP': 1} | {'STOP': 5, 'TARGET': 1} |

By session: LONDON: 6 trades, 16.7% win, -3.1R

| Month | Trades | W | L | R | $ |
|---|---|---|---|---|---|
| 2025-01 | 3 | 0 | 3 | -3.07 | -258.95 |
| 2025-02 | 3 | 1 | 2 | -0.03 | 28.54 |
