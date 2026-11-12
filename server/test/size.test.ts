import { describe, expect, it } from 'vitest';
import { buildComparison, cheapestContender } from '../src/compare.js';
import type { PackageSize } from '../src/contract.js';
import type { ProviderProduct } from '../src/providers/types.js';
import { personalizeProduct, rankOffers } from '../src/ranking.js';
import { shopperContext } from '../src/shopper.js';
import { baseAmount, comparableSizes, dimensionOf, formatSize, parseSize, sameSize, unitPriceOf } from '../src/size.js';
import { offer, profile, providerOffer } from './helpers.js';

const oz = (amount: number): PackageSize => ({ amount, unit: 'oz' });
const lb = (amount: number): PackageSize => ({ amount, unit: 'lb' });
const floz = (amount: number): PackageSize => ({ amount, unit: 'fl_oz' });
const ct = (amount: number): PackageSize => ({ amount, unit: 'ct' });

describe('parseSize', () => {
  it.each<[string, PackageSize]>([
    ['16 oz', oz(16)],
    ['16oz', oz(16)],
    ['16 OZ.', oz(16)],
    ['7.25 ounces', oz(7.25)],
    ['5 lb', lb(5)],
    ['5 lbs', lb(5)],
    ['2.5 pounds', lb(2.5)],
    ['64 fl oz', floz(64)],
    ['64 fl. oz.', floz(64)],
    ['16.9 fluid ounces', floz(16.9)],
    ['1 gal', { amount: 1, unit: 'gal' }],
    ['1 gallon', { amount: 1, unit: 'gal' }],
    ['half gallon', { amount: 0.5, unit: 'gal' }],
    ['12 ct', ct(12)],
    ['12 count', ct(12)],
    ['100 CT', ct(100)],
    ['dozen', ct(12)],
    ['6 pack', ct(6)],
    ['1 qt', floz(32)],
    ['1 pint', floz(16)],
  ])('"%s"', (text, expected) => {
    expect(parseSize(text)).toEqual(expected);
  });

  it('converts metric into the contract units', () => {
    expect(parseSize('2 L')).toEqual(floz(67.628));
    expect(parseSize('500 ml')!.amount).toBeCloseTo(16.907, 2);
    expect(parseSize('500 ml')!.unit).toBe('fl_oz');
    expect(parseSize('454 g')!.amount).toBeCloseTo(16.014, 2);
    expect(parseSize('454 g')!.unit).toBe('oz');
    expect(parseSize('1 kg')).toEqual(oz(35.274));
  });

  it.each<[string, PackageSize]>([
    ['12 x 12 fl oz', floz(144)],
    ['12x12 fl oz', floz(144)],
    ['24 x 16.9 fl oz', floz(405.6)],
    ['6 pack, 16.9 fl oz', floz(101.4)],
    ['12 pack 12 fl oz cans', floz(144)],
    ['12 fl oz, 12 count', floz(144)],
    ['12 fl oz cans, 12 pack', floz(144)],
    ['4 x 16 oz', oz(64)],
    ['2 x 1 gal', { amount: 2, unit: 'gal' }],
    ['8 ct of 5 oz', oz(40)],
  ])('multipack "%s"', (text, expected) => {
    expect(parseSize(text)).toEqual(expected);
  });

  it('reads a size out of a product title', () => {
    expect(parseSize('Great Value Whole Milk, 1 gal')).toEqual({ amount: 1, unit: 'gal' });
    expect(parseSize('Barilla Gluten Free Penne Pasta, 12 oz')).toEqual(oz(12));
    expect(parseSize('Coca-Cola Classic Soda Pop, 12 fl oz, 12 Pack Cans')).toEqual(floz(144));
    expect(parseSize("Eggland's Best Large White Eggs, 12 Count")).toEqual(ct(12));
    expect(parseSize('Charmin Ultra Soft Toilet Paper 12 Mega Rolls')).toBeNull(); // "12 mega rolls" is not a recognised unit phrase
    expect(parseSize('Tide PODS 42-ct')).toEqual(ct(42));
    expect(parseSize('Glad 13 Gallon Trash Bags, 40 Count')).toEqual({ amount: 13, unit: 'gal' }); // known limitation: a weight/volume beats a count
  });

  it('returns null for text without a size and for junk', () => {
    for (const bad of ['', 'Sony WH-1000XM5 Wireless Noise Canceling Headphones, Black', 'Aroma 8-Cup Digital Rice Cooker', 'large', '0 oz', 'x'.repeat(500), null, undefined]) {
      expect(parseSize(bad as string)).toBeNull();
    }
  });
});

