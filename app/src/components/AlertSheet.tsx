import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { describeError } from '@/api/client';
import type { PriceAlert, Product } from '@/api/contract';
import { createAlert, deleteAlert, useAlerts } from '@/api/queries';
import { APP_NAME } from '@/config';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { bestPrice } from '@/lib/offers';
import { alertSheet, showAlertSheet } from '@/lib/overlays';
import { getPushPermission, pushSupported, requestPushPermission, syncPushToken } from '@/lib/push';
import { alertPrefsStore } from '@/state';
import { space } from '@/theme';
import { Text } from './Text';
import { Banner, Button, Chip, Sheet, TextField, toast, type ButtonSize, type ButtonVariant } from './ui';

const DROPS = [5, 10, 20] as const;
const cents = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);

export function useAlertFor(productId: string): PriceAlert | null {
  const alerts = useAlerts();
  return alerts.data?.find((a) => a.productId === productId) ?? null;
}

/** "Alert me" / "Alert at $42" — opens the alert sheet for this product. */
export function AlertButton({ product, size = 'md', variant = 'secondary', fullWidth }: { product: Product; size?: ButtonSize; variant?: ButtonVariant; fullWidth?: boolean }) {
  const existing = useAlertFor(product.id);
  return (
    <Button
      testID="alert-button"
      label={existing ? `Alert at ${money(existing.targetPrice)}` : 'Alert me'}
      icon={existing ? 'notifications' : 'notifications-outline'}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      accessibilityLabel={existing ? `Price alert set at ${money(existing.targetPrice)} for ${product.title}. Edit` : `Alert me when the price of ${product.title} drops`}
      onPress={() => showAlertSheet(product)}
    />
  );
}

/** Mounted once at the root; opened with showAlertSheet(product). */
export function AlertSheet() {
  const product = alertSheet.use();
  if (!product) return null;
  return <AlertForm key={product.id} product={product} onClose={() => alertSheet.set(null)} />;
}

function AlertForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const client = useQueryClient();
  const existing = useAlertFor(product.id);
  const best = bestPrice(product);
  // Prefilled a little under today's best total; an existing alert shows its own target.
  const [text, setText] = useState(() => (existing ? existing.targetPrice.toFixed(2) : best != null ? cents(best * 0.97) : ''));
  const [step, setStep] = useState<'form' | 'push'>('form');
  const [busy, setBusy] = useState<null | 'save' | 'delete' | 'allow' | 'skip'>(null);
  const [error, setError] = useState<string | null>(null);

  const value = /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Number(text.trim()) : NaN;
  const problem = !text.trim()
    ? 'Enter the total price you want to be told about.'
    : Number.isNaN(value) || value <= 0
      ? 'Enter a price like 49.99.'
      : best != null && value >= best
        ? `That is not below the current best total (${money(best)}).`
        : null;

  const commit = async (via: 'save' | 'allow' | 'skip') => {
    setBusy(via);
    setError(null);
    try {
      const created = await createAlert(client, product.id, value);
      // The API has no "update": a changed target is a new alert replacing the old one.
      if (existing && existing.id !== created.id) await deleteAlert(client, existing.id).catch(() => undefined);
      const pushed = await syncPushToken();
      haptic.success();
      toast(pushed ? `Alert set. We'll notify you at ${money(value)}.` : `Alert set at ${money(value)}. Check Saved › Alerts.`, 'success');
      onClose();
    } catch (err) {
      haptic.warning();
      setStep('form');
      setError(`${describeError(err).title}. The alert was not saved.`);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (problem) return setError(problem);
    // Ask for notification permission only now, the first time an alert is created, and explain first.
    if (pushSupported && !alertPrefsStore.get().pushAsked && (await getPushPermission()) === 'undetermined') {
      setError(null);
      return setStep('push');
    }
    await commit('save');
  };

  const answerPush = async (allow: boolean) => {
    alertPrefsStore.set((s) => ({ ...s, pushAsked: true }));
    if (allow) {
      setBusy('allow');
      await requestPushPermission();
    }
    await commit(allow ? 'allow' : 'skip');
  };

  const remove = async () => {
    if (!existing) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteAlert(client, existing.id);
      toast('Alert deleted.');
      onClose();
    } catch (err) {
      setError(`${describeError(err).title}. The alert was not deleted.`);
    } finally {
      setBusy(null);
    }
  };

  if (step === 'push') {
    return (
      <Sheet
        visible
        onClose={onClose}
        dismissable={busy == null}
        title="Get notified when it drops?"
        testID="alert-push-step"
        footer={
          <>
            <Button label="Not now" variant="secondary" size="lg" style={styles.grow} fullWidth disabled={busy != null && busy !== 'skip'} loading={busy === 'skip'} onPress={() => void answerPush(false)} testID="push-skip" />
            <Button label="Turn on" icon="notifications" size="lg" style={styles.grow} fullWidth disabled={busy != null && busy !== 'allow'} loading={busy === 'allow'} onPress={() => void answerPush(true)} testID="push-allow" />
          </>
        }
      >
        <Text variant="body" tone="textSecondary">
          {APP_NAME} can send one notification when this product reaches {money(value)}. That is the only thing notifications are used for.
        </Text>
        <Text variant="body" tone="textSecondary" style={styles.gap}>
          If you say no, the alert still works: you will see it under Saved › Alerts the next time you open the app.
        </Text>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      dismissable={busy == null}
      title={existing ? 'Edit price alert' : 'Alert me when the price drops'}
      testID="alert-sheet"
      footer={
        <>
          {existing ? <Button label="Delete" variant="destructive" size="lg" icon="trash-outline" disabled={busy != null && busy !== 'delete'} loading={busy === 'delete'} onPress={() => void remove()} testID="alert-delete" /> : null}
          <Button label={existing ? 'Update alert' : 'Set alert'} size="lg" fullWidth style={styles.grow} disabled={busy != null && busy !== 'save'} loading={busy === 'save'} onPress={() => void save()} testID="alert-save" />
        </>
      }
    >
      <Text variant="calloutStrong" numberOfLines={2}>
        {product.title}
      </Text>
      <Text variant="callout" tone="textSecondary" style={styles.current}>
        {best != null ? `Best total right now: ${money(best)}` : 'No store has this in stock at a known price right now.'}
      </Text>
      <TextField
        testID="alert-target"
        label="Tell me when the total is at or below"
        value={text}
        onChangeText={(v) => {
          setText(v.replace(/[^0-9.]/g, ''));
          setError(null);
        }}
        prefix="$"
        placeholder="0.00"
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={9}
        error={error}
        hint="Total means item + shipping + estimated tax."
        onSubmit={() => void save()}
      />
      {best != null ? (
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Quick targets">
          {DROPS.map((pct) => {
            const v = cents(best * (1 - pct / 100));
            return (
              <Chip
                key={pct}
                testID={`alert-drop-${pct}`}
                role="radio"
                label={`−${pct}%`}
                selected={text === v}
                accessibilityLabel={`${pct} percent below the current best: ${money(Number(v))}`}
                onPress={() => {
                  haptic.selection();
                  setText(v);
                  setError(null);
                }}
              />
            );
          })}
        </View>
      ) : null}
      {!pushSupported ? <Banner tone="info" compact icon="notifications-off-outline" text="This version does not send notifications. A triggered alert is badged on the Saved tab." style={styles.gap} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  gap: { marginTop: space.md },
  current: { marginTop: 2, marginBottom: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, marginTop: space.sm },
});
