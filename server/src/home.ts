import type { ActivityEvent, HomeSection, Product, UserProfile } from './contract.js';
import type { ProviderProduct } from './providers/types.js';
import { personalizeProduct, savingsFraction } from './ranking.js';
import { NO_CONTEXT, type ShopperContext } from './shopper.js';

const SECTION_SIZE = 10;
const CATEGORY_SECTIONS = 5;

function popularity(p: Product): number {
  return p.reviewCount;
}

/** Product ids the shopper touched recently, newest first, de-duplicated. */
export function recentProductIds(events: readonly ActivityEvent[], limit: number): string[] {
  const ids: string[] = [];
  for (let i = events.length - 1; i >= 0 && ids.length < limit; i--) {
    const e = events[i]!;
    if (!e.productId) continue;
    if (e.type !== 'product_view' && e.type !== 'offer_click' && e.type !== 'save') continue;
    if (!ids.includes(e.productId)) ids.push(e.productId);
  }
  return ids;
}

/** Build the home feed. Pure: catalog + profile + recent events in, sections out. */
export function buildHomeSections(
  catalog: readonly ProviderProduct[],
  profile: UserProfile | null,
  recentEvents: readonly ActivityEvent[],
  ctx: ShopperContext = NO_CONTEXT,
): HomeSection[] {
  const hasProfile = profile !== null && profile.source !== 'none';
  const products = catalog.map((p) => personalizeProduct(p, hasProfile ? profile : undefined, ctx));
  const byId = new Map(products.map((p) => [p.id, p]));
  const sections: HomeSection[] = [];
  const recentIds = recentProductIds(recentEvents, SECTION_SIZE);

  if (hasProfile) {
    const recentSet = new Set(recentIds);
    const scored = products
      .map((p) => ({
        p,
        score:
          (profile.categoryAffinity[p.category] ?? 0) +
          0.7 * (profile.brandAffinity[p.brand] ?? 0) +
          // Things they already opened are covered by "recent"; nudge fresh picks up.
          (recentSet.has(p.id) ? -0.25 : 0),
      }))
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score || popularity(b.p) - popularity(a.p));
    if (scored.length > 0) {
      sections.push({
        id: 'for_you',
        title: 'For you',
        subtitle: 'Picked from what you browse and where you like to buy',
        kind: 'for_you',
        products: scored.slice(0, SECTION_SIZE).map((s) => s.p),
      });
    }
  }

  const recent = recentIds.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
  if (recent.length > 0) {
    sections.push({ id: 'recent', title: 'Recently viewed', subtitle: null, kind: 'recent', products: recent });
  }

  const deals = products
    .filter((p) => p.maxSavings > 0)
    .map((p) => ({ p, pct: savingsFraction(p) }))
    .sort((a, b) => b.pct - a.pct || b.p.maxSavings - a.p.maxSavings)
    .slice(0, SECTION_SIZE)
    .map((s) => s.p);
  if (deals.length > 0) {
    sections.push({
      id: 'top_deals',
      title: 'Top deals',
      subtitle: 'Biggest price gaps between retailers right now',
      kind: 'top_deals',
      products: deals,
    });
  }

  const categories = [...new Set(products.map((p) => p.category))];
  const affinity = (c: string) => (hasProfile ? (profile.categoryAffinity[c] ?? 0) : 0);
  const ordered = categories
    .map((c, i) => ({ c, i }))
    .sort((a, b) => affinity(b.c) - affinity(a.c) || a.i - b.i)
    .slice(0, CATEGORY_SECTIONS);
  for (const { c } of ordered) {
    sections.push({
      id: `category:${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: c,
      subtitle: null,
      kind: 'category',
      products: products
        .filter((p) => p.category === c)
        .sort((a, b) => popularity(b) - popularity(a))
        .slice(0, SECTION_SIZE),
    });
  }
  return sections;
}
