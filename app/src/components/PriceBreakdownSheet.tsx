import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { goToStore } from '@/lib/actions';
import { money, relativeTime } from '@/lib/format';
import { breakdownSheet } from '@/lib/overlays';
import { getRetailer } from '@/lib/retailers';
import { shopperStore } from '@/state';
import { space, useTheme } from '@/theme';
import { RetailerMark } from './bits';
import { Text } from './Text';
import { Banner, Button, Sheet } from './ui';

function Line({ label, value, note, strong, testID }: { label: string; value: string; note?: string; strong?: boolean; testID?: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineText}>
        <Text variant={strong ? 'bodyStrong' : 'body'}>{label}</Text>
        {note ? (
          <Text variant="footnote" tone="textSecondary">
            {note}
          </Text>
        ) : null}
      </View>
      <Text variant={strong ? 'priceLarge' : 'price'} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

/** Item + shipping + estimated tax = total, for the offer whose price was tapped. Mounted once at the root. */
export function PriceBreakdownSheet() {
  const { c } = useTheme();
  const router = useRouter();
  const open = breakdownSheet.use();
  const zip = shopperStore.use((s) => s.zip);
  const close = () => breakdownSheet.set(null);
  if (!open) return null;
  const { product, offer } = open;
  const retailer = getRetailer(offer.retailerId);
  return (
    <Sheet
      visible
      onClose={close}
      title="Price breakdown"
      testID="breakdown-sheet"
      footer={
        <Button
          label={`Go to ${retailer.name}`}
          trailingIcon="open-outline"
          size="lg"
          fullWidth
          accessibilityRole="link"
          style={styles.grow}
          onPress={() => {
            close();
            goToStore(product, offer);
          }}
        />
      }
    >
      <View style={styles.store}>
        <RetailerMark id={offer.retailerId} size={24} />
        <Text variant="calloutStrong" numberOfLines={1} style={styles.grow}>
          {retailer.name}
        </Text>
        <Text variant="footnote" tone="textSecondary">
          {offer.priceSource === 'demo' ? 'Demo price' : `as of ${relativeTime(offer.observedAt)}`}
        </Text>
      </View>
      <Line label="Item" value={money(offer.price)} testID="breakdown-item" />
      <Line
        label="Shipping"
        value={offer.shipping == null ? '—' : offer.shipping === 0 ? 'Free' : money(offer.shipping)}
        note={offer.shipping == null ? 'Not known. The store shows it at checkout.' : undefined}
        testID="breakdown-shipping"
      />
      <Line
        label="Estimated tax"
        value={offer.estimatedTax == null ? '—' : money(offer.estimatedTax)}
        note={offer.estimatedTax == null ? 'Not estimated: no ZIP code set.' : `An estimate for ZIP ${zip ?? 'you entered'}. The store's checkout is final.`}
        testID="breakdown-tax"
      />
      <View style={[styles.rule, { backgroundColor: c.borderStrong }]} />
      <Line label="Total" value={money(offer.landedPrice)} strong testID="breakdown-total" />
      {!offer.eligible ? (
        <Banner tone="info" icon="lock-closed-outline" compact text="Membership required. You told us you do not hold this one, so it is never marked best price." style={styles.note} />
      ) : null}
      {offer.estimatedTax == null ? (
        <Banner
          tone="info"
          compact
          text="Add a ZIP code to include estimated sales tax in every total."
          action={{
            label: 'Shopping settings',
            onPress: () => {
              close();
              router.navigate('/profile');
            },
          }}
          style={styles.note}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  store: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingVertical: 4 },
  lineText: { flex: 1, minWidth: 0 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  note: { marginTop: space.md },
});
