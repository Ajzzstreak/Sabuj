import { Ionicons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { productOptions } from '@/api/queries';
import { Button } from '@/components/bits';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { OfflineBanner, StateView } from '@/components/StateView';
import { Text } from '@/components/Text';
import { useLayout } from '@/hooks/useLayout';
import { toSnapshot } from '@/lib/actions';
import { moneyShort } from '@/lib/format';
import { useDeviceId } from '@/lib/deviceId';
import { bestTotal, refreshSaved, savedStore, type SavedItem } from '@/state';
import { layout, space, useTheme } from '@/theme';

const GAP = space.lg;
const keyOf = (item: SavedItem) => item.product.id;

export default function SavedScreen() {
  const router = useRouter();
  const deviceId = useDeviceId();
  const { columns, gutter, width, contentWidth, isPhone } = useLayout();
  const saved = savedStore.use();
  const items = useMemo(() => Object.values(saved).sort((a, b) => b.savedAt - a.savedAt), [saved]);
  const ids = useMemo(() => items.map((i) => i.product.id), [items]);

  // The list renders from local snapshots; prices are refreshed quietly in the background.
  const fresh = useQueries({
    queries: ids.map((id) => ({ ...productOptions(deviceId, id), enabled: deviceId !== '', staleTime: 5 * 60_000, retry: false })),
  });
  const freshKey = fresh.map((q) => q.dataUpdatedAt).join(',');
  useEffect(() => {
    for (const q of fresh) if (q.data) refreshSaved(toSnapshot(q.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey]);

  const cellWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);
  const side = Math.max(gutter, (width - layout.maxContentWidth) / 2 + gutter);
  const renderItem = useCallback<ListRenderItem<SavedItem>>(
    ({ item }) => (
      <View style={{ width: columns > 1 ? cellWidth : undefined, marginBottom: GAP }}>
        <ProductCard product={item.product} footnote={<PriceMove item={item} />} />
      </View>
    ),
    [columns, cellWidth],
  );

  return (
    <Screen topInset={isPhone}>
      <FlatList
        key={columns}
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
        contentContainerStyle={[styles.list, { paddingHorizontal: side }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="display" accessibilityRole="header">
              Saved
            </Text>
            <Text variant="body" tone="textSecondary" style={styles.sub}>
              {items.length > 0
                ? `${items.length} ${items.length === 1 ? 'product' : 'products'} on your watchlist, kept on this device.`
                : 'Your watchlist lives on this device.'}
            </Text>
            <OfflineBanner />
          </View>
        }
        ListEmptyComponent={
          <StateView
            icon="bookmark-outline"
            title="Nothing saved yet"
            detail="Tap the bookmark on any product to keep an eye on its prices here."
            action={<Button label="Find something" icon="search" onPress={() => router.navigate('/')} />}
          />
        }
        initialNumToRender={columns * 3}
        windowSize={7}
      />
    </Screen>
  );
}

/** How the best price has moved since the product was saved. */
function PriceMove({ item }: { item: SavedItem }) {
  const { c } = useTheme();
  const now = bestTotal(item.product);
  const then = item.priceWhenSaved;
  if (now == null || then == null || Math.abs(now - then) < 0.01) return null;
  const down = now < then;
  return (
    <View style={[styles.move, { borderTopColor: c.border }]}>
      <Ionicons name={down ? 'arrow-down' : 'arrow-up'} size={14} color={down ? c.best : c.textSecondary} />
      <Text variant="footnoteStrong" tone={down ? 'best' : 'textSecondary'}>
        {down ? 'Down' : 'Up'} {moneyShort(Math.abs(now - then))} since you saved it
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.xxxl, flexGrow: 1 },
  header: { paddingTop: space.xxl, paddingBottom: space.xl },
  sub: { marginTop: 6, marginBottom: space.md },
  move: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: space.sm + 2, paddingTop: space.sm + 2, marginHorizontal: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
