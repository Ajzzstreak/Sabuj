/**
 * Sales-tax ESTIMATE. This is deliberately coarse:
 *  - ZIP -> state via the 3-digit ZIP prefix,
 *  - one rate per state: the approximate COMBINED AVERAGE state + local rate.
 * Real tax depends on the exact address, the product category, the seller's
 * nexus and shipping taxability, so every figure derived from this table must
 * be presented as an estimate. The five states with no statewide sales tax
 * (AK, DE, MT, NH, OR) are 0 — local taxes in Alaska are ignored.
 * Rates are approximate figures (percent) and need periodic review.
 *
 * Groceries: most states exempt food for home consumption or tax it at a
 * reduced rate. `GROCERY_TAX` holds one treatment per state and `taxClassOf`
 * decides whether an item is food (that treatment applies) or general
 * merchandise (household / paper goods, personal care, diapers, soft drinks:
 * the general rate). ESTIMATE — NEEDS VERIFICATION, see the table.
 */

/** Approximate combined average state + local sales tax rate, percent. */
export const STATE_TAX_RATE_PCT: Readonly<Record<string, number>> = {
  AL: 9.29, AK: 0, AZ: 8.38, AR: 9.45, CA: 8.85, CO: 7.81, CT: 6.35, DE: 0, DC: 6.0, FL: 7.0,
  GA: 7.38, HI: 4.5, ID: 6.03, IL: 8.86, IN: 7.0, IA: 6.94, KS: 8.65, KY: 6.0, LA: 9.56, ME: 5.5,
  MD: 6.0, MA: 6.25, MI: 6.0, MN: 8.04, MS: 7.06, MO: 8.39, MT: 0, NE: 6.97, NV: 8.24, NH: 0,
  NJ: 6.6, NM: 7.62, NY: 8.53, NC: 7.0, ND: 7.04, OH: 7.24, OK: 8.99, OR: 0, PA: 6.34, RI: 7.0,
  SC: 7.5, SD: 6.11, TN: 9.55, TX: 8.2, UT: 7.25, VT: 6.36, VA: 5.77, WA: 9.38, WV: 6.57, WI: 5.7,
  WY: 5.44,
};

export type GroceryTreatment =
  | { kind: 'exempt' }
  /** Combined (state + typical local) rate on food, percent. */
  | { kind: 'reduced'; ratePct: number }
  | { kind: 'full' };

const EXEMPT: GroceryTreatment = { kind: 'exempt' };
const FULL: GroceryTreatment = { kind: 'full' };
const reduced = (ratePct: number): GroceryTreatment => ({ kind: 'reduced', ratePct });

/**
 * How each state taxes groceries (food for home consumption).
 * ESTIMATE, WRITTEN FROM MEMORY, NEEDS VERIFICATION against each state's
 * revenue department before anyone relies on it. Conventions:
 *  - exempt: no state and (generally) no local tax on food.
 *  - reduced(x): x = combined food rate. Where the STATE exempts food but
 *    local sales taxes still apply to it, x = the local share of the combined
 *    average (combined average minus the state rate) — an upper bound, since
 *    not every locality taxes food.
 *  - full: food taxed like everything else.
 * States not listed fall back to full (no states currently).
 */
