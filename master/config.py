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
TRADE_LOG     = BOT_DIR / "futures_trade_log.json"

# ════════════════════════════════════════════════════════════════
# INSTRUMENTS
# ════════════════════════════════════════════════════════════════
# CME futures. Price data comes from the full-size contract (NQ/ES/GC — same
# price as the micro); orders are sized in MICRO contracts so $100 risk is
# reachable with integer contracts. Swap to full-size by changing
# "contract"/"point_value" (NQ $20, ES $50, GC $100 per point).
#   point_value : $ per 1.00 price move per contract
#   min_fvg     : minimum FVG size in points (5m chart)
#   min_stop / max_stop : allowed stop distance in points
INSTRUMENT_UNIVERSE = {
    "NQ": {"type": "future", "exchange": "CME",   "name": "Nasdaq-100",  "data_symbol": "NQ=F",
           "contract": "MNQ", "point_value": 2.0,  "tick": 0.25, "min_fvg": 5.0,
           "min_stop": 8.0,  "max_stop": 60.0, "max_contracts": 10, "session": "CME_GLOBEX"},
    "ES": {"type": "future", "exchange": "CME",   "name": "S&P 500",     "data_symbol": "ES=F",
           "contract": "MES", "point_value": 5.0,  "tick": 0.25, "min_fvg": 1.25,
           "min_stop": 2.0,  "max_stop": 20.0, "max_contracts": 10, "session": "CME_GLOBEX"},
    "GC": {"type": "future", "exchange": "COMEX", "name": "Gold",        "data_symbol": "GC=F",
           "contract": "MGC", "point_value": 10.0, "tick": 0.10, "min_fvg": 1.0,
           "min_stop": 2.0,  "max_stop": 10.0, "max_contracts": 10, "session": "CME_GLOBEX"},
}

# Pair trading not used for futures (NQ/ES correlation is SMT context, not a trade).
SPREAD_PAIRS = []
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

# Futures fees are flat per contract. Micro all-in (commission + CME exchange
# + NFA) at discount brokers is ~$0.50-0.85/side. A 2-contract MNQ trade
# costs ~$2.50 round trip = 2.5% of a $100 risk (vs 33-265% on crypto).
FEE_PER_CONTRACT_SIDE = 0.62
SLIPPAGE_TICKS        = 1          # stop/market exits fill 1 tick worse
MAX_FEE_TO_RISK       = 0.15       # skip trade if round-trip fees > 15% of risk
MIN_CONTRACTS         = 1          # stop too wide for $RISK with 1 micro → no trade

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
TRADING_DAY_ROLL_HOUR = 18         # CME Globex day starts 18:00 NY (Asian belongs to next day)
GLOBEX_CLOSE_HOUR     = 17         # daily maintenance break 17:00-18:00 NY, Fri 17:00 → Sun 18:00 closed

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
CANDLE_INTERVAL_MIN   = 5          # 1, 2, 5 or 15
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
# Free source: Yahoo Finance chart API (no key). CME data there is DELAYED
# ~10 min — fine for paper-validating the rules, not for live execution.
# For live: Tradovate / Rithmic / IBKR / Databento feeds plug into the same
# get_candles/get_tick interface.
DATA_SOURCE_URL   = "https://query1.finance.yahoo.com/v8/finance/chart/"
FEED_CACHE_SEC    = 8              # min seconds between HTTP pulls per symbol
SCAN_LOOP_SEC     = 5.0            # tick/exit check cadence
PNL_MONITOR_SEC   = 30
