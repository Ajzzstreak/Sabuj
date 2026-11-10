import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Offer } from '@/api/contract';
import { money, shippingNote } from '@/lib/format';
import { getRetailer } from '@/lib/retailers';
import { continuous, layout, radius, space, useTheme } from '@/theme';
import { Pill, RetailerMark } from './bits';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface OfferRowProps {
  offer: Offer;
  isCheapest: boolean;
  isRecommended: boolean;
  onPress: (offer: Offer) => void;
  /** `table` is the roomier detail-screen row with list price and delivery. */
  density?: 'compact' | 'table';
}

/** One retailer's price. The whole row opens that retailer's page. */
export const OfferRow = memo(function OfferRow({ offer, isCheapest, isRecommended, onPress, density = 'compact' }: OfferRowProps) {
  const { c } = useTheme();
  const retailer = getRetailer(offer.retailerId);
  const table = density === 'table';
  const out = !offer.inStock;

  const notes: string[] = [];
  if (out) notes.push('Out of stock');
  else {
    notes.push(shippingNote(offer));
    if (offer.delivery) notes.push(offer.delivery);
  }
  const tint = isCheapest ? c.bestSoft : isRecommended ? c.accentSoft : 'transparent';

  const label = [
    retailer.name,
    out ? 'out of stock' : `${money(offer.totalPrice)} total`,
    out ? null : shippingNote(offer),
    offer.delivery && !out ? `delivery ${offer.delivery}` : null,
    offer.membershipRequired ? 'membership required' : null,
    isCheapest ? 'best price' : null,
    isRecommended ? 'picked for you' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      testID={`offer-${offer.retailerId}`}
      onPress={() => onPress(offer)}
      scaleTo={0.985}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={`Opens ${retailer.name}`}
      style={[styles.row, continuous, table && styles.rowTable, { backgroundColor: tint }]}
    >
      <View style={out && styles.dim}>
        <RetailerMark id={offer.retailerId} size={table ? 32 : 26} />
      </View>
      <View style={styles.middle}>
        <View style={styles.nameLine}>
          <Text variant={table ? 'bodyStrong' : 'calloutStrong'} numberOfLines={1} style={[styles.name, out && styles.dim]}>
            {retailer.name}
          </Text>
          {isCheapest ? <Pill kind="best" label="Best price" /> : null}
          {isRecommended ? <Pill kind="foryou" label="For you" icon="sparkles" /> : null}
        </View>
        <View style={styles.noteLine}>
          {offer.membershipRequired ? (
            <View style={styles.member}>
              <Ionicons name="card-outline" size={12} color={c.textSecondary} />
              <Text variant="caption" tone="textSecondary">
                Member
              </Text>
              <Text variant="caption" tone="textTertiary">
                ·
              </Text>
            </View>
          ) : null}
          <Text variant="caption" tone={out ? 'danger' : 'textSecondary'} numberOfLines={1} style={styles.note}>
            {notes.join(' · ')}
          </Text>
        </View>
      </View>
      <View style={[styles.priceCol, out && styles.dim]}>
        <Text variant={table ? 'priceLarge' : 'price'} tone={isCheapest ? 'best' : 'text'} style={out && styles.strike}>
          {money(offer.totalPrice)}
        </Text>
        {table && offer.listPrice != null && offer.listPrice > offer.price ? (
          <Text variant="caption" tone="textTertiary" style={styles.strike}>
            {money(offer.listPrice)}
          </Text>
        ) : null}
        {table && offer.shipping != null && offer.shipping > 0 ? (
          <Text variant="caption" tone="textTertiary">
            {money(offer.price)} + ship
          </Text>
        ) : null}
      </View>
      <Ionicons name="arrow-up-outline" size={14} color={c.textTertiary} style={styles.arrow} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTouch + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.sm + 2,
  },
  rowTable: { minHeight: 60, paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.md },
  middle: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  noteLine: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 4 },
  note: { flexShrink: 1 },
  priceCol: { alignItems: 'flex-end' },
  dim: { opacity: 0.5 },
  strike: { textDecorationLine: 'line-through' },
  arrow: { transform: [{ rotate: '45deg' }] },
});
