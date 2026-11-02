"""Builds model/financial_model.xlsx with live formulas (no hard-coded results).

Run:  python3 model/build_model.py
Then (optional) recalc + verify:  python3 model/verify_model.py

Blue cells = editable inputs. Black cells = formulas.
Every input carries a Status column: SOURCED (third-party/official source, see Sources sheet)
or UNVERIFIED ESTIMATE (replace with a real quote).
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parent / "financial_model.xlsx"
BLUE = Font(color="1F4FD8", bold=True)
BOLD = Font(bold=True)
HEAD = PatternFill("solid", fgColor="F3E3DC")
INPUT_FILL = PatternFill("solid", fgColor="EEF3FF")
WRAP = Alignment(wrap_text=True, vertical="top")

wb = Workbook()


def header(ws, row, values, widths=None):
    for i, v in enumerate(values, 1):
        c = ws.cell(row=row, column=i, value=v)
        c.font = BOLD
        c.fill = HEAD
        c.alignment = WRAP
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w


def inp(cell, value, fmt=None):
    cell.value = value
    cell.font = BLUE
    cell.fill = INPUT_FILL
    if fmt:
        cell.number_format = fmt


# ------------------------------------------------------------------ Assumptions
A = wb.active
A.title = "Assumptions"
A["A1"] = "MIRAE Glow — model inputs (blue = editable). Status: SOURCED or UNVERIFIED ESTIMATE."
A["A1"].font = Font(bold=True, size=12)
header(A, 3, ["Key", "Input", "Value", "Unit", "Status / source"], [26, 46, 12, 14, 60])
NAMES = {}
rows = [
    # key, label, value, unit, status, fmt
    ("price", "Retail price per box (20 sticks)", 24.99, "$", "Founder decision", "$#,##0.00"),
    ("sticks", "Sticks per box", 20, "sticks", "Founder decision (20–30 range)", "0"),
    ("cogs", "Product cost per box incl. label/box (supplier)", 5.00, "$", "UNVERIFIED ESTIMATE — replace with supplier quote ($4–6 range)", "$#,##0.00"),
    ("inbound", "Inbound freight per box (supplier → you/3PL)", 0.50, "$", "UNVERIFIED ESTIMATE", "$#,##0.00"),
    ("pay_pct", "Shopify Payments % (Basic plan)", 0.029, "%", "SOURCED (third-party summaries of Shopify pricing) — confirm on shopify.com/pricing", "0.0%"),
    ("pay_fix", "Shopify Payments fixed fee per order", 0.30, "$", "SOURCED (same as above)", "$#,##0.00"),
    ("postage", "Outbound postage per DTC order (≈9–12 oz parcel)", 5.00, "$", "UNVERIFIED ESTIMATE — get USPS Ground Advantage commercial rate", "$#,##0.00"),
    ("ship_charged", "Shipping charged to customer per DTC order", 0.00, "$", "Founder decision (0 = free shipping)", "$#,##0.00"),
    ("pack", "Self-fulfilment packaging per order (mailer, insert)", 0.60, "$", "UNVERIFIED ESTIMATE", "$#,##0.00"),
    ("pl_pick", "3PL pick/pack fee per order", 3.00, "$", "UNVERIFIED ESTIMATE — 3PLs quote case by case", "$#,##0.00"),
    ("pl_min", "3PL monthly minimum", 275, "$", "SOURCED range ($250–275/mo cited for ShipMonk/ShipBob) — get written quote", "$#,##0"),
    ("pl_threshold", "Switch to 3PL at DTC orders/month ≥", 200, "orders", "Founder decision (self-fulfil below)", "0"),
    ("amz_ref", "Amazon referral fee (Grocery, price > $15)", 0.15, "%", "SOURCED (third-party fee guides: 8% ≤$15, 15% >$15) — confirm in Seller Central", "0%"),
    ("amz_fba", "Amazon FBA fulfilment fee per unit (small/large standard, ~12–16 oz)", 3.50, "$", "SOURCED range $3.22–$4.75 depending on size tier — UNVERIFIED for this box", "$#,##0.00"),
    ("amz_fuel", "Amazon fuel & logistics surcharge on FBA fee", 0.035, "%", "SOURCED (one third-party source, Apr 2026) — UNVERIFIED", "0.0%"),
    ("amz_inbound", "Amazon inbound placement/prep per unit", 0.30, "$", "UNVERIFIED ESTIMATE", "$#,##0.00"),
    ("amz_pro", "Amazon Professional seller plan per month", 39.99, "$", "UNVERIFIED — confirm in Seller Central", "$#,##0.00"),
    ("sub_disc", "Subscription discount", 0.15, "%", "Founder decision", "0%"),
    ("shopify_plan", "Shopify plan per month (Basic, monthly billing)", 39, "$", "SOURCED (third-party: $39 monthly / ~$29 annual)", "$#,##0"),
    ("software", "Email, domain, misc software per month", 25, "$", "UNVERIFIED ESTIMATE", "$#,##0"),
    ("insurance", "Product liability insurance per month", 60, "$", "UNVERIFIED ESTIMATE — get quotes", "$#,##0"),
    ("founder_fixed", "Founder's working fixed-cost assumption per month", 400, "$", "Founder assumption (used for break-even check)", "$#,##0"),
    ("moq", "Reorder quantity (MOQ) per PO", 500, "boxes", "UNVERIFIED ESTIMATE — supplier quote", "0"),
    ("init_units", "Launch inventory (first PO)", 300, "boxes", "Founder decision (300–500)", "0"),
    ("lead", "Production + transit lead time", 2, "months", "Founder estimate (6–10 weeks)", "0"),
    ("deposit", "Deposit paid at PO (balance on delivery)", 0.5, "%", "UNVERIFIED — typical terms; confirm with supplier", "0%"),
    ("reorder_months", "Reorder when (stock + on order) < N months of demand", 2, "months", "Founder rule (~60 days)", "0"),
    ("order_cover", "Order size covers N months of demand (min MOQ)", 3, "months", "Model rule", "0"),
    ("preorders", "Pre-orders collected during validation (units)", 60, "boxes", "Plan target (see launch plan gate)", "0"),
    ("seeding", "Creator seeding boxes from first PO", 15, "boxes", "Plan", "0"),
    ("tax_rate", "Not modelled: income tax (pre-profit stage)", 0, "%", "Out of scope — consult accountant", "0%"),
]
for i, (k, label, val, unit, status, fmt) in enumerate(rows, start=4):
    A.cell(row=i, column=1, value=k)
    A.cell(row=i, column=2, value=label)
    inp(A.cell(row=i, column=3), val, fmt)
    A.cell(row=i, column=4, value=unit)
    A.cell(row=i, column=5, value=status).alignment = WRAP
    NAMES[k] = f"Assumptions!$C${i}"
N = NAMES  # shorthand

# ------------------------------------------------------------------ Scenarios
S = wb.create_sheet("Scenarios")
S["A1"] = "Scenario drivers (blue = editable). All values are UNVERIFIED planning estimates until real data exists."
S["A1"].font = Font(bold=True, size=12)
header(S, 3, ["Driver", "Conservative", "Realistic", "Aggressive", "Unit / note"], [44, 14, 14, 14, 50])
SC = {}
scen_rows = [
    ("nc1", "New DTC customers in month 1", (30, 50, 80), "customers", "0"),
    ("g", "Monthly growth in new DTC customers", (0.08, 0.12, 0.18), "%", "0%"),
    ("sub_share", "Share of new customers who subscribe", (0.20, 0.30, 0.35), "%", "0%"),
    ("churn", "Monthly subscriber churn", (0.15, 0.12, 0.09), "%", "0%"),
    ("cac", "Blended CAC per new DTC customer", (22, 15, 12), "$", "$#,##0.00"),
    ("amz_start", "Amazon launch month (1–12)", (9, 7, 5), "month", "0"),
    ("amz1", "Amazon units in first Amazon month", (15, 30, 60), "units", "0"),
    ("gA", "Monthly Amazon unit growth", (0.08, 0.12, 0.15), "%", "0%"),
]
for i, (k, label, vals, unit, fmt) in enumerate(scen_rows, start=4):
    S.cell(row=i, column=1, value=label)
    for j, v in enumerate(vals):
        inp(S.cell(row=i, column=2 + j), v, fmt)
    S.cell(row=i, column=5, value=unit)
    SC[k] = i

# ------------------------------------------------------------------ Unit economics
U = wb.create_sheet("Unit Economics")
U["A1"] = "Contribution per box by channel (before marketing/CAC and fixed costs). All cells are formulas."
U["A1"].font = Font(bold=True, size=12)
header(U, 3, ["Line", "Shopify one-time", "Subscription", "Amazon FBA"], [44, 18, 18, 18])
ue = [
    ("Price", f"={N['price']}", f"={N['price']}*(1-{N['sub_disc']})", f"={N['price']}"),
    ("+ Shipping charged", f"={N['ship_charged']}", f"={N['ship_charged']}", "=0"),
    ("Net revenue", "=B4+B5", "=C4+C5", "=D4+D5"),
    ("Product cost", f"={N['cogs']}", f"={N['cogs']}", f"={N['cogs']}"),
    ("Inbound freight", f"={N['inbound']}", f"={N['inbound']}", f"={N['inbound']}"),
    ("Payment processing", f"=B6*{N['pay_pct']}+{N['pay_fix']}", f"=C6*{N['pay_pct']}+{N['pay_fix']}", "=0"),
    ("Marketplace referral fee", "=0", "=0", f"=D4*{N['amz_ref']}"),
    ("Fulfilment (postage + packaging / FBA)", f"={N['postage']}+{N['pack']}", f"={N['postage']}+{N['pack']}", f"={N['amz_fba']}*(1+{N['amz_fuel']})+{N['amz_inbound']}"),
    ("Total variable cost", "=SUM(B7:B11)", "=SUM(C7:C11)", "=SUM(D7:D11)"),
    ("Contribution per box", "=B6-B12", "=C6-C12", "=D6-D12"),
    ("Contribution margin %", "=B13/B6", "=C13/C6", "=D13/D6"),
    ("Contribution if 3PL fulfils (pick fee replaces packaging)", f"=B13+{N['pack']}-{N['pl_pick']}", f"=C13+{N['pack']}-{N['pl_pick']}", "=D13"),
]
for i, (label, b, c, d) in enumerate(ue, start=4):
    U.cell(row=i, column=1, value=label)
    for col, f in zip((2, 3, 4), (b, c, d)):
        cell = U.cell(row=i, column=col, value=f)
        cell.number_format = "0.0%" if "margin" in label else "$#,##0.00"
for col in (2, 3, 4):
    U.cell(row=13, column=col).font = BOLD
U["A18"] = "Subscriber lifetime (months) = 1 / churn; contribution LTV per subscriber by scenario:"
U["A18"].font = BOLD
header(U, 19, ["Scenario", "Expected lifetime (months)", "Contribution LTV", "LTV : CAC"])
for j, name in enumerate(("Conservative", "Realistic", "Aggressive")):
    r = 20 + j
    col = get_column_letter(2 + j)
    U.cell(row=r, column=1, value=name)
    U.cell(row=r, column=2, value=f"=1/Scenarios!{col}{SC['churn']}").number_format = "0.0"
    U.cell(row=r, column=3, value=f"=B{r}*$C$13").number_format = "$#,##0.00"
    U.cell(row=r, column=4, value=f"=C{r}/Scenarios!{col}{SC['cac']}").number_format = "0.0x"
U["A24"] = "Targets from brief: CAC < $15, LTV > $60 (here LTV = contribution margin over expected lifetime, not revenue)."

# ------------------------------------------------------------------ Break-even
B = wb.create_sheet("Break-even")
B["A1"] = "Monthly break-even (units) — formulas"
B["A1"].font = Font(bold=True, size=12)
header(B, 3, ["Measure", "Value", "Note"], [56, 16, 60])
be = [
    ("Modelled fixed costs / month (Shopify + software + insurance)", f"={N['shopify_plan']}+{N['software']}+{N['insurance']}", "Self-fulfilment, before Amazon"),
    ("+ Amazon Professional plan (once Amazon live)", f"=B4+{N['amz_pro']}", ""),
    ("+ 3PL minimum (once on 3PL)", f"=B5+{N['pl_min']}", ""),
    ("Founder's working fixed-cost assumption", f"={N['founder_fixed']}", "From brief"),
    ("Contribution per Shopify one-time box", "='Unit Economics'!B13", ""),
    ("Break-even units — modelled fixed, self-fulfil", "=ROUNDUP(B4/B8,0)", ""),
    ("Break-even units — founder's $400 assumption", "=ROUNDUP(B7/B8,0)", "Brief said ~32"),
    ("Break-even units — with Amazon plan + 3PL minimum", "=ROUNDUP(B6/'Unit Economics'!B15,0)", "Uses 3PL contribution"),
    ("Break-even incl. paid acquisition (realistic CAC on every box)", '=IF(B8<=Scenarios!C8,"Never: CAC ≥ first-order contribution",ROUNDUP(B4/(B8-Scenarios!C8),0))', "If every sale needs a paid new customer — shows why repeat/subscription matters"),
]
for i, (label, f, note) in enumerate(be, start=4):
    B.cell(row=i, column=1, value=label)
    c = B.cell(row=i, column=2, value=f)
    c.number_format = "0" if "units" in label.lower() else "$#,##0.00"
    B.cell(row=i, column=3, value=note)

# ------------------------------------------------------------------ Launch budget (90 days)
L = wb.create_sheet("Launch Budget")
L["A1"] = "90-day launch budget and running cash (start = $5,000). Inflows positive, spend negative."
L["A1"].font = Font(bold=True, size=12)
inp(L["B2"], 5000, "$#,##0")
L["A2"] = "Starting cash"
header(L, 4, ["Week", "Item", "Amount ($, − = spend)", "Running cash", "Status / source"], [7, 58, 18, 16, 60])
budget = [
    (1, "Domain + handles (IG/TikTok/Pinterest/YouTube free)", -20, "UNVERIFIED ESTIMATE"),
    (1, "Waitlist landing page hosting (static, free tier) + email tool free tier", 0, "UNVERIFIED — free tiers change"),
    (2, "USPTO Intent-to-Use, Class 30 (coffee), base fee", -350, "SOURCED: $350/class base fee (eff. 18 Jan 2025); confirm on uspto.gov"),
    (2, "Supplier samples (3 suppliers, incl. shipping)", -200, "UNVERIFIED ESTIMATE"),
    (3, "Validation ad test, week 3", -75, "Plan"),
    (4, "Validation ad test, week 4", -75, "Plan"),
    (4, "Mock-up/photo props", -50, "UNVERIFIED ESTIMATE"),
    (5, "Validation ad test, week 5", -75, "Plan"),
    (5, "Third-party potency test of best sample (vitamin C, brewed per label)", -250, "SOURCED proxy: ~€100–125/sample + €97 order fee (Measurlabs); get US lab quote"),
    (6, "Validation ad test, week 6", -75, "Plan"),
    (6, "GATE — go/no-go (see launch-plan.md). Rows below assume GO.", 0, ""),
    (6, "NY LLC Articles of Organization", -200, "SOURCED: $200 NY DOS filing fee"),
    (6, "Shopify Basic, month 1", -39, "SOURCED (third-party)"),
    (7, "Pre-order revenue (units × price less payment fees)", f"={N['preorders']}*({N['price']}-({N['price']}*{N['pay_pct']}+{N['pay_fix']}))", "Plan target; refund liability if not shipped on time (FTC Mail Order Rule)"),
    (7, "Regulatory consultant — one-time label/claims review", -600, "UNVERIFIED ESTIMATE"),
    (7, "Label/box artwork (freelancer)", -150, "UNVERIFIED ESTIMATE"),
    (7, "GS1 US single GTIN (UPC)", -30, "SOURCED: $30 one-time single GTIN"),
    (8, "Inventory PO deposit (launch units × cost × deposit %)", f"=-{N['init_units']}*{N['cogs']}*{N['deposit']}", "UNVERIFIED unit cost/terms"),
    (8, "Label/packaging setup (plates, print)", -150, "UNVERIFIED ESTIMATE"),
    (10, "Shopify Basic, month 2", -39, "SOURCED (third-party)"),
    (10, "Product liability insurance, month 1", -60, "UNVERIFIED ESTIMATE"),
    (11, "Inventory balance on shipment", f"=-{N['init_units']}*{N['cogs']}*(1-{N['deposit']})", "UNVERIFIED unit cost/terms"),
    (11, "Inbound freight (launch units)", f"=-{N['init_units']}*{N['inbound']}", "UNVERIFIED ESTIMATE"),
    (11, "Mailers/inserts for launch units", f"=-{N['init_units']}*{N['pack']}", "UNVERIFIED ESTIMATE"),
    (12, "Receipt QC test on production lot (vitamin C)", -150, "UNVERIFIED ESTIMATE"),
    (12, "Ship pre-orders (postage)", f"=-{N['preorders']}*{N['postage']}", "UNVERIFIED postage"),
    (12, "Creator seeding postage (product already in PO)", f"=-{N['seeding']}*{N['postage']}", "UNVERIFIED postage"),
    (13, "Reserve: Queens LLC publication + $50 certificate (due ≤120 days after formation)", -1050, "SOURCED range $850–1,800 + $50; ring-fenced"),
]
for i, (wk, item, amt, status) in enumerate(budget, start=5):
    L.cell(row=i, column=1, value=wk)
    L.cell(row=i, column=2, value=item)
    c = L.cell(row=i, column=3)
    inp(c, amt, "$#,##0;[Red]-$#,##0")
    prev = "$B$2" if i == 5 else f"D{i-1}"
    L.cell(row=i, column=4, value=f"={prev}+C{i}").number_format = "$#,##0;[Red]-$#,##0"
    L.cell(row=i, column=5, value=status).alignment = WRAP
last = 4 + len(budget)
L.cell(row=last + 2, column=2, value="Total spend (all negative lines)").font = BOLD
L.cell(row=last + 2, column=3, value=f'=SUMIF(C5:C{last},"<0")').number_format = "$#,##0"
L.cell(row=last + 3, column=2, value="Total inflows").font = BOLD
L.cell(row=last + 3, column=3, value=f'=SUMIF(C5:C{last},">0")').number_format = "$#,##0"
L.cell(row=last + 4, column=2, value="Lowest cash point").font = BOLD
L.cell(row=last + 4, column=3, value=f"=MIN(D5:D{last})").number_format = "$#,##0"
L.cell(row=last + 5, column=2, value="Ending cash after day 90 (carried into 12-month model)").font = BOLD
L.cell(row=last + 5, column=3, value=f"=D{last}").number_format = "$#,##0"
L.cell(row=last + 6, column=2, value="Spend if GATE = NO-GO (weeks 1–6 only)").font = BOLD
gate_row = next(i for i, b in enumerate(budget, start=5) if b[1].startswith("GATE"))
L.cell(row=last + 6, column=3, value=f'=SUMIF(C5:C{gate_row},"<0")').number_format = "$#,##0"
LAUNCH_END = f"'Launch Budget'!$C${last + 5}"

# ------------------------------------------------------------------ 12-month cash flow per scenario
CF_COLS = [
    "Month", "New DTC customers", "Active subscribers", "One-time DTC units", "Subscription units", "Amazon units",
    "Gifting units", "Demand units", "Begin inventory", "Received", "Units sold", "Lost sales (stockout)",
    "End inventory", "On order", "PO placed (units)", "DTC revenue (cash)", "Amazon payout (1-mo lag)",
    "COGS + inbound (expense)", "Payment fees", "Fulfilment cost", "Amazon fees", "Marketing (CAC × new)",
    "Fixed costs", "Inventory cash out", "Net cash flow", "Ending cash", "Operating profit (accrual, approx.)",
    "Booked revenue",
]


def build_cf(name, sc_col):
    ws = wb.create_sheet(f"CF {name}")
    ws["A1"] = f"12-month cash flow — {name} scenario (starts at launch; month 1 = first shipments). Formulas only."
    ws["A1"].font = Font(bold=True, size=12)
    ws["A2"] = "Opening cash (from Launch Budget ending cash):"
    ws["D2"] = f"={LAUNCH_END}"
    ws["D2"].number_format = "$#,##0"
    header(ws, 4, CF_COLS, [7] + [13] * (len(CF_COLS) - 1))
    sv = lambda k: f"Scenarios!${sc_col}${SC[k]}"
    unit = "'Unit Economics'"
    for m in range(1, 13):
        r = 4 + m
        p = r - 1  # previous row
        f = {}
        f["A"] = m
        f["B"] = f"=ROUND({sv('nc1')}*(1+{sv('g')})^(A{r}-1),0)"
        f["C"] = (f"=ROUND(B{r}*{sv('sub_share')},0)" if m == 1
                  else f"=ROUND(C{p}*(1-{sv('churn')})+B{r}*{sv('sub_share')},0)")
        f["D"] = f"=B{r}-ROUND(B{r}*{sv('sub_share')},0)"
        f["E"] = f"=C{r}"
        f["F"] = f"=IF(A{r}>={sv('amz_start')},ROUND({sv('amz1')}*(1+{sv('gA')})^(A{r}-{sv('amz_start')}),0),0)"
        f["G"] = "=0"
        f["H"] = f"=D{r}+E{r}+F{r}+G{r}"
        f["I"] = f"={N['init_units']}-{N['preorders']}-{N['seeding']}" if m == 1 else f"=M{p}"
        # Received: PO placed `lead` months earlier
        f["J"] = "=0" if m == 1 else f"=IFERROR(IF(A{r}-{N['lead']}>=1,INDEX($O$5:O{p},A{r}-{N['lead']}),0),0)"
        f["K"] = f"=MIN(H{r},I{r}+J{r})"
        f["L"] = f"=H{r}-K{r}"
        f["M"] = f"=I{r}+J{r}-K{r}"
        # On order after this month's PO decision = sum of POs not yet received
        prior_onorder = "0" if m == 1 else f"SUMPRODUCT(($A$5:A{p}>A{r}-{N['lead']})*($O$5:O{p}))"
        f["N"] = f"={prior_onorder}+O{r}"
        f["O"] = (f"=IF(M{r}+{prior_onorder}<{N['reorder_months']}*H{r},"
                  f"MAX({N['moq']},ROUND({N['order_cover']}*H{r},0)),0)")
        # Units sold split pro-rata by demand mix (pre-orders already paid)
        share = lambda col: f"IF(H{r}=0,0,K{r}*{col}{r}/H{r})"
        f["P"] = (f"={share('D')}*({unit}!$B$6)+{share('E')}*({unit}!$C$6)")
        f["Q"] = (f"=0" if m == 1 else
                  f"=IF(H{p}=0,0,K{p}*F{p}/H{p})*({unit}!$D$4-{unit}!$D$10-{unit}!$D$11)")
        f["R"] = f"=K{r}*({N['cogs']}+{N['inbound']})"
        f["S"] = f"=({share('D')}+{share('E')})*{N['pay_fix']}+P{r}*{N['pay_pct']}"
        dtc_orders = f"({share('D')}+{share('E')}+{share('G')})"
        f["T"] = (f"=IF({dtc_orders}>={N['pl_threshold']},MAX({N['pl_min']},{dtc_orders}*{N['pl_pick']})"
                  f"+{dtc_orders}*{N['postage']},{dtc_orders}*({N['postage']}+{N['pack']}))")
        f["U"] = f"={share('F')}*({unit}!$D$10+{unit}!$D$11)"
        f["V"] = f"=B{r}*{sv('cac')}"
        f["W"] = (f"={N['shopify_plan']}+{N['software']}+{N['insurance']}"
                  f"+IF(A{r}>={sv('amz_start')}-1,{N['amz_pro']},0)")
        # Inventory cash: deposit on this month's PO + balance on POs received this month
        f["X"] = f"=O{r}*({N['cogs']})*{N['deposit']}+J{r}*({N['cogs']})*(1-{N['deposit']})+J{r}*{N['inbound']}"
        f["Y"] = f"=P{r}+Q{r}-S{r}-T{r}-V{r}-W{r}-X{r}"
        f["Z"] = f"=$D$2+Y{r}" if m == 1 else f"=Z{p}+Y{r}"
        f["AB"] = f"=P{r}+{share('F')}*{unit}!$D$4"
        f["AA"] = f"=AB{r}-R{r}-S{r}-T{r}-U{r}-V{r}-W{r}"
        for col, val in f.items():
            c = ws[f"{col}{r}"]
            c.value = val
            if col in ("P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB"):
                c.number_format = "$#,##0;[Red]-$#,##0"
            elif col != "A":
                c.number_format = "0"
    tr = 18
    ws[f"A{tr}"] = "Totals / key results"
    ws[f"A{tr}"].font = BOLD
    results = [
        ("Units sold (12 mo)", "=SUM(K5:K16)", "0"),
        ("Lost sales from stockouts", "=SUM(L5:L16)", "0"),
        ("Revenue booked (DTC + Amazon gross, excl. pre-orders)", "=SUM(AB5:AB16)", "$#,##0"),
        ("Operating profit (accrual, approx.)", "=SUM(AA5:AA16)", "$#,##0;[Red]-$#,##0"),
        ("Lowest month-end cash", "=MIN(Z5:Z16)", "$#,##0;[Red]-$#,##0"),
        ("Month of lowest cash", "=INDEX(A5:A16,MATCH(MIN(Z5:Z16),Z5:Z16,0))", "0"),
        ("Ending cash month 12", "=Z16", "$#,##0;[Red]-$#,##0"),
        ("Subscribers at month 12", "=C16", "0"),
        ("Months with negative cash", '=COUNTIF(Z5:Z16,"<0")', "0"),
    ]
    for i, (label, fml, fmt) in enumerate(results, start=tr + 1):
        ws[f"A{i}"] = label
        ws[f"D{i}"] = fml
        ws[f"D{i}"].number_format = fmt
    ws.freeze_panes = "B5"
    return ws, tr + 1


cfs = {}
for name, col in (("Conservative", "B"), ("Realistic", "C"), ("Aggressive", "D")):
    cfs[name] = build_cf(name, col)

# ------------------------------------------------------------------ Summary
Y = wb.create_sheet("Summary", 0)
Y["A1"] = "MIRAE Glow — model summary (all cells pull from formulas)"
Y["A1"].font = Font(bold=True, size=13)
header(Y, 3, ["Metric", "Conservative", "Realistic", "Aggressive"], [52, 16, 16, 16])
labels = ["Units sold (12 mo)", "Lost sales from stockouts", "Revenue booked (DTC + Amazon gross, excl. pre-orders)",
          "Operating profit (accrual, approx.)", "Lowest month-end cash", "Month of lowest cash",
          "Ending cash month 12", "Subscribers at month 12", "Months with negative cash"]
for i, label in enumerate(labels):
    r = 4 + i
    Y.cell(row=r, column=1, value=label)
    for j, name in enumerate(("Conservative", "Realistic", "Aggressive")):
        ws, start = cfs[name]
        c = Y.cell(row=r, column=2 + j, value=f"='CF {name}'!D{start + i}")
        c.number_format = ws[f"D{start + i}"].number_format
Y["A15"] = "Unit economics (contribution per box)"
Y["A15"].font = BOLD
for i, (lab, col) in enumerate((("Shopify one-time", "B"), ("Subscription", "C"), ("Amazon FBA", "D"))):
    Y.cell(row=16 + i, column=1, value=lab)
    Y.cell(row=16 + i, column=2, value=f"='Unit Economics'!{col}13").number_format = "$#,##0.00"
    Y.cell(row=16 + i, column=3, value=f"='Unit Economics'!{col}14").number_format = "0.0%"
Y["A20"] = "Break-even (self-fulfil, modelled fixed)"
Y["B20"] = "='Break-even'!B9"
Y["A21"] = "Break-even (founder $400 fixed)"
Y["B21"] = "='Break-even'!B10"
Y["A22"] = "Launch: ending cash day 90 / lowest cash"
Y["B22"] = f"={LAUNCH_END}"
Y["C22"] = f"='Launch Budget'!C{last + 4}"
for c in ("B22", "C22"):
    Y[c].number_format = "$#,##0;[Red]-$#,##0"

# ------------------------------------------------------------------ Sources
R = wb.create_sheet("Sources")
R["A1"] = "Sources for SOURCED inputs (verify on official pages before relying on them)"
R["A1"].font = BOLD
srcs = [
    ("USPTO fees (Jan 2025): $350/class base; SOU $150/class", "https://perkinscoie.com/insights/update/usptos-significant-restructuring-trademark-fees-takes-effect-january-18-2025"),
    ("Shopify Basic price & 2.9%+30¢ card rate (third-party)", "https://www.nerdwallet.com/article/small-business/shopify-pricing"),
    ("Amazon referral tiers Grocery 8%/15% (third-party)", "https://ecomcalctools.com/blog/fees-amazon/amazon-grocery-gourmet-fees/"),
    ("Amazon 2026 FBA fee changes (third-party)", "https://www.goatconsulting.com/blog/amazon-fba-fee-changes-for-2026"),
    ("3PL minimums ShipBob vs ShipMonk (third-party)", "https://fitsmallbusiness.com/shipbob-vs-shipmonk"),
    ("GS1 US single GTIN $30", "https://www.barcode.graphics/gs1-us-gtin-upc-barcodes/"),
    ("NY LLC $200 filing; publication costs by county", "https://howtostartanllc.com/new-york-publication-requirements/new-york-llc-publication-cost"),
    ("Vitamin C test price proxy (Measurlabs)", "https://measurlabs.com/products/vitamin-c-ascorbic-acid"),
]
for i, (a, b) in enumerate(srcs, start=3):
    R.cell(row=i, column=1, value=a)
    R.cell(row=i, column=2, value=b)
R.column_dimensions["A"].width = 60
R.column_dimensions["B"].width = 100

wb.save(OUT)
print("wrote", OUT)
