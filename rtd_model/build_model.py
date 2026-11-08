"""
Builds RTD_Lychee_Martini_Model.xlsx — canned lychee martini financial model.
Run:  python rtd_model/build_model.py   then recalc with LibreOffice.
"""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from pathlib import Path

OUT = Path(__file__).resolve().parent / "RTD_Lychee_Martini_Model.xlsx"

F = "Arial"
BLUE, BLACK, GREEN = "0000FF", "000000", "008000"
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEAD = PatternFill("solid", fgColor="1F3864")
SUB = PatternFill("solid", fgColor="D9E1F2")
THIN = Border(bottom=Side(style="thin", color="BFBFBF"))

USD = '$#,##0;($#,##0);"-"'
USD2 = '$#,##0.00;($#,##0.00);"-"'
USD3 = '$#,##0.000;($#,##0.000);"-"'
PCT = '0.0%;(0.0%);"-"'
NUM = '#,##0;(#,##0);"-"'
NUM1 = '#,##0.0;(#,##0.0);"-"'
NUM2 = '#,##0.00;(#,##0.00);"-"'

wb = Workbook()
REF: dict[str, str] = {}          # key -> absolute ref like 'Inputs'!$B$5


def font(color=BLACK, bold=False, size=10, italic=False, white=False):
    return Font(name=F, color="FFFFFF" if white else color, bold=bold, size=size, italic=italic)


def title(ws, text, sub=None):
    ws["A1"] = text
    ws["A1"].font = font(bold=True, size=14)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = font(italic=True, size=9, color="595959")


def header(ws, row, labels, widths=None):
    for i, lab in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=lab)
        c.font = font(bold=True, white=True)
        c.fill = HEAD
        c.alignment = Alignment(horizontal="center" if i > 1 else "left", vertical="center", wrap_text=True)
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w


def section(ws, row, text, ncols=4):
    for col in range(1, ncols + 1):
        ws.cell(row=row, column=col).fill = SUB
    ws.cell(row=row, column=1, value=text).font = font(bold=True)


def ref(sheet, col, row):
    s = f"'{sheet}'" if " " in sheet else sheet
    return f"{s}!${col}${row}"


def put(ws, row, key, label, value, unit="", note="", fmt=None, is_input=False, key_cell=False,
        col="B", link=False):
    ws.cell(row=row, column=1, value=label).font = font()
    c = ws[f"{col}{row}"]
    c.value = value
    c.font = font(BLUE if is_input else GREEN if link else BLACK, bold=key_cell and not is_input)
    if fmt:
        c.number_format = fmt
    if key_cell:
        c.fill = YELLOW
    if unit:
        ws.cell(row=row, column=3, value=unit).font = font(size=9, color="595959")
    if note:
        n = ws.cell(row=row, column=4, value=note)
        n.font = font(size=9, color="595959", italic=True)
        n.alignment = Alignment(wrap_text=True, vertical="top")
    for cc in range(1, 5):
        ws.cell(row=row, column=cc).border = THIN
    if key:
        REF[key] = ref(ws.title, col, row)
    return c


# ════════════════════════════════════════════════════════════════
# READ ME
# ════════════════════════════════════════════════════════════════
rm = wb.active
rm.title = "Read Me"
title(rm, "Canned Lychee Martini — Financial Model", "Built Nov 2026. All $ in USD. Estimates must be replaced with supplier quotes before committing capital.")
rows = [
    ("How to use", ""),
    ("1", "Edit only BLUE cells (inputs). Yellow-filled cells are the key assumptions and headline outputs."),
    ("2", "Pick the launch state on 'Inputs' (dropdown). Its state spirits tax flows into pricing automatically."),
    ("3", "Recipe and ingredient prices live on 'Formulation'; the liquid cost per can flows into 'Unit Economics'."),
    ("4", "'Cash Flow' runs 24 months: development → first production run → launch → ramp. Peak cash need = money to raise."),
    ("Colour code", ""),
    ("Blue text", "Hard-coded input — change freely"),
    ("Black text", "Formula — do not overwrite"),
    ("Green text", "Link pulled from another sheet"),
    ("Yellow fill", "Key assumption / headline result"),
    ("Sheets", ""),
    ("Inputs", "Price, margins, taxes, packaging, co-packer terms, marketing, fixed costs, timeline, one-time startup costs"),
    ("Formulation", "Lychee martini recipe per 200 ml can (ratios, grams, ABV check, sugar, calories) + 1,000 L batch sheet + liquid cost"),
    ("Unit Economics", "Retail → retailer → distributor → brand (FOB) waterfall, cost of goods, contribution per can and per case"),
    ("Production Runs", "Minimum run size, cash tied up per run, ingredients per run, months of supply"),
    ("Break-Even", "Cases/month, cans/month and stores needed to cover fixed costs; price sensitivity"),
    ("Cash Flow", "Monthly sales, inventory, production runs, collections, costs, cumulative cash, peak cash need"),
    ("States", "All 50 states + DC spirits tax (Tax Foundation, Jan 2026) + grocery access for spirits RTDs + launch-state score"),
    ("Key caveats", ""),
    ("Costs", "Ingredient, packaging, co-packing and freight costs are industry-range ESTIMATES, flagged in notes. Get 3+ quotes."),
    ("State tax", "Tax Foundation rates are for 40% ABV spirits in 750 ml off-premise. Many states tax RTDs at a different (often lower) rate; control states add mark-ups. Treat per-can state tax as indicative."),
    ("Grocery access", "Rows marked 'Verified' were confirmed from sources found Nov 2026; rows marked 'Verify' are from general knowledge. Confirm with the state regulator before choosing a launch state."),
]
r = 4
for a, b in rows:
    if b == "":
        section(rm, r, a, 2)
    else:
        rm.cell(row=r, column=1, value=a).font = font(bold=True)
        rm.cell(row=r, column=2, value=b).font = font()
        rm.cell(row=r, column=2).alignment = Alignment(wrap_text=True, vertical="top")
    r += 1
rm["A8"].font = font(BLUE, bold=True)
rm["A9"].font = font(BLACK, bold=True)
rm["A10"].font = font(GREEN, bold=True)
rm["A11"].fill = YELLOW
rm.column_dimensions["A"].width = 18
rm.column_dimensions["B"].width = 120

