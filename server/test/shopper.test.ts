import { describe, expect, it } from 'vitest';
import { Catalog, linkOnlyOffer, mergeHits } from '../src/catalog.js';
import { normalizeGtin } from '../src/gtin.js';
import { MockProvider, parsePriceOverrides } from '../src/providers/mock/index.js';
import type { PriceProvider, ProviderProduct, ProviderProductDetail } from '../src/providers/types.js';
import { personalizeProduct, premiumBound, rankOffers } from '../src/ranking.js';
import { applyContext, NO_CONTEXT, shopperContext } from '../src/shopper.js';
import { estimatedTaxRateForZip, STATE_TAX_RATE_PCT, stateForZip } from '../src/tax.js';
import { offer, profile, providerOffer } from './helpers.js';

const base = (offers: ProviderProduct['offers'], extra: Partial<ProviderProduct> = {}): ProviderProduct => ({
  id: 'p1', title: 'Thing', brand: 'Acme', category: 'Rice Cookers', imageUrl: null, gtin: null, highlights: [], offers, ...extra,
});
const catalogOpts = { providerTimeoutMs: 200, cacheMaxEntries: 100, cacheTtlMs: 60_000, cacheSwrMs: 60_000 };

describe('normalizeGtin', () => {
  it('canonicalizes UPC-A / EAN-13 / GTIN-14 spellings to 14 digits', () => {
    const canon = '00036000291452';
    expect(normalizeGtin('036000291452')).toBe(canon); // UPC-A
    expect(normalizeGtin('36000291452')).toBe(canon); // leading zero dropped
    expect(normalizeGtin('0036000291452')).toBe(canon); // EAN-13
    expect(normalizeGtin('00036000291452')).toBe(canon);
    expect(normalizeGtin(' 0-36000-29145-2 ')).toBe(canon);
    expect(normalizeGtin('4006381333931')).toBe('04006381333931'); // real EAN-13 shape
  });

  it('rejects wrong lengths, bad check digits and junk', () => {
    for (const bad of ['036000291453', '1234567', '123456789012345', '', 'abcdefgh', '00000000000000', null, undefined]) {
      expect(normalizeGtin(bad as string)).toBeNull();
    }
  });
});

describe('sales-tax estimate', () => {
  it('maps ZIP prefixes to states', () => {
    expect(stateForZip('94105')).toBe('CA');
    expect(stateForZip('10001')).toBe('NY');
    expect(stateForZip('00501')).toBe('NY');
    expect(stateForZip('73301')).toBe('TX'); // Austin sits inside the Oklahoma range
    expect(stateForZip('20001')).toBe('DC');
    expect(stateForZip('20101')).toBe('VA');
    expect(stateForZip('05501')).toBe('MA');
    expect(stateForZip('99501')).toBe('AK');
    expect(stateForZip('96701')).toBe('HI');
    expect(stateForZip('00901')).toBeNull(); // Puerto Rico: not in the table
    expect(stateForZip('09012')).toBeNull(); // military
    expect(stateForZip('9410')).toBeNull();
  });

  it('has a rate for all 50 states + DC, with the five no-sales-tax states at 0', () => {
    expect(Object.keys(STATE_TAX_RATE_PCT)).toHaveLength(51);
    for (const s of ['AK', 'DE', 'MT', 'NH', 'OR']) expect(STATE_TAX_RATE_PCT[s]).toBe(0);
    for (const [s, pct] of Object.entries(STATE_TAX_RATE_PCT)) {
      expect(pct, s).toBeGreaterThanOrEqual(0);
      expect(pct, s).toBeLessThan(12);
    }
    expect(Object.values(STATE_TAX_RATE_PCT).filter((p) => p === 0)).toHaveLength(5);
    expect(estimatedTaxRateForZip('97201')).toBe(0);
    expect(estimatedTaxRateForZip('19901')).toBe(0);
    expect(estimatedTaxRateForZip('94105')).toBeCloseTo(0.0885, 4);
    expect(estimatedTaxRateForZip('00901')).toBeNull();
  });
});

