import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { continuous, layout, radius, space, useTheme } from '@/theme';
import { PressableScale, useFocusRing, type ForcedState } from '../PressableScale';
import { Text } from '../Text';

export type Glyph = keyof typeof Ionicons.glyphMap;
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: Glyph;
  trailingIcon?: Glyph;
  /** Shows a spinner and ignores presses. The label stays so the width does not jump. */
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container's width. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  forceState?: ForcedState;
}

const SIZES = {
  sm: { height: 36, pad: space.md, icon: 16, text: 'calloutStrong', corner: radius.sm },
  md: { height: 44, pad: space.lg, icon: 18, text: 'bodyStrong', corner: radius.md - 2 },
  lg: { height: 52, pad: space.xl, icon: 18, text: 'bodyStrong', corner: radius.md },
} as const;

/**
 * The app's only button. The touch target is always at least 44pt tall even
 * when the visible shape (size "sm") is smaller.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  style,
  testID,
  forceState,
}: ButtonProps) {
  const { c } = useTheme();
  const ring = useFocusRing();
  const s = SIZES[size];
  const look = {
    primary: { bg: c.accent, fg: c.onAccent },
    secondary: { bg: c.fill, fg: c.text },
    tertiary: { bg: 'transparent', fg: c.accentText },
    destructive: { bg: c.dangerSoft, fg: c.danger },
  }[variant];
  const inert = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={inert}
      ring={false}
      forceState={forceState}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={[styles.target, fullWidth ? styles.full : styles.hug, style]}
    >
      {({ focusVisible }) => (
        <View
          style={[
            styles.shape,
            continuous,
            { height: s.height, borderRadius: s.corner, backgroundColor: look.bg, paddingHorizontal: variant === 'tertiary' ? space.sm : s.pad, opacity: disabled ? 0.45 : 1 },
            focusVisible && ring,
          ]}
        >
          {loading ? <ActivityIndicator size="small" color={look.fg} /> : icon ? <Ionicons name={icon} size={s.icon} color={look.fg} /> : null}
          <Text variant={s.text} color={look.fg} numberOfLines={1} style={styles.label}>
            {label}
          </Text>
          {trailingIcon && !loading ? <Ionicons name={trailingIcon} size={s.icon - 2} color={look.fg} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: layout.minTouch, justifyContent: 'center' },
  hug: { alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  shape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  label: { flexShrink: 1 },
});
