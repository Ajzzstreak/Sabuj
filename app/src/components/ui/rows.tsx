import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { space, useTheme } from '@/theme';
import { PressableScale, type ForcedState } from '../PressableScale';
import { Text } from '../Text';
import type { Glyph } from './Button';

function RowIcon({ icon, danger }: { icon: Glyph; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.icon, { backgroundColor: danger ? c.dangerSoft : c.fill }]}>
      <Ionicons name={icon} size={16} color={danger ? c.danger : c.textSecondary} />
    </View>
  );
}

export interface ListRowProps {
  title: string;
  /** Rich replacement for the title text (the plain `title` still labels the row). */
  titleNode?: ReactNode;
  subtitle?: string;
  /** Right-aligned current value, e.g. a ZIP code. */
  value?: string;
  icon?: Glyph;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Omit for a static row. Pressable rows get a chevron unless `chevron` is false. */
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Draw a hairline above the row (for rows after the first in a group). */
  divider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  testID?: string;
  forceState?: ForcedState;
}

/** A settings / navigation / suggestion row. Full-width, at least 52pt tall. */
export function ListRow({ title, titleNode, subtitle, value, icon, leading, trailing, onPress, chevron = true, destructive, disabled = false, divider, accessibilityLabel, accessibilityHint, accessibilityRole = 'button', testID, forceState }: ListRowProps) {
  const { c } = useTheme();
  const content = (
    <>
      {leading ?? (icon ? <RowIcon icon={icon} danger={destructive} /> : null)}
      <View style={styles.text}>
        {titleNode ?? (
          <Text variant="body" tone={destructive ? 'danger' : 'text'} numberOfLines={2}>
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text variant="footnote" tone="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" tone="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={16} color={c.textTertiary} /> : null}
    </>
  );
  const line = divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border };
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.row, line]}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.99}
      forceState={forceState}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={[styles.pressable, line]}
    >
      {/* Dimmed on an inner view: the touchable animates its own opacity. */}
      <View style={[styles.row, disabled && styles.disabled]}>{content}</View>
    </PressableScale>
  );
}

export interface ToggleRowProps {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  icon?: Glyph;
  leading?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
  testID?: string;
}

/** A labelled switch. The whole row is described to assistive tech by its label. */
export function ToggleRow({ label, detail, value, onValueChange, icon, leading, disabled = false, divider, testID }: ToggleRowProps) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, disabled && styles.disabled]}>
      {leading ?? (icon ? <RowIcon icon={icon} /> : null)}
      <View style={styles.text}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="callout" tone="textSecondary" style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.switchTarget}>
        <Switch
          testID={testID}
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            haptic.selection();
            onValueChange(next);
          }}
          trackColor={{ false: c.fillStrong, true: c.accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={c.fillStrong}
          accessibilityLabel={label}
          accessibilityHint={detail}
          {...({ activeThumbColor: '#FFFFFF' } as object)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  pressable: { borderRadius: 10 },
  disabled: { opacity: 0.45 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  value: { maxWidth: '45%' },
  detail: { marginTop: 2 },
  switchTarget: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
