import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Offer, Product, ProductDetail } from '@/api/contract';
import { getSeed, useProduct } from '@/api/queries';
import { Button, Card, Pill, Rating, RetailerMark } from '@/components/bits';
import { OfferRow } from '@/components/OfferRow';
import { PriceChart } from '@/components/PriceChart';
import { ProductTile } from '@/components/ProductTile';
import { SaveButton } from '@/components/SaveButton';
import { Page, Screen, StackHeader } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner } from '@/components/StateView';
import { Text } from '@/components/Text';
import { useLayout } from '@/hooks/useLayout';
import { goToStore, toSnapshot } from '@/lib/actions';
import { money, moneyShort, shippingNote } from '@/lib/format';
import { viewOffers } from '@/lib/offers';
import { getRetailer } from '@/lib/retailers';
import { track } from '@/lib/tracker';
import { refreshSaved, savedStore } from '@/state';
import { radius, space, useTheme } from '@/theme';

export default function ProductScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const { isDesktop } = useLayout();
  const query = useProduct(id);
  const detail: ProductDetail | undefined = query.data;
  // Paint at once from what a list already showed (or the saved snapshot) while the full record loads.
  const product: Product | undefined = detail ?? getSeed(id) ?? savedStore.get()[id]?.product;

  const known = product != null;
  const category = product?.category;
  const brand = product?.brand;
  useEffect(() => {
    if (id && known) track({ type: 'product_view', productId: id, category, brand });
    // One event per product opened, sent once its category and brand are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, known]);

  useEffect(() => {
    if (detail) refreshSaved(toSnapshot(detail));
  }, [detail]);

  const onOffer = useCallback((offer: Offer) => product && goToStore(product, offer), [product]);

  let body: ReactNode;
  if (!product) {
    body = query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <DetailSkeleton wide={isDesktop} />;
  } else {
    const tile = (
      <ProductTile imageUrl={product.imageUrl} category={product.category} title={product.title} style={isDesktop ? styles.tileWide : styles.tile} corner={radius.xl} glyphSize={isDesktop ? 120 : 84} />
    );
    const title = (
      <View style={styles.titleBlock}>
        <Text variant="overline" tone="textTertiary">
          {product.brand} · {product.category}
        </Text>
        <Text variant="title1" accessibilityRole="header" style={styles.title}>
          {product.title}
        </Text>
        <Rating rating={product.rating} count={product.reviewCount} size="md" />
      </View>
    );
    const loadingRest = !detail && !query.isError;
    const failedRest = !detail && query.isError;

    const offers = (
      <Section title="Compare prices" subtitle={`${product.offers.length} ${product.offers.length === 1 ? 'store' : 'stores'} · totals include shipping`}>
        <OffersTable product={product} onOffer={onOffer} />
      </Section>
    );
    const history = (
      <Section title="Price history">
        <Card>
          {detail ? (
            <PriceChart history={detail.priceHistory} />
          ) : failedRest ? (
            <ErrorState compact error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <Skeleton height={230} corner={radius.md} />
          )}
        </Card>
      </Section>
    );
    const highlights =
      product.highlights.length > 0 ? (
        <Section title="Highlights">
          <View style={styles.highlights}>
            {product.highlights.map((h) => (
              <Highlight key={h} label={h} />
            ))}
          </View>
        </Section>
      ) : null;
    const reviews = detail?.reviewSummary ? (
      <Section title="What reviewers say">
        <View style={[styles.proscons, isDesktop && styles.prosconsWide]}>
          <ProsCons kind="pros" items={detail.reviewSummary.pros} />
          <ProsCons kind="cons" items={detail.reviewSummary.cons} />
        </View>
      </Section>
    ) : loadingRest ? (
      <Section title="What reviewers say">
        <Skeleton height={120} corner={radius.lg} />
      </Section>
    ) : null;
    const about = detail?.description ? (
      <Section title="About this product">
        <Text variant="body" tone="textSecondary">
          {detail.description}
        </Text>
      </Section>
    ) : loadingRest ? (
      <Section title="About this product">
        <View style={{ gap: 9 }}>
          <Skeleton height={13} />
          <Skeleton height={13} width="94%" />
          <Skeleton height={13} width="70%" />
        </View>
      </Section>
    ) : null;

    body = isDesktop ? (
      <View style={styles.columns}>
        <View style={styles.left}>
          {tile}
          {highlights}
          {about}
        </View>
        <View style={styles.right}>
          {title}
          <BuyBox product={product} onOffer={onOffer} />
          {offers}
          {history}
          {reviews}
        </View>
      </View>
    ) : (
      <>
        {tile}
        {title}
        <BuyBox product={product} onOffer={onOffer} />
        {offers}
        {history}
        {highlights}
        {reviews}
        {about}
      </>
    );
  }

  return (
    <Screen>
      <StackHeader right={product ? <SaveButton product={product} /> : undefined} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Page>
          <OfflineBanner />
          <Animated.View entering={FadeIn.duration(160)}>{body}</Animated.View>
        </Page>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** The headline answer: the lowest total, where, and a button that goes there. */
function BuyBox({ product, onOffer }: { product: Product; onOffer: (o: Offer) => void }) {
  const { c } = useTheme();
  const view = useMemo(() => viewOffers(product), [product]);
  const best = view.offers.find((o) => o.id === view.cheapestId) ?? null;
  const pick = view.offers.find((o) => o.id === view.recommendedId) ?? null;

  if (!best) {
    const first = product.offers[0];
    return (
      <Card style={styles.buy}>
        <Pill kind="danger" label="Out of stock everywhere" />
        <Text variant="body" tone="textSecondary" style={{ marginTop: space.sm }}>
          No store has this in stock right now. Save it and check back.
        </Text>
        {first ? (
          <Button testID="go-to-store" kind="secondary" label={`View at ${getRetailer(first.retailerId).name}`} trailingIcon="open-outline" onPress={() => onOffer(first)} style={styles.cta} />
        ) : null}
      </Card>
    );
  }
  const store = getRetailer(best.retailerId);
  return (
    <Card style={styles.buy}>
      <View style={styles.bestLabel}>
        <Ionicons name="checkmark-circle" size={16} color={c.best} />
        <Text variant="overline" tone="best">
          Best price
        </Text>
      </View>
      <View style={styles.priceLine}>
        <Text variant="priceHero">{money(best.totalPrice)}</Text>
        {best.listPrice != null && best.listPrice > best.price ? (
          <Text variant="body" tone="textTertiary" style={styles.strike}>
            {money(best.listPrice)}
          </Text>
        ) : null}
      </View>
      <View style={styles.at}>
        <RetailerMark id={best.retailerId} size={20} />
        <Text variant="callout" tone="textSecondary" style={{ flex: 1 }}>
          <Text variant="calloutStrong">{store.name}</Text> · {shippingNote(best)}
          {best.delivery ? ` · ${best.delivery}` : ''}
          {best.membershipRequired ? ' · Membership required' : ''}
        </Text>
      </View>
      {view.savings >= 0.01 ? (
        <Text variant="calloutStrong" tone="best" style={{ marginTop: space.sm }}>
          Save up to {moneyShort(view.savings)} compared with the highest price
        </Text>
      ) : null}
      <Button
        testID="go-to-store"
        label={`Go to ${store.name}`}
        trailingIcon="open-outline"
        accessibilityHint="Opens the store's product page"
        onPress={() => onOffer(best)}
        style={styles.cta}
      />

      {pick ? (
        <View style={[styles.pick, { borderTopColor: c.border }]}>
          <View style={styles.pickHead}>
            <Pill kind="foryou" label="Picked for you" icon="sparkles" />
          </View>
          {view.reason ? (
            <Text variant="callout" tone="textSecondary" style={{ marginTop: 6 }}>
              {view.reason}
            </Text>
          ) : null}
          <Button
            kind="secondary"
            label={`${getRetailer(pick.retailerId).name} · ${money(pick.totalPrice)}`}
            trailingIcon="open-outline"
            accessibilityLabel={`Go to ${getRetailer(pick.retailerId).name}, ${money(pick.totalPrice)}`}
            onPress={() => onOffer(pick)}
            style={{ marginTop: space.md }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function OffersTable({ product, onOffer }: { product: Product; onOffer: (o: Offer) => void }) {
  const { c } = useTheme();
  const view = useMemo(() => viewOffers(product), [product]);
  return (
    <Card padded={false} style={styles.table}>
      {view.offers.map((offer, i) => (
        <View key={offer.id} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          <View style={styles.tableRow}>
            <OfferRow density="table" offer={offer} isCheapest={offer.id === view.cheapestId} isRecommended={offer.id === view.recommendedId} onPress={onOffer} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function Highlight({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.highlight, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Ionicons name="checkmark" size={14} color={c.accentText} />
      <Text variant="calloutStrong">{label}</Text>
    </View>
  );
}

function ProsCons({ kind, items }: { kind: 'pros' | 'cons'; items: string[] }) {
  const { c } = useTheme();
  if (items.length === 0) return null;
  const pros = kind === 'pros';
  return (
    <Card style={styles.pc}>
      <Text variant="overline" tone="textSecondary" style={{ marginBottom: space.sm }}>
        {pros ? 'People like' : 'Watch out for'}
      </Text>
      {items.map((item) => (
        <View key={item} style={styles.pcRow}>
          <Ionicons name={pros ? 'add-circle' : 'remove-circle'} size={17} color={pros ? c.accentText : c.textTertiary} style={{ marginTop: 3 }} />
          <Text variant="body" style={{ flex: 1 }}>
            {item}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function DetailSkeleton({ wide }: { wide: boolean }) {
  return (
    <View style={wide ? styles.columns : undefined} accessibilityLabel="Loading product" accessibilityRole="progressbar">
      <View style={wide ? styles.left : undefined}>
        <Skeleton height={wide ? 380 : 220} corner={radius.xl} />
      </View>
      <View style={wide ? styles.right : { marginTop: space.xl }}>
        <Skeleton width="30%" height={11} />
        <Skeleton width="85%" height={26} style={{ marginTop: 12 }} />
        <Skeleton width="45%" height={14} style={{ marginTop: 12 }} />
        <Skeleton height={190} corner={radius.lg} style={{ marginTop: space.xl }} />
        <Skeleton height={300} corner={radius.lg} style={{ marginTop: space.xl }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl + space.lg },
  columns: { flexDirection: 'row', gap: space.xxxl, alignItems: 'flex-start', paddingTop: space.sm },
  left: { flex: 5, minWidth: 0 },
  right: { flex: 6, minWidth: 0 },
  tile: { width: '100%', height: 220 },
  tileWide: { width: '100%', aspectRatio: 1.15 },
  titleBlock: { marginTop: space.xl },
  title: { marginTop: 6, marginBottom: space.sm + 2 },
  buy: { marginTop: space.xl, padding: space.xl },
  bestLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, marginTop: 4 },
  strike: { textDecorationLine: 'line-through' },
  at: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  cta: { marginTop: space.lg },
  pick: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  pickHead: { flexDirection: 'row' },
  section: { marginTop: space.xxl + 4 },
  sectionBody: { marginTop: space.md },
  table: { padding: 6 },
  tableRow: { paddingVertical: 3 },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  proscons: { gap: space.md },
  prosconsWide: { flexDirection: 'row', alignItems: 'stretch' },
  pc: { flex: 1 },
  pcRow: { flexDirection: 'row', gap: space.sm, marginTop: 6 },
});
