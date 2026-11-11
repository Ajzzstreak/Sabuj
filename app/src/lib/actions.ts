import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import type { Offer, Product } from '@/api/contract';
import { savedStore } from '@/state';
import { haptic } from './haptics';
import { bestPrice, hasPrice, viewOffers } from './offers';
import { track } from './tracker';

/** Record the click (the strongest learning signal) and open the retailer page. */
export function goToStore(product: Product, offer: Offer): void {
  const cheapestId = viewOffers(product).cheapestId;
  const cheapest = product.offers.find((o) => o.id === cheapestId) ?? null;
  // A link-only offer has no price to report or compare.
  const priced = hasPrice(offer);
  const rank = product.offers.findIndex((o) => o.id === offer.id);
  track({
    type: 'offer_click',
    productId: product.id,
    offerId: offer.id,
    retailerId: offer.retailerId,
    category: product.category,
    brand: product.brand,
    price: priced ? offer.landedPrice : undefined,
    rank: rank < 0 ? undefined : rank,
    wasCheapest: cheapest && priced ? offer.id === cheapest.id : undefined,
    premiumPaid: cheapest && priced ? Math.max(0, Math.round((offer.landedPrice - cheapest.landedPrice) * 100) / 100) : undefined,
  });
  haptic.medium();
  void openUrl(offer.url);
}

async function openUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    }
  } catch {
    Linking.openURL(url).catch(() => undefined);
  }
}

/** Optimistic: the local watchlist updates synchronously, then the event is queued. */
export function toggleSaved(product: Product): boolean {
  const isSaved = product.id in savedStore.get();
  if (isSaved) {
    savedStore.set((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    haptic.light();
  } else {
    savedStore.set((prev) => ({
      ...prev,
      [product.id]: { product: toSnapshot(product), savedAt: Date.now(), priceWhenSaved: bestPrice(product) },
    }));
    haptic.success();
  }
  track({
    type: isSaved ? 'unsave' : 'save',
    productId: product.id,
    category: product.category,
    brand: product.brand,
    price: bestPrice(product) ?? undefined,
  });
  return !isSaved;
}

/** Keep only Product fields (drops description / price history from a ProductDetail). */
export function toSnapshot(p: Product): Product {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    category: p.category,
    imageUrl: p.imageUrl,
    gtin: p.gtin,
    highlights: p.highlights,
    rating: p.rating,
    reviewCount: p.reviewCount,
    offers: p.offers,
    cheapestOfferId: p.cheapestOfferId,
    recommendedOfferId: p.recommendedOfferId,
    recommendationReason: p.recommendationReason,
    maxSavings: p.maxSavings,
  };
}
