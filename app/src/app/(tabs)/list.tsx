import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { ApiRequestError } from '@/api/client';
import type { BasketLine, BasketResolvedItem, BasketResponse, BasketStoreTotal, Offer, Product, RetailerId } from '@/api/contract';
import { getSeed, useBasket, useSearch, useStoreLookup } from '@/api/queries';
import { removeListItemWithUndo } from '@/components/AddToList';
import { Card, RetailerMark } from '@/components/bits';
import { DemoNotice } from '@/components/DemoNotice';
import { Page, Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner } from '@/components/StateView';
import { Text } from '@/components/Text';
import { Badge, Banner, Button, CheckRow, Chip, EmptyState, ListRow, QuantityStepper, SegmentedControl, Sheet, TextField, toast } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import { useDebounced, useTypeahead } from '@/hooks/useTypeahead';
import { money, sizeRatio, sizeText, unitPriceText } from '@/lib/format';
import { addQueryToList, clearChecked, setListItemProduct, setListQuantity, toggleListChecked } from '@/lib/list';
import { viewOffers } from '@/lib/offers';
import { getRetailer } from '@/lib/retailers';
import { LIST_MAX_ITEMS, listStore, QTY_MAX, shopperStore, type ListItem } from '@/state';
import { radius, space, useTheme } from '@/theme';

const STARTERS = ['milk', 'eggs', 'bread', 'bananas', 'chicken breast', 'rice'];
type Panel = 'items' | 'totals';

/** How one basket line relates to what was listed: its offer, and whether it is a bigger (club) pack. */
function lineFacts(line: BasketLine, resolved: BasketResolvedItem | undefined): { offer: Offer | null; bulk: number | null } {
  const product = resolved?.product ?? null;
  const offer = product?.offers.find((o) => o.id === line.offerId) ?? null;
  const ratio = offer && product ? sizeRatio(offer.size, product.size) : null;
  // A basket line is ONE package of whatever that store sells. At a club that is a bulk pack.
  return { offer, bulk: ratio != null && ratio >= 1.5 ? ratio : null };
}

/**
 * The shopping list and what it costs at each store.
 *
 * The list lives on this device. Totals come from POST /v1/basket: the request
 * is debounced while the list is being edited, the previous totals stay on
 * screen while new ones load, and a superseded request is cancelled.
 */
export default function ListScreen() {
  const { isPhone, isDesktop } = useLayout();
  const items = listStore.use();
  const [panel, setPanel] = useState<Panel>('items');
  const [changing, setChanging] = useState<ListItem | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  // Switching between Items and Store totals starts the new panel at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [panel]);

  const payload = useMemo(() => items.map((i) => (i.productId ? { id: i.id, productId: i.productId, quantity: i.quantity } : { id: i.id, query: i.query ?? i.title, quantity: i.quantity })), [items]);
  const debounced = useDebounced(payload, 450);
  const basket = useBasket(debounced);
  // While the list is ahead of the totals on screen (debounce or request in flight).
  const updating = items.length > 0 && (debounced !== payload || basket.isFetching);
  const resolved = useMemo(() => new Map((basket.data?.items ?? []).map((r) => [r.id, r])), [basket.data]);

  const itemsPanel = <ItemsPanel items={items} resolved={resolved} loading={basket.isPending && items.length > 0} onChange={setChanging} />;
  const totalsPanel = <TotalsPanel items={items} basket={basket.data} resolved={resolved} pending={basket.isPending} updating={updating} error={basket.isError && !basket.data ? basket.error : null} onRetry={() => void basket.refetch()} onChange={setChanging} />;
  const toBuy = items.filter((i) => !i.checked).length;

  return (
    <Screen topInset={isPhone}>
      <ScrollView ref={scroller} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Page>
          <View style={styles.header}>
            <Text variant="display" accessibilityRole="header">
              List
            </Text>
            <Text variant="body" tone="textSecondary" style={styles.sub}>
              {items.length === 0 ? 'Add what you need and see what the whole list costs at each store.' : `${toBuy} to buy${items.length - toBuy > 0 ? `, ${items.length - toBuy} checked off` : ''}. Kept on this device.`}
            </Text>
            <OfflineBanner />
            {isDesktop ? null : (
              <SegmentedControl
                testID="list-panel"
                accessibilityLabel="Show"
                fullWidth
                value={panel}
                onChange={setPanel}
                options={[
                  { key: 'items', label: `Items${items.length ? ` (${items.length})` : ''}` },
                  { key: 'totals', label: 'Store totals' },
                ]}
              />
            )}
          </View>
          {isDesktop ? (
            <View style={styles.columns}>
              <View style={styles.left}>{itemsPanel}</View>
              <View style={styles.colRight}>{totalsPanel}</View>
            </View>
          ) : panel === 'items' ? (
            <>
              {itemsPanel}
              {items.length > 0 ? <Button label="See store totals" icon="calculator-outline" size="lg" fullWidth onPress={() => setPanel('totals')} style={styles.gapTop} testID="list-see-totals" /> : null}
            </>
          ) : (
            totalsPanel
          )}
        </Page>
      </ScrollView>
      {changing ? <ChangeItemSheet item={changing} onClose={() => setChanging(null)} /> : null}
    </Screen>
  );
}

