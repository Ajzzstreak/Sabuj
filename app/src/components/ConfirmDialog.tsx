import { StyleSheet } from 'react-native';
import { space } from '@/theme';
import { Text } from './Text';
import { Banner, Button, Sheet } from './ui';

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
export function ConfirmDialog({ visible, title, message, confirmLabel, busy = false, error, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      dismissable={!busy}
      title={title}
      footer={
        <>
          <Button testID="confirm-cancel" variant="secondary" size="lg" label="Cancel" onPress={onCancel} disabled={busy} fullWidth style={styles.action} />
          <Button testID="confirm-ok" variant="destructive" size="lg" label={confirmLabel} onPress={onConfirm} loading={busy} fullWidth style={styles.action} />
        </>
      }
    >
      <Text variant="body" tone="textSecondary">
        {message}
      </Text>
      {error ? <Banner tone="danger" compact text={error} style={styles.error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  error: { marginTop: space.md },
});
