import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { layout, useTheme } from '@/theme';
import { PressableScale, useFocusRing, type ForcedState } from '../PressableScale';
import type { Glyph } from './Button';

export interface IconButtonProps {
  icon: Glyph;
  /** Required: an icon alone says nothing to a screen reader. */
  label: string;
  onPress?: () => void;
  /** Visible circle: 44 ("md") or 32 ("sm"). The touch target is 44 either way. */
  size?: 'sm' | 'md';
  variant?: 'filled' | 'plain' | 'accent';
  /** For toggles (bookmark, torch): announced as selected. */
  active?: boolean;
  tint?: string;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  forceState?: ForcedState;
}

export function IconButton({ icon, label, onPress, size = 'md', variant = 'filled', active, tint, disabled = false, loading = false, testID, style, forceState }: IconButtonProps) {
  const { c } = useTheme();
  const ring = useFocusRing();
  const d = size === 'md' ? layout.minTouch : 32;
  const bg = variant === 'filled' ? c.fill : variant === 'accent' ? c.accentSoft : 'transparent';
  const fg = tint ?? (variant === 'accent' ? c.accentText : c.text);
  const inert = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={inert}
      ring={false}
      forceState={forceState}
      scaleTo={0.9}
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading, ...(active === undefined ? null : { selected: active }) }}
      style={[styles.target, style]}
    >
      {({ focusVisible }) => (
        <View style={[styles.shape, { width: d, height: d, borderRadius: d / 2, backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, focusVisible && ring]}>
          {loading ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={size === 'md' ? 20 : 18} color={fg} />}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  target: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  shape: { alignItems: 'center', justifyContent: 'center' },
});
