import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { layout, radius, space, useTheme } from '@/theme';
import { PressableScale, useFocusRing, type ForcedState } from '../PressableScale';
import { Text } from '../Text';
import { CountBadge } from './Badge';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  /** Small count shown after the label (e.g. triggered alerts). */
  badge?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Segments share the full width equally. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Gallery only: applies the state to the first unselected segment. */
  forceState?: ForcedState;
}

/** One-of-several switch: sort order, Saved | Alerts. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, disabled = false, fullWidth = false, style, testID, forceState }: SegmentedControlProps<T>) {
  const { c } = useTheme();
  const ring = useFocusRing();
  const firstIdle = options.find((o) => o.key !== value)?.key;
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: c.fill, opacity: disabled ? 0.45 : 1 }, fullWidth ? styles.full : styles.hug, style]}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressableScale
            key={o.key}
            testID={testID ? `${testID}-${o.key}` : undefined}
            disabled={disabled}
            ring={false}
            forceState={forceState && o.key === firstIdle ? forceState : undefined}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on, disabled }}
            accessibilityLabel={o.badge ? `${o.label}, ${o.badge} new` : o.label}
            onPress={() => {
              if (on) return;
              haptic.selection();
              onChange(o.key);
            }}
            style={fullWidth ? styles.grow : undefined}
          >
            {({ focusVisible }) => (
              <View style={[styles.segment, on && { backgroundColor: c.text }, focusVisible && ring]}>
                <Text variant="calloutStrong" color={on ? c.bg : c.text} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.badge ? <CountBadge count={o.badge} /> : null}
              </View>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.pill, padding: 3, gap: 2, minHeight: layout.minTouch },
  hug: { alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  grow: { flex: 1 },
  segment: { minHeight: 38, paddingHorizontal: space.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
