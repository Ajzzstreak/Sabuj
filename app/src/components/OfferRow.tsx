import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Offer } from '@/api/contract';
import { breakdownLine, money, relativeTime, shippingNote } from '@/lib/format';
import { hasPrice } from '@/lib/offers';
import { getRetailer } from '@/lib/retailers';
import { continuous, layout, radius, space, useTheme } from '@/theme';
import { RetailerMark } from './bits';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { Badge } from './ui';

export interface OfferRowProps {
  offer: Offer;
  isCheapest: boolean;
  isRecommended: boolean;
  /** Opens the retailer's page. */
  onPress: (offer: Offer) => void;
  /** Opens the "how this total is made up" sheet. */
  onBreakdown: (offer: Offer) => void;
  /** `table` is the roomier detail-screen row with list price, delivery and the breakdown spelled out. */
  density?: 'compact' | 'table';
}

/**
 * One retailer's offer. Two targets side by side: the store (opens its page)
 * and the price (opens the item + shipping + est. tax breakdown).
 *
 * Rules that must hold here:
 * - the price shown is `landedPrice`;
 * - a 'link_only' offer shows "Check price" and never a number;
 * - an ineligible offer is dimmed, says "Membership required", and the caller
 *   never passes isCheapest for it (see viewOffers).
 */
export const OfferRow = memo(function OfferRow({ offer, isCheapest, isRecommended, onPress, onBreakdown, density = 'compact' }: OfferRowProps) {
  const { c } = useTheme();
  const retailer = getRetailer(offer.retailerId);
  const table = density === 'table';
  const out = !offer.inStock;
  const priced = hasPrice(offer);
  const locked = !offer.eligible;
  const dim = out || locked;

  const notes: string[] = [];
  if (locked) notes.push('Membership required');
  else if (offer.membershipRequired) notes.push(table ? 'Member price' : 'Member');
  if (out) notes.push('Out of stock');
  else if (!priced) notes.push('No price available here');
  else {
    notes.push(shippingNote(offer));
    if (offer.delivery) notes.push(offer.delivery);
  }
  const tint = isCheapest ? c.bestSoft : isRecommended ? c.accentSoft : 'transparent';
  const asOf = priced && offer.priceSource === 'live' ? `as of ${relativeTime(offer.observedAt)}` : null;

  const label = [
    retailer.name,
    !priced ? 'check price at the store' : `${money(offer.landedPrice)} total`,
    ...notes,
    isCheapest ? 'best price' : null,
    isRecommended ? 'picked for you' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.wrap, continuous, { backgroundColor: tint }]}>
      <View style={[styles.row, table && styles.rowTable]}>
        <PressableScale
          testID={`offer-${offer.retailerId}`}
          onPress={() => onPress(offer)}
          scaleTo={0.985}
          accessibilityRole="link"
          accessibilityLabel={label}
          accessibilityHint={`Opens ${retailer.name}`}
          style={[styles.store, table && styles.storeTable]}
        >
          <View style={dim && styles.dim}>
            <RetailerMark id={offer.retailerId} size={table ? 32 : 26} />
          </View>
          <View style={styles.middle}>
            <View style={styles.nameLine}>
              <Text variant={table ? 'bodyStrong' : 'calloutStrong'} numberOfLines={1} style={[styles.name, dim && styles.dim]}>
                {retailer.name}
              </Text>
              <Ionicons name="open-outline" size={12} color={c.textTertiary} />
              {isCheapest ? <Badge kind="best" label="Best price" /> : null}
              {isRecommended ? <Badge kind="accent" label="For you" icon="sparkles" /> : null}
            </View>
            <View style={styles.noteLine}>
              {locked ? <Ionicons name="lock-closed" size={11} color={c.textSecondary} style={styles.noteIcon} /> : null}
              <Text variant="caption" tone={out && !locked ? 'danger' : 'textSecondary'} numberOfLines={table ? 2 : 1} style={styles.note}>
                {notes.join(' · ')}
              </Text>
            </View>
          </View>
          {!priced ? (
            <View style={styles.check} testID={`offer-check-${offer.retailerId}`}>
              <Text variant="calloutStrong" tone="accentText">
                Check price
              </Text>
              <Ionicons name="chevron-forward" size={14} color={c.accentText} />
            </View>
          ) : null}
        </PressableScale>

        {priced ? (
          <PressableScale
            testID={`offer-price-${offer.retailerId}`}
            onPress={() => onBreakdown(offer)}
            scaleTo={0.96}
            accessibilityLabel={`${money(offer.landedPrice)} total at ${retailer.name}. Show price breakdown`}
            style={styles.priceCol}
          >
            <View style={[styles.priceLine, dim && styles.dim]}>
              <Text variant={table ? 'priceLarge' : 'price'} tone={isCheapest ? 'best' : 'text'} style={out && styles.strike}>
                {money(offer.landedPrice)}
              </Text>
              <Ionicons name="information-circle-outline" size={14} color={c.textTertiary} />
            </View>
            {table && offer.listPrice != null && offer.listPrice > offer.price ? (
              <Text variant="caption" tone="textTertiary" style={styles.strike}>
                {money(offer.listPrice)}
              </Text>
            ) : null}
            {asOf ? (
              <Text variant="caption" tone="textTertiary" numberOfLines={1}>
                {asOf}
              </Text>
            ) : table && offer.priceSource === 'demo' ? (
              <Text variant="caption" tone="textTertiary">
                Demo price
              </Text>
            ) : null}
          </PressableScale>
        ) : null}
      </View>
      {table && priced ? (
        <Text variant="caption" tone="textSecondary" style={styles.breakdown} testID={`offer-breakdown-${offer.retailerId}`}>
          {breakdownLine(offer)}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: space.sm, paddingRight: 2 },
  rowTable: { paddingLeft: space.md, paddingRight: space.xs },
  store: { flex: 1, minWidth: 0, minHeight: layout.minTouch + 2, flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingVertical: 5, borderRadius: radius.sm },
  storeTable: { minHeight: 60, gap: space.md, paddingVertical: space.sm },
  middle: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  noteLine: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  noteIcon: { marginRight: 4 },
  note: { flexShrink: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: space.sm },
  priceCol: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.sm },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dim: { opacity: 0.45 },
  strike: { textDecorationLine: 'line-through' },
  breakdown: { paddingLeft: space.md + 32 + space.md, paddingRight: space.md, paddingBottom: space.sm, marginTop: -2 },
});
