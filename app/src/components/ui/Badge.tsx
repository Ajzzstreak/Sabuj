import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { radius, useTheme } from '@/theme';
import { Text } from '../Text';
import type { Glyph } from './Button';

/** "best" (green) is reserved for best price and savings. */
export type BadgeKind = 'best' | 'accent' | 'neutral' | 'danger' | 'notice';

/** Small status label. Not interactive. */
export function Badge({ kind, label, icon }: { kind: BadgeKind; label: string; icon?: Glyph }) {
  const { c } = useTheme();
  const look = {
    best: { bg: c.bestSoft, fg: c.best },
    accent: { bg: c.accentSoft, fg: c.accentText },
    neutral: { bg: c.fill, fg: c.textSecondary },
    danger: { bg: c.dangerSoft, fg: c.danger },
    notice: { bg: c.noticeSoft, fg: c.notice },
  }[kind];
  return (
    <View style={[styles.badge, { backgroundColor: look.bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={look.fg} /> : null}
      <Text variant="captionStrong" color={look.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Numeric bubble for tabs and segments. Hidden at zero. */
export function CountBadge({ count, testID }: { count: number; testID?: string }) {
  const { c } = useTheme();
  if (count <= 0) return null;
  return (
    <View testID={testID} style={[styles.count, { backgroundColor: c.accent }]}>
      <Text variant="captionStrong" color={c.onAccent} allowFontScaling={false} style={styles.countText}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  count: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, lineHeight: 14 },
});
