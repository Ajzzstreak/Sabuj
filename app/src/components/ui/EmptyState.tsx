import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';
import { Text } from '../Text';
import type { Glyph } from './Button';

export interface EmptyStateProps {
  icon: Glyph;
  title: string;
  detail?: string;
  /** One or two Buttons. */
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  compact?: boolean;
  testID?: string;
}

/** Centered message for empty, not-found and error states. */
export function EmptyState({ icon, title, detail, action, tone = 'neutral', compact, testID }: EmptyStateProps) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.wrap, compact && styles.compact]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <View style={[styles.icon, { backgroundColor: tone === 'danger' ? c.dangerSoft : c.fill }]}>
        <Ionicons name={icon} size={26} color={tone === 'danger' ? c.danger : c.textSecondary} />
      </View>
      <Text variant="title2" center>
        {title}
      </Text>
      {detail ? (
        <Text variant="body" tone="textSecondary" center style={styles.detail}>
          {detail}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.xxxl + space.lg, paddingHorizontal: space.xxl, maxWidth: 460, alignSelf: 'center' },
  compact: { paddingVertical: space.xxl },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  detail: { marginTop: space.sm },
  action: { marginTop: space.lg, alignItems: 'center', gap: space.xs },
});