describe('size maths', () => {
  it('normalizes within a dimension only', () => {
    expect(dimensionOf(lb(1))).toBe('weight');
    expect(dimensionOf({ amount: 1, unit: 'gal' })).toBe('volume');
    expect(dimensionOf({ amount: 1, unit: 'each' })).toBe('count');
    expect(baseAmount(lb(5))).toBe(80);
    expect(baseAmount({ amount: 1, unit: 'gal' })).toBe(128);
    expect(baseAmount(ct(12))).toBe(12);
    expect(sameSize(lb(1), oz(16))).toBe(true);
    expect(sameSize(oz(16), floz(16))).toBe(false);
    expect(sameSize(null, null)).toBe(true);
    expect(sameSize(null, oz(1))).toBe(false);
    expect(comparableSizes(lb(5), oz(12))).toBe(true);
    expect(comparableSizes(oz(12), floz(12))).toBe(false);
    expect(comparableSizes(oz(12), ct(12))).toBe(false);
    expect(comparableSizes(oz(12), null)).toBe(false);
  });

  it('unit price: per oz, per fl oz, each', () => {
    expect(unitPriceOf(3.2, lb(5))).toEqual({ unitPrice: 0.04, unitLabel: 'per oz' });
    expect(unitPriceOf(3.84, { amount: 1, unit: 'gal' })).toEqual({ unitPrice: 0.03, unitLabel: 'per fl oz' });
    expect(unitPriceOf(3, ct(12))).toEqual({ unitPrice: 0.25, unitLabel: 'each' });
    expect(unitPriceOf(0.88, { amount: 1, unit: 'each' })).toEqual({ unitPrice: 0.88, unitLabel: 'each' });
    expect(unitPriceOf(3, null)).toBeNull();
    expect(unitPriceOf(3, oz(0))).toBeNull();
  });

  it('formats sizes', () => {
    expect(formatSize(oz(16))).toBe('16 oz');
    expect(formatSize(floz(16.9))).toBe('16.9 fl oz');
    expect(formatSize({ amount: 1, unit: 'gal' })).toBe('1 gal');
    expect(formatSize(ct(12))).toBe('12 ct');
    expect(formatSize({ amount: 1, unit: 'each' })).toBe('each');
  });
});

