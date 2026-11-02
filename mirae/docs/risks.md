# Top Risks & Mitigations

| # | Risk | Likelihood / impact | Concrete mitigation |
|---|---|---|---|
| 1 | **Cash-flow gap**: the model's realistic case dips to −$3,837 because reorders (50% deposit) and paid acquisition run ahead of revenue | High / High | Hard rule: no ad spend that would push projected month-end cash below $500. Ask for net-30 on reorders. Unlock the extra $5K only once subscription churn ≤ 15%/month |
| 2 | **Paid first orders lose money** ($12.87 contribution vs $15 CAC) | High / High | Make subscription the default offer (pre-checked on the page, with the 15% off framed clearly). Track CAC per channel weekly. Pause any channel whose CAC exceeds 1.2× first-order contribution and that brings no subscribers |
| 3 | **Regulatory misclassification or claim violation** (food vs supplement; collagen skin claims) | Medium / High | Consultant review before print. Claims file mapping each claim to evidence. Launch with conservative vitamin-C-based claims |
| 4 | **Amazon suspension or listing suppression** (TIC verification, claim mismatch, ungated category) | Medium / High | Delay Amazon until DTC proves demand. Complete TIC verification before listing (if supplement). Listing copy must equal the label. Keep Shopify as the primary channel |
| 5 | **Manufacturer quality drift** (lower potency, contamination in later lots) | Medium / High | COA for every lot. Independent receipt test of vitamin C on every lot (−$150/lot). Retain 5 samples per lot. Put potency tolerance and reformulation-notice clauses in the PO |
| 6 | **Stockouts** (2-month lead time; model shows 114 lost sales in the realistic case) | Medium / Medium | Reorder when stock + on-order < 60 days of demand. Keep a safety stock of 1 month. Find a second qualified supplier by month 6 |
| 7 | **Negative reviews** (taste, grit, "vitamins don't survive heat") | Medium / Medium | Blind taste gate (≥7/10) before PO. Publish the post-brew lab result. Brew instructions on the box ("stir into hot, not boiling, water"). Satisfaction guarantee on the first box |
| 8 | **Copycats** (incumbent collagen-coffee brands or Amazon private label) | High / Medium | File the ITU trademark now (Class 30). Build moats a copycat can't copy quickly: email list, subscribers, published test results, Korean-wellness content library |
| 9 | **Heat-loss claim credibility** | Medium / Medium | Use the measured post-brew number, not a theoretical one. Evidence suggests ~2–4% vitamin C loss over 10 min in water at 90 °C, versus 20–64% in vegetable blanching. The brief's 40–80% is UNVERIFIED |
| 10 | **Biotin lab-test interference** (FDA warnings 2017/2019) | Low / High | Modest biotin dose (around 100% DV), plus a label note to tell your doctor before lab tests |
| 11 | **NY compliance costs surprise** (LLC publication $850–1,800 in Queens) | High / Medium | Already ring-fenced ($1,050) in the launch budget. Pay within 120 days of formation |

## Sources
- Vitamin C degradation (90 °C control, blanching kinetics): [PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC3551187); arithmetic in `model/calcs.py`
- Biotin interference: [Cardiovascular Business](https://cardiovascularbusiness.com/topics/clinical/acute-coronary-syndromes/fda-warns-biotin-interference-troponin-tests)
- Amazon TIC verification: [NSF](https://www.nsf.org/knowledge-library/amazon-new-dietary-supplements-policy-enhancing-safety-compliance)
- NY publication cost range: [HowToStartAnLLC](https://howtostartanllc.com/new-york-publication-requirements/new-york-llc-publication-cost)
