import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { describeError } from '@/api/client';
import { setAiConsent } from '@/api/queries';
import { APP_NAME } from '@/config';
import { haptic } from '@/lib/haptics';
import { settingsStore } from '@/state';
import { space, useTheme } from '@/theme';
import { Text } from './Text';
import { Banner, Button, Sheet } from './ui';

/**
 * What is sent to Anthropic when the user allows it. Checked against the code
 * that builds the requests: server/src/ask/claude.ts (the typed text, plus
 * catalog products) and server/src/profile/claude.ts (buildActivityDigest:
 * event counts, per-store click stats, top searches / categories / brands,
 * up to 30 recent events and the rules-based profile). Neither includes the
 * ZIP code, stores, device ID, token or a timestamp. Keep in step with them.
 */
export const AI_SENT = [
  'The words you type into Ask.',
  'A summary of your activity here: searches, the categories and brands of products you open or save, the stores you tap with their prices, and the shopping-list items you add or remove.',
] as const;
export const AI_NOT_SENT = 'Never your name or email (the app does not ask for them), your ZIP code or any location, or your device ID.';

export interface AiConsentSheetProps {
  visible: boolean;
  /** "Allow" (true) or "Not now" (false). Closing the sheet counts as "Not now". */
  onDecide: (allow: boolean) => void;
  /** Which answer is being saved, while it is. */
  busy?: boolean | null;
  error?: string | null;
}

/**
 * Saving an answer. "Not now" always closes the sheet: if the server cannot be
 * reached it is kept on this device (the server's default is already "no").
 * "Allow" only counts once the server has stored it.
 */
export function useConsentDecision(onDone?: (allowed: boolean) => void) {
  const client = useQueryClient();
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (allow: boolean) => {
    setBusy(allow);
    setError(null);
    try {
      await setAiConsent(client, allow);
      if (allow) haptic.success();
      onDone?.(allow);
    } catch (err) {
      if (allow) {
        haptic.warning();
        setError(`${describeError(err).title}. AI features were not turned on — try again, or choose Not now.`);
      } else {
        settingsStore.set((s) => ({ ...s, aiConsent: false }));
        onDone?.(false);
      }
    } finally {
      setBusy(null);
    }
  };
  return { decide, busy, error, clearError: () => setError(null) };
}

/** Explicit, optional permission to use Anthropic's Claude. Shown only when the server has AI available. */
export function AiConsentSheet({ visible, onDecide, busy = null, error }: AiConsentSheetProps) {
  const { c } = useTheme();
  const saving = busy != null;
  return (
    <Sheet
      visible={visible}
      onClose={() => onDecide(false)}
      dismissable={!saving}
      title="Use AI for smarter results?"
      testID="ai-consent-sheet"
      footer={
        <>
          <Button testID="ai-consent-no" variant="secondary" size="lg" label="Not now" onPress={() => onDecide(false)} loading={busy === false} disabled={saving} fullWidth style={styles.action} />
          <Button testID="ai-consent-yes" variant="primary" size="lg" label="Allow" onPress={() => onDecide(true)} loading={busy === true} disabled={saving} fullWidth style={styles.action} />
        </>
      }
    >
      <Text variant="body">
        {APP_NAME} can send some of your data to <Text variant="bodyStrong">Claude, an AI model made by Anthropic</Text> (a separate company), to understand questions you ask in plain English and to describe how you shop.
      </Text>

      <Text variant="footnoteStrong" tone="textSecondary" style={styles.label}>
        IF YOU ALLOW IT, WE SEND ANTHROPIC
      </Text>
      {AI_SENT.map((line) => (
        <Point key={line} icon="arrow-up-circle-outline" color={c.accentText} text={line} />
      ))}
      <Point icon="close-circle-outline" color={c.textSecondary} text={AI_NOT_SENT} />

      <Text variant="footnoteStrong" tone="textSecondary" style={styles.label}>
        IT IS OPTIONAL
      </Text>
      <Text variant="callout" tone="textSecondary">
        Without it, everything still works: questions are read by simpler fixed rules, and your profile is counted by rules on our server.
      </Text>
      <Text variant="callout" tone="textSecondary" style={styles.gap}>
        You can turn it off any time in Your profile › AI features. Sending stops at once and the AI-written profile is removed.
      </Text>
      {error ? <Banner tone="danger" compact text={error} style={styles.gap} /> : null}
    </Sheet>
  );
}

function Point({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={color} style={styles.pointIcon} />
      <Text variant="callout" style={styles.pointText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  label: { marginTop: space.lg, marginBottom: space.xs, letterSpacing: 0.4 },
  point: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  pointIcon: { marginTop: 1 },
  pointText: { flex: 1 },
  gap: { marginTop: space.md },
});