describe('unit-price comparison', () => {
  const product = (offers: ProviderProduct['offers'], size: PackageSize | null = lb(2)): ProviderProduct => ({
    id: 'p1', title: 'Store Rice, 2 lb', brand: 'Store', category: 'Pantry', imageUrl: null, gtin: null, size, isStoreBrand: true, highlights: [], offers,
  });
  const own = (total: number, extra = {}) => providerOffer('walmart', total, { size: lb(2), ...extra });
  const equivalent = (retailer: Parameters<typeof providerOffer>[0], total: number, size: PackageSize | null, extra = {}) =>
    providerOffer(retailer, total, { matchType: 'equivalent', offerTitle: `${retailer} rice`, size, ...extra });

  it('same item, same size everywhere: still compared on landedPrice', () => {
    const offers = [offer('walmart', 3, { size: lb(2) }), offer('kroger', 2.5, { size: lb(2) })];
    const cmp = buildComparison(offers, lb(2));
    expect(cmp.unitMode).toBe(false);
    expect(cmp.value(offers[0]!)).toBe(3);
    const p = personalizeProduct(product([own(3), providerOffer('kroger', 2.5, { size: lb(2) })]));
    expect(p.cheapestOfferId).toBe('p1:kroger');
    expect(p.maxSavings).toBe(0.5);
    expect(p.offers.map((o) => o.unitPrice)).toEqual([0.0781, 0.0938]);
    expect(p.offers[0]!.unitLabel).toBe('per oz');
  });

  it('a bigger equivalent pack that costs more on the shelf but less per unit is the cheapest', () => {
    // Walmart 2 lb for $3.00 ($1.50/lb) vs Costco 25 lb for $20 ($0.80/lb) vs Kroger 2 lb for $2.80 ($1.40/lb).
    const p = personalizeProduct(product([own(3), equivalent('costco', 20, lb(25)), equivalent('kroger', 2.8, lb(2))]));
    expect(p.offers.map((o) => o.retailerId)).toEqual(['costco', 'kroger', 'walmart']);
    expect(p.cheapestOfferId).toBe('p1:costco');
    expect(p.recommendedOfferId).toBe('p1:costco');
    // Lowest shelf price is Kroger, but that is not what "cheapest" means here.
    expect(Math.min(...p.offers.map((o) => o.landedPrice))).toBe(2.8);
    // Savings are for the product's own 2 lb: $3.00 at Walmart vs $1.60 worth at Costco's unit price.
    expect(p.maxSavings).toBe(1.4);
    expect(p.offers.find((o) => o.retailerId === 'costco')).toMatchObject({ matchType: 'equivalent', offerTitle: 'costco rice', unitPrice: 0.05, unitLabel: 'per oz' });
    expect(p.recommendationReason).toBeNull();
  });

  it('differing sizes of the SAME item also switch to unit prices', () => {
    const p = personalizeProduct(product([own(3), providerOffer('kroger', 5, { size: lb(5) })]));
    expect(p.cheapestOfferId).toBe('p1:kroger'); // $1.00/lb beats $1.50/lb
    expect(p.maxSavings).toBe(1); // on the product's own 2 lb
  });

  it('never compares across dimensions: an offer in another dimension or without a size is not cheapest', () => {
    const p = personalizeProduct(product([own(3), equivalent('kroger', 0.5, { amount: 6, unit: 'ct' }), equivalent('target', 0.1, null), equivalent('costco', 20, lb(25))]));
    expect(p.cheapestOfferId).toBe('p1:costco');
    expect(p.recommendedOfferId).toBe('p1:costco');
    // Comparable offers first; the two that cannot be compared follow, in stock but never recommended.
    expect(p.offers.map((o) => o.retailerId)).toEqual(['costco', 'walmart', 'target', 'kroger']);
    expect(p.maxSavings).toBe(1.4);
    const cmp = buildComparison(p.offers, lb(2));
    expect(cmp.value(p.offers.find((o) => o.retailerId === 'kroger')!)).toBeNull();
    expect(cheapestContender(p.offers, cmp)!.retailerId).toBe('costco');
  });

  it('when nothing is comparable per unit it falls back to shelf prices', () => {
    const p = personalizeProduct(product([providerOffer('walmart', 3), equivalent('kroger', 2.5, null)], null));
    expect(buildComparison(p.offers, null).unitMode).toBe(false);
    expect(p.cheapestOfferId).toBe('p1:kroger');
  });

  it('eligibility, stock and tax still apply in unit mode', () => {
    const offers = [own(3), equivalent('costco', 20, lb(25)), equivalent('samsclub', 18, lb(25), { inStock: false }), equivalent('kroger', 2.8, lb(2))];
    const noClub = personalizeProduct(product(offers), undefined, shopperContext('94105', []));
    expect(noClub.cheapestOfferId).toBe('p1:kroger');
    expect(noClub.offers.map((o) => o.retailerId)).toEqual(['kroger', 'walmart', 'costco', 'samsclub']);
    expect(noClub.offers[0]!.estimatedTax).toBe(0.25);
    expect(noClub.maxSavings).toBe(0.22); // landed 3.27 vs 3.05 for the same 2 lb
  });

  it('the recommendation reason states the PER-UNIT gap, not a shelf-price gap', () => {
    // The shopper loves Walmart and has paid up to 100% extra before.
    const loyal = profile({ priceSensitivity: 0, retailerAffinity: { walmart: 1 }, maxObservedPremiumPct: 1 });
    const p = personalizeProduct(product([own(3), equivalent('costco', 20, lb(25))]), loyal);
    expect(p.cheapestOfferId).toBe('p1:costco');
    expect(p.recommendedOfferId).toBe('p1:walmart');
    // $3/32 oz = 9.375 cents/oz vs $20/400 oz = 5 cents/oz.
    expect(p.recommendationReason).toMatch(/^Walmart is 4\.4¢ per oz more — a store you often choose/);
    expect(p.recommendationReason).not.toMatch(/\$17|\$-/); // never "$17 less"/"more" from comparing a 2 lb bag with a 25 lb bag
    // Count-based products say "each".
    const eggs = personalizeProduct(
      { ...product([providerOffer('walmart', 3, { size: ct(12) }), equivalent('costco', 5, ct(24))], ct(12)) },
      loyal,
    );
    expect(eggs.recommendationReason).toMatch(/^Walmart is 4\.2¢ each more/);
  });

  it('the premium bound is enforced on unit prices too', () => {
    const offers = [offer('walmart', 3, { size: lb(2) }), offer('costco', 20, { size: lb(25), matchType: 'equivalent', offerTitle: 'x' })];
    const loves = { priceSensitivity: 0, retailerAffinity: { walmart: 1 } };
    // 87.5% more per unit: allowed only for a shopper who has paid that much extra before.
    expect(rankOffers(offers, profile({ ...loves, maxObservedPremiumPct: 0.5 }), lb(2))[0]!.retailerId).toBe('costco');
    expect(rankOffers(offers, profile({ ...loves, maxObservedPremiumPct: 0.9 }), lb(2))[0]!.retailerId).toBe('walmart');
  });
});