# ════════════════════════════════════════════════════════════════
# STATES (built early so Inputs can reference it)
# ════════════════════════════════════════════════════════════════
st = wb.create_sheet("States")
# name, tax2026, control(a), pop_m (approx), access, confidence/source note
TF = "Tax Foundation, Distilled Spirits Taxes by State 2026 (rates as of Jan 2026; source data DISCUS/TTB)"
STATES = [
    ("Alabama", 22.87, 1, 5.16, "No", "Verified: 2025 grocery-RTD bills (HB 521/SB 286) not enacted; check 2026 session"),
    ("Alaska", 12.80, 0, 0.74, "Not researched", ""),
    ("Arizona", 3.00, 0, 7.58, "Verify", "Sources conflict: grocery spirits allowed under quota licenses per most sources"),
    ("Arkansas", 9.76, 0, 3.09, "Not researched", ""),
    ("California", 3.30, 0, 39.43, "Yes", "Grocery stores may sell spirits (consumer/legal guides); confirm with CA ABC"),
    ("Colorado", 2.28, 0, 5.96, "Verify", "General knowledge: spirits only in liquor stores; grocery limited to beer/wine"),
    ("Connecticut", 5.94, 0, 3.68, "Not researched", ""),
    ("Delaware", 4.50, 0, 1.05, "Not researched", ""),
    ("Florida", 6.50, 0, 23.37, "Likely yes", "Brewers Law: spirits RTDs sellable by beer/wine vendors under F.S. 564.06(5)(b); distributor needs KLD licence. Bottled spirits still behind 'the wall'. Verify"),
    ("Georgia", 3.79, 0, 11.18, "Verify", "General knowledge: spirits only in package stores"),
    ("Hawaii", 5.98, 0, 1.45, "Not researched", ""),
    ("Idaho", 12.94, 1, 2.00, "Not researched", ""),
    ("Illinois", 8.55, 0, 12.71, "Yes", "Grocery stores may sell spirits (consumer/legal guides); Chicago/Cook add local taxes"),
    ("Indiana", 2.68, 0, 6.92, "Verify", "General knowledge: grocery may sell spirits"),
    ("Iowa", 15.14, 1, 3.24, "Not researched", ""),
    ("Kansas", 2.50, 0, 2.97, "Verify", "General knowledge: spirits only in liquor stores"),
    ("Kentucky", 9.56, 0, 4.59, "Not researched", ""),
    ("Louisiana", 3.03, 0, 4.60, "Yes", "Grocery spirits allowed; some parishes/cities (e.g., Shreveport) restrict"),
    ("Maine", 11.93, 1, 1.41, "Not researched", ""),
    ("Maryland", 5.46, 0, 6.26, "Not researched", ""),
    ("Massachusetts", 4.05, 0, 7.14, "Verify", "General knowledge: limited grocery licences"),
    ("Michigan", 14.61, 1, 10.14, "Verify", "General knowledge: grocery may sell spirits (control state pricing)"),
    ("Minnesota", 8.74, 0, 5.79, "Verify", "General knowledge: spirits only in liquor stores"),
    ("Mississippi", 9.38, 1, 2.94, "Not researched", ""),
    ("Missouri", 2.00, 0, 6.25, "Yes", "Grocery stores may sell spirits (consumer/legal guides)"),
    ("Montana", 10.55, 1, 1.14, "Not researched", ""),
    ("Nebraska", 3.75, 0, 2.01, "Not researched", ""),
    ("Nevada", 3.60, 0, 3.27, "Yes", "Grocery stores may sell spirits (consumer/legal guides)"),
    ("New Hampshire", 0.00, 1, 1.41, "Not researched", "Control state: state liquor outlets"),
    ("New Jersey", 5.50, 0, 9.50, "Verify", "General knowledge: very limited grocery licences"),
    ("New Mexico", 6.06, 0, 2.13, "Not researched", ""),
    ("New York", 6.44, 0, 19.87, "Verify", "General knowledge: spirits only in liquor stores"),
    ("North Carolina", 18.23, 1, 11.05, "No", "Verified: ABC stores only; HB 921 (grocery RTDs) advanced May 2026, not law"),
    ("North Dakota", 4.93, 0, 0.80, "Not researched", ""),
    ("Ohio", 12.33, 1, 11.88, "Verify", "General knowledge: spirits-based drinks <=21% ABV sold with grocery permit"),
    ("Oklahoma", 5.56, 0, 4.10, "Not researched", ""),
    ("Oregon", 23.74, 1, 4.27, "No", "Verified: OLCC declined grocery sales in 2025"),
    ("Pennsylvania", 7.48, 1, 13.08, "Limited", "Verified: Act 86 of 2024 (SB 688), eff. 16 Sep 2024 — spirits RTDs <=12.5% ABV, <=16 oz, retailer needs $2,500 RTD permit"),
    ("Rhode Island", 5.40, 0, 1.11, "Not researched", ""),
    ("South Carolina", 5.42, 0, 5.48, "Verify", "General knowledge: spirits only in liquor stores"),
    ("South Dakota", 4.93, 0, 0.92, "Not researched", ""),
    ("Tennessee", 4.46, 0, 7.23, "Verify", "General knowledge: spirits only in liquor stores"),
    ("Texas", 2.40, 0, 31.29, "No", "Verified: SB 2225 (grocery RTDs <=10% ABV) not enacted in 2025 session"),
    ("Utah", 16.07, 1, 3.50, "Not researched", ""),
    ("Vermont", 9.06, 1, 0.65, "Not researched", ""),
    ("Virginia", 23.47, 1, 8.81, "Verify", "Control state; check low-ABV spirits RTD rules"),
    ("Washington", 36.68, 0, 7.96, "Verify", "General knowledge: grocery >10,000 sq ft may sell spirits; highest tax in US"),
    ("West Virginia", 8.98, 1, 1.77, "Not researched", ""),
    ("Wisconsin", 3.25, 0, 5.96, "Verify", "General knowledge: grocery may sell spirits"),
    ("Wyoming", 0.00, 1, 0.59, "Not researched", "Control state (wholesale)"),
    ("DC", 6.68, 0, 0.70, "Not researched", ""),
]
title(st, "State comparison — spirits tax, grocery access for spirits RTDs, launch score",
      "Tax: " + TF + ". Population: approx. 2024 Census estimates, millions (rounded). Access: see column G.")
# weights
section(st, 4, "Scoring weights (edit blue)", 9)
weights = [("w_access", "Weight: grocery/convenience access", 0.50), ("w_tax", "Weight: low state tax", 0.20),
           ("w_pop", "Weight: market size (population)", 0.30), ("w_control", "Penalty: control state", 0.10)]
for i, (k, lab, v) in enumerate(weights):
    rr = 5 + i
    st.cell(row=rr, column=1, value=lab).font = font()
    c = st.cell(row=rr, column=2, value=v)
    c.font = font(BLUE)
    c.number_format = "0.00"
    REF[k] = ref("States", "B", rr)
# access points lookup
section(st, 4, "", 9)
st["D4"] = "Access level → points"
st["D4"].font = font(bold=True)
levels = [("Yes", 3), ("Likely yes", 2.5), ("Limited", 2), ("Verify", 1), ("No", 0), ("Not researched", 0)]
for i, (lv, pts) in enumerate(levels):
    st.cell(row=5 + i, column=4, value=lv).font = font()
    c = st.cell(row=5 + i, column=5, value=pts)
    c.font = font(BLUE)
LV_RANGE = "States!$D$5:$D$10"
PT_RANGE = "States!$E$5:$E$10"

HR = 12
header(st, HR, ["State", "Spirits tax $/gal (2026)", "Control state (1=yes)", "Population (m, approx)",
                "Grocery/c-store access for spirits RTDs", "Access points", "Source / confidence",
                "Indicative state tax per can ($)", "Launch score", "Rank"],
       [16, 12, 10, 11, 16, 9, 70, 12, 10, 7])
