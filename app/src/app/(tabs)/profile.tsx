import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { describeError } from '@/api/client';
import type { RetailerId, UserProfile } from '@/api/contract';
import { clearSeeds, deleteProfile, useProfile } from '@/api/queries';
import { Card, RetailerMark } from '@/components/bits';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Page, Screen } from '@/components/Screen';
import { ShoppingSettings } from '@/components/Shopper';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner } from '@/components/StateView';
import { Text } from '@/components/Text';
import { Badge, Banner, Button, Chip, ListRow, ToggleRow } from '@/components/ui';
import { APP_NAME, DEV_ROUTES } from '@/config';
import { LEGAL_DOCS, LEGAL_ORDER } from '@/content/legal';
import { useLayout } from '@/hooks/useLayout';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { wipeQueryCache } from '@/lib/queryClient';
import { getRetailer, RETAILER_ORDER } from '@/lib/retailers';
import { replaceSession, useDeviceId } from '@/lib/session';
import { clearQueue, flush, usePendingEvents } from '@/lib/tracker';
import { addRecent, clearLocalState, settingsStore } from '@/state';
import { radius, space, useTheme } from '@/theme';

const SOURCE: Record<UserProfile['source'], { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = {
  claude: { label: 'Written by Claude', detail: 'An AI model read your recent activity and wrote this description.', icon: 'sparkles' },
  heuristic: { label: 'Estimated by simple rules', detail: 'Counted from your activity with fixed rules. No AI model was involved.', icon: 'calculator-outline' },
  none: { label: 'Nothing learned yet', detail: 'There is not enough activity to describe how you shop.', icon: 'ellipse-outline' },
};

function priceWords(v: number): string {
  if (v >= 0.75) return 'You almost always choose the lowest price.';
  if (v >= 0.5) return 'Price usually decides, but not every time.';
  if (v >= 0.25) return 'You will pay a little more for a store you like.';
  return 'Price is rarely what decides it for you.';
}
function affinityWords(v: number): string {
  if (v >= 0.5) return 'Strong preference';
  if (v >= 0.15) return 'Slight preference';
  if (v > -0.15) return 'Neutral';
  if (v > -0.5) return 'Tends to skip';
  return 'Usually avoids';
}
const top = (map: Record<string, number>, n: number) =>
  Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);

