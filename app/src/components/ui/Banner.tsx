import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { continuous, radius, space, useTheme } from '@/theme';
import { Text } from '../Text';
import { Button, type Glyph } from './Button';
import { IconButton } from './IconButton';

export type BannerTone = 'info' | 'accent' | 'notice' | 'danger';

export interface BannerProps {
  tone?: BannerTone;
  icon?: Glyph;
  title?: string;
  text: string;
  action?: { label: string; onPress: () => void; testID?: string };
  onDismiss?: () => void;
  /** One-line strip instead of a padded block. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICONS: Record<BannerTone, Glyph> = { info: 'information-circle-outline', accent: 'sparkles', notice: 'flask-outline', danger: 'alert-circle-outline' };

/** Inline message that stays on screen: notices, explanations, recoverable problems. */
export function Banner({ tone = 'info', icon, title, text, action, onDismiss, compact = false, style, testID }: BannerProps) {
  const { c } = useTheme();
  const look = {
    info: { bg: c.fill, fg: c.textSecondary, strong: c.text },
    accent: { bg: c.accentSoft, fg: c.accentText, strong: c.accentText },
    notice: { bg: c.noticeSoft, fg: c.notice, strong: c.notice },
    danger: { bg: c.dangerSoft, fg: c.danger, strong: c.danger },
  }[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.banner, continuous, compact && styles.compact, { backgroundColor: look.bg }, style]}
    >
      <Ionicons name={icon ?? ICONS[tone]} size={compact ? 15 : 18} color={look.fg} style={compact ? undefined : styles.icon} />
      <View style={styles.text}>
        {title ? (
          <Text variant={compact ? 'footnoteStrong' : 'calloutStrong'} color={look.strong}>
            {title}
          </Text>
        ) : null}
        <Text variant={compact ? 'footnote' : 'callout'} color={tone === 'info' ? c.textSecondary : look.fg}>
          {text}
        </Text>
        {action ? <Button label={action.label} onPress={action.onPress} variant="tertiary" size="sm" testID={action.testID} style={styles.action} /> : null}
      </View>
      {onDismiss ? <IconButton icon="close" label="Dismiss" size="sm" variant="plain" tint={look.fg} onPress={onDismiss} style={styles.dismiss} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: space.md, padding: space.md + 2, borderRadius: radius.md },
  compact: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0 },
  action: { marginLeft: -space.sm, marginBottom: -space.sm },
  dismiss: { marginVertical: -space.sm, marginRight: -space.sm },
});