describe('applyContext', () => {
  const raw = [providerOffer('amazon', 105, { price: 100, shipping: 5 }), providerOffer('costco', 90)];

  it('no context: no tax, everything eligible', () => {
    for (const o of applyContext(raw, NO_CONTEXT)) {
      expect(o.estimatedTax).toBeNull();
      expect(o.landedPrice).toBe(o.totalPrice);
      expect(o.eligible).toBe(true);
    }
  });

  it('taxes the item price, not shipping, and adds it to the landed price', () => {
    const [amazon] = applyContext(raw, shopperContext('94105', null));
    expect(amazon!.estimatedTax).toBe(8.85);
    expect(amazon!.landedPrice).toBe(113.85);
    expect(amazon!.totalPrice).toBe(105);
  });

  it('eligible is false only for a membership the shopper said they lack', () => {
    const el = (m: Parameters<typeof shopperContext>[1]) => applyContext(raw, shopperContext(null, m)).map((o) => o.eligible);
    expect(el(null)).toEqual([true, true]);
    expect(el([])).toEqual([true, false]);
    expect(el(['samsclub'])).toEqual([true, false]);
    expect(el(['costco'])).toEqual([true, true]);
  });
});

describe('ranking with landed price, eligibility and link-only offers', () => {
  it('cheapest and order follow landedPrice, which tax can flip', () => {
    // Equal-ish totals, different taxable base (tax is on the item price, not shipping).
    const offers = [providerOffer('amazon', 100, { price: 90, shipping: 10 }), providerOffer('walmart', 100.5, { price: 100.5, shipping: 0 })];
    expect(personalizeProduct(base(offers)).cheapestOfferId).toBe('p1:amazon');
    // 8.85% of 90 = 7.97 vs 8.85% of 100.5 = 8.89: landed 107.97 vs 109.39.
    const taxed = personalizeProduct(base(offers), undefined, shopperContext('94105', null));
    expect(taxed.offers.map((o) => o.landedPrice)).toEqual([107.97, 109.39]);
    expect(taxed.maxSavings).toBe(1.42);
    // Tax flips the winner: Walmart is $1 cheaper before tax, Amazon after.
    const shipHeavy = [providerOffer('amazon', 100, { price: 80, shipping: 20 }), providerOffer('walmart', 99, { price: 99, shipping: 0 })];
    expect(personalizeProduct(base(shipHeavy)).cheapestOfferId).toBe('p1:walmart');
    expect(personalizeProduct(base(shipHeavy), undefined, shopperContext('94105', null)).cheapestOfferId).toBe('p1:amazon');
  });

  it('tiers: eligible in-stock, then ineligible, then out of stock, then link-only', () => {
    const offers = [
      { ...linkOnlyOffer({ id: 'p1', title: 'Thing' }, 'target', '2026-01-01T00:00:00.000Z') },
      providerOffer('bestbuy', 50, { inStock: false }),
      providerOffer('costco', 80),
      providerOffer('walmart', 120),
      providerOffer('amazon', 100),
    ];
    const p = personalizeProduct(base(offers), undefined, shopperContext(null, []));
    expect(p.offers.map((o) => o.retailerId)).toEqual(['amazon', 'walmart', 'costco', 'bestbuy', 'target']);
    expect(p.cheapestOfferId).toBe('p1:amazon');
    expect(p.recommendedOfferId).toBe('p1:amazon');
    expect(p.maxSavings).toBe(20); // 120 - 100: the ineligible $80 and the link-only $0 are excluded
    const link = p.offers.at(-1)!;
    expect(link).toMatchObject({ priceSource: 'link_only', price: 0, totalPrice: 0, landedPrice: 0, listPrice: null, estimatedTax: null });
  });

  it('an ineligible or link-only offer is never recommended, even when nothing else exists', () => {
    const onlyClub = personalizeProduct(base([providerOffer('costco', 80)]), profile({ retailerAffinity: { costco: 1 }, priceSensitivity: 0 }), shopperContext(null, []));
    expect(onlyClub.recommendedOfferId).toBeNull();
    expect(onlyClub.cheapestOfferId).toBeNull();
    expect(onlyClub.maxSavings).toBe(0);
    const onlyLink = personalizeProduct(base([linkOnlyOffer({ id: 'p1', title: 'Thing' }, 'target', '2026-01-01T00:00:00.000Z')]), undefined, shopperContext('94105', null));
    expect(onlyLink.recommendedOfferId).toBeNull();
    expect(onlyLink.cheapestOfferId).toBeNull();
    expect(onlyLink.offers[0]!.estimatedTax).toBeNull();
  });

  it('a link-only offer is not preferred even by a profile that loves that store', () => {
    const offers = [linkOnlyOffer({ id: 'p1', title: 'Thing' }, 'target', '2026-01-01T00:00:00.000Z'), providerOffer('amazon', 100)];
    const p = personalizeProduct(base(offers), profile({ priceSensitivity: 0, retailerAffinity: { target: 1 }, maxObservedPremiumPct: 1 }));
    expect(p.recommendedOfferId).toBe('p1:amazon');
    expect(p.cheapestOfferId).toBe('p1:amazon');
    expect(p.recommendationReason).toBeNull();
  });

  it('stated memberships override inferred ones in both directions', () => {
    const offers = [providerOffer('costco', 98), providerOffer('amazon', 100)];
    const inferredMember = profile({ priceSensitivity: 0.3, memberships: ['costco'] });
    // Profile thinks they are a member; they said they are not.
    const no = personalizeProduct(base(offers), inferredMember, shopperContext(null, []));
    expect(no.recommendedOfferId).toBe('p1:amazon');
    expect(no.cheapestOfferId).toBe('p1:amazon');
    // Profile has no membership signal; they said they are a member: no "membership required" caveat.
    const yes = personalizeProduct(base([providerOffer('costco', 101), providerOffer('amazon', 100)]), profile({ priceSensitivity: 0, retailerAffinity: { costco: 1 } }), shopperContext(null, ['costco']));
    expect(yes.recommendedOfferId).toBe('p1:costco');
    expect(yes.recommendationReason).not.toMatch(/required/);
  });
});

