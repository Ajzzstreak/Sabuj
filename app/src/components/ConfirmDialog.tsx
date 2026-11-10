import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { continuous, radius, space, useTheme } from '@/theme';
import { Button } from './bits';
import { Text } from './Text';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A destructive-action confirmation that looks the same on every platform. */
export function ConfirmDialog({ visible, title, message, confirmLabel, busy, error, onConfirm, onCancel }: ConfirmDialogProps) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.c.overlay }]} onPress={busy ? undefined : onCancel} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, continuous, { backgroundColor: t.c.surface }, t.shadow2]} accessibilityViewIsModal accessibilityRole="alert">
          <Text variant="title2" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="textSecondary" style={styles.message}>
            {message}
          </Text>
          {error ? (
            <Text variant="callout" tone="danger" style={styles.message} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button testID="confirm-cancel" kind="secondary" label="Cancel" onPress={onCancel} disabled={busy} style={styles.action} />
            <Button testID="confirm-ok" kind="danger" label={busy ? 'Deleting…' : confirmLabel} onPress={onConfirm} disabled={busy} style={styles.action} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.xl, padding: space.xxl },
  message: { marginTop: space.sm },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  action: { flex: 1, paddingHorizontal: space.md },
});
