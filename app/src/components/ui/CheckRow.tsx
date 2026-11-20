import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';
import { PressableScale, useFocusRing, type ForcedState } from '../PressableScale';
import { Text } from '../Text';

export interface CheckRowProps {
  label: string;
  detail?: string;
  /** Rich replacement for the detail line. */
  detailNode?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** "checkbox": square, any number on. "radio": round, one of a group. */
  kind?: 'checkbox' | 'radio';
  /** Strike the label through when checked (a shopping list being ticked off). */
  strikeWhenChecked?: boolean;
  /** Controls to the right of the row, outside the pressable area (e.g. a QuantityStepper). */
  trailing?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  forceState?: ForcedState;
}

/** A row that is ticked or selected: shopping-list items, store choices. */
export function CheckRow({ label, detail, detailNode, checked, onChange, kind = 'checkbox', strikeWhenChecked, trailing, disabled = false, divider, accessibilityLabel, testID, forceState }: CheckRowProps) {
  const { c } = useTheme();
  const ring = useFocusRing();
  const round = kind === 'radio';
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
      <PressableScale
        testID={testID}
        disabled={disabled}
        ring={false}
        scaleTo={0.99}
        forceState={forceState}
        accessibilityRole={kind}
        accessibilityState={{ checked, selected: checked, disabled }}
        accessibilityLabel={accessibilityLabel ?? [label, detail].filter(Boolean).join(', ')}
        onPress={() => onChange(round ? true : !checked)}
        style={styles.press}
      >
        {({ focusVisible }) => (
          <View style={[styles.inner, disabled && styles.disabled]}>
            <View style={[styles.box, round && styles.round, { borderColor: checked ? c.accent : c.borderStrong, backgroundColor: checked && !round ? c.accent : 'transparent' }, focusVisible && ring]}>
              {checked ? round ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : <Ionicons name="checkmark" size={16} color={c.onAccent} /> : null}
            </View>
            <View style={styles.text}>
              <Text variant="body" tone={checked && strikeWhenChecked ? 'textTertiary' : 'text'} numberOfLines={2} style={checked && strikeWhenChecked ? styles.strike : undefined}>
                {label}
              </Text>
              {detailNode ??
                (detail ? (
                  <Text variant="footnote" tone="textSecondary" numberOfLines={2}>
                    {detail}
                  </Text>
                ) : null)}
            </View>
          </View>
        )}
      </PressableScale>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  press: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: 'center', borderRadius: 10 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  disabled: { opacity: 0.45 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  round: { borderRadius: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { flex: 1, minWidth: 0 },
  strike: { textDecorationLine: 'line-through' },
});