describe('premium bound', () => {
  const loves = { priceSensitivity: 0, retailerAffinity: { target: 1 }, speedPreference: 1, qualityPreference: 1 };

  it('never recommends a pricier offer beyond maxObservedPremiumPct (tiny tolerance)', () => {
    const p = profile({ ...loves, maxObservedPremiumPct: 0.05 });
    expect(premiumBound(100, p)).toBeCloseTo(105.01, 5);
    expect(rankOffers([offer('target', 105), offer('amazon', 100)], p)[0]!.retailerId).toBe('target');
    expect(rankOffers([offer('target', 105.01), offer('amazon', 100)], p)[0]!.retailerId).toBe('target');
    expect(rankOffers([offer('target', 105.02), offer('amazon', 100)], p)[0]!.retailerId).toBe('amazon');
    expect(rankOffers([offer('target', 130), offer('amazon', 100)], p)[0]!.retailerId).toBe('amazon');
  });

  it('a shopper who never paid a premium always gets the cheapest eligible offer', () => {
    const p = profile({ ...loves, maxObservedPremiumPct: 0 });
    expect(rankOffers([offer('target', 100.5), offer('amazon', 100)], p)[0]!.retailerId).toBe('amazon');
    // Profiles stored before the field existed behave the same.
    const { maxObservedPremiumPct: _drop, ...legacy } = p;
    expect(rankOffers([offer('target', 100.5), offer('amazon', 100)], legacy)[0]!.retailerId).toBe('amazon');
    // An exact tie is still allowed to follow preference.
    expect(rankOffers([offer('target', 100), offer('amazon', 100)], p)[0]!.retailerId).toBe('target');
  });

  it('the bound is measured from the cheapest ELIGIBLE landed price, tax included', () => {
    const p = profile({ ...loves, maxObservedPremiumPct: 0.05 });
    const product = base([providerOffer('costco', 80), providerOffer('amazon', 100), providerOffer('target', 104), providerOffer('walmart', 106)]);
    const r = personalizeProduct(product, p, shopperContext('94105', []));
    // Costco is ineligible, so the base is Amazon ($108.85 landed); Target ($113.20) is within 5%, Walmart is not.
    expect(r.recommendedOfferId).toBe('p1:target');
    expect(r.offers.map((o) => o.retailerId)).toEqual(['target', 'amazon', 'walmart', 'costco']);
    const top = r.offers[0]!;
    const low = r.offers.find((o) => o.id === r.cheapestOfferId)!;
    expect(top.landedPrice).toBeLessThanOrEqual(low.landedPrice * 1.05 + 0.01);
    expect(r.recommendationReason).toMatch(/^Target is \$4\.35 more/);
  });

  it('holds for every mock product under an extreme profile', async () => {
    const p = profile({ priceSensitivity: 0, retailerAffinity: { bestbuy: 1, target: 1, costco: 1 }, speedPreference: 1, qualityPreference: 1, maxObservedPremiumPct: 0.02 });
    for (const product of await new MockProvider().browse()) {
      for (const ctx of [NO_CONTEXT, shopperContext('60601', []), shopperContext('10001', ['costco'])]) {
        const r = personalizeProduct(product, p, ctx);
        const low = r.offers.find((o) => o.id === r.cheapestOfferId);
        if (!low) continue;
        const top = r.offers[0]!;
        expect(r.recommendedOfferId).toBe(top.id);
        expect(top.inStock && top.eligible).toBe(true);
        expect(top.landedPrice).toBeLessThanOrEqual(low.landedPrice * 1.02 + 0.0101);
        expect(low.landedPrice).toBe(Math.min(...r.offers.filter((o) => o.inStock && o.eligible).map((o) => o.landedPrice)));
      }
    }
  });
});