first, last = HR + 1, HR + len(STATES)
for i, (name, tax, ctl, pop, acc, note) in enumerate(STATES):
    rr = HR + 1 + i
    vals = [name, tax, ctl, pop, acc]
    for j, v in enumerate(vals, 1):
        c = st.cell(row=rr, column=j, value=v)
        c.font = font(BLUE if j > 1 else BLACK)
    st.cell(row=rr, column=2).number_format = USD2
    st.cell(row=rr, column=4).number_format = NUM2
    st.cell(row=rr, column=6, value=f"=INDEX({PT_RANGE},MATCH(E{rr},{LV_RANGE},0))").font = font()
    gc = st.cell(row=rr, column=7, value=("Verified — " if note.startswith("Verified") else "") + note.replace("Verified: ", "") if note else "")
    gc.font = font(size=9)
    st.cell(row=rr, column=8, value=f"=B{rr}*Inputs!$B$6/3785.41").number_format = USD3   # can_ml placed at Inputs!B6
    st.cell(row=rr, column=9, value=(
        f'=IF(E{rr}="Not researched","",ROUND({REF["w_access"]}*F{rr}/3'
        f'+{REF["w_tax"]}*(1-B{rr}/MAX($B${first}:$B${last}))'
        f'+{REF["w_pop"]}*D{rr}/MAX($D${first}:$D${last})'
        f'-{REF["w_control"]}*C{rr},3))')).number_format = "0.000"
    st.cell(row=rr, column=10, value=f'=IF(I{rr}="","",RANK(I{rr},$I${first}:$I${last}))').number_format = "0"
st.freeze_panes = st.cell(row=HR + 1, column=2)
sr = last + 2
st.cell(row=sr, column=1, value="Top-scored launch state").font = font(bold=True)
c = st.cell(row=sr, column=2, value=f"=INDEX($A${first}:$A${last},MATCH(MAX($I${first}:$I${last}),$I${first}:$I${last},0))")
c.font = font(bold=True)
c.fill = YELLOW
REF["top_state"] = ref("States", "B", sr)
st.cell(row=sr + 1, column=1, value="Notes").font = font(bold=True)
notes = [
    "Indicative tax per can = state $/gal × can volume. Many states tax RTDs by ABV tier or at lower RTD rates; control states (1) add a mark-up not shown here.",
    "Score = access weight × points/3 + tax weight × (1 − tax/max) + size weight × pop/max − control penalty. Unscored rows were not researched.",
    "Pennsylvania 'Limited' = permit-holding grocers/c-stores only, ≤12.5% ABV, ≤16 oz — the default recipe (12.5%) is designed to qualify.",
]
for i, n in enumerate(notes):
    st.cell(row=sr + 2 + i, column=1, value=n).font = font(size=9, italic=True)

# ════════════════════════════════════════════════════════════════
# INPUTS
# ════════════════════════════════════════════════════════════════
inp = wb.create_sheet("Inputs", 1)
title(inp, "Inputs — edit blue cells", "Estimates are industry ranges; replace with quotes. Notes in column D give the basis for each number.")
header(inp, 4, ["Assumption", "Value", "Unit", "Basis / note"], [44, 14, 14, 90])
r = 5
section(inp, r, "Product & pricing"); r += 1
assert r == 6
put(inp, r, "can_ml", "Can size", 200, "ml", "Slim 200 ml can ≈ one bar martini serving", NUM, True); r += 1
put(inp, r, "abv", "Alcohol by volume", 0.125, "%", "12.5% = max for Pennsylvania grocery RTD permit (Act 86 of 2024); ~1.4 US standard drinks per can", PCT, True, True); r += 1
put(inp, r, "cans_pack", "Cans per retail pack", 4, "cans", "", NUM, True); r += 1
put(inp, r, "cans_case", "Cans per case", 24, "cans", "6 × 4-packs", NUM, True); r += 1
put(inp, r, "retail_can", "Retail shelf price per can", 4.49, "$/can", "$17.96 per 4-pack. Bar lychee martini typically $14–18", USD2, True, True); r += 1
put(inp, r, "rm", "Retailer margin (on shelf price)", 0.30, "%", "Typical off-premise 25–35% (estimate)", PCT, True); r += 1
put(inp, r, "dm", "Distributor margin (on distributor sell price ex-tax)", 0.28, "%", "Typical 25–30% (estimate)", PCT, True); r += 1
put(inp, r, "velocity", "Store velocity (cans per store per week)", 6, "cans", "≈1.5 four-packs/store/week — assumption for 'stores needed'", NUM1, True); r += 1
section(inp, r, "Taxes"); r += 1
put(inp, r, "state", "Launch state", "California", "", "Dropdown — see 'States' sheet for score and grocery access", None, True, True)
dv = DataValidation(type="list", formula1=f"=States!$A${first}:$A${last}", allow_blank=False)
inp.add_data_validation(dv)
dv.add(f"B{r}")
r += 1
put(inp, r, "state_tax_gal", "State spirits tax (selected state)", f"=INDEX(States!$B${first}:$B${last},MATCH({REF['state']},States!$A${first}:$A${last},0))",
    "$/gal", "Tax Foundation 2026, 40% ABV basis — indicative for RTDs", USD2, link=True); r += 1
