/**
 * Deterministic parser for plain-English shopping requests. This is the
 * fallback for POST /v1/ask whenever Claude is not configured, is over budget,
 * fails or times out — and it also produces the preliminary query used to pick
 * candidates for the Claude call. Pure: no I/O, no clock.
 */
import type { AskInterpretation, RetailerId } from '../contract.js';
import { RETAILER_IDS } from '../retailers.js';

const RETAILER_ALIASES: Array<[RegExp, RetailerId]> = [
  [/\bamazon(?:\.com)?\b/g, 'amazon'],
  [/\bwal-?\s?mart\b/g, 'walmart'],
  [/\bsam'?s(?:\s+club)?\b/g, 'samsclub'],
  [/\btarget\b/g, 'target'],
  [/\bcostco\b/g, 'costco'],
  [/\bbest\s?buy\b/g, 'bestbuy'],
];

/** A number right after "under/over" that is a size or a rating, not a price. */
const NOT_A_PRICE = /^\s*(?:\+|-?\s*(?:stars?|★|cups?|inch(?:es)?|in\b|"|”|people|persons?|qt|quarts?|oz|ounces?|lbs?|pounds?|gb|tb|mah|watts?|w\b|ft|feet|hours?|hrs?|pack|pieces?|pcs?|years?|yrs?|months?|liters?|l\b|gallons?))/;

const PRICE_CAP = /(?:\bunder|\bbelow|\bless than|\bcheaper than|\bup to|\bat most|\bno more than|\bnot more than|\bmax(?:imum)?(?: of)?|\bwithin|\bbudget(?: of| is)?|<=?)\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d.,]*\d)\s*(?:dollars?|bucks|usd)?/g;
const PRICE_SUFFIX = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars?\s*)?(?:or less|or under|or below|or cheaper|max(?:imum)?|tops|budget)/g;
const DOLLARS_SUFFIX = /\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars?|bucks)\s*(?:or less|or under|or below|or cheaper|max(?:imum)?|tops|budget)/g;

const RATING = /(?:\b(?:at least|min(?:imum)?(?: of)?|over|above|more than)\s+)?(\d(?:\.\d)?)\s*\+?\s*-?\s*(?:stars?\b|★)(?:\s*(?:or|and)\s*(?:more|up|higher|above|better))?/g;
const RATED = /\brated\s+(?:at least\s+|above\s+|over\s+)?(\d(?:\.\d)?)\b(?:\s*(?:\+|or (?:more|higher|above|better)|and (?:up|above)))?/g;

const SORT_TOP_RATED = /\b(?:top|best|highest|highly|well)[\s-]+(?:rated|reviewed)\b|\bbest reviews\b/g;
const SORT_LOWEST = /\b(?:cheapest|lowest[\s-]+priced?|least expensive|lowest cost|most affordable)\b/g;

const NEGATION = /\b(?:not|except|excluding|other than|anywhere but|no)\s+(?:at\s+|from\s+|on\s+)?$/;

/** Attribute words: pulled out of the keyword query and used as a relevance boost. */
const ATTRIBUTES = new Set([
  'quiet', 'silent', 'small', 'compact', 'mini', 'large', 'big', 'portable', 'lightweight', 'wireless', 'cordless', 'waterproof',
  'durable', 'fast', 'quick', 'digital', 'smart', 'stainless', 'nonstick', 'rechargeable', 'foldable', 'slim', 'programmable',
  'automatic', 'adjustable', 'ergonomic', 'powerful', 'quiet-running', 'energy-efficient', 'dishwasher-safe', 'heavy-duty', 'budget',
  'simple', 'easy', 'sturdy', 'travel', 'kids', 'professional',
]);

const FILLER = new Set([
  'i', 'im', "i'm", 'id', "i'd", 'am', 'want', 'wanted', 'need', 'needed', 'looking', 'look', 'for', 'find', 'me', 'show', 'get', 'buy',
  'a', 'an', 'the', 'some', 'please', 'can', 'you', 'could', 'would', 'like', 'to', 'that', 'thats', "that's", 'is', 'are', 'which',
  'with', 'and', 'or', 'of', 'in', 'on', 'at', 'from', 'my', 'something', 'anything', 'good', 'great', 'nice', 'decent', 'best',
  'recommend', 'suggest', 'search', 'shop', 'shopping', 'price', 'priced', 'prices', 'cost', 'costs', 'costing', 'rated', 'rating',
  'ratings', 'reviews', 'reviewed', 'review', 'least', 'most', 'than', 'less', 'more', 'under', 'over', 'about', 'around', 'it',
  'its', 'has', 'have', 'one', 'ones', 'only', 'just', 'really', 'very', 'also', 'but', 'not', 'no', 'any', 'there', 'what', 'whats',
  'who', 'where', 'how', 'do', 'does', 'be', 'should', 'must', 'hi', 'hello', 'hey', 'thanks', 'thank', 'us', 'we', 'our', 'so',
  'sold', 'by', 'available', 'cheap', 'affordable', 'stars', 'star', 'money', 'dollars', 'bucks', 'max', 'budget', 'below', 'above',
  'within', 'will', 'who', 'whose', 'them', 'they', 'this', 'these', 'those', 'if', 'possible', 'ideally', 'preferably', 'maybe',
]);

