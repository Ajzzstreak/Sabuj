import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Offer, Product } from '@/api/contract';
import { prefetchProduct, seedProducts } from '@/api/queries';
import { goToStore } from '@/lib/actions';
import { moneyShort } from '@/lib/format';
import { NO_FILTERS, viewOffers, type OfferFilters } from '@/lib/offers';
import { showBreakdown } from '@/lib/overlays';
import { continuous, radius, space, useTheme } from '@/theme';
import { Rating } from './bits';
import { OfferRow } from './OfferRow';
import { PressableScale } from './PressableScale';
import { ProductTile } from './ProductTile';
import { SaveButton } from './SaveButton';
import { Text } from './Text';
import { Button } from './ui';

export interface ProductCardProps {
  product: Product;
  filters?: OfferFilters;
  /** Extra line under the offers, e.g. price movement on the Saved tab. */
  footnote?: ReactNode;
}

/**
 * A product with every retailer's price visible at once. Tapping the header
 * opens the detail screen; tapping an offer goes to that store.
 */
export const ProductCard = memo(function ProductCard({ product, filters = NO_FILTERS, footnote }: ProductCardProps) {
  const t = useTheme();
  const { c } = t;
  const router = useRouter();
  const client = useQueryClient();
  const view = useMemo(() => viewOffers(product, filters), [product, filters]);

  const open = useCallback(() => {
    seedProducts([product]);
    router.push({ pathname: '/product/[id]', params: { id: product.id } });
  }, [product, router]);
  const warm = useCallback(() => prefetchProduct(client, product.id), [client, product.id]);
  const onOffer = useCallback((offer: Offer) => goToStore(product, offer), [product]);
  const onBreakdown = useCallback((offer: Offer) => showBreakdown(product, offer), [product]);

  return (
    <View style={[styles.card, continuous, { backgroundColor: c.surface, borderColor: c.border }, t.shadow1]}>
      <View style={styles.header}>
        <PressableScale
          testID={`product-${product.id}`}
          onPress={open}
          onPressIn={warm}
          onHoverIn={warm}
          scaleTo={0.98}
          accessibilityLabel={`${product.title} by ${product.brand}. View details`}
          style={styles.headerPress}
        >
          <ProductTile imageUrl={product.imageUrl} category={product.category} title={product.title} size={76} />
          <View style={styles.headerText}>
            <Text variant="overline" tone="textTertiary" numberOfLines={1}>
              {product.brand}
            </Text>
            <Text variant="title3" numberOfLines={2} style={styles.title}>
              {product.title}
            </Text>
            <Rating rating={product.rating} count={product.reviewCount} />
          </View>
        </PressableScale>
        <SaveButton product={product} filled={false} />
      </View>

      {/* The server's wording, shown as sent: never parsed or reworded. */}
      {view.reason ? (
        <View style={[styles.reason, continuous, { backgroundColor: c.accentSoft }]}>
          <Ionicons name="sparkles" size={13} color={c.accentText} />
          <Text variant="footnote" tone="accentText" style={styles.reasonText} testID="recommendation-reason">
            {view.reason}
          </Text>
        </View>
      ) : null}

      <View style={styles.offers}>
        {view.offers.map((offer) => (
          <OfferRow
            key={offer.id}
            offer={offer}
            isCheapest={offer.id === view.cheapestId}
            isRecommended={offer.id === view.recommendedId}
            onPress={onOffer}
            onBreakdown={onBreakdown}
          />
        ))}
      </View>

      <View style={styles.footer}>
        {view.savings >= 0.01 ? (
          <View style={styles.savings}>
            <Ionicons name="trending-down" size={15} color={c.best} />
            <Text variant="footnoteStrong" tone="best">
              Save up to {moneyShort(view.savings)}
            </Text>
          </View>
        ) : (
          <Text variant="footnote" tone="textTertiary">
            {view.offers.length === 1 ? 'One store carries this' : view.bestPrice == null ? 'No comparable price' : 'Same price everywhere'}
          </Text>
        )}
        <Button label="Details" variant="tertiary" size="sm" trailingIcon="chevron-forward" onPress={open} accessibilityLabel={`Details for ${product.title}`} style={styles.detailsLink} />
      </View>
      {footnote}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, paddingBottom: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerPress: { flex: 1, flexDirection: 'row', gap: space.md, padding: 4, borderRadius: radius.md },
  headerText: { flex: 1, minWidth: 0, paddingTop: 2 },
  title: { marginTop: 2, marginBottom: 5 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: space.sm, marginHorizontal: 4, paddingHorizontal: space.sm + 2, paddingVertical: 7, borderRadius: radius.sm },
  reasonText: { flex: 1 },
  offers: { marginTop: space.sm, gap: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: space.sm + 2, paddingHorizontal: space.sm, minHeight: 34 },
  savings: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailsLink: { marginRight: -space.sm, marginVertical: -4 },
});