put(inp, r, "fet_rate", "Federal excise tax rate", 13.50, "$/proof gal", "Full rate $13.50 (conservative). $2.70 applies to a producer's first 100,000 proof gal/yr (CBMA) — only if your co-packer passes it through", USD2, True, True); r += 1
section(inp, r, "Packaging & production (estimates — get quotes)"); r += 1
put(inp, r, "can_cost", "Can + end (200 ml slim, unprinted)", 0.16, "$/can", "Small-volume pricing estimate", USD3, True); r += 1
put(inp, r, "sleeve", "Shrink sleeve (printed)", 0.15, "$/can", "Low MOQ (a few thousand); printed cans ~$0.03 extra but MOQ ~200k cans", USD3, True); r += 1
put(inp, r, "carrier", "4-pack carrier", 0.30, "$/pack", "Paperboard/plastic carrier estimate", USD2, True); r += 1
put(inp, r, "shipper", "Case shipper (corrugate)", 0.80, "$/case", "", USD2, True); r += 1
put(inp, r, "copack", "Co-packing fee (blend, fill, seam, pasteurise)", 0.30, "$/can", "Contract DSP canner, estimate range $0.20–0.45", USD3, True); r += 1
put(inp, r, "moq", "Minimum run (MOQ)", 1000, "cases", "Typical co-packer minimums 500–2,000 cases", NUM, True, True); r += 1
put(inp, r, "run_setup", "Run setup / changeover fee", 1500, "$/run", "Estimate", USD, True); r += 1
put(inp, r, "qa_run", "Lab & QA per run (ABV, micro, seam checks)", 750, "$/run", "Estimate", USD, True); r += 1
put(inp, r, "freight", "Freight to distributor", 3.00, "$/case", "Regional LTL estimate", USD2, True); r += 1
section(inp, r, "Sales & marketing"); r += 1
put(inp, r, "dep", "Depletion allowance to distributor", 2.00, "$/case", "Incentive per case sold through (estimate)", USD2, True); r += 1
put(inp, r, "trade", "Trade spend / chargebacks / promos", 0.05, "% of FOB revenue", "", PCT, True); r += 1
put(inp, r, "samp_launch", "Sampling & launch marketing (first months)", 5000, "$/month", "In-store tastings, events, POS", USD, True); r += 1
put(inp, r, "samp_n", "Months of launch-level marketing", 6, "months", "", NUM, True); r += 1
put(inp, r, "samp_after", "Ongoing marketing after launch period", 2500, "$/month", "", USD, True); r += 1
section(inp, r, "Fixed overhead"); r += 1
put(inp, r, "fixed_pre", "Fixed costs before launch", 2000, "$/month", "Insurance, software, accounting, compliance (founder unpaid)", USD, True); r += 1
put(inp, r, "fixed_post", "Fixed costs after launch", 12000, "$/month", "1 field sales/brand rep (~$7k), insurance, warehouse, compliance, travel", USD, True, True); r += 1
section(inp, r, "Timeline & volume"); r += 1
put(inp, r, "launch", "Launch month (first sales)", 7, "month #", "Months 1–6: formulation, stability test, permits, label approval", NUM, True, True); r += 1
put(inp, r, "start_cases", "Cases sold in launch month", 150, "cases", "≈ 25 stores × 6 cans/week (assumption)", NUM, True, True); r += 1
put(inp, r, "growth", "Monthly growth in cases sold", 0.12, "%/month", "Assumption: new doors + velocity", PCT, True, True); r += 1
put(inp, r, "cap", "Cap on monthly cases (single-state ceiling)", 2500, "cases", "Assumption", NUM, True); r += 1
put(inp, r, "cover", "Inventory cover kept after each month", 1.0, "months of next month's sales", "Production triggers a run (multiples of MOQ) when stock would fall below this", NUM1, True); r += 1
put(inp, r, "capital", "Capital raised / available", 250000, "$", "", USD, True, True); r += 1
section(inp, r, "One-time startup costs (amount, month incurred)"); r += 1
inp.cell(row=r, column=1, value="Item").font = font(bold=True)
inp.cell(row=r, column=2, value="Amount ($)").font = font(bold=True)
inp.cell(row=r, column=3, value="Month #").font = font(bold=True)
inp.cell(row=r, column=4, value="Note").font = font(bold=True)
r += 1
ONE_TIME = [
    ("Trademark search & filing", 2500, 1, "USPTO + clearance search"),
    ("Entity, alcohol attorney, federal permit", 10000, 1, "Wholesaler/importer basic permit or co-packer brand-owner arrangement"),
    ("Formulation (beverage developer / flavour house)", 15000, 2, ""),
    ("Brand & label design", 10000, 2, ""),
    ("Shelf-life & can-liner compatibility testing", 7500, 3, "3–6 month accelerated test"),
    ("TTB formula + label (COLA) + state registrations", 1500, 4, "Federal approvals free; state fees vary"),
    ("Sleeve plates / print proofs", 1500, 5, ""),
    ("Website, launch event, sell sheets", 5000, 6, ""),
]
ot_first = r
for item, amt, mo, note in ONE_TIME:
    inp.cell(row=r, column=1, value=item).font = font()
    c = inp.cell(row=r, column=2, value=amt)
    c.font = font(BLUE)
    c.number_format = USD
    c = inp.cell(row=r, column=3, value=mo)
    c.font = font(BLUE)
    inp.cell(row=r, column=4, value=note).font = font(size=9, italic=True, color="595959")
    r += 1
ot_last = r - 1
inp.cell(row=r, column=1, value="Total one-time costs").font = font(bold=True)
c = inp.cell(row=r, column=2, value=f"=SUM(B{ot_first}:B{ot_last})")
c.font = font(bold=True)
c.number_format = USD
REF["ot_total"] = ref("Inputs", "B", r)
OT_AMT = f"Inputs!$B${ot_first}:$B${ot_last}"
OT_MO = f"Inputs!$C${ot_first}:$C${ot_last}"
inp.freeze_panes = "B5"

# ════════════════════════════════════════════════════════════════
# FORMULATION
# ════════════════════════════════════════════════════════════════
fm = wb.create_sheet("Formulation", 2)
title(fm, "Formulation — Lychee Martini, 200 ml can, still (nitrogen-dosed)",
      "Starting-point recipe for a beverage developer. Final numbers come from bench trials + 3-month stability test.")
header(fm, 4, ["Component", "Spec / input", "Per can", "Unit", "% of can (v/v)", "Per 1,000 L batch", "Batch unit",
               "Ingredient price", "Price unit", "Cost per can ($)", "Function / note"],
       [34, 11, 10, 7, 11, 13, 9, 11, 9, 12, 70])
fm["A5"] = "Batch size"
fm["B5"] = 1000
fm["B5"].font = font(BLUE)
fm["C5"] = "L"
fm["D5"] = "Juice sugar"
fm["E5"] = 14
fm["E5"].font = font(BLUE)
fm["F5"] = "g sugar /100 ml lychee juice (NFC ~14–16 °Brix)"
for c in ("A5", "C5", "D5", "F5"):
    fm[c].font = font(size=9)
CAN = REF["can_ml"]
ABV = REF["abv"]
# rows
R0 = 7
# Vodka
fm[f"A{R0}"] = "Vodka (neutral grain, 40% ABV)"
fm[f"B{R0}"] = 0.40
fm[f"B{R0}"].number_format = PCT
fm[f"C{R0}"] = f"={CAN}*{ABV}/B{R0}"
fm[f"D{R0}"] = "ml"
fm[f"H{R0}"] = 3.00
fm[f"I{R0}"] = "$/L"
fm[f"J{R0}"] = f"=C{R0}/1000*H{R0}"
fm[f"K{R0}"] = "Supplies all alcohol. Volume = can × target ABV ÷ vodka ABV. Price is bulk estimate; branded/premium vodka costs more."
# Lychee juice
r1 = R0 + 1
fm[f"A{r1}"] = "Lychee juice / purée (NFC)"
fm[f"B{r1}"] = 0.40
fm[f"B{r1}"].number_format = PCT
fm[f"C{r1}"] = f"={CAN}*B{r1}"
fm[f"D{r1}"] = "ml"
fm[f"H{r1}"] = 4.50
fm[f"I{r1}"] = "$/L"
fm[f"J{r1}"] = f"=C{r1}/1000*H{r1}"
fm[f"K{r1}"] = "Body + real-fruit claim. Spec input = share of can volume. Lychee browns and loses aroma: protect with ascorbic acid, low oxygen, cold-fill or tunnel pasteurisation."
# Lime
r2 = R0 + 2
fm[f"A{r2}"] = "Lime juice (fresh-pressed or NFC)"
fm[f"B{r2}"] = 0.025
fm[f"B{r2}"].number_format = PCT
fm[f"C{r2}"] = f"={CAN}*B{r2}"
fm[f"D{r2}"] = "ml"
fm[f"H{r2}"] = 3.00
fm[f"I{r2}"] = "$/L"
fm[f"J{r2}"] = f"=C{r2}/1000*H{r2}"
fm[f"K{r2}"] = "Brightness; replaces the vermouth/citrus edge of the bar version"
# dry ingredients g/L
dry = [
    ("Cane sugar", 25.0, 1.00, "$/kg", "Balances acid; bar lychee martinis are sweet. Adjust to taste: 20–35 g/L"),
    ("Citric acid", 2.0, 3.00, "$/kg", "Target pH 3.3–3.5 (microbial safety + can-liner spec); TA ~0.35%"),
    ("Ascorbic acid (vitamin C)", 0.2, 15.00, "$/kg", "Antioxidant — slows lychee browning and aroma loss"),
    ("Natural lychee flavour (WONF)", 0.75, 40.00, "$/kg", "Flavour house; restores top-note lost in juice processing"),
    ("Rose / floral note (optional)", 0.05, 60.00, "$/kg", "Trace; lychee's natural rose-like aroma (geraniol). Set 0 to omit"),
    ("Potassium sorbate (optional)", 0.25, 8.00, "$/kg", "Only if stability test fails without it; not needed if tunnel pasteurised"),
]
dry_first = R0 + 3
for i, (name, gl, price, pu, note) in enumerate(dry):
    rr = dry_first + i
    fm[f"A{rr}"] = name
    fm[f"B{rr}"] = gl
    fm[f"C{rr}"] = f"=B{rr}*{CAN}/1000"
    fm[f"D{rr}"] = "g"
    fm[f"F{rr}"] = f"=B{rr}*$B$5/1000"
    fm[f"G{rr}"] = "kg"
    fm[f"H{rr}"] = price
    fm[f"I{rr}"] = pu
    fm[f"J{rr}"] = f"=C{rr}/1000*H{rr}"
    fm[f"K{rr}"] = note
