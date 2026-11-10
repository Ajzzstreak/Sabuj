import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Platform, RefreshControl, ScrollView, StyleSheet, View, type ListRenderItem } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Product, RetailerId } from '@/api/contract';
import { useSearch } from '@/api/queries';
import { Button, Chip, RetailerMark } from '@/components/bits';
import { ProductCard } from '@/components/ProductCard';
import { Page, Screen, StackHeader } from '@/components/Screen';
import { SearchField, SuggestionList } from '@/components/Search';
import { ProductCardSkeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner, StateView } from '@/components/StateView';
import { Text } from '@/components/Text';
import { useLayout } from '@/hooks/useLayout';
import { useTypeahead } from '@/hooks/useTypeahead';
import { haptic } from '@/lib/haptics';
import { applyResultsView, type OfferFilters, type SortKey } from '@/lib/offers';
import { getRetailer, RETAILER_ORDER } from '@/lib/retailers';
import { track } from '@/lib/tracker';
import { addRecent } from '@/state';
import { layout, space, useTheme } from '@/theme';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'best', label: 'Best match' },
  { key: 'price', label: 'Lowest price' },
  { key: 'rating', label: 'Top rated' },
];
const GAP = space.lg;
const keyOf = (p: Product) => p.id;

export default function ResultsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? '';
  const { columns, gutter, width, contentWidth } = useLayout();
  const cellWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  const [text, setText] = useState(q);
  // True once the user has typed something that has not been submitted yet.
  const [dirty, setDirty] = useState(false);
  const [sort, setSort] = useState<SortKey>('best');
  const [retailers, setRetailers] = useState<RetailerId[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);

  const search = useSearch(q);
  const editing = dirty && text.trim().length > 0 && text.trim().toLowerCase() !== q.toLowerCase();
  const { suggestions } = useTypeahead(text, editing);

  useEffect(() => {
    setText(q);
    setDirty(false);
  }, [q]);
  const onChangeText = useCallback((value: string) => {
    setText(value);
    setDirty(true);
  }, []);

  // One `search` event per submitted query.
  useEffect(() => {
    if (q) track({ type: 'search', query: q });
  }, [q]);

  const submit = useCallback(
    (raw: string) => {
      const next = raw.trim();
      if (!next) return;
      Keyboard.dismiss();
      if (Platform.OS === 'web') (document.activeElement as HTMLElement | null)?.blur?.();
      setDirty(false);
      setText(next);
      addRecent(next);
      if (next.toLowerCase() !== q.toLowerCase()) {
        haptic.light();
        router.setParams({ q: next });
      }
    },
    [q, router],
  );

  const filters = useMemo<OfferFilters>(() => ({ retailers, inStockOnly }), [retailers, inStockOnly]);
  const all = search.data?.products;
  const products = useMemo(() => applyResultsView(all ?? [], sort, filters), [all, sort, filters]);
  const available = useMemo(() => {
    const present = new Set<RetailerId>();
    for (const p of all ?? []) for (const o of p.offers) present.add(o.retailerId);
    return RETAILER_ORDER.filter((id) => present.has(id));
  }, [all]);
  const filtered = retailers.length > 0 || inStockOnly;
  const resetFilters = () => {
    setRetailers([]);
    setInStockOnly(false);
  };
  const toggleRetailer = (id: RetailerId) => {
    haptic.selection();
    setRetailers((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const side = Math.max(gutter, (width - layout.maxContentWidth) / 2 + gutter);
  const renderItem = useCallback<ListRenderItem<Product>>(
    ({ item }) => (
      <View style={columns > 1 ? [styles.cell, { width: cellWidth }] : styles.cellSingle}>
        <ProductCard product={item} filters={filters} />
      </View>
    ),
    [columns, filters, cellWidth],
  );

  // Previous results stay visible (dimmed) while a new query loads.
  const stale = search.isPlaceholderData;
  const firstLoad = search.isPending && q !== '';

  const header = (
    <View style={styles.listHeader}>
      <OfflineBanner />
      <View style={styles.meta}>
        <Text variant="title1" accessibilityRole="header" numberOfLines={2} style={{ flexShrink: 1 }}>
          {q ? `“${q}”` : 'Search'}
        </Text>
      </View>
      {search.data && !stale ? (
        <View style={styles.subMeta}>
          <Text variant="callout" tone="textSecondary">
            {products.length === search.data.products.length
              ? `${products.length} ${products.length === 1 ? 'product' : 'products'}`
              : `${products.length} of ${search.data.products.length} products`}{' '}
            · {search.data.cached ? 'instant' : `${Math.max(1, Math.round(search.data.tookMs))} ms`}
          </Text>
          {search.data.personalized ? (
            <View style={styles.personalized}>
              <Ionicons name="sparkles" size={13} color={c.accentText} />
              <Text variant="footnoteStrong" tone="accentText">
                Ordered for you
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text variant="callout" tone="textSecondary" style={styles.subMeta}>
          {!q ? 'Type a product to compare prices.' : search.isError ? 'Could not load results.' : 'Comparing stores…'}
        </Text>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -side }}
        contentContainerStyle={[styles.controls, { paddingHorizontal: side }]}
        keyboardShouldPersistTaps="handled"
      >
        <View accessibilityRole="radiogroup" accessibilityLabel="Sort by" style={[styles.segment, { backgroundColor: c.fill }]}>
          {SORTS.map((s) => (
            <Chip
              key={s.key}
              role="radio"
              label={s.label}
              selected={sort === s.key}
              onPress={() => {
                haptic.selection();
                setSort(s.key);
              }}
              style={[styles.segmentItem, sort !== s.key && styles.segmentIdle]}
            />
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: c.borderStrong }]} />
        <Chip
          role="checkbox"
          label="In stock"
          icon={inStockOnly ? 'checkmark' : 'cube-outline'}
          selected={inStockOnly}
          onPress={() => {
            haptic.selection();
            setInStockOnly((v) => !v);
          }}
          accessibilityLabel="In stock only"
        />
        {available.map((id) => (
          <Chip
            key={id}
            role="checkbox"
            label={getRetailer(id).name}
            selected={retailers.includes(id)}
            onPress={() => toggleRetailer(id)}
            leading={<RetailerMark id={id} size={18} />}
            accessibilityLabel={`Only ${getRetailer(id).name}`}
          />
        ))}
      </ScrollView>
    </View>
  );

  const empty = firstLoad ? (
    <View style={[styles.skeletonGrid, { gap: GAP }]}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={{ width: columns > 1 ? cellWidth : '100%' }}>
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  ) : search.isError ? (
    <ErrorState error={search.error} onRetry={() => void search.refetch()} />
  ) : !q ? undefined : filtered ? (
    <StateView
      icon="funnel-outline"
      title="Nothing matches these filters"
      detail="Try another store or include out-of-stock offers."
      action={<Button label="Clear filters" kind="secondary" onPress={resetFilters} />}
    />
  ) : (
    <StateView icon="search-outline" title={`No results for “${q}”`} detail="Check the spelling or try a more general term, like the product type." />
  );

  return (
    <Screen>
      <StackHeader>
        <SearchField value={text} onChangeText={onChangeText} onSubmit={submit} />
      </StackHeader>
      <View style={styles.body}>
        <FlatList
          key={columns}
          data={search.isError && !search.data ? [] : products}
          keyExtractor={keyOf}
          renderItem={renderItem}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={[styles.list, { paddingHorizontal: side }]}
          style={stale ? styles.stale : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={columns * 3}
          maxToRenderPerBatch={columns * 3}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={search.isRefetching && !stale} onRefresh={() => void search.refetch()} tintColor={c.textTertiary} />}
        />
        {editing ? (
          <Animated.View entering={FadeIn.duration(120)} style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Page>
                <SuggestionList query={text} suggestions={suggestions} onPick={submit} />
              </Page>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  list: { paddingBottom: space.xxxl },
  stale: { opacity: 0.55 },
  listHeader: { paddingTop: space.sm, paddingBottom: space.lg },
  meta: { flexDirection: 'row', alignItems: 'center' },
  subMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 4, marginTop: 4 },
  personalized: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controls: { alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingBottom: 2 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 3, gap: 2 },
  segmentItem: { minHeight: 36 },
  segmentIdle: { backgroundColor: 'transparent', borderColor: 'transparent' },
  divider: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 4 },
  cell: { marginBottom: GAP },
  cellSingle: { marginBottom: GAP },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap' },
});
