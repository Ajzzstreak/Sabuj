import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RetailerId } from '@/api/contract';
import { APP_NAME } from '@/config';
import { haptic } from '@/lib/haptics';
import { getRetailer } from '@/lib/retailers';
import { isZip, MEMBERSHIP_RETAILERS, shopperStore } from '@/state';
import { continuous, radius, space, useTheme } from '@/theme';
import { Card, RetailerMark } from './bits';
import { Text } from './Text';
import { Badge, Button, ListRow, Sheet, TextField, toast, ToggleRow } from './ui';

const ZIP_ERROR = 'Enter a 5-digit ZIP code, or leave it empty.';
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
 * First-run flow: why totals, ZIP, memberships. Every step can be skipped, and
 * skipping leaves the answer "not given" rather than guessing one.
 * Rendered by the root layout until `shopper.onboarded` is true.
 */
export function Onboarding() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [zipText, setZipText] = useState('');
  const [zip, setZip] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<RetailerId[]>([]);

  /** `answered` false = skipped: memberships stay unanswered. A ZIP confirmed on step 2 is kept either way. */
  const finish = (answered: boolean) => {
    haptic.success();
    shopperStore.set({ zip, memberships: answered ? memberships : null, onboarded: true });
  };
  const next = () => {
    if (step === 1) {
      if (zipText && !isZip(zipText)) return setZipError(ZIP_ERROR);
      setZip(zipText || null);
    }
    if (step === 2) return finish(true);
    haptic.light();
    setStep(step + 1);
  };

  return (
    <Modal visible animationType="fade" onRequestClose={() => (step > 0 ? setStep(step - 1) : finish(false))} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top + space.sm, paddingBottom: Math.max(insets.bottom, space.lg) }]} testID="onboarding">
        <View style={styles.column}>
          <View style={styles.top}>
            <View style={styles.dots} accessible accessibilityLabel={`Step ${step + 1} of 3`}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i === step ? c.accent : c.fillStrong, width: i === step ? 22 : 8 }]} />
              ))}
            </View>
            <Button label="Skip" variant="tertiary" size="sm" onPress={() => finish(false)} accessibilityLabel="Skip setup" testID="onboarding-skip" />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 0 ? (
              <>
                <Text variant="display" accessibilityRole="header">
                  The price you’ll actually pay.
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  {APP_NAME} compares the full total at every store, not the sticker price. Two optional questions make that total accurate for you.
                </Text>
                <View style={[styles.sample, continuous, { backgroundColor: c.surface, borderColor: c.border }]} accessible accessibilityLabel="Example: item 54.99, shipping 5.99, estimated tax 4.88, total 65.86">
                  <SampleLine label="Item" value="$54.99" />
                  <SampleLine label="Shipping" value="$5.99" />
                  <SampleLine label="Estimated tax" value="$4.88" />
                  <View style={[styles.rule, { backgroundColor: c.borderStrong }]} />
                  <SampleLine label="Total" value="$65.86" strong />
                </View>
              </>
            ) : step === 1 ? (
              <>
                <Text variant="title1" accessibilityRole="header">
                  What’s your ZIP code?
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  It is used to estimate sales tax, so totals are closer to what checkout will show. It is sent with your searches. Leave it empty to skip tax estimates.
                </Text>
                <TextField
                  testID="onboarding-zip"
                  label="ZIP code (optional)"
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
                  onSubmit={next}
                />
              </>
            ) : (
              <>
                <Text variant="title1" accessibilityRole="header">
                  Any warehouse memberships?
                </Text>
                <Text variant="body" tone="textSecondary" style={styles.lead}>
                  Member-only prices count only for the clubs you belong to. Leave both off if you have neither: those offers are then dimmed and never marked best price.
                </Text>
                <Card style={styles.toggles}>
                  <MembershipToggles value={memberships} onChange={setMemberships} testPrefix="onboarding-member" />
                </Card>
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {step > 0 ? <Button label="Back" variant="secondary" size="lg" onPress={() => setStep(step - 1)} testID="onboarding-back" /> : null}
            <Button label={step === 0 ? 'Get started' : step === 1 ? 'Next' : memberships.length ? 'Done' : 'I have neither'} size="lg" fullWidth style={styles.grow} onPress={next} testID="onboarding-next" />
          </View>
          <Text variant="footnote" tone="textTertiary" center style={styles.foot}>
            You can change both later in Your profile › Shopping settings.
          </Text>
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

  const answered = shopper.memberships != null;
  const held = shopper.memberships ?? [];
  const setMemberships = (next: RetailerId[] | null) => shopperStore.set((s) => ({ ...s, memberships: next }));
  const saveZip = () => {
    if (zipText && !isZip(zipText)) return setZipError(ZIP_ERROR);
    shopperStore.set((s) => ({ ...s, zip: zipText || null }));
    setEditingZip(false);
    toast(zipText ? `ZIP code set to ${zipText}. Totals now include estimated tax.` : 'ZIP code removed. Tax is no longer estimated.', 'success');
  };

  return (
    <Card style={styles.card}>
      <ListRow
        testID="settings-zip"
        icon="location-outline"
        title="ZIP code"
        subtitle="For estimated sales tax"
        value={shopper.zip ?? 'Not set'}
        accessibilityHint="Opens the ZIP code editor"
        onPress={() => {
          setZipText(shopper.zip ?? '');
          setZipError(null);
          setEditingZip(true);
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
                  shopperStore.set((s) => ({ ...s, zip: null }));
                  setEditingZip(false);
                  toast('ZIP code removed. Tax is no longer estimated.');
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
          hint="Used to estimate sales tax and sent with your searches."
          onSubmit={saveZip}
        />
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
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xl },
  lead: { marginTop: space.md, marginBottom: space.xl },
  sample: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  sampleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  toggles: { paddingVertical: space.xs },
  actions: { flexDirection: 'row', gap: space.md },
  grow: { flex: 1 },
  foot: { marginTop: space.md },
  card: { paddingHorizontal: space.xl, paddingVertical: space.md },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  inlineAction: { marginLeft: -space.sm },
});