export default function ProfileScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { isPhone, isDesktop } = useLayout();
  const deviceId = useDeviceId();
  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const paused = settingsStore.use((s) => s.learningPaused);
  const pending = usePendingEvents();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const setPaused = (next: boolean) => {
    haptic.selection();
    setDeleted(false);
    // The tracker listens to this store and empties its queue when paused.
    settingsStore.set((s) => ({ ...s, learningPaused: next }));
  };

  const runDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // Server first: if it cannot be reached, nothing local is touched and the request can be retried.
      await deleteProfile();
      // The server has erased the data and revoked the token. Now everything on this device...
      clearQueue();
      clearLocalState();
      clearSeeds();
      await wipeQueryCache();
      // ...and a fresh anonymous device. The old token is never sent again.
      await replaceSession();
      haptic.success();
      setConfirming(false);
      setDeleted(true);
    } catch (err) {
      haptic.warning();
      setDeleteError(`${describeError(err).title}. Nothing was deleted — try again when the server is reachable.`);
    } finally {
      setDeleting(false);
    }
  };

  const search = (q: string) => {
    addRecent(q);
    router.push({ pathname: '/search', params: { q } });
  };

  const learned = profile != null && profile.source !== 'none' && profile.eventCount > 0;
  const source = SOURCE[profile?.source ?? 'none'];

  const learnedColumn = profileQuery.isPending ? (
    <View style={{ gap: space.lg }} accessibilityLabel="Loading your profile" accessibilityRole="progressbar">
      <Skeleton height={170} corner={radius.lg} />
      <Skeleton height={220} corner={radius.lg} />
    </View>
  ) : profileQuery.isError && !profile ? (
    <Card>
      <ErrorState compact error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
    </Card>
  ) : profile ? (
    <View style={{ gap: space.lg }}>
      <Card style={styles.pad}>
        <View style={styles.sourceRow}>
          <Badge kind={profile.source === 'claude' ? 'accent' : 'neutral'} label={source.label} icon={source.icon} />
        </View>
        <Text variant="title3" style={styles.summary} testID="profile-summary">
          {learned && profile.summary
            ? profile.summary
            : `${APP_NAME} has not learned anything about you yet. Search, open products and tap through to stores, and a description of how you shop will appear here.`}
        </Text>
        <Text variant="footnote" tone="textSecondary" style={{ marginTop: space.md }}>
          {source.detail}
        </Text>
        <View style={[styles.facts, { borderTopColor: c.border }]}>
          <Fact label="Actions used" value={profile.eventCount.toLocaleString()} testID="event-count" />
          <Fact label="Last updated" value={relativeTime(profile.updatedAt)} />
          <Fact label="Waiting to send" value={paused ? 'Paused' : String(pending)} />
        </View>
      </Card>

      {learned && profile.insights.length > 0 ? (
        <Block title="What we noticed">
          <Card style={styles.pad}>
            {profile.insights.map((insight, i) => (
              <View key={insight} style={[styles.insight, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                <Ionicons name="sparkles" size={15} color={c.accentText} style={{ marginTop: 4 }} />
                <Text variant="body" style={{ flex: 1 }}>
                  {insight}
                </Text>
              </View>
            ))}
          </Card>
        </Block>
      ) : null}

      {learned ? (
        <>
          <Block title="How you weigh things" subtitle="These three numbers change the order of offers you see.">
            <Card style={styles.pad}>
              <Meter label="Price sensitivity" value={profile.priceSensitivity} low="Price barely matters" high="Always the cheapest" words={priceWords(profile.priceSensitivity)} />
              <View style={[styles.rule, { backgroundColor: c.border }]} />
              <Meter label="Fast delivery" value={profile.speedPreference} low="Happy to wait" high="Want it now" />
              <View style={[styles.rule, { backgroundColor: c.border }]} />
              <Meter label="Ratings and reviews" value={profile.qualityPreference} low="Rarely a factor" high="Top rated only" />
            </Card>
          </Block>

          <Block title="Stores" subtitle="Whether you lean toward or away from a store, beyond its price.">
            <Card style={styles.pad}>
              <View style={styles.axis}>
                <Text variant="caption" tone="textTertiary">
                  Avoids
                </Text>
                <Text variant="caption" tone="textTertiary">
                  Prefers
                </Text>
              </View>
              {RETAILER_ORDER.filter((id) => profile.retailerAffinity[id] != null || profile.memberships.includes(id)).map((id) => (
                <AffinityRow key={id} id={id} value={profile.retailerAffinity[id] ?? 0} member={profile.memberships.includes(id)} />
              ))}
              {Object.keys(profile.retailerAffinity).length === 0 && profile.memberships.length === 0 ? (
                <Text variant="callout" tone="textSecondary">
                  No store preference has shown up yet.
                </Text>
              ) : null}
            </Card>
          </Block>

          {top(profile.categoryAffinity, 6).length + top(profile.brandAffinity, 6).length > 0 ? (
            <Block title="Interests">
              <Card style={styles.pad}>
                <Interests label="Categories" items={top(profile.categoryAffinity, 6)} />
                <Interests label="Brands" items={top(profile.brandAffinity, 6)} />
              </Card>
            </Block>
          ) : null}

          {profile.suggestedQueries.length > 0 ? (
            <Block title="Suggested for you">
              <View style={styles.chips}>
                {profile.suggestedQueries.map((q) => (
                  <Chip key={q} label={q} icon="search" onPress={() => search(q)} accessibilityLabel={`Search for ${q}`} />
                ))}
              </View>
            </Block>
          ) : null}
        </>
      ) : null}
    </View>
  ) : null;

  const controlColumn = (
    <View style={{ gap: space.lg }}>
      <Block title="Shopping settings" subtitle="What turns a shelf price into the total you would pay." first={isDesktop}>
        <ShoppingSettings />
      </Block>

      <Block title="Your controls">
        <Card style={styles.pad}>
          <ToggleRow
            testID="learning-toggle"
            label="Learn from my activity"
            detail={
              paused
                ? 'Paused. Nothing you do is recorded or sent. Results are no longer tailored by new activity.'
                : 'On. Your activity is used to order offers the way you tend to choose.'
            }
            value={!paused}
            onValueChange={(on) => setPaused(!on)}
          />
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <Text variant="bodyStrong">Delete my data</Text>
          <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }}>
            Erases your profile, activity and price alerts from the server, clears saved items, recent searches, ZIP code and memberships on this device, and gives you a new anonymous ID.
          </Text>
          <Button testID="delete-data" variant="destructive" icon="trash-outline" label="Delete my data" onPress={() => { setDeleteError(null); setConfirming(true); }} style={{ marginTop: space.md }} />
          {deleted ? (
            <View testID="delete-done">
              <Banner tone="info" compact icon="checkmark-circle" text="Deleted. You are starting fresh with a new anonymous ID." style={{ marginTop: space.md }} />
            </View>
          ) : null}
        </Card>
      </Block>

      <Block title="What is collected">
        <Card style={styles.pad}>
          <Collected icon="search-outline" title="Searches and questions" detail="The words you search for, and the full text of anything you ask in plain English." />
          <Collected icon="location-outline" title="ZIP code and memberships" detail="If you set them, they are sent with every search, product and alert request, to estimate tax and decide which member prices apply. They are stored on this device." />
          <Collected icon="eye-outline" title="Products you open" detail="Which product, its category and brand." />
          <Collected icon="open-outline" title="Offers you tap" detail="The store, the price, where it sat in the list, and whether it was the cheapest — or how much more you chose to pay." />
          <Collected icon="bookmark-outline" title="Saves" detail="When you save or remove a product. The saved list itself stays on this device." />
          <Collected icon="notifications-outline" title="Price alerts" detail="The product and target price of each alert and, only if you allow notifications, a push token so the alert can reach this device." />
          <Collected icon="barcode-outline" title="Barcodes" detail="Only the number of a code you scan or type. Camera images never leave your device." />
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <Text variant="bodyStrong">How an AI model is involved</Text>
          <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }} testID="ai-disclosure">
            On the server, your activity may be summarized by an AI model (Anthropic’s Claude) to write the description of how you shop, and plain-English questions may be interpreted by the same model. When it is not used, fixed rules do the job, and the screen says which one it was.
          </Text>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <Text variant="bodyStrong">What is not collected</Text>
          <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }}>
            No name, email, account, contacts or precise location; the only location is a ZIP code you choose to enter. Activity is tied only to an anonymous ID issued to this device, and events are sent in small batches every few seconds.
          </Text>
          <View style={[styles.idBox, { backgroundColor: c.fill }]}>
            <Text variant="caption" tone="textTertiary">
              Anonymous ID
            </Text>
            <Text variant="footnote" tone="textSecondary" selectable testID="device-id" style={styles.mono}>
              {deviceId || 'Not registered yet (offline)'}
            </Text>
          </View>
        </Card>
      </Block>

      <Block title="About & legal">
        <Card style={styles.rows}>
          {LEGAL_ORDER.map((doc, i) => (
            <ListRow key={doc} testID={`legal-${doc}`} icon={LEGAL_DOCS[doc].icon} title={LEGAL_DOCS[doc].title} divider={i > 0} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} />
          ))}
          {DEV_ROUTES ? <ListRow testID="dev-components" icon="construct-outline" title="Component gallery" subtitle="Development builds only" divider onPress={() => router.push('/dev/components')} /> : null}
        </Card>
      </Block>
    </View>
  );

  return (
    <Screen topInset={isPhone}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching}
            onRefresh={() => {
              void flush(true).finally(() => void profileQuery.refetch());
            }}
            tintColor={c.textTertiary}
          />
        }
      >
        <Page>
          <View style={styles.header}>
            <Text variant="display" accessibilityRole="header">
              Your profile
            </Text>
            <Text variant="body" tone="textSecondary" style={styles.sub}>
              Everything {APP_NAME} has worked out about how you shop, in plain language — with your shopping settings and the controls to pause or erase it.
            </Text>
            <OfflineBanner />
          </View>
          {isDesktop ? (
            <View style={styles.columns}>
              <View style={styles.main}>{learnedColumn}</View>
              <View style={styles.aside}>{controlColumn}</View>
            </View>
          ) : (
            <View style={{ gap: space.lg }}>
              {learnedColumn}
              {controlColumn}
            </View>
          )}
        </Page>
      </ScrollView>

      <ConfirmDialog
        visible={confirming}
        title="Delete your data?"
        message="Your learned profile and activity are erased from the server, and saved items and recent searches are cleared from this device. This cannot be undone."
        confirmLabel="Delete"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