dry_last = dry_first + len(dry) - 1
# water
rw = dry_last + 1
fm[f"A{rw}"] = "Water (RO, de-aerated) to volume"
fm[f"B{rw}"] = 0.63
fm[f"C{rw}"] = f"={CAN}-C{R0}-C{r1}-C{r2}-C{dry_first}*B{rw}"
fm[f"D{rw}"] = "ml"
fm[f"H{rw}"] = 0.002
fm[f"I{rw}"] = "$/L"
fm[f"J{rw}"] = f"=C{rw}/1000*H{rw}"
fm[f"K{rw}"] = "Fills to 200 ml. Spec input = ml displaced per g of sugar (≈0.63). Ethanol–water contraction is trimmed with water at the bench."
for rr in (R0, r1, r2, rw):
    fm[f"E{rr}"] = f"=C{rr}/{CAN}"
    fm[f"F{rr}"] = f"=C{rr}/{CAN}*$B$5"
    fm[f"G{rr}"] = "L"
for rr in range(dry_first, dry_last + 1):
    fm[f"E{rr}"] = ""
rt = rw + 1
fm[f"A{rt}"] = "Total liquid cost per can"
fm[f"J{rt}"] = f"=SUM(J{R0}:J{rw})"
fm[f"J{rt}"].fill = YELLOW
REF["liquid"] = ref("Formulation", "J", rt)
fm[f"E{rt}"] = f"=SUM(E{R0}:E{r2})+E{rw}"
fm[f"K{rt}"] = "Volume check: vodka + juice + lime + water ≈ 100% minus sugar displacement"
# styling
for rr in range(R0, rt + 1):
    for col in "BH":
        fm[f"{col}{rr}"].font = font(BLUE)
    for col in "CEFJ":
        fm[f"{col}{rr}"].font = font()
    fm[f"K{rr}"].font = font(size=9, italic=True, color="595959")
    fm[f"K{rr}"].alignment = Alignment(wrap_text=True, vertical="top")
    fm[f"C{rr}"].number_format = NUM2
    fm[f"F{rr}"].number_format = NUM1
    fm[f"H{rr}"].number_format = USD2
    fm[f"J{rr}"].number_format = USD3
    fm[f"E{rr}"].number_format = PCT
    fm[f"A{rr}"].font = font(bold=(rr == rt))
fm[f"B{rw}"].number_format = NUM2
fm["B5"].number_format = NUM
# checks
rc = rt + 2
section(fm, rc, "Spec check (per can)", 11)
checks = [
    ("Ethanol (ml)", f"={CAN}*{ABV}", NUM2, ""),
    ("Ethanol (g)", f"=B{rc+1}*0.789", NUM1, "density 0.789 g/ml"),
    ("US standard drinks (14 g ethanol)", f"=B{rc+2}/14", NUM2, ""),
    ("ABV from recipe", f"=C{R0}*B{R0}/{CAN}", PCT, "Must match label ± 0.3 percentage points (TTB tolerance for spirits)"),
    ("Total sugar (g)", f"=C{dry_first}+C{r1}*$E$5/100", NUM1, "added sugar + juice sugar"),
    ("Sugar (g per 100 ml)", f"=B{rc+5}/{CAN}*100", NUM1, "Target 7–9 g/100 ml (bar version is sweeter)"),
    ("Calories (kcal)", f"=B{rc+2}*7+B{rc+5}*4", NUM, "ethanol 7 kcal/g + sugar 4 kcal/g"),
    ("Cans per 1,000 L batch", f"=$B$5*1000/{CAN}", NUM, "before ~3–5% fill/line loss"),
    ("Cases per 1,000 L batch", f"=B{rc+8}/{REF['cans_case']}", NUM, ""),
]
for i, (lab, f_, nf, note) in enumerate(checks):
    rr = rc + 1 + i
    fm[f"A{rr}"] = lab
    fm[f"A{rr}"].font = font()
    fm[f"B{rr}"] = f_
    fm[f"B{rr}"].number_format = nf
    fm[f"B{rr}"].font = font()
    fm[f"D{rr}"] = note
    fm[f"D{rr}"].font = font(size=9, italic=True, color="595959")
REF["ethanol_g"] = ref("Formulation", "B", rc + 2)
# bar comparison
rb = rc + len(checks) + 3
section(fm, rb, "Ratio comparison: bar recipe vs can", 11)
bar = [
    ("Bar lychee martini (classic build)", "2 oz vodka : 1 oz lychee liqueur : 1 oz lychee syrup/juice : ¼–½ oz lime or dry vermouth, shaken, ~18–22% ABV after dilution"),
    ("Can (this sheet), by volume", "≈ 31% vodka : 40% lychee juice : 2.5% lime : ~25% water, + 25 g/L sugar, 2 g/L citric, 0.2 g/L vitamin C, 0.75 g/L natural lychee flavour → 12.5% ABV"),
    ("Simplified ratio", "Vodka : lychee juice : water+lime ≈ 1.25 : 1.6 : 1.1  (≈ 5 : 6.4 : 4.4)"),
    ("Why it differs", "Liqueur replaced by juice + natural flavour (cheaper, cleaner label, keeps ABV ≤12.5% for PA grocery). Lower ABV than a bar pour because a can is drunk unshaken, unchilled-by-ice and over a longer time."),
    ("Process", "Batch cold: water → dissolve sugar/acids/vitamin C → juice → flavour → vodka last. Filter (1–5 µm), check ABV/pH/Brix, liquid-nitrogen dose for can rigidity, fill & seam, tunnel pasteurise (or cold-fill with sorbate), date-code."),
    ("Bench-test plan", "Make 3 variants: juice 30% / 40% / 50%; sugar 20 / 25 / 30 g/L. Blind-test vs a bar-made lychee martini; pick winner, then 3-month accelerated stability (colour, aroma, can corrosion, micro)."),
]
for i, (a, b) in enumerate(bar):
    rr = rb + 1 + i
    fm[f"A{rr}"] = a
    fm[f"A{rr}"].font = font(bold=True)
    fm[f"B{rr}"] = b
    fm[f"B{rr}"].font = font()
    fm.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=11)
    fm[f"B{rr}"].alignment = Alignment(wrap_text=True, vertical="top")
    fm.row_dimensions[rr].height = 30
fm.freeze_panes = "B7"

# ════════════════════════════════════════════════════════════════
# UNIT ECONOMICS
# ════════════════════════════════════════════════════════════════
ue = wb.create_sheet("Unit Economics", 3)
title(ue, "Unit economics — per can and per case", "Waterfall from shelf price to what the brand receives, then cost of goods and contribution.")
header(ue, 4, ["Line", "Per can", "Per case", "Basis"], [46, 13, 13, 80])
CC = REF["cans_case"]


