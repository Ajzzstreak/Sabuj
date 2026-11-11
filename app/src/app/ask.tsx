import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Platform, StyleSheet, View, type ListRenderItem } from 'react-native';
import type { AskInterpretation, Product, RetailerId } from '@/api/contract';
import { ASK_MAX_CHARS, useAsk, useSearch } from '@/api/queries';
import { RetailerMark } from '@/components/bits';
import { DemoNotice } from '@/components/DemoNotice';
import { ProductCard } from '@/components/ProductCard';
import { Screen, StackHeader } from '@/components/Screen';
import { SearchField } from '@/components/Search';
import { ProductCardSkeleton, Skeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner } from '@/components/StateView';
import { Text } from '@/components/Text';
import { Badge, Banner, Button, Chip, EmptyState, SegmentedControl, Sheet, TextField } from '@/components/ui';
import { ASK_EXAMPLES } from '@/content/ask';
import { useLayout } from '@/hooks/useLayout';
import { moneyShort } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { applyResultsView, type OfferFilters, type SortKey } from '@/lib/offers';
import { getRetailer, RETAILER_ORDER } from '@/lib/retailers';
import { track } from '@/lib/tracker';
import { layout, space } from '@/theme';

type Sort = AskInterpretation['sort'];
const SORT_LABEL: Record<Sort, string> = { best_match: 'Best match', lowest_price: 'Lowest price', top_rated: 'Top rated' };
const SORT_KEY: Record<Sort, SortKey> = { best_match: 'best', lowest_price: 'price', top_rated: 'rating' };
const SORT_OPTIONS = (Object.keys(SORT_LABEL) as Sort[]).map((key) => ({ key, label: SORT_LABEL[key] }));
const RATINGS = [null, 3, 3.5, 4, 4.5] as const;
const GAP = space.lg;
const keyOf = (p: Product) => p.id;

/**
 * Plain-English search (POST /v1/ask). Reached only by an explicit choice
 * (the sparkle button, an "Ask" row or an example); typing and pressing Enter
 * anywhere stays on the fast keyword path.
 *
 * The server's reading of the request is shown as chips. Editing one stops
 * using the /ask result: the edited keyword query runs on /v1/search and the
 * other constraints are applied on the device, so an edit is instant and
 * never waits on the model again.
 */
