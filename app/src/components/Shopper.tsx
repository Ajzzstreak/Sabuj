import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RetailerId, Store } from '@/api/contract';
import { nearestPerRetailer, useStores } from '@/api/queries';
import { APP_NAME } from '@/config';
import { haptic } from '@/lib/haptics';
import { getRetailer, RETAILER_ORDER } from '@/lib/retailers';
import { isZip, MEMBERSHIP_RETAILERS, shopperStore } from '@/state';
import { continuous, radius, space, useTheme } from '@/theme';
import { Card, RetailerMark } from './bits';
import { Text } from './Text';
import { Skeleton } from './Skeleton';
import { Badge, Banner, Button, CheckRow, ListRow, Sheet, TextField, toast, ToggleRow } from './ui';

const ZIP_ERROR = 'Enter a 5-digit ZIP code.';
const NO_ZIP = 'Without a ZIP code, prices are national estimates rather than your stores’ shelf prices, and tax is not included.';
const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 5);

function MembershipToggles({ value, onChange, testPrefix }: { value: RetailerId[]; onChange: (next: RetailerId[]) => void; testPrefix: string }) {
  return (
    <View>
      {MEMBERSHIP_RETAILERS.map((id, i) => (
        <ToggleRow
          key={id}
          testID={`${testPrefix}-${id}`}
          label={getRetailer(id).name}
          leading={<RetailerMark id={id} size={30} />}
          divider={i > 0}
          value={value.includes(id)}
          onValueChange={(on) => onChange(on ? [...value.filter((v) => v !== id), id] : value.filter((v) => v !== id))}
        />
      ))}
    </View>
  );
}

/**
 * One store per retailer, grouped by retailer, nearest first. `value` null
 * means "not chosen yet": the nearest of each is shown selected, which is also
 * what the server uses on its own.
 */