def ue_row(rr, key, label, f_can, basis="", fmt=USD3, bold=False, key_cell=False):
    ue.cell(row=rr, column=1, value=label).font = font(bold=bold)
    c = ue.cell(row=rr, column=2, value=f_can)
    c.font = font(bold=bold)
    c.number_format = fmt
    c2 = ue.cell(row=rr, column=3, value=f"=B{rr}*{CC}" if fmt != PCT else f"=B{rr}")
    c2.font = font(bold=bold)
    c2.number_format = USD2 if fmt != PCT else PCT
    if key_cell:
        c.fill = YELLOW
        c2.fill = YELLOW
    ue.cell(row=rr, column=4, value=basis).font = font(size=9, italic=True, color="595959")
    for col in range(1, 5):
        ue.cell(row=rr, column=col).border = THIN
    if key:
        REF[key] = ref("Unit Economics", "B", rr)
        REF[key + "_case"] = ref("Unit Economics", "C", rr)


r = 5
section(ue, r, "Price waterfall"); r += 1
ue_row(r, "p_retail", "Retail shelf price", f"={REF['retail_can']}", "Input"); r += 1
ue_row(r, "p_rm", "Less: retailer margin", f"=-B{r-1}*{REF['rm']}", "Retail × retailer margin"); r += 1
ue_row(r, "p_whsl", "Distributor sell price to retailer (incl. state tax)", f"=B{r-2}+B{r-1}", "", bold=True); r += 1
ue_row(r, "p_stax", "Less: state excise tax (paid by distributor)", f"=-{REF['state_tax_gal']}*{REF['can_ml']}/3785.41", "Selected state $/gal × gallons per can (indicative)"); r += 1
ue_row(r, "p_net", "Distributor net price ex-tax", f"=B{r-2}+B{r-1}"); r += 1
ue_row(r, "p_dm", "Less: distributor margin", f"=-B{r-1}*{REF['dm']}", "Net × distributor margin"); r += 1
ue_row(r, "fob", "Brand price to distributor (FOB)", f"=B{r-2}+B{r-1}", "What you invoice", bold=True, key_cell=True); r += 1
ue_row(r, "fob_pct", "FOB as % of shelf price", f"=B{r-1}/B{r-7}", "", fmt=PCT); r += 1
section(ue, r, "Cost of goods"); r += 1
cogs_first = r
ue_row(r, "c_liquid", "Liquid (recipe)", f"={REF['liquid']}", "From 'Formulation'"); ue.cell(row=r, column=2).font = font(GREEN); r += 1
ue_row(r, "c_can", "Can + end", f"={REF['can_cost']}", "Input"); r += 1
ue_row(r, "c_sleeve", "Shrink sleeve", f"={REF['sleeve']}", "Input"); r += 1
ue_row(r, "c_carrier", "4-pack carrier (per can)", f"={REF['carrier']}/{REF['cans_pack']}", "Carrier ÷ cans per pack"); r += 1
ue_row(r, "c_shipper", "Case shipper (per can)", f"={REF['shipper']}/{CC}", "Shipper ÷ cans per case"); r += 1
ue_row(r, "c_copack", "Co-packing fee", f"={REF['copack']}", "Input"); r += 1
ue_row(r, "c_fet", "Federal excise tax", f"={REF['can_ml']}/3785.41*{REF['abv']}*2*{REF['fet_rate']}", "Gallons × proof/100 × rate (proof = 2 × ABV)"); r += 1
var_last = r - 1
ue_row(r, "c_run", "Run setup + QA (allocated)", f"=({REF['run_setup']}+{REF['qa_run']})/({REF['moq']}*{CC})", "Per-run fixed ÷ cans per MOQ run"); r += 1
ue_row(r, "c_freight", "Freight to distributor", f"={REF['freight']}/{CC}", "Per case ÷ cans per case"); r += 1
ue_row(r, "cogs", "Total cost of goods", f"=SUM(B{cogs_first}:B{r-1})", "", bold=True, key_cell=True); r += 1
ue_row(r, "var_prod", "   of which variable production cost (paid at each run)", f"=SUM(B{cogs_first}:B{var_last})", "Liquid + packaging + co-pack + FET"); r += 1
ue_row(r, "gp", "Gross profit", f"={REF['fob']}-{REF['cogs']}", "", bold=True); r += 1
ue_row(r, "gm", "Gross margin %", f"=IF({REF['fob']}=0,0,B{r-1}/{REF['fob']})", "", fmt=PCT); r += 1
section(ue, r, "Variable selling costs"); r += 1
ue_row(r, "s_dep", "Depletion allowance", f"={REF['dep']}/{CC}", "Per case ÷ cans per case"); r += 1
ue_row(r, "s_trade", "Trade spend / chargebacks", f"={REF['fob']}*{REF['trade']}", "% of FOB"); r += 1
ue_row(r, "contrib", "Contribution per can / per case", f"={REF['gp']}-B{r-2}-B{r-1}", "Covers fixed costs + marketing", bold=True, key_cell=True); r += 1
ue_row(r, "cm", "Contribution margin % of FOB", f"=IF({REF['fob']}=0,0,B{r-1}/{REF['fob']})", "", fmt=PCT); r += 1
section(ue, r, "Consumer view"); r += 1
ue_row(r, None, "Price per 4-pack", f"={REF['retail_can']}*{REF['cans_pack']}", "vs bar lychee martini $14–18 each", fmt=USD2); ue.cell(row=r, column=3, value=""); r += 1
ue_row(r, None, "Price per standard drink", f"={REF['retail_can']}/({REF['ethanol_g']}/14)", "", fmt=USD2); ue.cell(row=r, column=3, value=""); r += 1
ue_row(r, None, "Total taxes per can (federal + state)", f"={REF['c_fet']}-{REF['p_stax']}", "", fmt=USD3); r += 1
ue.freeze_panes = "B5"

# ════════════════════════════════════════════════════════════════
# CASH FLOW (24 months + helper month 25)
# ════════════════════════════════════════════════════════════════
cf = wb.create_sheet("Cash Flow", 4)
title(cf, "Monthly cash flow — 24 months", "Month 1 = start of development. Production is paid when run; distributors pay 1 month after delivery (net 30).")
NM = 24
cols = [get_column_letter(2 + i) for i in range(NM + 1)]       # B..Z (Z = helper month 25)
HROW = 12
cf.column_dimensions["A"].width = 38
for c in cols:
    cf.column_dimensions[c].width = 10.5
cf.cell(row=HROW, column=1, value="Month #").font = font(bold=True, white=True)
cf.cell(row=HROW, column=1).fill = HEAD
for i, c in enumerate(cols):
    cell = cf[f"{c}{HROW}"]
    cell.value = i + 1
    cell.font = font(bold=True, white=True)
    cell.fill = HEAD
    cell.alignment = Alignment(horizontal="center")
cf[f"Z{HROW-1}"] = "helper"
cf[f"Z{HROW-1}"].font = font(size=8, italic=True, color="808080")

