import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import { describeError } from '@/api/client';
import type { PriceAlert } from '@/api/contract';
import { deleteAlert, productOptions, useAlerts, useScope } from '@/api/queries';
import { AlertButton } from '@/components/AlertSheet';
import { Card, RetailerMark } from '@/components/bits';
import { DemoNotice } from '@/components/DemoNotice';
import { PressableScale } from '@/components/PressableScale';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner } from '@/components/StateView';
import { Text } from '@/components/Text';
import { Badge, Banner, Button, EmptyState, IconButton, SegmentedControl, toast } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import { toSnapshot } from '@/lib/actions';
import { money, moneyShort, relativeTime } from '@/lib/format';
import { bestPrice } from '@/lib/offers';
import { getPushPermission, pushSupported, requestPushPermission, syncPushToken, type PushPermission } from '@/lib/push';
import { getRetailer } from '@/lib/retailers';
import { alertPrefsStore, refreshSaved, savedStore, type SavedItem } from '@/state';
import { layout, radius, space, useTheme } from '@/theme';

const GAP = space.lg;
type Segment = 'saved' | 'alerts';
const savedKey = (item: SavedItem) => item.product.id;
const alertKey = (a: PriceAlert) => a.id;

export default function SavedScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const scope = useScope();
  const { columns, gutter, width, contentWidth, isPhone } = useLayout();
  const [segment, setSegment] = useState<Segment>('saved');

  const saved = savedStore.use();
  const items = useMemo(() => Object.values(saved).sort((a, b) => b.savedAt - a.savedAt), [saved]);
  const ids = useMemo(() => items.map((i) => i.product.id), [items]);

  // The list renders from local snapshots; prices are refreshed quietly in the background.
  const fresh = useQueries({
    queries: ids.map((id) => ({ ...productOptions(scope, id), staleTime: 5 * 60_000, retry: false })),
  });
  const freshKey = fresh.map((q) => q.dataUpdatedAt).join(',');
  useEffect(() => {
    for (const q of fresh) if (q.data) refreshSaved(toSnapshot(q.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey]);

  // Alerts live on the server. Without push (the web, or permission denied) this
  // poll on focus is how a triggered alert reaches the user.
  const alertsQuery = useAlerts();
  const { refetch: refetchAlerts } = alertsQuery;
  useFocusEffect(
    useCallback(() => {
      void refetchAlerts();
    }, [refetchAlerts]),
  );
  const alerts = useMemo(
    () => [...(alertsQuery.data ?? [])].sort((a, b) => Number(b.status === 'triggered') - Number(a.status === 'triggered') || b.createdAt.localeCompare(a.createdAt)),
    [alertsQuery.data],
  );
  const seen = alertPrefsStore.use((s) => s.seenTriggered);
  const unseen = alerts.filter((a) => a.status === 'triggered' && !seen.includes(a.id));
  const unseenKey = unseen.map((a) => a.id).join(',');
  // Looking at the Alerts list is what clears the badge. `fresh` keeps this visit's highlights.
  const [freshIds, setFreshIds] = useState<string[]>([]);
  useEffect(() => {
    if (segment !== 'alerts' || !unseenKey) return;
    const idsNow = unseenKey.split(',');
    setFreshIds((prev) => [...new Set([...prev, ...idsNow])]);
    alertPrefsStore.set((s) => ({ ...s, seenTriggered: [...new Set([...s.seenTriggered, ...idsNow])].slice(-200) }));
  }, [segment, unseenKey]);

  const cellWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);
  const side = Math.max(gutter, (width - layout.maxContentWidth) / 2 + gutter);
  const cell = columns > 1 ? { width: cellWidth, marginBottom: GAP } : { marginBottom: GAP };

  const renderSaved = useCallback<ListRenderItem<SavedItem>>(
    ({ item }) => (
      <View style={cell}>
        <ProductCard product={item.product} footnote={<SavedFootnote item={item} />} />
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, cellWidth],
  );
  const renderAlert = useCallback<ListRenderItem<PriceAlert>>(
    ({ item }) => (
      <View style={cell}>
        <AlertCard alert={item} isNew={freshIds.includes(item.id)} />
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, cellWidth, freshIds],
  );

  const header = (
    <View style={styles.header}>
      <Text variant="display" accessibilityRole="header">
        Saved
      </Text>
      <Text variant="body" tone="textSecondary" style={styles.sub}>
        {segment === 'saved'
          ? items.length > 0
            ? `${items.length} ${items.length === 1 ? 'product' : 'products'} on your watchlist, kept on this device.`
            : 'Your watchlist lives on this device.'
          : 'We check prices for you and flag an alert when the total reaches your target.'}
      </Text>
      <SegmentedControl
        testID="saved-segment"
        accessibilityLabel="Show"
        value={segment}
        onChange={setSegment}
        options={[
          { key: 'saved', label: 'Saved' },
          { key: 'alerts', label: 'Alerts', badge: unseen.length },
        ]}
      />
      <View style={styles.notices}>
        <OfflineBanner />
        {segment === 'saved' ? <DemoNotice products={items.map((i) => i.product)} /> : <PushStatus hasAlerts={alerts.length > 0} />}
      </View>
    </View>
  );

  const common = {
    numColumns: columns,
    columnWrapperStyle: columns > 1 ? { gap: GAP } : undefined,
    contentContainerStyle: [styles.list, { paddingHorizontal: side }],
    ListHeaderComponent: header,
    initialNumToRender: columns * 3,
    windowSize: 7,
  };

  return (
    <Screen topInset={isPhone}>
      {segment === 'saved' ? (
        <FlatList
          key={`saved-${columns}`}
          {...common}
          data={items}
          keyExtractor={savedKey}
          renderItem={renderSaved}
          ListEmptyComponent={
            <EmptyState
              icon="bookmark-outline"
              title="Nothing saved yet"
              detail="Tap the bookmark on any product to keep an eye on its prices here."
              action={<Button label="Find something" icon="search" onPress={() => router.navigate('/')} />}
            />
          }
        />
      ) : (
        <FlatList
          key={`alerts-${columns}`}
          {...common}
          data={alerts}
          keyExtractor={alertKey}
          renderItem={renderAlert}
          refreshControl={<RefreshControl refreshing={alertsQuery.isRefetching && !alertsQuery.isPending} onRefresh={() => void refetchAlerts()} tintColor={c.textTertiary} />}
          ListEmptyComponent={
            alertsQuery.isPending ? (
              <View style={{ gap: GAP }} accessibilityLabel="Loading alerts" accessibilityRole="progressbar">
                <Skeleton height={132} corner={radius.lg} />
                <Skeleton height={132} corner={radius.lg} />
              </View>
            ) : alertsQuery.isError ? (
              <ErrorState error={alertsQuery.error} onRetry={() => void refetchAlerts()} />
            ) : (
              <EmptyState
                testID="alerts-empty"
                icon="notifications-outline"
                title="No price alerts"
                detail="Open a product and choose “Alert me” to be told when its total drops to a price you pick."
                action={<Button label="Find something" icon="search" onPress={() => router.navigate('/')} />}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

/** Under each saved product: how its best total moved, and the alert control. */
function SavedFootnote({ item }: { item: SavedItem }) {
  const { c } = useTheme();
  const now = bestPrice(item.product);
  const then = item.priceWhenSaved;
  const moved = now != null && then != null && Math.abs(now - then) >= 0.01;
  const down = moved && now < then;
  return (
    <View style={[styles.foot, { borderTopColor: c.border }]}>
      <View style={styles.move}>
        {moved ? (
          <>
            <Ionicons name={down ? 'arrow-down' : 'arrow-up'} size={14} color={down ? c.best : c.textSecondary} />
            <Text variant="footnoteStrong" tone={down ? 'best' : 'textSecondary'} style={styles.moveText}>
              {down ? 'Down' : 'Up'} {moneyShort(Math.abs(now - then))} since you saved it
            </Text>
          </>
        ) : (
          <Text variant="footnote" tone="textTertiary" style={styles.moveText}>
            No change since you saved it
          </Text>
        )}
      </View>
      <AlertButton product={item.product} size="sm" />
    </View>
  );
}

function AlertCard({ alert, isNew }: { alert: PriceAlert; isNew: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const triggered = alert.status === 'triggered';
  const open = () => router.push({ pathname: '/product/[id]', params: { id: alert.productId } });
  const remove = async () => {
    setDeleting(true);
    try {
      await deleteAlert(client, alert.id);
      toast('Alert deleted.');
    } catch (err) {
      toast(`${describeError(err).title}. The alert was not deleted.`, 'danger');
      setDeleting(false);
    }
  };
  const store = alert.currentBestRetailerId ? getRetailer(alert.currentBestRetailerId) : null;
  return (
    <Card padded={false} style={[styles.alert, triggered && { borderColor: c.best }]}>
      <View style={styles.alertTop} testID={`alert-${alert.productId}`}>
        <PressableScale onPress={open} scaleTo={0.99} accessibilityRole="link" accessibilityLabel={`${alert.productTitle}. Open product`} style={styles.alertTitle}>
          <View style={styles.alertBadges}>
            <View testID={`alert-status-${alert.status}`}>
              <Badge kind={triggered ? 'best' : 'neutral'} label={triggered ? 'Triggered' : 'Active'} icon={triggered ? 'checkmark-circle' : 'time-outline'} />
            </View>
            {isNew ? <Badge kind="accent" label="New" /> : null}
          </View>
          <Text variant="title3" numberOfLines={2} style={styles.alertName}>
            {alert.productTitle}
          </Text>
        </PressableScale>
        <IconButton icon="trash-outline" label={`Delete alert for ${alert.productTitle}`} variant="plain" loading={deleting} onPress={() => void remove()} testID={`alert-delete-${alert.productId}`} />
      </View>
      <View style={[styles.alertNumbers, { borderTopColor: c.border }]}>
        <View style={styles.alertNumber}>
          <Text variant="caption" tone="textSecondary">
            Your target
          </Text>
          <Text variant="priceLarge">{money(alert.targetPrice)}</Text>
        </View>
        <View style={styles.alertNumber}>
          <Text variant="caption" tone="textSecondary">
            Best total now
          </Text>
          <Text variant="priceLarge" tone={triggered ? 'best' : 'text'}>
            {alert.currentBestPrice != null ? money(alert.currentBestPrice) : '—'}
          </Text>
        </View>
      </View>
      <View style={styles.alertFoot}>
        {store ? <RetailerMark id={store.id} size={16} /> : null}
        <Text variant="footnote" tone="textSecondary" style={styles.moveText} numberOfLines={2}>
          {triggered
            ? `Reached your target${store ? ` at ${store.name}` : ''} ${relativeTime(alert.triggeredAt)}.`
            : alert.currentBestPrice != null
              ? `${money(Math.max(0, alert.currentBestPrice - alert.targetPrice))} to go${store ? ` · best at ${store.name}` : ''}. Was ${money(alert.priceAtCreation)} when set.`
              : 'No store has it at a known price right now.'}
        </Text>
        <Button label="View" variant="tertiary" size="sm" trailingIcon="chevron-forward" onPress={open} accessibilityLabel={`View ${alert.productTitle}`} style={styles.view} />
      </View>
    </Card>
  );
}

/** Whether triggered alerts will also arrive as a notification, and the way to turn that on. */
function PushStatus({ hasAlerts }: { hasAlerts: boolean }) {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (pushSupported) void getPushPermission().then(setPermission);
    }, []),
  );
  if (!pushSupported) {
    return hasAlerts ? <Banner tone="info" compact icon="notifications-off-outline" text="This version does not send notifications. Triggered alerts appear here and are badged on the Saved tab." /> : null;
  }
  if (!hasAlerts || permission == null || permission === 'granted') return null;
  return (
    <Banner
      tone="info"
      icon="notifications-off-outline"
      title="Notifications are off"
      text="Triggered alerts still appear here. Turn notifications on to be told right away."
      action={{
        label: permission === 'undetermined' ? 'Turn on notifications' : 'Open settings',
        onPress: () => {
          if (permission === 'undetermined') {
            alertPrefsStore.set((s) => ({ ...s, pushAsked: true }));
            void requestPushPermission().then(async (ok) => {
              setPermission(ok ? 'granted' : 'denied');
              if (ok) await syncPushToken();
            });
          } else void Linking.openSettings();
        },
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.xxxl, flexGrow: 1 },
  header: { paddingTop: space.xxl, paddingBottom: space.lg },
  sub: { marginTop: 6, marginBottom: space.lg },
  notices: { marginTop: space.md, gap: space.sm },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingTop: space.xs, marginHorizontal: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  move: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  moveText: { flex: 1 },
  alert: { flex: 1 },
  alertTop: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: space.lg, paddingRight: space.xs, paddingTop: space.sm },
  alertTitle: { flex: 1, minHeight: layout.minTouch, paddingVertical: space.sm, borderRadius: radius.sm },
  alertBadges: { flexDirection: 'row', gap: 6 },
  alertName: { marginTop: 6 },
  alertNumbers: { flexDirection: 'row', gap: space.lg, marginHorizontal: space.lg, marginTop: space.xs, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  alertNumber: { flex: 1, gap: 2 },
  alertFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: space.lg, paddingRight: space.sm, paddingTop: space.xs, paddingBottom: space.xs },
  view: {},
});
