"""
signal_monitor.py — lifecycle of every setup the scanner finds.

ARMED        FVG formed, limit level known, swarm deliberating
APPROVED     swarm score >= AUTO_EXECUTE_SCORE, waiting for price to touch zone
REJECTED     swarm score below threshold — never traded
BLOCKED      a mandatory rule (strategy or account) failed
FIRED        order filled, position open
EXPIRED      window closed / zone invalidated before fill
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from strategy import TradeSignal


@dataclass
class SignalEvent:
    setup_id: str
    instrument: str
    signal: TradeSignal
    status: str = "ARMED"
    created_ts: float = field(default_factory=time.time)
    touched_ts: float | None = None
    briefing: str = ""
    score: int | None = None
    consensus: str = ""
    confidence: str = ""
    swarm_source: str = ""           # "llm" / "rule_based"
    position_id: int | None = None
    reasons: list[str] = field(default_factory=list)
    briefing_path: str = ""

    @property
    def deliberated(self) -> bool:
        return self.score is not None

    @property
    def approved(self) -> bool:
        return self.score is not None and self.score >= _threshold()

    @property
    def terminal(self) -> bool:
        return self.status in ("FIRED", "REJECTED", "BLOCKED", "EXPIRED")

    def line(self) -> str:
        s = self.signal
        sc = f"{self.score}/10 {self.consensus}" if self.deliberated else "deliberating…"
        return (f"[{self.status:<8}] {s.instrument} {s.direction:<5} {s.label:<22} "
                f"entry {s.entry:,.2f} SL {s.stop:,.2f} TP {s.target:,.2f} | {sc}")


def _threshold() -> int:
    import config
    return config.AUTO_EXECUTE_SCORE


class SignalMonitor:
    def __init__(self):
        self.events: dict[str, SignalEvent] = {}

    def register(self, signal: TradeSignal) -> tuple[SignalEvent, bool]:
        ev = self.events.get(signal.setup_id)
        if ev:
            return ev, False
        ev = SignalEvent(signal.setup_id, signal.instrument, signal)
        self.events[signal.setup_id] = ev
        return ev, True

    def get(self, setup_id: str) -> SignalEvent | None:
        return self.events.get(setup_id)

    def live(self, instrument: str | None = None) -> list[SignalEvent]:
        return [e for e in self.events.values()
                if not e.terminal and (instrument is None or e.instrument == instrument)]

    def expire_others(self, instrument: str, keep_setup_id: str | None, reason: str):
        for e in self.live(instrument):
            if e.setup_id != keep_setup_id:
                e.status = "EXPIRED"
                e.reasons.append(reason)

    def summary(self) -> dict:
        out: dict[str, int] = {}
        for e in self.events.values():
            out[e.status] = out.get(e.status, 0) + 1
        return out