labels = ["Phase", "Cases sold", "Opening inventory (cases)", "Production (cases)", "Production runs",
          "Closing inventory (cases)", "Revenue at FOB ($)", "Cash collected ($)",
          "Production cost paid ($)", "Freight ($)", "Depletion allowance + trade spend ($)",
          "Sampling & marketing ($)", "Fixed costs ($)", "One-time startup costs ($)", "Total cash out ($)",
          "Net cash flow ($)", "Cumulative cash flow ($)", "Cash balance incl. capital ($)",
          "Contribution after marketing & fixed ($)", "Positive-month flag"]
RW = {lab: HROW + 1 + i for i, lab in enumerate(labels)}
for lab, rr in RW.items():
    cf.cell(row=rr, column=1, value=lab).font = font(bold=lab in ("Net cash flow ($)", "Cumulative cash flow ($)", "Cases sold"))
L = REF
for i, c in enumerate(cols):
    m = f"{c}${HROW}"
    prev = cols[i - 1] if i > 0 else None
    nxt = cols[i + 1] if i + 1 < len(cols) else None
    R = lambda lab: f"{c}{RW[lab]}"  # noqa: E731
    cf[R("Phase")] = f'=IF({m}<{L["launch"]},"Develop","Sell")'
    cf[R("Cases sold")] = f"=IF({m}<{L['launch']},0,MIN({L['cap']},ROUND({L['start_cases']}*(1+{L['growth']})^({m}-{L['launch']}),0)))"
    if c == "Z":
        continue
    cf[R("Opening inventory (cases)")] = "=0" if prev is None else f"={prev}{RW['Closing inventory (cases)']}"
    cf[R("Production (cases)")] = (f"=IF({m}>={L['launch']}-1,ROUNDUP(MAX(0,{R('Cases sold')}+{nxt}{RW['Cases sold']}*{L['cover']}"
                                   f"-{R('Opening inventory (cases)')})/{L['moq']},0)*{L['moq']},0)")
    cf[R("Production runs")] = f"={R('Production (cases)')}/{L['moq']}"
    cf[R("Closing inventory (cases)")] = f"={R('Opening inventory (cases)')}+{R('Production (cases)')}-{R('Cases sold')}"
    cf[R("Revenue at FOB ($)")] = f"={R('Cases sold')}*{L['fob_case']}"
    cf[R("Cash collected ($)")] = "=0" if prev is None else f"={prev}{RW['Revenue at FOB ($)']}"
    cf[R("Production cost paid ($)")] = f"={R('Production (cases)')}*{L['var_prod_case']}+{R('Production runs')}*({L['run_setup']}+{L['qa_run']})"
    cf[R("Freight ($)")] = f"={R('Cases sold')}*{L['freight']}"
    cf[R("Depletion allowance + trade spend ($)")] = f"={R('Cases sold')}*{L['dep']}+{R('Revenue at FOB ($)')}*{L['trade']}"
    cf[R("Sampling & marketing ($)")] = f"=IF({m}<{L['launch']},0,IF({m}-{L['launch']}<{L['samp_n']},{L['samp_launch']},{L['samp_after']}))"
    cf[R("Fixed costs ($)")] = f"=IF({m}<{L['launch']},{L['fixed_pre']},{L['fixed_post']})"
    cf[R("One-time startup costs ($)")] = f"=SUMIF({OT_MO},{m},{OT_AMT})"
    cf[R("Total cash out ($)")] = f"=SUM({c}{RW['Production cost paid ($)']}:{c}{RW['One-time startup costs ($)']})"
    cf[R("Net cash flow ($)")] = f"={R('Cash collected ($)')}-{R('Total cash out ($)')}"
    cf[R("Cumulative cash flow ($)")] = (f"={R('Net cash flow ($)')}" if prev is None
                                         else f"={prev}{RW['Cumulative cash flow ($)']}+{R('Net cash flow ($)')}")
    cf[R("Cash balance incl. capital ($)")] = f"={L['capital']}+{R('Cumulative cash flow ($)')}"
    cf[R("Contribution after marketing & fixed ($)")] = (f"={R('Cases sold')}*{L['contrib_case']}-{R('Sampling & marketing ($)')}"
                                                         f"-{R('Fixed costs ($)')}")
    cf[R("Positive-month flag")] = f'=IF(AND({m}>={L["launch"]},{R("Contribution after marketing & fixed ($)")}>0),{m},"")'
for lab, rr in RW.items():
    for c in cols:
        cell = cf[f"{c}{rr}"]
        cell.font = font(bold=lab in ("Net cash flow ($)", "Cumulative cash flow ($)"))
        cell.number_format = NUM1 if lab == "Production runs" else (NUM if "$" not in lab else USD)
        cell.border = THIN
cf["Z13"].font = font(size=8, color="808080")
cf[f"Z{RW['Cases sold']}"].font = font(size=8, color="808080")
last_col = cols[NM - 1]   # Y
rng = lambda lab: f"$B${RW[lab]}:${last_col}${RW[lab]}"  # noqa: E731
# summary
section(cf, 4, "Headline results (24 months)", 6)
summary = [
    ("peak_need", "Peak cash needed (money to raise)", f"=-MIN(0,MIN({rng('Cumulative cash flow ($)')}))", USD, True),
    ("peak_month", "Month of peak cash need", f"=MATCH(MIN({rng('Cumulative cash flow ($)')}),{rng('Cumulative cash flow ($)')},0)", NUM, False),
    ("first_pos", "First month operations cover fixed + marketing", f'=IF(COUNT({rng("Positive-month flag")})=0,"Not within 24 months",MIN({rng("Positive-month flag")}))', NUM, True),
    ("cash_end", "Cash balance at month 24", f"={last_col}{RW['Cash balance incl. capital ($)']}", USD, False),
    ("capital_ok", "Capital sufficient?", f'=IF({L["capital"]}>=-MIN(0,MIN({rng("Cumulative cash flow ($)")})),"Yes","No — short by "&TEXT(-MIN({rng("Cumulative cash flow ($)")})-{L["capital"]},"$#,##0"))', None, True),
    ("cases_24", "Cases sold in 24 months", f"=SUM({rng('Cases sold')})", NUM, False),
    ("runs_24", "Production runs in 24 months", f"=SUM({rng('Production runs')})", NUM, False),
]
for i, (k, lab, f_, nf, key) in enumerate(summary):
    rr = 5 + i
    cf.cell(row=rr, column=1, value=lab).font = font(bold=key)
    c = cf.cell(row=rr, column=2, value=f_)
    c.font = font(bold=key)
    if nf:
        c.number_format = nf
    if key:
        c.fill = YELLOW
    cf.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=4)
    REF[k] = ref("Cash Flow", "B", rr)
cf.freeze_panes = cf.cell(row=HROW + 1, column=2)
REF["prod_row"] = rng("Production (cases)")

