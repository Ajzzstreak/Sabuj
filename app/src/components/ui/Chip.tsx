import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { continuous, layout, radius, space, useTheme } from '@/theme';
import { PressableScale, useFocusRing, type ForcedState } from '../PressableScale';
import { Text } from '../Text';
import type { Glyph } from './Button';

export interface ChipProps {
  label: string;
  /** Filter chips: filled when on. */
  selected?: boolean;
  /** Omit for a static, non-interactive tag. */
  onPress?: () => void;
  leading?: ReactNode;
  icon?: Glyph;
  trailingIcon?: Glyph;
  /** "accent" is used for AI-understood values. */
  tone?: 'neutral' | 'accent';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  role?: 'button' | 'checkbox' | 'radio';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  forceState?: ForcedState;
}

/** Suggestion, filter or value chip. 36pt visible, 44pt touch target. */
export function Chip({ label, selected = false, onPress, leading, icon, trailingIcon, tone = 'neutral', disabled = false, accessibilityLabel, accessibilityHint, role = 'button', style, testID, forceState }: ChipProps) {
  const { c } = useTheme();
  const ring = useFocusRing();
  const accent = tone === 'accent' && !selected;
  const bg = selected ? c.text : accent ? c.accentSoft : c.surface;
  const fg = selected ? c.bg : accent ? c.accentText : c.text;
  const border = selected ? c.text : accent ? 'transparent' : c.border;
  const shape = (focusVisible: boolean) => (
    <View style={[styles.shape, continuous, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : 1 }, focusVisible && ring]}>
      {leading}
      {icon ? <Ionicons name={icon} size={15} color={selected ? c.bg : accent ? c.accentText : c.textSecondary} /> : null}
      <Text variant="calloutStrong" color={fg} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      {trailingIcon ? <Ionicons name={trailingIcon} size={14} color={selected ? c.bg : accent ? c.accentText : c.textSecondary} /> : null}
    </View>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.target, style]} accessible accessibilityLabel={accessibilityLabel ?? label}>
        {shape(false)}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      ring={false}
      forceState={forceState}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? { disabled } : { checked: selected, selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={[styles.target, style]}
    >
      {({ focusVisible }) => shape(focusVisible)}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: layout.minTouch, justifyContent: 'center', maxWidth: '100%' },
  shape: { height: 36, paddingHorizontal: space.md + 2, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexShrink: 1 },
});
