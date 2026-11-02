"""Supporting arithmetic used in the docs (run: python3 model/calcs.py)."""
import math

# Vitamin C loss, first-order kinetics. Anchor: ~72% loss after 6 h at 90 °C in water
# (Serpen & Gökmen control, as reported in a review). Coffee cools fast; this is an upper-ish bound.
k_water = math.log(1 / 0.28) / 360  # per minute
print(f"k (pure water, 90C) = {k_water:.5f}/min")
for t in (5, 10, 20, 30):
    print(f"  loss after {t:>2} min: {100*(1-math.exp(-k_water*t)):.1f}%")
# Vegetable blanching 60–90 °C, pH 5.0–6.5: k = 0.0223–0.1028 /min (enzymes/matrix; a pessimistic bound)
for k in (0.0223, 0.1028):
    print(f"  blanching k={k}: 10-min loss {100*(1-math.exp(-k*10)):.0f}%")

# Storage: 300 boxes; assumed box 6 x 3.5 x 2.5 in (20 sticks) — UNVERIFIED dimensions
box_in3 = 6 * 3.5 * 2.5
for n in (300, 500):
    ft3 = n * box_in3 / 1728
    print(f"{n} boxes ≈ {ft3:.1f} cu ft (≈ {ft3/ (2*2*2):.1f} × 2ft cubes)")

# Unit economics cross-check (must match the workbook)
price, cogs, inbound, post, pack = 24.99, 5.00, 0.50, 5.00, 0.60
pay = price * 0.029 + 0.30
shop = price - cogs - inbound - pay - post - pack
sub_p = price * 0.85
sub = sub_p - cogs - inbound - (sub_p * 0.029 + 0.30) - post - pack
amz = price - cogs - inbound - price * 0.15 - (3.50 * 1.035 + 0.30)
print(f"Contribution: Shopify {shop:.2f} ({shop/price:.1%}), Sub {sub:.2f} ({sub/sub_p:.1%}), Amazon {amz:.2f} ({amz/price:.1%})")
print(f"Break-even @ $400 fixed: {math.ceil(400/shop)} units; @ $124 modelled fixed: {math.ceil(124/shop)} units")
for name, churn, cac in (("Conservative", .15, 22), ("Realistic", .12, 15), ("Aggressive", .09, 12)):
    ltv = sub / churn
    print(f"  {name}: lifetime {1/churn:.1f} mo, contribution LTV ${ltv:.2f}, LTV:CAC {ltv/cac:.1f}")
# Vitamin C %DV sanity check from uploaded can image (250 mg vs 90 mg DV)
print(f"250 mg vitamin C = {250/90:.0%} DV")
