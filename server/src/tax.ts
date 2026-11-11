/**
 * Sales-tax ESTIMATE. This is deliberately coarse:
 *  - ZIP -> state via the 3-digit ZIP prefix,
 *  - one rate per state: the approximate COMBINED AVERAGE state + local rate.
 * Real tax depends on the exact address, the product category, the seller's
 * nexus and shipping taxability, so every figure derived from this table must
 * be presented as an estimate. The five states with no statewide sales tax
 * (AK, DE, MT, NH, OR) are 0 — local taxes in Alaska are ignored.
 * Rates are approximate figures (percent) and need periodic review.
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

/** Estimated tax rate as a fraction (0.0825), or null when the ZIP maps to no state. */
export function estimatedTaxRateForZip(zip: string): number | null {
  const state = stateForZip(zip);
  if (!state) return null;
  const pct = STATE_TAX_RATE_PCT[state];
  return pct === undefined ? null : pct / 100;
}
