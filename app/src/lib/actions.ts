import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import type { Offer, Product } from '@/api/contract';
import { bestTotal, savedStore } from '@/state';
import { haptic } from './haptics';
import { track } from './tracker';

/** Record the click (the strongest learning signal) and open the retailer page. */
export function goToStore(product: Product, offer: Offer): void {
  const cheapest = product.offers.find((o) => o.id === product.cheapestOfferId) ?? null;
  const rank = product.offers.findIndex((o) => o.id === offer.id);
  track({
    type: 'offer_click',
    productId: product.id,
    offerId: offer.id,
    retailerId: offer.retailerId,
    category: product.category,
    brand: product.brand,
    price: offer.totalPrice,
    rank: rank < 0 ? undefined : rank,
    wasCheapest: cheapest ? offer.id === cheapest.id : undefined,
    premiumPaid: cheapest ? Math.max(0, Math.round((offer.totalPrice - cheapest.totalPrice) * 100) / 100) : undefined,
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
      [product.id]: { product: toSnapshot(product), savedAt: Date.now(), priceWhenSaved: bestTotal(product) },
    }));
    haptic.success();
  }
  track({
    type: isSaved ? 'unsave' : 'save',
    productId: product.id,
    category: product.category,
    brand: product.brand,
    price: bestTotal(product) ?? undefined,
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