export const GROCERY_TAX: Readonly<Record<string, GroceryTreatment>> = {
  // No statewide sales tax (rate is 0 anyway).
  AK: EXEMPT, DE: EXEMPT, MT: EXEMPT, NH: EXEMPT, OR: EXEMPT,
  // Food exempt at state and local level.
  CA: EXEMPT, CT: EXEMPT, DC: EXEMPT, FL: EXEMPT, IN: EXEMPT, IA: EXEMPT, KY: EXEMPT, ME: EXEMPT,
  MD: EXEMPT, MA: EXEMPT, MI: EXEMPT, MN: EXEMPT, NE: EXEMPT, NV: EXEMPT, NJ: EXEMPT, NM: EXEMPT,
  NY: EXEMPT, ND: EXEMPT, OH: EXEMPT, PA: EXEMPT, RI: EXEMPT, TX: EXEMPT, VT: EXEMPT, WA: EXEMPT,
  WV: EXEMPT, WI: EXEMPT, WY: EXEMPT,
  // State exempts food; local taxes may still apply (local share of the combined average).
  AZ: reduced(2.78), CO: reduced(4.91), GA: reduced(3.38), KS: reduced(2.15), LA: reduced(5.11),
  OK: reduced(4.49), SC: reduced(1.5), AR: reduced(2.95),
  NC: reduced(2.0), // state exempt, flat 2% local rate on food
  // Reduced state rate on food (plus local where it applies).
  AL: reduced(7.29), // state 2% on food + local
  IL: reduced(1.0), // ~1% on groceries (state portion repealed 2026; local option)
  MS: reduced(5.07), // state 5% on food
  MO: reduced(5.39), // state 1.225% + local
  TN: reduced(6.55), // state 4% on food + local
  UT: reduced(3.0), // 3% combined food rate
  VA: reduced(1.0), // 1% local on food, state portion eliminated
  // Food taxed at the full rate (some offer income-tax credits instead).
  HI: FULL, ID: FULL, SD: FULL,
};

export type TaxClass = 'food' | 'general';

/** Grocery aisles whose items are food (unless the title says otherwise). */
const FOOD_CATEGORIES = new Set(
  ['produce', 'dairy & eggs', 'meat & seafood', 'bakery', 'pantry', 'canned goods', 'snacks', 'beverages', 'frozen', 'breakfast', 'baby',
   'grocery', 'food'].map((c) => c.toLowerCase()),
);
/**
 * Items in food aisles that are NOT food for sales-tax purposes in most states:
 * diapers / wipes (Baby aisle) and soft drinks (most food-exempt states tax them).
 */
const NON_FOOD_TITLE = /\b(diapers?|wipes|soda|cola|soft drinks?|thirst quencher|sports drink)\b/i;

/** Food or general merchandise, from the item's category and title. Heuristic. */
export function taxClassOf(category: string, title: string): TaxClass {
  if (!FOOD_CATEGORIES.has(category.toLowerCase())) return 'general';
  return NON_FOOD_TITLE.test(title) ? 'general' : 'food';
}

/** [first prefix, last prefix, state]. Later rows override earlier ones. */
const ZIP3_RANGES: ReadonlyArray<readonly [number, number, string]> = [
  [5, 5, 'NY'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 59, 'VT'], [55, 55, 'MA'],
  [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 205, 'DC'],
  [201, 201, 'VA'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'],
  [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'],
  [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'],
  [550, 567, 'MN'], [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'],
  [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'], [733, 733, 'TX'],
  [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'],
  [870, 884, 'NM'], [885, 885, 'TX'], [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'],
  [980, 994, 'WA'], [995, 999, 'AK'],
];

const ZIP3_TO_STATE: Array<string | undefined> = [];
for (const [from, to, state] of ZIP3_RANGES) for (let p = from; p <= to; p++) ZIP3_TO_STATE[p] = state;

/** Two-letter state for a 5-digit ZIP, or null (territories, military, unassigned). */
export function stateForZip(zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;
  return ZIP3_TO_STATE[Number(zip.slice(0, 3))] ?? null;
}

/**
 * Estimated tax rate as a fraction (0.0825), or null when the ZIP maps to no state.
 * `taxClass` 'food' applies the state's grocery treatment; default is general merchandise.
 */
export function estimatedTaxRateForZip(zip: string, taxClass: TaxClass = 'general'): number | null {
  const state = stateForZip(zip);
  if (!state) return null;
  const pct = STATE_TAX_RATE_PCT[state];
  if (pct === undefined) return null;
  if (taxClass === 'general') return pct / 100;
  const g = GROCERY_TAX[state] ?? FULL;
  if (g.kind === 'exempt') return 0;
  if (g.kind === 'reduced') return Math.min(g.ratePct, pct) / 100;
  return pct / 100;
}