/** ---- Items ------------------------------------------------------------------------- */

function ItemsPanel({ items, resolved, loading, onChange }: { items: ListItem[]; resolved: Map<string, BasketResolvedItem>; loading: boolean; onChange: (item: ListItem) => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { suggestions } = useTypeahead(text);
  const checked = items.filter((i) => i.checked).length;

  const add = (raw: string) => {
    if (!raw.trim()) return setError('Type what you need, like “milk”.');
    const result = addQueryToList(raw);
    if (result === 'full') return setError(`A list holds up to ${LIST_MAX_ITEMS} items.`);
    setText('');
    setError(null);
    if (result === 'increased') toast(`“${raw.trim()}” was already on your list. Quantity raised.`);
  };

  return (
    <View>
      <TextField
        testID="list-quick-add"
        label="Quick add"
        value={text}
        onChangeText={(v) => {
          setText(v.slice(0, 100));
          setError(null);
        }}
        placeholder="milk, eggs, bread…"
        autoCapitalize="none"
        returnKeyType="done"
        error={error}
        onSubmit={() => add(text)}
        trailing={<Button label="Add" size="sm" icon="add" onPress={() => add(text)} testID="list-quick-add-button" style={styles.addButton} />}
      />
      {text.trim() && suggestions.length > 0 ? (
        <View style={styles.chips}>
          {suggestions.slice(0, 4).map((s) => (
            <Chip key={s} label={s} icon="add" onPress={() => add(s)} accessibilityLabel={`Add ${s} to your list`} />
          ))}
        </View>
      ) : null}

      {items.length === 0 ? (
        <Card style={styles.gapTop}>
          <EmptyState
            compact
            testID="list-empty"
            icon="list-outline"
            title="Your list is empty"
            detail="Type an item above, or add products from search with “Add to list”. Start with a staple:"
            action={
              <>
                <View style={[styles.chips, styles.center]}>
                  {STARTERS.map((s) => (
                    <Chip key={s} label={s} icon="add" onPress={() => add(s)} accessibilityLabel={`Add ${s} to your list`} />
                  ))}
                </View>
                <Button label="Browse products" variant="tertiary" icon="search" onPress={() => router.navigate('/')} />
              </>
            }
          />
        </Card>
      ) : (
        <Card style={[styles.gapTop, styles.rows]}>
          {items.map((item, i) => {
            const r = resolved.get(item.id);
            const free = !item.productId;
            // While new totals load, `resolved` may still describe what this row USED to be (before
            // "Change"). A pinned row trusts only a resolution of its own product, else the cached one.
            const product = free ? (r?.product ?? null) : r?.product != null && r.product.id === item.productId ? r.product : (getSeed(item.productId ?? '') ?? null);
            const unmatched = free && r != null && r.product == null;
            return (
              <View key={item.id} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }} testID={`list-item-${i}`}>
                <CheckRow
                  testID={`list-check-${i}`}
                  label={item.title}
                  strikeWhenChecked
                  checked={item.checked}
                  onChange={() => toggleListChecked(item.id)}
                  accessibilityLabel={`${item.title}, quantity ${item.quantity}${item.checked ? ', checked off' : ''}`}
                  detailNode={
                    unmatched ? (
                      <Text variant="footnote" tone="danger" testID={`list-unmatched-${i}`}>
                        No match found. It is left out of the totals.
                      </Text>
                    ) : free ? (
                      <Text variant="footnote" tone="textSecondary" numberOfLines={2} testID={`list-resolved-${i}`}>
                        {product ? `Priced as: ${product.title}` : loading ? 'Finding a match…' : 'Matched when totals load'}
                      </Text>
                    ) : product ? (
                      <Text variant="footnote" tone="textSecondary" numberOfLines={1}>
                        {[product.brand, sizeText(product.size)].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null
                  }
                  trailing={
                    <QuantityStepper
                      testID={`list-qty-${i}`}
                      label={`quantity of ${item.title}`}
                      value={item.quantity}
                      max={QTY_MAX}
                      onChange={(q) => setListQuantity(item.id, q)}
                      onRemove={() => removeListItemWithUndo(item.id, item.title)}
                    />
                  }
                />
                {free || unmatched ? (
                  <Button
                    testID={`list-change-${i}`}
                    label={unmatched ? 'Pick a product' : 'Change'}
                    variant="tertiary"
                    size="sm"
                    icon="swap-horizontal"
                    accessibilityLabel={`Choose a specific product for ${item.title}`}
                    onPress={() => onChange(item)}
                    style={styles.change}
                  />
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
      {checked > 0 ? (
        <Button
          testID="list-clear-checked"
          label={`Clear ${checked} checked`}
          variant="secondary"
          size="sm"
          icon="checkmark-done"
          style={styles.gapTop}
          onPress={() => {
            const undo = clearChecked();
            if (undo) toast(`Cleared ${checked} checked ${checked === 1 ? 'item' : 'items'}`, 'neutral', { label: 'Undo', onPress: undo });
          }}
        />
      ) : null}
    </View>
  );
}

/** ---- Totals ------------------------------------------------------------------------ */

interface TotalsProps {
  items: ListItem[];
  basket: BasketResponse | undefined;
  resolved: Map<string, BasketResolvedItem>;
  pending: boolean;
  updating: boolean;
  error: unknown;
  onRetry: () => void;
  onChange: (item: ListItem) => void;
}

function TotalsPanel({ items, basket, resolved, pending, updating, error, onRetry, onChange }: TotalsProps) {
  const router = useRouter();
  const zip = shopperStore.use((s) => s.zip);
  const [openStore, setOpenStore] = useState<RetailerId | null>(null);
  const [openSplit, setOpenSplit] = useState(false);
  const titleOf = (id: string) => resolved.get(id)?.product?.title ?? items.find((i) => i.id === id)?.title ?? 'Item';
  const listedTitle = (id: string) => items.find((i) => i.id === id)?.title ?? titleOf(id);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState compact icon="calculator-outline" title="No totals yet" detail="Add items to your list and each store’s total appears here." />
      </Card>
    );
  }
  if (error) {
    const limited = error instanceof ApiRequestError && error.status === 429;
    return (
      <Card>
        {limited ? <EmptyState compact tone="danger" icon="hourglass-outline" title="Too many updates" detail="Totals are being recalculated too often. Wait a moment and try again." action={<Button label="Try again" variant="secondary" icon="refresh" onPress={onRetry} />} /> : <ErrorState compact error={error} onRetry={onRetry} />}
      </Card>
    );
  }
  if (pending || !basket) {
    return (
      <View style={{ gap: space.md }} accessibilityRole="progressbar" accessibilityLabel="Totalling your list" testID="totals-loading">
        <Skeleton height={150} corner={radius.lg} />
        <Skeleton height={120} corner={radius.lg} />
        <Skeleton height={120} corner={radius.lg} />
      </View>
    );
  }

  const count = basket.items.length;
  const unmatched = basket.items.filter((i) => i.product == null);
  const priced = count - unmatched.length;
  const split = basket.bestSplit;
  const best = basket.perStore.find((s) => s.retailerId === basket.bestSingleStore) ?? null;
  const topCoverage = Math.max(0, ...basket.perStore.map((s) => s.lines.length));
  const open = basket.perStore.find((s) => s.retailerId === openStore) ?? null;
  const products = basket.items.flatMap((i) => (i.product ? [i.product] : []));

  return (
    <View style={[{ gap: space.md }, updating && styles.updating]} testID="totals">
      <DemoNotice products={products} />
      {zip ? (
        <Text variant="footnote" tone="textSecondary" testID="totals-context">
          In-store prices near {zip}, with estimated sales tax. Stores are ranked by how much of your list they have, then by total, so a store missing items can show a lower total.{updating ? ' Updating…' : ''}
        </Text>
      ) : (
        <Banner tone="info" compact text="National estimates without tax. Add your ZIP code to price this list at your own stores." action={{ label: 'Shopping settings', onPress: () => router.navigate('/profile') }} testID="totals-no-zip" />
      )}
      {unmatched.length > 0 ? (
        <Banner
          testID="totals-unmatched"
          tone="danger"
          title={`${unmatched.length} ${unmatched.length === 1 ? 'item' : 'items'} could not be matched`}
          text={`${unmatched.map((u) => `“${listedTitle(u.id)}”`).join(', ')} ${unmatched.length === 1 ? 'is' : 'are'} left out of every total below.`}
          action={
            unmatched[0]
              ? {
                  label: 'Pick a product',
                  onPress: () => {
                    const item = items.find((i) => i.id === unmatched[0]?.id);
                    if (item) onChange(item);
                  },
                }
              : undefined
          }
        />
      ) : null}

      {basket.perStore.length === 0 ? (
        <Card>
          <EmptyState compact icon="pricetag-outline" title="No store has a price for these" detail="None of the items on your list has a price you can use right now." />
        </Card>
      ) : null}

      {split && best ? (
        <Card style={styles.split} testID="split-card">
          <View style={styles.badges}>
            <Badge kind="accent" label="Split across two stores" icon="git-branch-outline" />
            <Badge kind="best" label={`Save ${money(split.savingsVsBestSingle)}`} />
          </View>
          <View style={styles.totalLine}>
            <View style={styles.marks}>
              {split.stores.map((s) => (
                <RetailerMark key={s.retailerId} id={s.retailerId} size={26} />
              ))}
            </View>
            <Text variant="title3" style={styles.grow} numberOfLines={2}>
              {split.stores.map((s) => getRetailer(s.retailerId).name).join(' + ')}
            </Text>
            <Text variant="priceLarge" testID="split-total">
              {money(split.total)}
            </Text>
          </View>
          <Text variant="callout" tone="textSecondary">
            {money(split.savingsVsBestSingle)} less than buying everything at {getRetailer(best.retailerId).name} ({money(best.total)}), for the same {split.assignments.length} items.
          </Text>
          {split.stores.map((s) => {
            const mine = split.assignments.filter((a) => a.retailerId === s.retailerId);
            return (
              <Text key={s.retailerId} variant="footnote" tone="textSecondary" numberOfLines={2}>
                <Text variant="footnoteStrong">
                  {getRetailer(s.retailerId).name} · {mine.length} {mine.length === 1 ? 'item' : 'items'} · {money(mine.reduce((sum, a) => sum + a.line.lineTotal, 0))}:
                </Text>{' '}
                {mine.map((a) => listedTitle(a.itemId)).join(', ')}
              </Text>
            );
          })}
          <Button label="What to buy where" variant="secondary" size="sm" trailingIcon="chevron-forward" onPress={() => setOpenSplit(true)} testID="split-open" />
        </Card>
      ) : null}

      {basket.perStore.map((store) => (
        <StoreCard key={store.retailerId} store={store} best={store.retailerId === basket.bestSingleStore} priced={priced} short={store.lines.length < topCoverage} resolved={resolved} listedTitle={listedTitle} onOpen={() => setOpenStore(store.retailerId)} />
      ))}

      {open ? (
        <LinesSheet title={getRetailer(open.retailerId).name} total={open.total} onClose={() => setOpenStore(null)} lines={open.lines} missing={open.missingItemIds} resolved={resolved} listedTitle={listedTitle} />
      ) : null}
      {openSplit && split ? (
        <LinesSheet
          title="What to buy where"
          total={split.total}
          onClose={() => setOpenSplit(false)}
          lines={split.assignments.map((a) => a.line)}
          groups={split.stores.map((s) => ({ retailerId: s.retailerId, itemIds: split.assignments.filter((a) => a.retailerId === s.retailerId).map((a) => a.itemId) }))}
          missing={split.missingItemIds}
          resolved={resolved}
          listedTitle={listedTitle}
        />
      ) : null}
    </View>
  );
}

function StoreCard({ store, best, priced, short, resolved, listedTitle, onOpen }: { store: BasketStoreTotal; best: boolean; priced: number; short: boolean; resolved: Map<string, BasketResolvedItem>; listedTitle: (id: string) => string; onOpen: () => void }) {
  const { c } = useTheme();
  const stores = useStoreLookup();
  const retailer = getRetailer(store.retailerId);
  const location = store.storeId ? stores.get(store.storeId) : null;
  const facts = store.lines.map((l) => lineFacts(l, resolved.get(l.itemId)));
  const bulk = facts.filter((f) => f.bulk != null).length;
  const similar = store.lines.filter((l) => l.matchType === 'equivalent').length;
  // Missing ids include items nothing matched at all; those are reported once, above.
  const missing = store.missingItemIds.filter((id) => resolved.get(id)?.product != null);
  return (
    <Card style={best ? { borderColor: c.best, borderWidth: 1.5 } : undefined} testID={`store-total-${store.retailerId}`}>
      {best ? (
        <View style={styles.badges} testID="best-single-store">
          <Badge kind="best" label={store.complete || missing.length === 0 ? 'Best single store' : 'Covers the most'} icon="checkmark-circle" />
        </View>
      ) : null}
      <View style={styles.totalLine}>
        <RetailerMark id={store.retailerId} size={30} />
        <View style={styles.grow}>
          <Text variant="title3" numberOfLines={1}>
            {retailer.name}
          </Text>
          <Text variant="footnote" tone="textSecondary" numberOfLines={1}>
            {location ? `${location.distanceMiles.toFixed(1)} mi · ${location.name}` : store.storeId ? 'Your store' : 'Online price, not a store near you'}
          </Text>
        </View>
        <View style={styles.right}>
          <Text variant="priceLarge" tone={best ? 'best' : 'text'} testID={`store-total-amount-${store.retailerId}`}>
            {money(store.total)}
          </Text>
          <Text variant="caption" tone={short ? 'danger' : 'textSecondary'}>
            {store.lines.length} of {priced} items
          </Text>
        </View>
      </View>
      {missing.length > 0 ? (
        <Text variant="footnote" tone="textSecondary" style={styles.note} testID={`store-missing-${store.retailerId}`}>
          <Text variant="footnoteStrong" tone="danger">
            Missing:
          </Text>{' '}
          {missing.map(listedTitle).join(', ')}
        </Text>
      ) : null}
      {bulk > 0 ? (
        <View style={styles.note} testID={`store-bulk-${store.retailerId}`}>
          <Banner tone="notice" compact icon="cube-outline" text={`${bulk} bulk ${bulk === 1 ? 'pack' : 'packs'}: this total buys more product than you listed.`} />
        </View>
      ) : null}
      <View style={styles.cardFoot}>
        <Text variant="footnote" tone="textSecondary" style={styles.grow}>
          {similar > 0 ? `${similar} similar ${similar === 1 ? 'item' : 'items'} (not the exact product)` : 'All exact items'}
        </Text>
        <Button label="See items" variant="tertiary" size="sm" trailingIcon="chevron-forward" onPress={onOpen} accessibilityLabel={`See the ${retailer.name} list line by line`} testID={`store-open-${store.retailerId}`} />
      </View>
    </Card>
  );
}

interface LinesSheetProps {
  title: string;
  total: number;
  lines: BasketLine[];
  /** For a split: which items go to which store. */
  groups?: { retailerId: RetailerId; itemIds: string[] }[];
  missing: string[];
  resolved: Map<string, BasketResolvedItem>;
  listedTitle: (id: string) => string;
  onClose: () => void;
}

/** One store's list, or a split's, line by line. */
function LinesSheet({ title, total, lines, groups, missing, resolved, listedTitle, onClose }: LinesSheetProps) {
  const { c } = useTheme();
  const row = (line: BasketLine): ReactNode => {
    const r = resolved.get(line.itemId);
    const { offer, bulk } = lineFacts(line, r);
    const similar = line.matchType === 'equivalent';
    const unit = offer ? unitPriceText(offer) : null;
    return (
      <View key={line.itemId} style={[styles.line, { borderTopColor: c.border }]} testID="basket-line">
        <View style={styles.grow}>
          <Text variant="calloutStrong" numberOfLines={2}>
            {similar ? (line.offerTitle ?? r?.product?.title ?? listedTitle(line.itemId)) : (r?.product?.title ?? listedTitle(line.itemId))}
          </Text>
          <View style={styles.lineBadges}>
            <Badge kind={similar ? 'neutral' : 'accent'} label={similar ? 'Similar item' : 'Exact item'} icon={similar ? 'swap-horizontal' : 'checkmark'} />
            {bulk != null ? <Badge kind="notice" label={`Bulk pack · ${sizeText(offer?.size) ?? ''} (${bulk >= 10 ? Math.round(bulk) : Math.round(bulk * 10) / 10}× listed size)`} icon="cube-outline" /> : null}
          </View>
          <Text variant="caption" tone="textSecondary">
            {[listedTitle(line.itemId) !== (r?.product?.title ?? '') || similar ? `For “${listedTitle(line.itemId)}”` : null, unit].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.right}>
          <Text variant="price">{money(line.lineTotal)}</Text>
          <Text variant="caption" tone="textSecondary">
            {money(line.unitCost)} × {line.quantity}
          </Text>
        </View>
      </View>
    );
  };
  const shownMissing = missing.filter((id) => resolved.get(id)?.product != null);
  return (
    <Sheet visible onClose={onClose} title={title} testID="lines-sheet" footer={<Button label="Done" size="lg" fullWidth style={styles.grow} onPress={onClose} />}>
      {groups
        ? groups.map((g) => (
            <View key={g.retailerId} style={styles.group}>
              <View style={styles.groupHead}>
                <RetailerMark id={g.retailerId} size={22} />
                <Text variant="title3" style={styles.grow}>
                  {getRetailer(g.retailerId).name}
                </Text>
                <Text variant="price">{money(lines.filter((l) => g.itemIds.includes(l.itemId)).reduce((s, l) => s + l.lineTotal, 0))}</Text>
              </View>
              {lines.filter((l) => g.itemIds.includes(l.itemId)).map(row)}
            </View>
          ))
        : lines.map(row)}
      {shownMissing.length > 0 ? (
        <Banner tone="info" compact icon="remove-circle-outline" title="Not available here" text={shownMissing.map(listedTitle).join(', ')} style={styles.gapTop} />
      ) : null}
      <View style={[styles.sheetTotal, { borderTopColor: c.borderStrong }]}>
        <Text variant="bodyStrong" style={styles.grow}>
          Total
        </Text>
        <Text variant="priceLarge">{money(total)}</Text>
      </View>
    </Sheet>
  );
}

/** ---- "Change": pick a specific product for an item ------------------------------------ */

function ChangeItemSheet({ item, onClose }: { item: ListItem; onClose: () => void }) {
  const [text, setText] = useState(item.query ?? item.title);
  const q = useDebounced(text.trim(), 250);
  const search = useSearch(q);
  const products = search.data?.products ?? [];
  const pick = (product: Product) => {
    setListItemProduct(item.id, product);
    toast(`“${item.title}” is now ${product.title}`, 'success');
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={`Pick a product for “${item.title}”`} testID="change-sheet">
      <TextField testID="change-search" label="Search products" value={text} onChangeText={setText} autoCapitalize="none" placeholder="e.g. unsalted butter" />
      <View style={styles.gapTop}>
        {!q ? (
          <Text variant="callout" tone="textSecondary">
            Type a product name to see matches.
          </Text>
        ) : search.isPending ? (
          <View style={{ gap: space.sm }} accessibilityRole="progressbar" accessibilityLabel="Searching">
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </View>
        ) : search.isError ? (
          <ErrorState compact error={search.error} onRetry={() => void search.refetch()} />
        ) : products.length === 0 ? (
          <Text variant="callout" tone="textSecondary" testID="change-empty">
            Nothing matches “{q}”. Try a more general word.
          </Text>
        ) : (
          products.slice(0, 12).map((p, i) => {
            const view = viewOffers(p);
            const best = view.offers.find((o) => o.id === view.cheapestId);
            return (
              <ListRow
                key={p.id}
                testID={`change-pick-${i}`}
                title={p.title}
                subtitle={[p.brand, best ? `from ${money(best.landedPrice)} at ${getRetailer(best.retailerId).name}` : 'no price right now'].join(' · ')}
                divider={i > 0}
                chevron={false}
                accessibilityHint="Uses this product for the list item"
                onPress={() => pick(p)}
              />
            );
          })
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl + space.lg },
  header: { paddingTop: space.xxl, paddingBottom: space.lg },
  sub: { marginTop: 6, marginBottom: space.lg },
  columns: { flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' },
  left: { flex: 5, minWidth: 0 },
  colRight: { flex: 6, minWidth: 0 },
  right: { alignItems: 'flex-end' },
  gapTop: { marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, marginTop: space.xs },
  center: { justifyContent: 'center' },
  addButton: { marginRight: -space.sm },
  rows: { paddingVertical: space.xs },
  change: { marginLeft: 28, marginTop: -space.sm },
  updating: { opacity: 0.6 },
  split: { gap: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.sm },
  totalLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  marks: { flexDirection: 'row', gap: 4 },
  grow: { flex: 1, minWidth: 0 },
  note: { marginTop: space.sm },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs, marginBottom: -space.sm, marginRight: -space.sm },
  line: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  lineBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  group: { marginBottom: space.lg },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.sm },
  sheetTotal: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md, marginTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