export default function AskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string }>();
  const asked = ((Array.isArray(params.text) ? params.text[0] : params.text) ?? '').trim().slice(0, ASK_MAX_CHARS);
  const { columns, gutter, width, contentWidth } = useLayout();
  const cellWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);
  const side = Math.max(gutter, (width - layout.maxContentWidth) / 2 + gutter);

  const [text, setText] = useState(asked);
  const [edited, setEdited] = useState<AskInterpretation | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setText(asked);
    setEdited(null);
  }, [asked]);

  const ask = useAsk(asked);
  const understood = ask.data?.interpretation ?? null;
  const interp = edited ?? understood;
  // Only once the user has edited the interpretation: the fast keyword path.
  const search = useSearch(edited?.query ?? '', edited != null);

  const submit = useCallback(
    (raw: string) => {
      const next = raw.trim().slice(0, ASK_MAX_CHARS);
      if (!next) return;
      Keyboard.dismiss();
      if (Platform.OS === 'web') (document.activeElement as HTMLElement | null)?.blur?.();
      haptic.light();
      if (next !== asked) router.setParams({ text: next });
      else setEdited(null);
    },
    [asked, router],
  );

  // One `search` event per keyword query actually run (the existing event type; no new ones).
  const ranQuery = interp?.query ?? '';
  useEffect(() => {
    if (ranQuery) track({ type: 'search', query: ranQuery });
  }, [ranQuery]);

  const filters = useMemo<OfferFilters>(() => ({ retailers: edited?.retailers ?? [], inStockOnly: false }), [edited]);
  const products = useMemo(() => {
    if (!edited) return ask.data?.products ?? [];
    return applyResultsView(search.data?.products ?? [], SORT_KEY[edited.sort], filters, { maxPrice: edited.maxPrice, minRating: edited.minRating });
  }, [edited, ask.data, search.data, filters]);

  const renderItem = useCallback<ListRenderItem<Product>>(
    ({ item }) => (
      <View style={columns > 1 ? { width: cellWidth, marginBottom: GAP } : styles.cell}>
        <ProductCard product={item} filters={filters} />
      </View>
    ),
    [columns, cellWidth, filters],
  );

  const loading = edited ? search.isPending : ask.isPending && asked !== '';
  const error = edited ? (search.isError && !search.data ? search.error : null) : ask.isError ? ask.error : null;
  const retry = () => void (edited ? search.refetch() : ask.refetch());

  const header = (
    <View style={styles.header}>
      <OfflineBanner />
      {asked ? (
        <>
          <Text variant="title1" accessibilityRole="header" numberOfLines={3}>
            “{asked}”
          </Text>
          {interp ? (
            <View testID="ask-understood">
              <View style={styles.sourceLine}>
                <Text variant="overline" tone="textTertiary">
                  Understood as
                </Text>
                <View testID="ask-source">
                  {edited ? (
                    <Badge kind="neutral" label="Edited by you" icon="create-outline" />
                  ) : ask.data?.source === 'claude' ? (
                    <Badge kind="accent" label="Read by Claude (AI)" icon="sparkles" />
                  ) : (
                    <Badge kind="neutral" label="Read by simple rules" icon="calculator-outline" />
                  )}
                </View>
              </View>
              <View style={styles.chips}>
                <Chip testID="chip-query" icon="search" trailingIcon="pencil" label={interp.query || 'Anything'} tone="accent" onPress={() => setEditing(true)} accessibilityLabel={`Search words: ${interp.query}. Edit`} />
                <Chip
                  testID="chip-price"
                  trailingIcon="pencil"
                  label={interp.maxPrice != null ? `Under ${moneyShort(interp.maxPrice)}` : 'Any price'}
                  tone={interp.maxPrice != null ? 'accent' : 'neutral'}
                  onPress={() => setEditing(true)}
                  accessibilityLabel={`Maximum price: ${interp.maxPrice != null ? moneyShort(interp.maxPrice) : 'none'}. Edit`}
                />
                <Chip
                  testID="chip-rating"
                  icon="star"
                  trailingIcon="pencil"
                  label={interp.minRating != null ? `${interp.minRating}+` : 'Any rating'}
                  tone={interp.minRating != null ? 'accent' : 'neutral'}
                  onPress={() => setEditing(true)}
                  accessibilityLabel={`Minimum rating: ${interp.minRating ?? 'none'}. Edit`}
                />
                <Chip
                  testID="chip-stores"
                  icon="storefront-outline"
                  trailingIcon="pencil"
                  label={interp.retailers?.length ? interp.retailers.map((id) => getRetailer(id).name).join(', ') : 'Any store'}
                  tone={interp.retailers?.length ? 'accent' : 'neutral'}
                  onPress={() => setEditing(true)}
                  accessibilityLabel={`Stores: ${interp.retailers?.length ? interp.retailers.map((id) => getRetailer(id).name).join(', ') : 'any'}. Edit`}
                />
                <Chip testID="chip-sort" icon="swap-vertical" trailingIcon="pencil" label={SORT_LABEL[interp.sort]} tone={interp.sort !== 'best_match' ? 'accent' : 'neutral'} onPress={() => setEditing(true)} accessibilityLabel={`Sorted by ${SORT_LABEL[interp.sort]}. Edit`} />
              </View>
              {interp.mustHave.length > 0 ? (
                <Text variant="footnote" tone="textSecondary" testID="ask-must-have">
                  Also favoring: {interp.mustHave.join(', ')}
                </Text>
              ) : null}
              {edited ? <Button label="Back to the original reading" variant="tertiary" size="sm" icon="arrow-undo-outline" onPress={() => setEdited(null)} style={styles.undo} testID="ask-reset" /> : null}
            </View>
          ) : loading ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Reading your request" testID="ask-loading">
              <Text variant="callout" tone="textSecondary" style={styles.sourceLine}>
                Reading your request. This can take a few seconds…
              </Text>
              <View style={[styles.chips, styles.chipSkeletons]}>
                {[118, 92, 76, 104].map((w, i) => (
                  <Skeleton key={i} width={w} height={36} corner={18} />
                ))}
              </View>
            </View>
          ) : null}
          {!loading && !error ? (
            <Text variant="callout" tone="textSecondary" style={styles.count}>
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </Text>
          ) : null}
          <DemoNotice products={products} style={styles.block} />
          {/* The server's sentence, shown as sent. Only while its own results are on screen. */}
          {!edited && ask.data?.topPickReason && products.length > 0 ? (
            <Banner testID="top-pick-reason" tone="accent" title="Why the first result" text={ask.data.topPickReason} style={styles.block} />
          ) : null}
        </>
      ) : (
        <View>
          <Text variant="title1" accessibilityRole="header">
            Ask in plain English
          </Text>
          <Text variant="body" tone="textSecondary" style={styles.lead}>
            Describe what you need, with a budget, a rating or stores if you like. For a plain product name, the regular search is faster.
          </Text>
          <View style={styles.chips}>
            {ASK_EXAMPLES.map((example) => (
              <Chip key={example} label={example} icon="sparkles" tone="accent" onPress={() => submit(example)} accessibilityLabel={`Ask: ${example}`} />
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const empty = !asked ? undefined : loading ? (
    <View style={[styles.skeletons, { gap: GAP }]}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={{ width: columns > 1 ? cellWidth : '100%' }}>
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  ) : error ? (
    <ErrorState error={error} onRetry={retry} />
  ) : (
    <EmptyState
      testID="ask-empty"
      icon="sparkles-outline"
      title="Nothing fits that"
      detail="Loosen one of the chips above, or search by product name instead."
      action={
        <>
          <Button label="Edit what was understood" variant="secondary" onPress={() => setEditing(true)} />
          {interp?.query ? <Button label={`Search “${interp.query}”`} variant="tertiary" onPress={() => router.push({ pathname: '/search', params: { q: interp.query } })} /> : null}
        </>
      }
    />
  );

  return (
    <Screen>
      <StackHeader>
        <SearchField
          testID="ask-input"
          value={text}
          onChangeText={setText}
          onSubmit={submit}
          icon="sparkles"
          placeholder="e.g. quiet rice cooker under $60"
          accessibilityLabel="Ask in plain English"
          maxLength={ASK_MAX_CHARS}
          autoFocus={!asked}
        />
      </StackHeader>
      <FlatList
        key={columns}
        data={loading || error ? [] : products}
        keyExtractor={keyOf}
        renderItem={renderItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={[styles.list, { paddingHorizontal: side }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={columns * 3}
        windowSize={7}
      />
      {editing && interp ? (
        <EditSheet
          initial={interp}
          onClose={() => setEditing(false)}
          onApply={(next) => {
            setEdited(next);
            setEditing(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Edit every part of the interpretation in one place. */
function EditSheet({ initial, onClose, onApply }: { initial: AskInterpretation; onClose: () => void; onApply: (next: AskInterpretation) => void }) {
  const [query, setQuery] = useState(initial.query);
  const [price, setPrice] = useState(initial.maxPrice != null ? String(initial.maxPrice) : '');
  const [rating, setRating] = useState<number | null>(initial.minRating);
  const [stores, setStores] = useState<RetailerId[]>(initial.retailers ?? []);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [errors, setErrors] = useState<{ query?: string; price?: string }>({});

  const apply = () => {
    const q = query.trim();
    const max = price.trim() === '' ? null : Number(price);
    const problems = {
      query: q ? undefined : 'Enter at least one word to search for.',
      price: max != null && (!/^\d+(\.\d{1,2})?$/.test(price.trim()) || max <= 0) ? 'Enter an amount like 60, or leave it empty.' : undefined,
    };
    setErrors(problems);
    if (problems.query || problems.price) return;
    onApply({ ...initial, query: q, maxPrice: max, minRating: rating, retailers: stores.length ? stores : null, sort });
  };

  return (
    <Sheet visible onClose={onClose} title="Edit what was understood" testID="ask-edit-sheet" footer={<Button label="Show results" size="lg" fullWidth style={styles.grow} onPress={apply} testID="ask-edit-apply" />}>
      <TextField testID="ask-edit-query" label="Search words" value={query} onChangeText={setQuery} error={errors.query} autoCapitalize="none" onSubmit={apply} />
      <TextField
        testID="ask-edit-price"
        label="Maximum total price"
        value={price}
        onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
        prefix="$"
        placeholder="No limit"
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={8}
        error={errors.price}
        style={styles.field}
        onSubmit={apply}
      />
      <Text variant="footnoteStrong" tone="textSecondary" style={styles.label}>
        Minimum rating
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Minimum rating">
        {RATINGS.map((r) => (
          <Chip key={String(r)} testID={`ask-edit-rating-${r ?? 'any'}`} role="radio" label={r == null ? 'Any' : `${r}+`} icon={r == null ? undefined : 'star'} selected={rating === r} onPress={() => setRating(r)} />
        ))}
      </View>
      <Text variant="footnoteStrong" tone="textSecondary" style={styles.label}>
        Stores (none selected = any)
      </Text>
      <View style={styles.chips}>
        {RETAILER_ORDER.map((id) => (
          <Chip
            key={id}
            testID={`ask-edit-store-${id}`}
            role="checkbox"
            label={getRetailer(id).name}
            leading={<RetailerMark id={id} size={18} />}
            selected={stores.includes(id)}
            onPress={() => setStores((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))}
          />
        ))}
      </View>
      <Text variant="footnoteStrong" tone="textSecondary" style={styles.label}>
        Sort by
      </Text>
      <SegmentedControl testID="ask-edit-sort" accessibilityLabel="Sort by" options={SORT_OPTIONS} value={sort} onChange={setSort} fullWidth />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.xxxl, flexGrow: 1 },
  header: { paddingTop: space.sm, paddingBottom: space.lg },
  sourceLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm },
  chipSkeletons: { rowGap: space.sm, marginTop: space.sm },
  undo: { marginLeft: -space.sm },
  count: { marginTop: space.sm },
  block: { marginTop: space.md },
  lead: { marginTop: 6, marginBottom: space.lg, maxWidth: 620 },
  cell: { marginBottom: GAP },
  skeletons: { flexDirection: 'row', flexWrap: 'wrap' },
  grow: { flex: 1 },
  field: { marginTop: space.lg },
  label: { marginTop: space.lg, marginBottom: 2 },
});
