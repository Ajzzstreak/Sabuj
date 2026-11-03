"""
swarm_engine.py — 5-agent council + chairman synthesis (OpenRouter free tier).

Stage 1  each agent analyses the signal independently        (parallel)
Stage 2  each agent reads its peers and cross-reviews          (parallel)
Stage 3  chairman synthesises the final BRIEFING               (model fallback chain)

If no API key / every model fails, agents fall back to deterministic views built
from the rule checklist, and the chairman falls back to _rule_based_chairman().
The bot therefore always gets a score and never stalls on an LLM outage.
The swarm can only VETO a setup that already passed every mandatory rule — it
cannot create a trade the rules did not produce.
"""
from __future__ import annotations

import asyncio
import logging
import re

import requests

import config
from strategy import TradeSignal

log = logging.getLogger("swarm")

BULLISH_KEYWORDS = [
    "strong", "bullish", "buy", "long", "upside", "momentum", "breakout", "support", "valid",
    "confirmed", "clean", "aligned", "favorable", "opportunity", "high probability", "recommend",
    "entry valid", "continuation", "positive", "clear", "good setup", "excellent", "quality",
    "in play", "structural", "with trend", "bias up",
]
BEARISH_KEYWORDS = [
    "bearish", "short", "avoid", "skip", "risky", "danger", "caution", "warning", "poor", "invalid",
    "concern", "downside", "weak", "reject", "not take", "against", "resistance", "overbought",
    "crowded", "deteriorating", "low probability", "insufficient", "problem", "doubt", "trap",
    "stop hunt", "overextended",
]
AGENT_WEIGHTS = {"risk": 1.4, "technical": 1.2, "devil": 1.1, "context": 1.0, "sentiment": 0.9}

ROLE_PROMPTS = {
    "technical": "You are an ICT/SMC technical analyst. Judge the structure: liquidity sweep, breaker, "
                 "displacement quality, FVG/unicorn, premium/discount.",
    "context":   "You judge market context: session timing (London/NY kill zones), HTF daily bias, "
                 "Asian/London range sweeps, draw on liquidity, PO3 phase.",
    "risk":      "You are the risk manager. Judge stop placement, R:R, invalidation, and whether the "
                 "setup deserves capital. Be strict.",
    "sentiment": "You judge index/gold futures order flow: NQ-ES correlation (SMT divergence), USD and yields for gold, scheduled news (8:30 CPI/NFP, 10:00 data, FOMC) at this time of day.",
    "devil":     "You are the devil's advocate. Find the strongest reason this trade fails.",
}

# Phrases are framed for the direction-agnostic quality vocabulary.
# A SHORT setup should not be penalised for using the word "short".
_DIRECTION_WORDS = {"LONG": {"short", "bearish", "downside"}, "SHORT": {"long", "bullish", "upside", "buy"}}


def _count(text: str, words: list[str], ignore: set[str]) -> int:
    t = text.lower()
    return sum(len(re.findall(r"\b" + re.escape(w) + r"\b", t)) for w in words if w not in ignore)