export function StorePicker({ zip, value, onChange }: { zip: string; value: string[] | null; onChange: (next: string[]) => void }) {
  const stores = useStores(zip);
  if (stores.isPending) {
    return (
      <View style={{ gap: space.md }} accessibilityRole="progressbar" accessibilityLabel="Finding stores">
        <Skeleton height={56} corner={radius.md} />
        <Skeleton height={56} corner={radius.md} />
        <Skeleton height={56} corner={radius.md} />
      </View>
    );
  }
  if (stores.isError) return <Banner tone="danger" text="Stores near you could not be loaded. The nearest store of each chain will be used." action={{ label: 'Try again', onPress: () => void stores.refetch() }} />;
  const all = stores.data ?? [];
  if (all.length === 0) return <Banner tone="info" text={`No stores were found near ${zip}. Prices will be national estimates.`} />;
  const selected = value ?? nearestPerRetailer(all);
  const byRetailer = RETAILER_ORDER.map((id) => ({ id, stores: all.filter((st) => st.retailerId === id) })).filter((g) => g.stores.length > 0);
  const pick = (store: Store) => onChange([...selected.filter((id) => all.find((st) => st.id === id)?.retailerId !== store.retailerId), store.id]);
  return (
    <View style={{ gap: space.lg }} testID="store-picker">
      {byRetailer.map((group) => (
        <View key={group.id} accessibilityRole="radiogroup" accessibilityLabel={`${getRetailer(group.id).name} store`}>
          <View style={styles.groupHead}>
            <RetailerMark id={group.id} size={22} />
            <Text variant="calloutStrong">{getRetailer(group.id).name}</Text>
          </View>
          {group.stores.map((store, i) => (
            <CheckRow
              key={store.id}
              testID={`store-${store.id}`}
              kind="radio"
              label={store.name}
              detail={`${store.distanceMiles > 0 ? `${store.distanceMiles.toFixed(1)} mi · ` : ''}${store.address}`}
              checked={selected.includes(store.id)}
              onChange={() => pick(store)}
              divider={i > 0}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * First-run flow: why totals, ZIP, your stores, memberships. Every step can be
 * skipped, and skipping leaves the answer "not given" rather than guessing one.
 * Skipping the ZIP has a real cost for groceries, and the screen says what it is.
 * Rendered by the root layout until `shopper.onboarded` is true.
 */
export function Onboarding() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'intro' | 'zip' | 'stores' | 'members'>('intro');
  const [zipText, setZipText] = useState('');
  const [zip, setZip] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [storeIds, setStoreIds] = useState<string[] | null>(null);
  const [memberships, setMemberships] = useState<RetailerId[]>([]);
  const steps = zip ? (['intro', 'zip', 'stores', 'members'] as const) : (['intro', 'zip', 'members'] as const);
  const index = Math.max(0, (steps as readonly string[]).indexOf(step));

  /** `answered` false = skipped: memberships stay unanswered. A ZIP and stores already confirmed are kept either way. */
  const finish = (answered: boolean) => {
    haptic.success();
    shopperStore.set({ zip, storeIds: zip ? storeIds : null, memberships: answered ? memberships : null, onboarded: true });
  };
  const back = () => setStep(step === 'members' ? (zip ? 'stores' : 'zip') : step === 'stores' ? 'zip' : 'intro');
  const next = () => {
    haptic.light();
    if (step === 'intro') return setStep('zip');
    if (step === 'zip') {
      if (!isZip(zipText)) return setZipError(ZIP_ERROR);
      if (zipText !== zip) setStoreIds(null);
      setZip(zipText);
      return setStep('stores');
    }
    if (step === 'stores') return setStep('members');
    finish(true);
  };
  const withoutZip = () => {
    setZip(null);
    setStoreIds(null);
    setZipError(null);
    setStep('members');
  };

  return (
    <Modal visible animationType="fade" onRequestClose={() => (step !== 'intro' ? back() : finish(false))} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top + space.sm, paddingBottom: Math.max(insets.bottom, space.lg) }]} testID="onboarding">
        <View style={styles.column}>
          <View style={styles.top}>
            <View style={styles.dots} accessible accessibilityLabel={`Step ${index + 1} of ${steps.length}`}>
              {steps.map((name, i) => (
                <View key={name} style={[styles.dot, { backgroundColor: i === index ? c.accent : c.fillStrong, width: i === index ? 22 : 8 }]} />
              ))}
            </View>
            <Button label="Skip" variant="tertiary" size="sm" onPress={() => finish(false)} accessibilityLabel="Skip setup" testID="onboarding-skip" />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 'intro' ? (
              <>
                <Text variant="display" accessibilityRole="header">
                  Your grocery list, totaled at every store.
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  {APP_NAME} prices your whole list at the stores near you and shows where it costs least, including each store’s own brands. A ZIP code is what makes those prices yours.
                </Text>
                <View style={[styles.sample, continuous, { backgroundColor: c.surface, borderColor: c.border }]} accessible accessibilityLabel="Example: a 9 item list costs 41.20 at Kroger, 43.85 at Walmart, 47.10 at Target">
                  <SampleLine label="Kroger" value="$41.20" strong />
                  <SampleLine label="Walmart" value="$43.85" />
                  <SampleLine label="Target" value="$47.10" />
                  <View style={[styles.rule, { backgroundColor: c.borderStrong }]} />
                  <Text variant="footnote" tone="textSecondary">
                    Example totals for a 9-item list.
                  </Text>
                </View>
              </>
            ) : step === 'zip' ? (
              <>
                <Text variant="title1" accessibilityRole="header">
                  Where do you shop?
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  Grocery prices change from store to store. Your ZIP code finds the stores near you and estimates sales tax. It is sent with your searches.
                </Text>
                <TextField
                  testID="onboarding-zip"
                  label="ZIP code"
                  value={zipText}
                  onChangeText={(v) => {
                    setZipText(onlyDigits(v));
                    setZipError(null);
                  }}
                  placeholder="e.g. 45202"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  autoFocus
                  error={zipError}
                  onSubmit={next}
                />
                <Banner tone="info" compact text={NO_ZIP} style={styles.consequence} testID="onboarding-no-zip-note" />
              </>
            ) : step === 'stores' && zip ? (
              <>
                <Text variant="title1" accessibilityRole="header">
                  Your stores
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  Prices come from these locations. The nearest of each chain is selected; change any of them now or later.
                </Text>
                <StorePicker zip={zip} value={storeIds} onChange={setStoreIds} />
              </>
            ) : (
              <>
                <Text variant="title1" accessibilityRole="header">
                  Any warehouse memberships?
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  Club prices count only for the clubs you belong to. Leave both off if you have neither: those offers are then dimmed and never marked best.
                </Text>
                <Card style={styles.toggles}>
                  <MembershipToggles value={memberships} onChange={setMemberships} testPrefix="onboarding-member" />
                </Card>
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {step !== 'intro' ? <Button label="Back" variant="secondary" size="lg" onPress={back} testID="onboarding-back" /> : null}
            <Button
              label={step === 'intro' ? 'Get started' : step === 'zip' ? 'Find my stores' : step === 'stores' ? 'Use these stores' : memberships.length ? 'Done' : 'I have neither'}
              size="lg"
              fullWidth
              style={styles.grow}
              onPress={next}
              testID="onboarding-next"
            />
          </View>
          {step === 'zip' ? (
            <Button label="Continue without a ZIP code" variant="tertiary" size="sm" onPress={withoutZip} testID="onboarding-no-zip" style={styles.noZip} />
          ) : (
            <Text variant="footnote" tone="textTertiary" center style={styles.foot}>
              You can change all of this later in Your profile › Shopping settings.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SampleLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.sampleLine}>
      <Text variant={strong ? 'bodyStrong' : 'body'} tone={strong ? 'text' : 'textSecondary'}>
        {label}
      </Text>
      <Text variant={strong ? 'priceLarge' : 'price'}>{value}</Text>
    </View>
  );
}

/** Profile tab: the same two answers, editable any time. */
export function ShoppingSettings() {
  const { c } = useTheme();
  const shopper = shopperStore.use();
  const [editingZip, setEditingZip] = useState(false);
  const [zipText, setZipText] = useState('');
  const [zipError, setZipError] = useState<string | null>(null);
  const [editingStores, setEditingStores] = useState(false);
  const [storeDraft, setStoreDraft] = useState<string[] | null>(null);

  const answered = shopper.memberships != null;
  const held = shopper.memberships ?? [];
  const setMemberships = (next: RetailerId[] | null) => shopperStore.set((s) => ({ ...s, memberships: next }));
  const saveZip = () => {
    if (!isZip(zipText)) return setZipError(ZIP_ERROR);
    // A new ZIP means different stores: back to "nearest of each chain" until the user picks.
    shopperStore.set((s) => ({ ...s, zip: zipText, storeIds: zipText === s.zip ? s.storeIds : null }));
    setEditingZip(false);
    toast(`ZIP code set to ${zipText}. Prices now come from stores near you.`, 'success');
  };

  return (
    <Card style={styles.card}>
      <ListRow
        testID="settings-zip"
        icon="location-outline"
        title="ZIP code"
        subtitle="Finds your stores and estimates sales tax"
        value={shopper.zip ?? 'Not set'}
        accessibilityHint="Opens the ZIP code editor"
        onPress={() => {
          setZipText(shopper.zip ?? '');
          setZipError(null);
          setEditingZip(true);
        }}
      />
      <ListRow
        testID="settings-stores"
        icon="storefront-outline"
        title="Your stores"
        subtitle={shopper.zip ? 'Where shelf prices come from' : NO_ZIP}
        value={!shopper.zip ? undefined : shopper.storeIds?.length ? `${shopper.storeIds.length} chosen` : 'Nearest'}
        disabled={!shopper.zip}
        divider
        accessibilityHint="Opens the store picker"
        onPress={() => {
          setStoreDraft(shopper.storeIds);
          setEditingStores(true);
        }}
      />
      <View style={[styles.memberHead, { borderTopColor: c.border }]}>
        <Text variant="bodyStrong" style={styles.grow}>
          Memberships
        </Text>
        <View testID="membership-status">
          <Badge kind={answered ? 'neutral' : 'notice'} label={answered ? (held.length ? 'Answered' : 'Answered: none') : 'Not answered'} />
        </View>
      </View>
      <Text variant="callout" tone="textSecondary">
        {!answered
          ? 'You have not said which clubs you belong to, so member-only prices are shown as if you could buy them.'
          : held.length
            ? `Member prices count for ${held.map((id) => getRetailer(id).name).join(' and ')}. Other member-only offers are dimmed.`
            : 'You hold neither, so member-only offers are dimmed and never marked best price.'}
      </Text>
      <MembershipToggles value={held} onChange={setMemberships} testPrefix="settings-member" />
      {answered ? (
        <Button label="Clear my answer" variant="tertiary" size="sm" onPress={() => setMemberships(null)} testID="settings-member-clear" style={styles.inlineAction} />
      ) : (
        <Button label="I have neither" variant="tertiary" size="sm" onPress={() => setMemberships([])} testID="settings-member-none" style={styles.inlineAction} />
      )}

      <Sheet
        visible={editingZip}
        onClose={() => setEditingZip(false)}
        title="ZIP code"
        testID="zip-sheet"
        footer={
          <>
            {shopper.zip ? (
              <Button
                label="Remove"
                variant="destructive"
                size="lg"
                testID="zip-remove"
                onPress={() => {
                  shopperStore.set((s) => ({ ...s, zip: null, storeIds: null }));
                  setEditingZip(false);
                  toast('ZIP code removed. Prices are now national estimates.');
                }}
              />
            ) : null}
            <Button label="Save" size="lg" fullWidth style={styles.grow} onPress={saveZip} testID="zip-save" />
          </>
        }
      >
        <TextField
          testID="zip-input"
          label="ZIP code"
          value={zipText}
          onChangeText={(v) => {
            setZipText(onlyDigits(v));
            setZipError(null);
          }}
          placeholder="e.g. 94103"
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          autoFocus
          error={zipError}
          hint="Finds your stores, estimates sales tax, and is sent with your searches."
          onSubmit={saveZip}
        />
      </Sheet>

      <Sheet
        visible={editingStores}
        onClose={() => setEditingStores(false)}
        title="Your stores"
        testID="stores-sheet"
        footer={
          <Button
            label="Save"
            size="lg"
            fullWidth
            style={styles.grow}
            testID="stores-save"
            onPress={() => {
              shopperStore.set((s) => ({ ...s, storeIds: storeDraft }));
              setEditingStores(false);
              toast('Stores updated. Prices now come from these locations.', 'success');
            }}
          />
        }
      >
        {shopper.zip ? <StorePicker zip={shopper.zip} value={storeDraft} onChange={setStoreDraft} /> : null}
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xl },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.lg },
  lead: { marginTop: space.md, marginBottom: space.xl },
  sample: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  sampleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  toggles: { paddingVertical: space.xs },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  consequence: { marginTop: space.lg },
  noZip: { alignSelf: 'center', marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.md },
  grow: { flex: 1 },
  foot: { marginTop: space.md },
  card: { paddingHorizontal: space.xl, paddingVertical: space.md },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  inlineAction: { marginLeft: -space.sm },
});
