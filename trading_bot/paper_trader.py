"""
paper_trader.py — position tracking, rule-based exits, live P&L, persistence.

Sizing: units = RISK_PER_TRADE / risk_points  → every stop-out loses $100 (+fees).
Exits are mechanical: stop, target, time stop, NY flatten hour. No discretion.
State survives restarts via a JSON trade log (config.TRADE_LOG).
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path

_MASTER = Path(__file__).resolve().parent.parent / "master"
if str(_MASTER) not in sys.path:
    sys.path.insert(0, str(_MASTER))

import config  # noqa: E402
from strategy import TradeSignal, CheckItem, trading_day, ny_dt  # noqa: E402

_DIR_MAP = {"LONG": "LONG", "BUY": "LONG", "BULL": "LONG",
            "SHORT": "SHORT", "SELL": "SHORT", "BEAR": "SHORT"}


@dataclass
class Position:
    instrument: str
    direction: str
    entry_price: float
    stop_price: float
    target_price: float
    risk_points: float
    open_time: float
    label: str = ""
    close_time: float | None = None
    close_price: float | None = None
    outcome: str | None = None          # WIN / LOSS / BE
    pnl_dollars: float = 0.0
    pnl_points: float = 0.0
    exit_reason: str | None = None      # TARGET / STOP / TIME / FLATTEN / FORCED
    fees: float = 0.0
    setup_id: str = ""
    session: str = ""
    id: int = 0
    tp_levels: list = field(default_factory=list)

    @property
    def is_long(self) -> bool:
        return self.direction == "LONG"

    @property
    def is_open(self) -> bool:
        return self.close_time is None

    def _size(self) -> float:
        return config.RISK_PER_TRADE / self.risk_points if self.risk_points > 0 else 0.0

    @property
    def notional(self) -> float:
        return self._size() * self.entry_price

    def unrealized_pnl(self, current_price: float) -> tuple[float, float]:
        pts = (current_price - self.entry_price) if self.is_long else (self.entry_price - current_price)
        return pts, pts * self._size() - self.fees

    def r_multiple(self, price: float) -> float:
        pts, _ = self.unrealized_pnl(price)
        return pts / self.risk_points if self.risk_points else 0.0


class PaperTrader:
    def __init__(self, balance: float = config.PAPER_BALANCE, log_path: Path | str | None = config.TRADE_LOG,
                 fee_rate: float = config.FEE_RATE_PER_SIDE):
        self.start_balance = balance
        self.balance = balance
        self.fee_rate = fee_rate
        self.log_path = Path(log_path) if log_path else None
        self.open_positions: list[Position] = []
        self.closed: list[Position] = []
        self._next_id = 1
        self.taken_setups: set[str] = set()
        self._load()

    # ── persistence ────────────────────────────────────────────
    def _load(self):
        if not self.log_path or not self.log_path.exists():
            return
        try:
            data = json.loads(self.log_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            print(f"[paper] trade log unreadable ({e}); starting fresh")
            return
        self.start_balance = data.get("start_balance", self.start_balance)
        self.balance = data.get("balance", self.balance)
        self.open_positions = [Position(**p) for p in data.get("open", [])]
        self.closed = [Position(**p) for p in data.get("closed", [])]
        self._next_id = data.get("next_id", len(self.closed) + len(self.open_positions) + 1)
        self.taken_setups = set(data.get("taken_setups", []))
        print(f"[paper] restored {len(self.closed)} closed / {len(self.open_positions)} open trades, "
              f"balance ${self.balance:,.2f}")

    def _save(self):
        if not self.log_path:
            return
        data = {
            "start_balance": self.start_balance, "balance": self.balance, "next_id": self._next_id,
            "updated": datetime.now(timezone.utc).isoformat(),
            "taken_setups": sorted(self.taken_setups)[-500:],
            "open": [asdict(p) for p in self.open_positions],
            "closed": [asdict(p) for p in self.closed],
        }
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.log_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, default=str))
        os.replace(tmp, self.log_path)

    # ── risk gate ──────────────────────────────────────────────
    def daily_pnl(self, day: str | None = None) -> float:
        day = day or trading_day(time.time())
        return sum(p.pnl_dollars for p in self.closed if trading_day(p.close_time) == day)

    def trades_today(self, day: str | None = None) -> int:
        day = day or trading_day(time.time())
        return sum(1 for p in self.closed + self.open_positions if trading_day(p.open_time) == day)

    def pre_trade_checks(self, signal: TradeSignal, now: float | None = None) -> list[CheckItem]:
        """Account-level mandatory rules. All must pass or the order is not sent."""
        now = now or time.time()
        day = trading_day(now)
        r = signal.risk_points
        risk_pct = r / signal.entry if signal.entry else 0
        size = config.RISK_PER_TRADE / r if r > 0 else 0
        notional = size * signal.entry
        fees = notional * self.fee_rate * 2
        geometry = (signal.stop < signal.entry < signal.target) if signal.is_long else \
                   (signal.target < signal.entry < signal.stop)
        window_key = f"{signal.instrument}-{day}-{signal.session}"
        window_used = any(s.startswith(window_key) for s in self.taken_setups)
        return [
            CheckItem("order_geometry", geometry, True, "stop < entry < target" if signal.is_long
                      else "target < entry < stop"),
            CheckItem("stop_distance", config.MIN_RISK_PCT <= risk_pct <= config.MAX_RISK_PCT, True,
                      f"{risk_pct * 100:.2f}% (allowed {config.MIN_RISK_PCT * 100:.2f}-{config.MAX_RISK_PCT * 100:.1f}%)"),
            CheckItem("fee_drag", fees <= config.RISK_PER_TRADE * config.MAX_FEE_TO_RISK, True,
                      f"round-trip fees ${fees:.2f} vs max ${config.RISK_PER_TRADE * config.MAX_FEE_TO_RISK:.0f}"),
            CheckItem("leverage", notional <= self.balance * config.MAX_LEVERAGE, True,
                      f"notional ${notional:,.0f} ({notional / self.balance:.2f}x)"),
            CheckItem("max_open_positions", len(self.open_positions) < config.MAX_OPEN_POSITIONS, True,
                      f"{len(self.open_positions)}/{config.MAX_OPEN_POSITIONS} open"),
            CheckItem("no_duplicate_instrument",
                      not any(p.instrument == signal.instrument for p in self.open_positions), True,
                      "no open position on this instrument"),
            CheckItem("daily_loss_limit", self.daily_pnl(day) > -config.MAX_DAILY_LOSS, True,
                      f"today ${self.daily_pnl(day):,.2f} / limit -${config.MAX_DAILY_LOSS}"),
            CheckItem("max_trades_per_day", self.trades_today(day) < config.MAX_TRADES_PER_DAY, True,
                      f"{self.trades_today(day)}/{config.MAX_TRADES_PER_DAY}"),
            CheckItem("one_trade_per_window", not (config.ONE_TRADE_PER_WINDOW and window_used), True,
                      f"{signal.session} window {'already traded' if window_used else 'free'}"),
            CheckItem("setup_not_taken", signal.setup_id not in self.taken_setups, True, signal.setup_id),
        ]

    # ── orders ─────────────────────────────────────────────────
    def open_trade(self, signal: TradeSignal | None = None, *, instrument: str | None = None,
                   direction: str | None = None, entry: float | None = None, stop: float | None = None,
                   target: float | None = None, label: str = "") -> Position:
        if signal is not None:
            instrument, direction = signal.instrument, signal.direction
            entry, stop, target = signal.entry, signal.stop, signal.target
            label = label or signal.label
        if None in (instrument, direction, entry, stop, target):
            raise ValueError("open_trade needs a TradeSignal or instrument/direction/entry/stop/target")
        direction = _DIR_MAP[direction.upper()]
        risk = abs(entry - stop)
        if risk <= 0:
            raise ValueError("risk_points must be > 0")
        pos = Position(instrument=instrument, direction=direction, entry_price=float(entry),
                       stop_price=float(stop), target_price=float(target), risk_points=risk,
                       open_time=time.time(), label=label, id=self._next_id,
                       setup_id=signal.setup_id if signal else "",
                       session=signal.session if signal else "",
                       tp_levels=list(signal.tp_levels) if signal else [])
        pos.fees = pos.notional * self.fee_rate          # entry fee
        self._next_id += 1
        self.open_positions.append(pos)
        if pos.setup_id:
            self.taken_setups.add(pos.setup_id)
        self._save()
        print(f"\n▶ OPEN  #{pos.id} {pos.direction} {instrument} @ {entry:,.2f}  SL {stop:,.2f}  "
              f"TP {target:,.2f}  size {pos._size():.6f}  risk ${config.RISK_PER_TRADE}  [{label}]")
        return pos

    def close_position(self, pos: Position, price: float, reason: str) -> Position:
        pos.close_time = time.time()
        pos.close_price = price
        pos.pnl_points = (price - pos.entry_price) if pos.is_long else (pos.entry_price - price)
        exit_fee = pos._size() * price * self.fee_rate
        pos.fees += exit_fee
        pos.pnl_dollars = pos.pnl_points * pos._size() - pos.fees
        pos.outcome = "WIN" if pos.pnl_dollars > 0 else "LOSS" if pos.pnl_dollars < 0 else "BE"
        pos.exit_reason = reason
        self.balance += pos.pnl_dollars
        self.open_positions.remove(pos)
        self.closed.append(pos)
        self._save()
        tag = "✅" if pos.outcome == "WIN" else "❌"
        print(f"\n{tag} CLOSE #{pos.id} {pos.direction} {pos.instrument} @ {price:,.2f} [{reason}]  "
              f"{pos.pnl_points:+,.2f} pts  ${pos.pnl_dollars:+,.2f}  "
              f"({pos.pnl_points / pos.risk_points:+.2f}R)  balance ${self.balance:,.2f}")
        return pos

    def check_exits(self, instrument: str, current_high: float, current_low: float) -> list[Position]:
        """Price range since last check. Stop and target both inside → stop (conservative)."""
        out = []
        for pos in [p for p in self.open_positions if p.instrument == instrument]:
            if pos.is_long:
                hit_stop, hit_tgt = current_low <= pos.stop_price, current_high >= pos.target_price
            else:
                hit_stop, hit_tgt = current_high >= pos.stop_price, current_low <= pos.target_price
            if hit_stop:
                out.append(self.close_position(pos, pos.stop_price, "STOP"))
            elif hit_tgt:
                out.append(self.close_position(pos, pos.target_price, "TARGET"))
        return out

    def check_time_exits(self, prices: dict[str, float], now: float | None = None) -> list[Position]:
        now = now or time.time()
        out = []
        nyh = ny_dt(now).hour
        for pos in list(self.open_positions):
            px = prices.get(pos.instrument)
            if px is None:
                continue
            if (now - pos.open_time) / 60 >= config.MAX_HOLD_MINUTES:
                out.append(self.close_position(pos, px, "TIME"))
            elif nyh == config.FLATTEN_HOUR_NY and ny_dt(pos.open_time).hour != nyh:
                out.append(self.close_position(pos, px, "FLATTEN"))
        return out

    def force_close_all(self, prices: dict | None = None) -> list[Position]:
        prices = prices or {}
        return [self.close_position(p, prices.get(p.instrument, p.entry_price), "FORCED")
                for p in list(self.open_positions)]

    # ── reporting ──────────────────────────────────────────────
    def mark_to_market(self, prices: dict[str, float]) -> str:
        now = datetime.now(timezone.utc).astimezone(ny_dt(time.time()).tzinfo)
        lines = ["", "═" * 78, f" LIVE P&L  {now:%Y-%m-%d %H:%M:%S} NY", "─" * 78]
        total = 0.0
        if not self.open_positions:
            lines.append(" no open positions")
        for p in self.open_positions:
            px = prices.get(p.instrument)
            if px is None:
                lines.append(f" #{p.id:<3} {p.instrument:<4} {p.direction:<5} entry {p.entry_price:>11,.2f}  (no price)")
                continue
            pts, usd = p.unrealized_pnl(px)
            total += usd
            mins = (time.time() - p.open_time) / 60
            lines.append(f" #{p.id:<3} {p.instrument:<4} {p.direction:<5} entry {p.entry_price:>11,.2f} "
                         f"now {px:>11,.2f}  SL {p.stop_price:>11,.2f}  TP {p.target_price:>11,.2f}")
            lines.append(f"      {pts:+12,.2f} pts  ${usd:+9,.2f}  {p.r_multiple(px):+.2f}R  {mins:5.0f} min  {p.label}")
        realized = sum(p.pnl_dollars for p in self.closed)
        lines += ["─" * 78,
                  f" Unrealized ${total:+,.2f}   Realized ${realized:+,.2f}   Today ${self.daily_pnl():+,.2f}",
                  f" Balance ${self.balance:,.2f}   Equity ${self.balance + total:,.2f}   "
                  f"Trades {len(self.closed)} closed / {len(self.open_positions)} open",
                  "═" * 78]
        return "\n".join(lines)

    def stats(self) -> dict:
        n = len(self.closed)
        wins = [p.pnl_dollars for p in self.closed if p.pnl_dollars > 0]
        losses = [p.pnl_dollars for p in self.closed if p.pnl_dollars <= 0]
        gross_w, gross_l = sum(wins), -sum(losses)
        net = sum(p.pnl_dollars for p in self.closed)
        return {
            "trades": n,
            "wins": len(wins),
            "losses": len(losses),
            "win_pct": round(len(wins) / n * 100, 1) if n else 0.0,
            "avg_win": round(gross_w / len(wins), 2) if wins else 0.0,
            "avg_loss": round(-gross_l / len(losses), 2) if losses else 0.0,
            "profit_factor": round(gross_w / gross_l, 2) if gross_l > 0 else (float("inf") if gross_w else 0.0),
            "avg_r": round(sum(p.pnl_points / p.risk_points for p in self.closed) / n, 2) if n else 0.0,
            "fees": round(sum(p.fees for p in self.closed), 2),
            "net_pnl": round(net, 2),
            "final_balance": round(self.balance, 2),
            "return_pct": round((self.balance - self.start_balance) / self.start_balance * 100, 2),
            "live_ready": n >= 50 and (len(wins) / n if n else 0) > 0.5 and
                          (gross_w / gross_l if gross_l else 0) > 1.5,
        }

    def print_stats(self):
        s = self.stats()
        print("\n" + "═" * 50 + "\n PAPER TRADING STATS\n" + "─" * 50)
        for k, v in s.items():
            print(f" {k:<15} {v}")
        print(" live gate:      50+ trades, win% > 50, PF > 1.5")
        print("═" * 50)

    def print_trade_log(self, last: int = 50):
        print("\n" + "═" * 100 + "\n TRADE LOG\n" + "─" * 100)
        print(f" {'#':<4}{'opened (NY)':<18}{'inst':<5}{'dir':<6}{'entry':>11}{'exit':>11}"
              f"{'pts':>10}{'R':>7}{'$':>10}  reason / label")
        for p in self.closed[-last:]:
            print(f" {p.id:<4}{ny_dt(p.open_time):%m-%d %H:%M:%S}  {p.instrument:<5}{p.direction:<6}"
                  f"{p.entry_price:>11,.2f}{p.close_price:>11,.2f}{p.pnl_points:>+10,.2f}"
                  f"{p.pnl_points / p.risk_points:>+7.2f}{p.pnl_dollars:>+10,.2f}  {p.exit_reason} {p.label}")
        print("═" * 100)