class SwarmEngine:
    def __init__(self, api_key: str = config.OPENROUTER_API_KEY):
        self.api_key = api_key
        self.session = requests.Session()
        self.llm_enabled = bool(api_key) and config.SWARM_ENABLED

    # ── LLM transport ──────────────────────────────────────────
    def _call(self, model: str, system: str, user: str) -> str:
        r = self.session.post(
            f"{config.OPENROUTER_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json",
                     "X-Title": "ICT Paper Bot"},
            json={"model": model, "max_tokens": config.LLM_MAX_TOKENS, "temperature": 0.2,
                  "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            timeout=config.LLM_TIMEOUT_SEC,
        )
        r.raise_for_status()
        txt = r.json()["choices"][0]["message"]["content"]
        if not txt or not txt.strip():
            raise RuntimeError("empty completion")
        return txt.strip()

    async def _ask(self, model: str, system: str, user: str) -> str | None:
        if not self.llm_enabled:
            return None
        try:
            return await asyncio.to_thread(self._call, model, system, user)
        except Exception as e:  # noqa: BLE001
            log.info("LLM %s failed: %s", model, e)
            return None

    # ── deterministic agent views (offline / failed model) ─────
    @staticmethod
    def _offline_view(agent_id: str, sig: TradeSignal) -> str:
        ck = {c.name: c for c in sig.checklist}
        p = lambda n: ck.get(n) and ck[n].passed  # noqa: E731
        rr = abs(sig.target - sig.entry) / sig.risk_points if sig.risk_points else 0
        out = []
        if agent_id == "technical":
            out.append("Structure confirmed: sweep, breaker and displacement are valid.")
            out.append("Unicorn overlap — high probability quality entry." if sig.unicorn
                       else "Plain FVG, no breaker overlap — insufficient confluence for top grade.")
            out.append("Entry in discount/premium is aligned." if p("premium_discount")
                       else "Entry sits in the wrong half of the leg — poor location.")
        elif agent_id == "context":
            out.append("Session context sweep aligned with trade." if p("session_context_sweep")
                       else "No session range sweep in favour — weak context.")
            out.append("HTF daily bias aligned, with trend." if sig.htf_bias in ("BULLISH", "BEARISH")
                       and ck["htf_bias"].passed else "HTF daily neutral — no clear bias.")
            out.append("Draw on liquidity is clear beyond entry." if p("draw_on_liquidity")
                       else "Draw on liquidity is behind entry — concern.")
        elif agent_id == "risk":
            out.append(f"R:R {rr:.1f} with a structural stop beyond the sweep extreme — valid.")
            if not sig.hard_rules_pass():
                out.append("Mandatory rule failed: reject, do not take.")
            out.append("Silver Bullet hour — clean timing." if p("silver_bullet_hour")
                       else "Outside Silver Bullet hour — caution.")
        elif agent_id == "sentiment":
            out.append("PO3: entry on the correct side of the midnight open — favorable." if p("po3_open")
                       else "PO3: entry on the wrong side of the midnight open — risky, possible trap.")
        elif agent_id == "devil":
            fails = [c.name for c in sig.checklist if not c.hard and not c.passed]
            if fails:
                out.append("Weak points: " + ", ".join(fails) + ". Doubt this setup.")
            else:
                out.append("Every confluence present; I cannot find a problem. Clear setup.")
        return " ".join(out)

    # ── stages ─────────────────────────────────────────────────
    async def _stage1(self, sig: TradeSignal) -> dict[str, str]:
        brief = sig.summary_text()

        async def one(a):
            sys_p = ROLE_PROMPTS[a["id"]] + " Answer in <=120 words. End with VERDICT: TAKE or SKIP."
            txt = await self._ask(a["model"], sys_p, brief)
            return a["id"], txt or self._offline_view(a["id"], sig)

        return dict(await asyncio.gather(*(one(a) for a in config.COUNCIL_AGENTS)))

    async def _stage2(self, sig: TradeSignal, views: dict[str, str]) -> dict[str, str]:
        if not self.llm_enabled:
            return views

        async def one(a):
            peers = "\n\n".join(f"{k.upper()}: {v}" for k, v in views.items() if k != a["id"])
            user = (f"{sig.summary_text()}\n\nYOUR VIEW:\n{views[a['id']]}\n\nPEER VIEWS:\n{peers}\n\n"
                    "Cross-review: where are peers right or wrong? Give your revised view in <=100 words. "
                    "End with VERDICT: TAKE or SKIP.")
            txt = await self._ask(a["model"], ROLE_PROMPTS[a["id"]], user)
            return a["id"], txt or views[a["id"]]

        return dict(await asyncio.gather(*(one(a) for a in config.COUNCIL_AGENTS)))

    async def _stage3_chairman(self, sig: TradeSignal, reviews: dict[str, str]) -> tuple[str, str]:
        council = "\n\n".join(f"{k.upper()}: {v}" for k, v in reviews.items())
        user = (f"{sig.summary_text()}\n\nCOUNCIL:\n{council}\n\nWrite the final briefing in EXACTLY this "
                "format:\nSETUP QUALITY: [1-10]\nCONSENSUS: [STRONG BUY / LEAN BUY / NEUTRAL / LEAN SKIP / SKIP]\n"
                "BULL CASE: ...\nBEAR CASE: ...\nRECOMMENDED ACTION: ...\n"
                f"ENTRY: {sig.entry:.2f}\nSTOP: {sig.stop:.2f}\nTARGET: {sig.target:.2f}\n"
                "CONFIDENCE: [High / Medium / Low]\nSUMMARY: ...\n"
                "BUY/SKIP refers to TAKING THE TRADE in its stated direction, not to market direction.")
        system = "You chair a trading council. Be decisive and concise. Follow the format exactly."
        for model in [config.CHAIRMAN["model"], *config.CHAIRMAN["fallback_models"]]:
            txt = await self._ask(model, system, user)
            if txt and parse_score(txt) is not None:
                return txt, "llm"
        return self._rule_based_chairman(sig, reviews), "rule_based"

    def _rule_based_chairman(self, sig: TradeSignal, reviews: dict[str, str]) -> str:
        ignore = _DIRECTION_WORDS.get(sig.direction, set())
        bull = bear = 0.0
        bull_pts, bear_pts = [], []
        for aid, text in reviews.items():
            w = AGENT_WEIGHTS.get(aid, 1.0)
            b, s = _count(text, BULLISH_KEYWORDS, ignore), _count(text, BEARISH_KEYWORDS, ignore)
            bull += b * w
            bear += s * w
            (bull_pts if b >= s else bear_pts).append(f"{aid}: {text.split('.')[0].strip()}")
        total = bull + bear
        net = (bull - bear) / total if total else 0.0
        if not sig.hard_rules_pass():
            net = min(net, -0.8)
        score = max(1, min(10, round(5.0 + net * 4.5)))
        consensus = ("STRONG BUY" if score >= 8 else "LEAN BUY" if score >= 7 else "NEUTRAL" if score >= 5
                     else "LEAN SKIP" if score >= 3 else "SKIP")
        conf = "High" if abs(net) >= 0.5 else "Medium" if abs(net) >= 0.2 else "Low"
        action = (f"TAKE {sig.direction} at {sig.entry:.2f}" if score >= config.AUTO_EXECUTE_SCORE
                  else "SKIP — below auto-execution threshold")
        return "\n".join([
            f"SETUP QUALITY: {score}",
            f"CONSENSUS: {consensus}",
            f"BULL CASE: {'; '.join(bull_pts) or 'none'}",
            f"BEAR CASE: {'; '.join(bear_pts) or 'none'}",
            f"RECOMMENDED ACTION: {action}",
            f"ENTRY: {sig.entry:.2f}",
            f"STOP: {sig.stop:.2f}",
            f"TARGET: {sig.target:.2f}",
            f"CONFIDENCE: {conf}",
            f"SUMMARY: rule-based synthesis, weighted keyword net {net:+.2f} "
            f"(bull {bull:.1f} / bear {bear:.1f}); confluence {sig.confluence}/{sig.confluence_max}.",
        ])

    async def deliberate(self, sig: TradeSignal) -> dict:
        views = await self._stage1(sig)
        reviews = await self._stage2(sig, views)
        briefing, source = await self._stage3_chairman(sig, reviews)
        score = parse_score(briefing) or 1
        return {"briefing": briefing, "score": score, "source": source,
                "consensus": parse_field(briefing, "CONSENSUS"),
                "confidence": parse_field(briefing, "CONFIDENCE"),
                "views": views, "reviews": reviews}


def parse_score(text: str) -> int | None:
    m = re.search(r"SETUP QUALITY:\s*\[?\s*(\d{1,2})", text or "", re.I)
    if not m:
        return None
    v = int(m.group(1))
    return v if 1 <= v <= 10 else None


def parse_field(text: str, name: str) -> str:
    m = re.search(rf"{name}:\s*\[?([^\]\n]+)", text or "", re.I)
    return m.group(1).strip() if m else ""
