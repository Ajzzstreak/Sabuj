import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { layout, radius, useTheme } from '@/theme';
import { PressableScale, useFocusRing, type ForcedState } from '../PressableScale';
import { Text } from '../Text';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** What is being counted, for screen readers: "Quantity of milk". */
  label: string;
  min?: number;
  max?: number;
  /**
   * When given, the minus button at the minimum becomes a remove (trash)
   * button instead of being disabled.
   */
  onRemove?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Gallery only: applied to the plus button. */
  forceState?: ForcedState;
}

/** − 2 + . Each half is a 44pt target. */
export function QuantityStepper({ value, onChange, label, min = 1, max = 99, onRemove, disabled = false, style, testID, forceState }: QuantityStepperProps) {
  const { c } = useTheme();
  const ring = useFocusRing();
  const atMin = value <= min;
  const atMax = value >= max;
  const removing = atMin && onRemove != null;
  const half = (kind: 'dec' | 'inc') => {
    const off = disabled || (kind === 'dec' ? atMin && !removing : atMax);
    return (
      <PressableScale
        testID={testID ? `${testID}-${kind}` : undefined}
        disabled={off}
        ring={false}
        scaleTo={0.9}
        forceState={kind === 'inc' ? forceState : undefined}
        accessibilityLabel={kind === 'inc' ? `Increase ${label}` : removing ? `Remove ${label}` : `Decrease ${label}`}
        accessibilityState={{ disabled: off }}
        onPress={() => {
          haptic.selection();
          if (kind === 'inc') onChange(value + 1);
          else if (removing) onRemove?.();
          else onChange(value - 1);
        }}
        style={styles.target}
      >
        {({ focusVisible }) => (
          <View style={[styles.button, { opacity: off ? 0.35 : 1 }, focusVisible && ring]}>
            <Ionicons name={kind === 'inc' ? 'add' : removing ? 'trash-outline' : 'remove'} size={removing && kind === 'dec' ? 16 : 18} color={c.text} />
          </View>
        )}
      </PressableScale>
    );
  };
  return (
    <View testID={testID} style={[styles.wrap, style]} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}>
      <View style={[styles.track, { backgroundColor: c.fill }]} />
      {half('dec')}
      <Text variant="calloutStrong" style={styles.value} testID={testID ? `${testID}-value` : undefined} accessibilityLiveRegion="polite">
        {value}
      </Text>
      {half('inc')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', height: layout.minTouch },
  // The visible pill is 36pt tall inside the 44pt row.
  track: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderRadius: radius.pill },
  target: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  button: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
