import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Product } from '@/api/contract';
import { prefetchProduct, seedProducts } from '@/api/queries';
import { money, moneyShort, unitPriceText } from '@/lib/format';
import { viewOffers } from '@/lib/offers';
import { getRetailer } from '@/lib/retailers';
import { continuous, radius, space, useTheme } from '@/theme';
import { AddToListIcon } from './AddToList';
import { RetailerMark } from './bits';
import { PressableScale } from './PressableScale';
import { ProductTile } from './ProductTile';
import { Text } from './Text';

export const MINI_CARD_WIDTH = 172;

/** Compact card for the home carousels: picture, name, best price and where. */
export const MiniProductCard = memo(function MiniProductCard({ product, width = MINI_CARD_WIDTH }: { product: Product; width?: number }) {
  const t = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const view = useMemo(() => viewOffers(product), [product]);
  const best = view.offers.find((o) => o.id === view.cheapestId) ?? null;
  const stores = view.offers.length;

  const open = useCallback(() => {
    seedProducts([product]);
    router.push({ pathname: '/product/[id]', params: { id: product.id } });
  }, [product, router]);
  const warm = useCallback(() => prefetchProduct(client, product.id), [client, product.id]);

  const unit = best ? unitPriceText(best) : null;
  return (
    <View style={{ width }}>
      <PressableScale
        onPress={open}
        onPressIn={warm}
        onHoverIn={warm}
        accessibilityLabel={`${product.title}. ${best ? `${view.bestLabel} ${money(best.landedPrice)}${unit ? `, ${unit}` : ''} at ${getRetailer(best.retailerId).name}` : 'No price available'}`}
        style={[styles.card, continuous, { backgroundColor: t.c.surface, borderColor: t.c.border }, t.shadow1]}
      >
        <ProductTile imageUrl={product.imageUrl} category={product.category} title={product.title} style={styles.tile} glyphSize={40} corner={radius.md} />
        <Text variant="calloutStrong" numberOfLines={2} style={styles.title}>
          {product.title}
        </Text>
        <View style={styles.bottom}>
          {best ? (
            <>
              <View style={styles.priceLine}>
                <Text variant="priceLarge">{money(best.landedPrice)}</Text>
                {unit ? (
                  <Text variant="caption" tone="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {unit}
                  </Text>
                ) : null}
              </View>
              <View style={styles.at}>
                <RetailerMark id={best.retailerId} size={16} />
                <Text variant="caption" tone="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                  {getRetailer(best.retailerId).name} · {stores} {stores === 1 ? 'store' : 'stores'}
                </Text>
              </View>
              <Text variant="captionStrong" tone="best" style={styles.save} numberOfLines={1}>
                {view.unitMode ? (view.savingsPct >= 0.01 ? `${view.bestLabel} · ${Math.round(view.savingsPct * 100)}% less` : view.bestLabel) : view.savings >= 0.01 ? `Save up to ${moneyShort(view.savings)}` : ' '}
              </Text>
            </>
          ) : (
            <Text variant="footnote" tone="textTertiary">
              No price available right now
            </Text>
          )}
        </View>
      </PressableScale>
      {/* A sibling, not a child: its own target, and it does not open the product. */}
      <View style={styles.plus}>
        <AddToListIcon product={product} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.sm + 2 },
  tile: { width: '100%', aspectRatio: 1.25 },
  title: { marginTop: space.sm + 2, minHeight: 40 },
  bottom: { marginTop: space.sm },
  at: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  plus: { position: 'absolute', top: space.sm, right: space.sm },
  save: { marginTop: 5 },
});