const num = (s: string) => Number(s.replace(/,/g, ''));

export function normalizeAskText(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Parse a request with regular expressions only. Never throws. */
export function parseAskRules(text: string): AskInterpretation {
  let t = ` ${normalizeAskText(text)} `;
  const cut = (re: RegExp, onMatch: (m: RegExpExecArray, before: string) => boolean | void) => {
    re.lastIndex = 0;
    const spans: Array<[number, number]> = [];
    for (let m = re.exec(t); m; m = re.exec(t)) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (onMatch(m, t.slice(0, m.index)) !== false) spans.push([m.index, m.index + m[0].length]);
    }
    for (const [a, b] of spans.reverse()) t = `${t.slice(0, a)} ${t.slice(b)}`;
  };

  // --- rating first, so "under 4 stars"/"4+ stars" is never read as a price ---
  let minRating: number | null = null;
  const takeRating = (m: RegExpExecArray) => {
    const v = Number(m[1]);
    if (!(v > 0 && v <= 5)) return false;
    minRating = Math.max(minRating ?? 0, v);
    return true;
  };
  cut(RATING, takeRating);
  cut(RATED, takeRating);

  let sort: AskInterpretation['sort'] = 'best_match';
  cut(SORT_TOP_RATED, () => {
    sort = 'top_rated';
  });
  cut(SORT_LOWEST, () => {
    sort = 'lowest_price';
  });

  // --- price ceiling: the lowest stated cap wins ---
  let maxPrice: number | null = null;
  const takePrice = (m: RegExpExecArray) => {
    if (NOT_A_PRICE.test(t.slice(m.index + m[0].length))) return false;
    const v = num(m[1]!);
    if (!(v > 0 && v <= 1_000_000)) return false;
    maxPrice = maxPrice === null ? v : Math.min(maxPrice, v);
    return true;
  };
  cut(PRICE_SUFFIX, takePrice);
  cut(DOLLARS_SUFFIX, takePrice);
  cut(PRICE_CAP, takePrice);

  // --- retailers ("at walmart", "not costco") ---
  const wanted = new Set<RetailerId>();
  const unwanted = new Set<RetailerId>();
  for (const [re, id] of RETAILER_ALIASES) {
    cut(re, (_m, before) => {
      if (NEGATION.test(before)) unwanted.add(id);
      else wanted.add(id);
    });
  }
  let retailers: RetailerId[] | null = null;
  if (wanted.size > 0) retailers = RETAILER_IDS.filter((r) => wanted.has(r) && !unwanted.has(r));
  else if (unwanted.size > 0) retailers = RETAILER_IDS.filter((r) => !unwanted.has(r));
  if (retailers && retailers.length === 0) retailers = null;

  // --- what is left: "for two people" style qualifiers, filler, attributes, keywords ---
  t = t.replace(/\bfor\s+(?:\w+\s+)?(?:people|persons?|adults|kids|children|guests)\b/g, ' ');
  const words = t
    .replace(/[^a-z0-9.'"+-]+/g, ' ')
    .split(' ')
    .map((w) => w.replace(/^[.'"+-]+|[.'"+]+$/g, ''))
    .filter((w) => w.length > 0);
  const mustHave: string[] = [];
  const keywords: string[] = [];
  for (const w of words) {
    if (FILLER.has(w)) continue;
    if (ATTRIBUTES.has(w)) {
      if (!mustHave.includes(w) && mustHave.length < 6) mustHave.push(w);
    } else if (!keywords.includes(w)) {
      keywords.push(w);
    }
  }
  // Nothing but attributes ("something portable"): search on those instead of nothing.
  const query = (keywords.length > 0 ? keywords : mustHave).slice(0, 8).join(' ').slice(0, 120);

  return { query, maxPrice, minRating, retailers, sort, mustHave };
}
