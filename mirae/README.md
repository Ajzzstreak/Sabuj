# MIRAE — Launch Workspace

**MIRAE (미래, "future")**: Korean-inspired, vitamin-infused instant coffee. *The future of your morning.*
One cup replaces the daily vitamin routine: people forget vitamins, but they don't forget coffee.

> Assumptions made for this workspace (change them in `model/financial_model.xlsx` → *Assumptions*):
> 20 sticks per box · $5.00 landed product cost · $5.00 outbound postage · free shipping · 300-box first PO · 2-month lead time · 50% deposit.
> All are **UNVERIFIED ESTIMATES** until supplier and carrier quotes come in.

## ⚠️ Product definition conflict (resolve before spending)
| Source | Product | Format | Price |
|---|---|---|---|
| This brief | MIRAE Glow = **instant coffee** + collagen 5g + vit C + biotin | Stick packs, 20–30/box | $24.99/box |
| Uploaded decks + can images | MIRAE **IGNITE / GLOW RTD** (caffeine-free pre-workout and collagen hydration) | 16 oz cans | $5.99/can |

**Recommendation: launch the coffee stick pack (this brief).** A canned RTD launch needs co-packer runs, liquid shelf-stability work and heavy freight. That doesn't fit a $5K cap. A private-label powder does. Keep the RTD line as a later, funded expansion.

The uploaded GLOW can artwork **cannot be reused for the coffee SKU**, for two reasons:
- It says **"No Caffeine"**.
- It claims **"No Sugar"** with 1 g of total sugars. FDA's "sugar free" claim requires <0.5 g per serving under 21 CFR 101.60(c). The consultant should confirm this.

It also uses a **Supplement Facts** panel on a 16 oz can, which FDA's 2014 beverage guidance treats as a conventional-food signal.

The "Billion Dollar Case" deck mixes real deal values with **simulated quotes and unsourced stats**: Poppi $1.95B, Alani Nu $1.8B, Olipop $1.85B, Liquid Death $1.4B and BodyArmor $5.6B are widely reported deal values; "SPINS Q1 2026 +23%" and the analyst quotes are not sourced. Treat it as narrative, not evidence.

## Business snapshot
| Item | Decision |
|---|---|
| Model | Private-label an existing compliant vitamin-coffee formula; MIRAE label only |
| Launch SKU | **MIRAE Glow**: freeze-dried coffee + hydrolyzed collagen (target 5 g) + vitamin C + biotin |
| Later SKUs | MIRAE Immune (D3 + C + zinc), MIRAE Daily (vitamin black coffee) |
| Customer | Women 28–45, Prime + IG/TikTok, K-beauty buyers, inconsistent with vitamins |
| Positioning | Korean wellness, transparent labels, third-party tested, honest about heat effects |
| Channels | Waitlist → Shopify pre-orders → Shopify DTC + subscription → Amazon once reviews + cash exist |
| Budget | $5,000 cap (max $10,000), solo founder in Queens, no storage, no equity raise |
| Price | $24.99 one-time · $21.24 subscription (15% off) |

## Key numbers (computed in `model/`, all UNVERIFIED inputs)
| Metric | Value |
|---|---|
| Contribution/box: Shopify · Subscription · Amazon FBA | $12.87 (51.5%) · $9.23 (43.4%) · $11.82 (47.3%) |
| Break-even at founder's $400/mo fixed | **32 boxes/month** |
| Break-even at modelled fixed costs ($124/mo, self-fulfilled) | 10 boxes/month |
| First-order contribution vs realistic CAC ($15) | $12.87 < $15 → **every paid first order loses money; profit comes from repeat purchases and subscriptions** |
| 90-day launch: spend / pre-order inflow / day-90 cash | $5,843 / $1,438 / **$595** (incl. $1,050 LLC publication reserve) |
| 12-month lowest cash (realistic scenario, $5K start) | **−$3,837 (month 12)**. Paid growth at plan pace needs ≈ **$9.3K total**, so throttle ads to cash or use the $10K ceiling |

## What's here
| Path | Contents |
|---|---|
| `docs/launch-plan.md` | 13-week plan, $ per line, running cash, validation gate with go/no-go criteria |
| `docs/supplier-outreach.md` | Shortlist template, outreach email, scoring rubric |
| `docs/label-compliance-checklist.md` | Food vs supplement decision, allowed/disallowed claims, label elements, Amazon rules, pre-print checklist |
| `docs/brand-and-content.md` | Voice, colour/type, 6 pillars, 30-day short-form calendar |
| `docs/risks.md` | Top risks + one mitigation each |
| `model/financial_model.xlsx` | Live-formula model: assumptions, unit economics, 12-mo cash flow ×3 scenarios, break-even, launch budget |
| `model/build_model.py`, `model/calcs.py` | Regenerate the workbook / re-run the arithmetic |
| `site/index.html` | Mobile-first pre-order/waitlist page (static, placeholders for photos and form endpoint) |

Not legal, tax or regulatory advice. Budget for one regulatory consultant review before printing labels.
