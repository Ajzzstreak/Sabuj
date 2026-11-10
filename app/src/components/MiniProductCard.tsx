import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Product } from '@/api/contract';
import { prefetchProduct, seedProducts } from '@/api/queries';
import { money, moneyShort } from '@/lib/format';
import { viewOffers } from '@/lib/offers';
import { getRetailer } from '@/lib/retailers';
import { continuous, radius, space, useTheme } from '@/theme';
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

  return (
    <PressableScale
      onPress={open}
      onPressIn={warm}
      onHoverIn={warm}
      accessibilityLabel={`${product.title}. ${best ? `Best price ${money(best.totalPrice)} at ${getRetailer(best.retailerId).name}` : 'Out of stock'}`}
      style={[styles.card, continuous, { width, backgroundColor: t.c.surface, borderColor: t.c.border }, t.shadow1]}
    >
      <ProductTile imageUrl={product.imageUrl} category={product.category} title={product.title} style={styles.tile} glyphSize={40} corner={radius.md} />
      <Text variant="calloutStrong" numberOfLines={2} style={styles.title}>
        {product.title}
      </Text>
      <View style={styles.bottom}>
        {best ? (
          <>
            <Text variant="priceLarge">{money(best.totalPrice)}</Text>
            <View style={styles.at}>
              <RetailerMark id={best.retailerId} size={16} />
              <Text variant="caption" tone="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                {getRetailer(best.retailerId).name} · {stores} {stores === 1 ? 'store' : 'stores'}
              </Text>
            </View>
            <Text variant="captionStrong" tone="best" style={styles.save} numberOfLines={1}>
              {view.savings >= 0.01 ? `Save up to ${moneyShort(view.savings)}` : ' '}
            </Text>
          </>
        ) : (
          <Text variant="footnote" tone="textTertiary">
            Out of stock everywhere
          </Text>
        )}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.sm + 2 },
  tile: { width: '100%', aspectRatio: 1.25 },
  title: { marginTop: space.sm + 2, minHeight: 40 },
  bottom: { marginTop: space.sm },
  at: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  save: { marginTop: 5 },
});