# ════════════════════════════════════════════════════════════════
# PRODUCTION RUNS
# ════════════════════════════════════════════════════════════════
pr = wb.create_sheet("Production Runs", 4)
title(pr, "Production runs — minimums and cash tied up", "A run must be paid before cases are sold; this is the biggest recurring cash outlay.")
header(pr, 4, ["Item", "Value", "Unit", "Note"], [46, 14, 14, 80])
r = 5
put(pr, r, None, "Minimum run (MOQ)", f"={REF['moq']}", "cases", "From Inputs", NUM, link=True); r += 1
put(pr, r, "run_cans", "Cans per MOQ run", f"=B{r-1}*{CC}", "cans", "", NUM); r += 1
put(pr, r, None, "Liquid per run", f"=B{r-1}*{REF['can_ml']}/1000", "L", "Before ~3–5% line loss", NUM); r += 1
put(pr, r, None, "Vodka per run", f"=B{r-2}*Formulation!$C${R0}/1000", "L", "From recipe", NUM); r += 1
put(pr, r, None, "Lychee juice per run", f"=B{r-3}*Formulation!$C${r1}/1000", "L", "From recipe", NUM); r += 1
put(pr, r, None, "Variable production cost per case", f"={REF['var_prod_case']}", "$/case", "Liquid + packaging + co-pack + FET", USD2, link=True); r += 1
put(pr, r, "run_cash", "Cash per MOQ run", f"=B5*B{r-1}+{REF['run_setup']}+{REF['qa_run']}", "$", "Paid at production", USD, key_cell=True); r += 1
put(pr, r, None, "Months of supply per run at launch volume", f"=IF({REF['start_cases']}=0,0,B5/{REF['start_cases']})", "months", "", NUM1); r += 1
put(pr, r, None, "Months of supply per run at volume cap", f"=IF({REF['cap']}=0,0,B5/{REF['cap']})", "months", "", NUM1); r += 1
put(pr, r, None, "Runs in 24 months (from Cash Flow)", f"={REF['runs_24']}", "runs", "", NUM, link=True); r += 1
put(pr, r, None, "Printed-can MOQ (switch from sleeves)", 200000, "cans", "Typical can-maker minimum per design (estimate)", NUM, True); r += 1
put(pr, r, None, "Equivalent cases", f"=B{r-1}/{CC}", "cases", "Stay on sleeves until annual volume exceeds this", NUM); r += 1
put(pr, r, None, "Shelf-life planning", "", "", "Plan runs so stock sells within ~6–9 months; lychee aroma fades — rotate inventory FIFO", None); r += 1

# ════════════════════════════════════════════════════════════════
# BREAK-EVEN
# ════════════════════════════════════════════════════════════════
be = wb.create_sheet("Break-Even", 5)
title(be, "Break-even", "Volume needed for contribution to cover fixed overhead + marketing.")
header(be, 4, ["Measure", "Launch period", "Steady state", "Note"], [46, 16, 16, 70])
r = 5
items = [
    ("Contribution per case", f"={REF['contrib_case']}", f"={REF['contrib_case']}", USD2, "From Unit Economics"),
    ("Fixed costs per month", f"={REF['fixed_post']}", f"={REF['fixed_post']}", USD, ""),
    ("Marketing per month", f"={REF['samp_launch']}", f"={REF['samp_after']}", USD, "Launch vs ongoing"),
    ("Break-even cases per month", "=IF(B5<=0,\"Never (contribution ≤ 0)\",(B6+B7)/B5)", "=IF(C5<=0,\"Never (contribution ≤ 0)\",(C6+C7)/C5)", NUM, "Key result"),
    ("Break-even cans per month", f"=IF(ISNUMBER(B8),B8*{CC},\"-\")", f"=IF(ISNUMBER(C8),C8*{CC},\"-\")", NUM, ""),
    ("Break-even 4-packs per month", f"=IF(ISNUMBER(B9),B9/{REF['cans_pack']},\"-\")", f"=IF(ISNUMBER(C9),C9/{REF['cans_pack']},\"-\")", NUM, ""),
    ("Stores needed at assumed velocity", f"=IF(ISNUMBER(B9),B9/({REF['velocity']}*52/12),\"-\")", f"=IF(ISNUMBER(C9),C9/({REF['velocity']}*52/12),\"-\")", NUM, "Cans/month ÷ (cans/store/week × 4.33)"),
    ("Break-even incl. one-time costs over 24 months (cases/month)",
     f"=IF(B5<=0,\"-\",(B6+B7+{REF['ot_total']}/24)/B5)", f"=IF(C5<=0,\"-\",(C6+C7+{REF['ot_total']}/24)/C5)", NUM, "Spreads startup costs over 24 months"),
]
for i, (lab, fb, fc, nf, note) in enumerate(items):
    rr = r + i
    be.cell(row=rr, column=1, value=lab).font = font(bold=(i == 3))
    for col, f_ in (("B", fb), ("C", fc)):
        c = be[f"{col}{rr}"]
        c.value = f_
        c.number_format = nf
        c.font = font(GREEN if i in (0, 1, 2) else BLACK, bold=(i == 3))
        if i == 3:
            c.fill = YELLOW
    be.cell(row=rr, column=4, value=note).font = font(size=9, italic=True, color="595959")
REF["be_cases"] = ref("Break-Even", "C", 8)
# sensitivity
rs = r + len(items) + 2
section(be, rs, "Sensitivity — retail price vs federal excise rate (steady-state break-even cases/month)", 6)
hdr = ["Retail price / can", "FOB / can", "Contribution / case @ FET full", "Break-even cases @ FET full",
       "Contribution / case @ FET $2.70", "Break-even cases @ FET $2.70"]
for j, h in enumerate(hdr, 1):
    c = be.cell(row=rs + 1, column=j, value=h)
    c.font = font(bold=True, white=True)
    c.fill = HEAD
    c.alignment = Alignment(wrap_text=True, horizontal="center")
be.row_dimensions[rs + 1].height = 30
for col, w in zip("ABCDEF", (18, 12, 16, 16, 16, 16)):
    be.column_dimensions[col].width = max(be.column_dimensions[col].width or 0, w)
cogs_ex_fet = f"({REF['cogs']}-{REF['c_fet']})"
fet_gal = f"{REF['can_ml']}/3785.41*{REF['abv']}*2"
for i, price in enumerate([3.49, 3.99, 4.49, 4.99, 5.49, 5.99]):
    rr = rs + 2 + i
    c = be.cell(row=rr, column=1, value=price)
    c.font = font(BLUE)
    c.number_format = USD2
    be.cell(row=rr, column=2, value=f"=(A{rr}*(1-{REF['rm']})+{REF['p_stax']})*(1-{REF['dm']})").number_format = USD2
    for col_c, col_b, rate in (("C", "D", REF["fet_rate"]), ("E", "F", "2.7")):
        be[f"{col_c}{rr}"] = f"=(B{rr}*(1-{REF['trade']})-{cogs_ex_fet}-{fet_gal}*{rate})*{CC}-{REF['dep']}"
        be[f"{col_c}{rr}"].number_format = USD2
        be[f"{col_b}{rr}"] = f'=IF({col_c}{rr}<=0,"Never",({REF["fixed_post"]}+{REF["samp_after"]})/{col_c}{rr})'
        be[f"{col_b}{rr}"].number_format = NUM
    for col in "BCDEF":
        be[f"{col}{rr}"].font = font()
be.cell(row=rs + 9, column=1, value="FET $2.70/proof gal only if your co-packer is eligible for and passes through the CBMA reduced rate.").font = font(size=9, italic=True)

# order sheets
order = ["Read Me", "Inputs", "Formulation", "Unit Economics", "Production Runs", "Break-Even", "Cash Flow", "States"]
wb._sheets = [wb[n] for n in order]
for ws in wb.worksheets:
    ws.sheet_view.showGridLines = False
    for row in ws.iter_rows():
        for c in row:
            if c.font and c.font.name != F:
                c.font = Font(name=F, size=c.font.size, bold=c.font.bold, italic=c.font.italic, color=c.font.color)
wb.save(OUT)
print("saved", OUT)
