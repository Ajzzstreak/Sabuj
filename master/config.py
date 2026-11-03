"""
config.py — instruments, LLM models, strategy rules and risk constants.

Every rule the bot obeys lives here. Change a number here, not in code.
"""
import os
from pathlib import Path

ROOT_DIR      = Path(__file__).resolve().parent.parent
MASTER_DIR    = ROOT_DIR / "master"
BOT_DIR       = ROOT_DIR / "trading_bot"
BRIEFINGS_DIR = MASTER_DIR / "briefings"
TRADE_LOG     = BOT_DIR / "trade_log.json"

# ════════════════════════════════════════════════════════════════
# INSTRUMENTS
# ════════════════════════════════════════════════════════════════
INSTRUMENT_UNIVERSE = {
    "BTC": {"type": "crypto", "exchange": "KRAKEN", "min_fvg": 50.0, "tick": 0.01, "session": "24/7"},
    "ETH": {"type": "crypto", "exchange": "KRAKEN", "min_fvg": 5.0,  "tick": 0.01, "session": "24/7"},
    "SOL": {"type": "crypto", "exchange": "KRAKEN", "min_fvg": 0.5,  "tick": 0.01, "session": "24/7"},
}

SPREAD_PAIRS = [
    {"name": "BTC/ETH", "leg1": "BTC", "leg2": "ETH", "ratio": 15.0, "threshold_pct": 0.20},
]
# Pair mean-reversion is NOT part of the ICT rule set. Off by default.
SPREAD_ENABLED          = False
SPREAD_LOOKBACK_BARS    = 288          # 24h of 5m bars for the rolling mean ratio
SPREAD_COOLDOWN_MIN     = 60

# ════════════════════════════════════════════════════════════════
# LLM SWARM (OpenRouter free tier)
# ════════════════════════════════════════════════════════════════
COUNCIL_AGENTS = [
    {"id": "technical", "name": "Technical Analyst", "model": "mistralai/mistral-7b-instruct:free"},
    {"id": "context",   "name": "Market Context",    "model": "meta-llama/llama-3.1-8b-instruct:free"},
    {"id": "risk",      "name": "Risk Manager",      "model": "google/gemma-2-9b-it:free"},
    {"id": "sentiment", "name": "Sentiment Analyst", "model": "qwen/qwen-2.5-7b-instruct:free"},
    {"id": "devil",     "name": "Devil's Advocate",  "model": "mistralai/mistral-7b-instruct:free"},
]
CHAIRMAN = {
    "model": "qwen/qwen-2.5-7b-instruct:free",
    "fallback_models": [
        "mistralai/mistral-7b-instruct:free",
        "google/gemma-2-9b-it:free",
        "meta-llama/llama-3.1-8b-instruct:free",
        "google/gemini-2.0-flash-exp:free",
    ],
}
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY  = os.getenv("OPENROUTER_API_KEY", "")
LLM_TIMEOUT_SEC     = 25
LLM_MAX_TOKENS      = 350

SWARM_ENABLED       = True
AUTO_EXECUTE_SCORE  = 7            # swarm SETUP QUALITY needed to auto-fire

# ════════════════════════════════════════════════════════════════
# PAPER ACCOUNT / RISK
# ════════════════════════════════════════════════════════════════
PAPER_BALANCE  = 50000
RISK_PER_TRADE = 100

# Fees are what kill tight-stop intraday crypto. Default = Kraken Futures
# taker (0.05%). Kraken *spot* Pro taker is 0.40% at the lowest tier — at
# that rate a $100-risk BTC trade with a 0.3% stop pays ~$265 in fees.
FEE_RATE_PER_SIDE   = 0.0005
MAX_FEE_TO_RISK     = 0.30         # skip trade if round-trip fees > 30% of risk
MAX_LEVERAGE        = 3.0          # skip trade if notional > 3x balance
MIN_RISK_PCT        = 0.0010       # stop must be >= 0.10% from entry (noise floor)
MAX_RISK_PCT        = 0.0300       # stop must be <= 3% from entry

MAX_OPEN_POSITIONS      = 3
MAX_TRADES_PER_DAY      = 6
MAX_DAILY_LOSS          = 300      # $ — 3R. Trading halts for the day when hit.
ONE_TRADE_PER_WINDOW    = True     # per instrument per session window
MAX_HOLD_MINUTES        = 240      # time stop
FLATTEN_HOUR_NY         = 16       # hard flat at 16:00 New York

# ════════════════════════════════════════════════════════════════
# SESSIONS  (New York time, ICT convention)
# ════════════════════════════════════════════════════════════════
NY_TZ = "America/New_York"
TRADING_DAY_ROLL_HOUR = 18         # trading day starts 18:00 NY (Asian belongs to next day)

# Context ranges (liquidity pools)
ASIAN_RANGE  = ("20:00", "00:00")
LONDON_RANGE = ("03:00", "08:00")  # matches Pine v6.4 London Session input

# Entry windows. "context" = which range's sweep sets directional bias.
TRADE_WINDOWS = {
    "LONDON": {"start": "02:00", "end": "05:00", "context": "ASIAN",  "enabled": True},
    "NY_AM":  {"start": "09:00", "end": "11:00", "context": "LONDON", "enabled": True},
    "NY_PM":  {"start": "13:30", "end": "16:00", "context": "LONDON", "enabled": False},
}
SILVER_BULLET = {"LONDON": ("03:00", "04:00"), "NY_AM": ("10:00", "11:00"), "NY_PM": ("14:00", "15:00")}

# ════════════════════════════════════════════════════════════════
# SETUP RULES  (Pine "ICT Silver Bullet v6.4" inputs)
# ════════════════════════════════════════════════════════════════
CANDLE_INTERVAL_MIN   = 5          # 1 or 5. Kraken REST returns max 720 bars.
SWING_LEN             = 2          # swing confirm bars each side
SWING_LOOKBACK_BARS   = 36         # how far back a swing may be to count as liquidity
DISP_BODY_PCT         = 50.0       # min displacement body %
BB_LOOKBACK           = 6          # breaker block lookback bars
SL_BUFFER             = 0.10       # SL buffer as fraction of zone size
FVG_SEARCH_BARS       = 3          # FVG must form within N bars of displacement
INVALIDATION_R        = 2.0        # zone consumed if price reaches +2R from entry before the retest
REQUIRE_UNICORN       = False
REQUIRE_DISCOUNT      = True       # longs from discount / shorts from premium of disp. leg
HTF_BIAS_FILTER       = True
TARGET_R              = 2.0        # exit target (TP1). Pine also plots 4R/5R.
TP_LEVELS_R           = (2.0, 4.0, 5.0)

# ════════════════════════════════════════════════════════════════
# FEED / LOOP
# ════════════════════════════════════════════════════════════════
KRAKEN_REST_URL   = "https://api.kraken.com/0/public/"
KRAKEN_WS_URL     = "wss://ws.kraken.com/v2"
USE_WEBSOCKET     = True
SCAN_LOOP_SEC     = 1.0            # tick/exit check cadence
PNL_MONITOR_SEC   = 30