function Block({ title, subtitle, children, first }: { title: string; subtitle?: string; children: ReactNode; first?: boolean }) {
  return (
    <View style={[styles.block, first && styles.blockFirst]}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={{ marginTop: space.md }}>{children}</View>
    </View>
  );
}

function Fact({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="priceLarge" testID={testID} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="textSecondary">
        {label}
      </Text>
    </View>
  );
}

/** A 0–1 position on a labelled scale. */
function Meter({ label, value, low, high, words }: { label: string; value: number; low: string; high: string; words?: string }) {
  const { c } = useTheme();
  const v = Math.min(1, Math.max(0, value));
  return (
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={styles.meterHead}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="priceSmall" tone="textSecondary">
          {Math.round(v * 100)}%
        </Text>
      </View>
      {words ? (
        <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }}>
          {words}
        </Text>
      ) : null}
      <View style={[styles.track, { backgroundColor: c.fill }]}>
        <View style={[styles.trackFill, { width: `${v * 100}%`, backgroundColor: c.accent }]} />
        <View style={[styles.knob, { left: `${v * 100}%`, backgroundColor: c.surface, borderColor: c.accent }]} />
      </View>
      <View style={styles.axis}>
        <Text variant="caption" tone="textTertiary">
          {low}
        </Text>
        <Text variant="caption" tone="textTertiary">
          {high}
        </Text>
      </View>
    </View>
  );
}