describe('catalog: GTIN merge, link-only fallback, category scope, lookup', () => {
  const detail = (id: string, gtin: string | null, offers: ProviderProduct['offers'], title = 'Sony WH-1000XM5 Headphones'): ProviderProductDetail => ({
    id, title, brand: 'Sony', category: 'Headphones', imageUrl: null, gtin, highlights: [], offers: offers.map((o) => ({ ...o, productId: id, id: `${id}:${o.retailerId}` })),
    description: '', priceHistory: [], reviewSummary: null,
  });
  const fake = (name: string, products: ProviderProductDetail[]): PriceProvider => ({
    name,
    search: async () => products.map((product, i) => ({ product, relevance: 0.9 - i * 0.1 })),
    getProduct: async (id) => products.find((p) => p.id === id) ?? null,
    lookupGtin: async (gtin) => products.find((p) => normalizeGtin(p.gtin) === gtin) ?? null,
  });
  const live = (r: 'bestbuy' | 'walmart', total: number) => providerOffer(r, total, { priceSource: 'live' });

  it('merges across providers by normalized GTIN only — never by title', async () => {
    const a = detail('bby-1', '036000291452', [live('bestbuy', 300)]);
    const sameGtinOtherSpelling = detail('wmt-9', '0036000291452', [live('walmart', 290)], 'Totally different title');
    const sameTitleNoGtin = detail('wmt-10', null, [live('walmart', 100)]);
    const sameTitleOtherGtin = detail('wmt-11', '4006381333931', [live('walmart', 100)]);
    const merged = mergeHits([[{ product: a, relevance: 0.9 }], [sameGtinOtherSpelling, sameTitleNoGtin, sameTitleOtherGtin].map((product) => ({ product, relevance: 0.5 }))]);
    expect(merged.map((h) => h.product.id)).toEqual(['bby-1', 'wmt-10', 'wmt-11']);
    expect(merged[0]!.product.offers.map((o) => [o.retailerId, o.totalPrice, o.productId])).toEqual([['bestbuy', 300, 'bby-1'], ['walmart', 290, 'bby-1']]);
  });

  it('with real providers active, unpriced retailers get a link-only "check price" offer', async () => {
    const catalog = new Catalog(
      [fake('bestbuy', [detail('bby-1', '036000291452', [live('bestbuy', 300)])]), fake('walmart', [detail('wmt-9', '36000291452', [live('walmart', 290)])])],
      { ...catalogOpts, linkOnlyFallback: true },
    );
    const { value: hits } = await catalog.search('sony');
    expect(hits).toHaveLength(1);
    const p = personalizeProduct(hits[0]!.product);
    expect(p.offers.map((o) => [o.retailerId, o.priceSource])).toEqual([
      ['walmart', 'live'], ['bestbuy', 'live'], ['amazon', 'link_only'], ['costco', 'link_only'], ['samsclub', 'link_only'], ['target', 'link_only'],
    ]);
    expect(p.cheapestOfferId).toBe('bby-1:walmart');
    expect(p.maxSavings).toBe(10);
    const amazon = p.offers.find((o) => o.retailerId === 'amazon')!;
    expect(amazon.url).toBe('https://www.amazon.com/s?k=Sony%20WH-1000XM5%20Headphones');
    expect(amazon).toMatchObject({ price: 0, totalPrice: 0, landedPrice: 0, productId: 'bby-1', id: 'bby-1:amazon' });

    // Detail by one provider's id pulls the other provider's offer in via GTIN lookup.
    const { value: d } = await catalog.product('bby-1');
    expect(d!.offers.filter((o) => o.priceSource === 'live').map((o) => o.retailerId).sort()).toEqual(['bestbuy', 'walmart']);
    expect(d!.offers).toHaveLength(6);
    // Barcode lookup merges the same way.
    const { value: l } = await catalog.lookup(normalizeGtin('036000291452')!);
    expect(l!.offers.filter((o) => o.priceSource === 'live')).toHaveLength(2);
  });

  it('demo (mock) products never get link-only offers, and live+link merge prefers the real price', async () => {
    const catalog = new Catalog([new MockProvider()], { ...catalogOpts, linkOnlyFallback: true });
    for (const p of (await catalog.browse([])).value) expect(p.offers.every((o) => o.priceSource === 'demo')).toBe(true);
    const stub = linkOnlyOffer({ id: 'bby-1', title: 'X' }, 'walmart', '2026-01-01T00:00:00.000Z');
    const merged = mergeHits([
      [{ product: detail('bby-1', '036000291452', [live('bestbuy', 300)]), relevance: 1 }].map((h) => ({ ...h, product: { ...h.product, offers: [...h.product.offers, stub] } })),
      [{ product: detail('wmt-9', '036000291452', [live('walmart', 290)]), relevance: 1 }],
    ]);
    expect(merged[0]!.product.offers.find((o) => o.retailerId === 'walmart')!.priceSource).toBe('live');
  });

  it('CATALOG_CATEGORIES limits search, browse, detail, lookup and suggestions', async () => {
    const scoped = new MockProvider({ categories: ['rice cookers'] });
    const all = await scoped.browse();
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(new Set(all.map((p) => p.category))).toEqual(new Set(['Rice Cookers']));
    expect(await scoped.search('tv', { limit: 10 })).toEqual([]);
    expect((await scoped.suggest('', 20)).every((q) => /rice|cooker|zojirushi/.test(q))).toBe(true);

    // The catalog enforces the scope for providers that do not (here: an unscoped mock).
    const catalog = new Catalog([new MockProvider()], { ...catalogOpts, categories: ['rice cookers'] });
    expect((await catalog.search('tv')).value).toEqual([]);
    expect((await catalog.search('rice cooker')).value.length).toBeGreaterThan(0);
    expect(new Set((await catalog.browse([])).value.map((p) => p.category))).toEqual(new Set(['Rice Cookers']));
    const tv = (await new MockProvider().search('tv', { limit: 1 }))[0]!.product;
    expect((await catalog.product(tv.id)).value).toBeNull();
    expect((await catalog.lookup(normalizeGtin(tv.gtin)!)).value).toBeNull();
    expect((await catalog.product('dash-mini-2-cup-rice-cooker')).value).not.toBeNull();
  });

  it('mock lookupGtin and price overrides', async () => {
    const mock = new MockProvider({ priceOverrides: parsePriceOverrides('dash-mini-2-cup-rice-cooker:amazon=9.50') });
    const product = (await mock.getProduct('dash-mini-2-cup-rice-cooker'))!;
    const amazon = product.offers.find((o) => o.retailerId === 'amazon');
    if (amazon) {
      expect(amazon.price).toBe(9.5);
      expect(amazon.totalPrice).toBeCloseTo(9.5 + (amazon.shipping ?? 0), 2);
      expect(amazon.inStock).toBe(true);
    }
    expect((await mock.lookupGtin(normalizeGtin(product.gtin)!))!.id).toBe(product.id);
    expect(await mock.lookupGtin('00036000291452')).toBeNull();
    const first = product.offers[0]!;
    expect(mock.setPriceOverride(product.id, first.retailerId, 3.21)).toBe(true);
    expect((await mock.search('dash mini', { limit: 1 }))[0]!.product.offers[0]!.price).toBe(3.21);
    expect(mock.setPriceOverride('nope', 'amazon', 1)).toBe(false);
    expect(mock.setPriceOverride(product.id, first.retailerId, -1)).toBe(false);
    expect(() => parsePriceOverrides('garbage')).toThrow(/MOCK_PRICE_OVERRIDES/);
    expect(() => parsePriceOverrides('a:ebay=1')).toThrow();
    expect(parsePriceOverrides(' a-b:target=10 , c:costco=2.5 ')).toEqual(new Map([['a-b:target', 10], ['c:costco', 2.5]]));
  });
});