/** Diverging bar from a neutral center: accent toward "prefers", gray toward "avoids". */
function AffinityRow({ id, value, member }: { id: RetailerId; value: number; member: boolean }) {
  const { c } = useTheme();
  const v = Math.min(1, Math.max(-1, value));
  const name = getRetailer(id).name;
  return (
    <View style={styles.affinity} accessible accessibilityLabel={`${name}: ${affinityWords(v)}${member ? ', member' : ''}`}>
      <View style={styles.affinityHead}>
        <RetailerMark id={id} size={22} />
        <Text variant="calloutStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
        {member ? <Badge kind="neutral" label="Member" icon="card-outline" /> : null}
        <Text variant="footnote" tone="textSecondary" style={styles.affinityWords}>
          {affinityWords(v)}
        </Text>
      </View>
      <View style={[styles.diverge, { backgroundColor: c.fill }]}>
        <View
          style={[
            styles.divergeFill,
            v >= 0
              ? { left: '50%', width: `${v * 50}%`, backgroundColor: c.accent, borderTopRightRadius: 4, borderBottomRightRadius: 4 }
              : { right: '50%', width: `${-v * 50}%`, backgroundColor: c.textTertiary, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
          ]}
        />
        <View style={[styles.zero, { backgroundColor: c.textSecondary }]} />
      </View>
    </View>
  );
}

function Interests({ label, items }: { label: string; items: string[] }) {
  const { c } = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.interests}>
      <Text variant="caption" tone="textTertiary" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <View style={styles.tags}>
        {items.map((item) => (
          <View key={item} style={[styles.tag, { backgroundColor: c.fill }]}>
            <Text variant="footnoteStrong">{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Collected({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.collected}>
      <View style={[styles.collectedIcon, { backgroundColor: c.fill }]}>
        <Ionicons name={icon} size={16} color={c.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="callout" tone="textSecondary">
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl + space.lg },
  header: { paddingTop: space.xxl, paddingBottom: space.lg },
  sub: { marginTop: 6, marginBottom: space.md, maxWidth: 620 },
  columns: { flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' },
  main: { flex: 6, minWidth: 0 },
  aside: { flex: 5, minWidth: 0 },
  pad: { padding: space.xl },
  block: { marginTop: space.sm },
  blockFirst: { marginTop: 0 },
  sourceRow: { flexDirection: 'row' },
  summary: { marginTop: space.md, lineHeight: 26 },
  facts: { flexDirection: 'row', gap: space.md, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  fact: { flex: 1, minWidth: 0, gap: 2 },
  insight: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  track: { height: 8, borderRadius: 4, marginTop: space.md, marginHorizontal: 8 },
  trackFill: { height: 8, borderRadius: 4 },
  knob: { position: 'absolute', top: -4, width: 16, height: 16, marginLeft: -8, borderRadius: 8, borderWidth: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  affinity: { paddingVertical: space.sm + 2 },
  affinityHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  affinityWords: { marginLeft: 'auto' },
  diverge: { height: 8, borderRadius: 4, marginTop: space.sm, overflow: 'hidden' },
  divergeFill: { position: 'absolute', top: 0, bottom: 0 },
  zero: { position: 'absolute', left: '50%', marginLeft: -1, top: 0, bottom: 0, width: 2 },
  interests: { marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
  rows: { paddingHorizontal: space.xl, paddingVertical: space.xs },
  collected: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  collectedIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  idBox: { marginTop: space.lg, padding: space.md, borderRadius: radius.sm, gap: 2 },
  mono: { fontVariant: ['tabular-nums'] },
});
