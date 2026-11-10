import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { RetailerId } from '@/api/contract';
import { compactCount } from '@/lib/format';
import { getRetailer } from '@/lib/retailers';
import { continuous, fonts, layout, radius, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** ---- Retailer mark: brand-colored tile with the retailer's initial ------- */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}

export const RetailerMark = memo(function RetailerMark({ id, size = 24 }: { id: RetailerId; size?: number }) {
  const { c } = useTheme();
  const r = getRetailer(id);
  const onColor = luminance(r.color) > 0.45 ? '#16161A' : '#FFFFFF';
  return (
    <View
      style={[
        continuous,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: r.color, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
        styles.center,
      ]}
    >
      <Text allowFontScaling={false} style={{ fontFamily: fonts.displayBold, fontSize: size * 0.54, lineHeight: size * 0.74, color: onColor }}>
        {r.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
});

/** ---- Pills ---------------------------------------------------------------- */
export type PillKind = 'best' | 'foryou' | 'neutral' | 'danger';

export function Pill({ kind, label, icon }: { kind: PillKind; label: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { c } = useTheme();
  const map = {
    best: { bg: c.bestSoft, fg: c.best },
    foryou: { bg: c.accentSoft, fg: c.accentText },
    neutral: { bg: c.fill, fg: c.textSecondary },
    danger: { bg: c.dangerSoft, fg: c.danger },
  }[kind];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={map.fg} /> : null}
      <Text variant="captionStrong" color={map.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** ---- Rating ---------------------------------------------------------------- */
export const Rating = memo(function Rating({ rating, count, size = 'sm' }: { rating: number | null; count: number; size?: 'sm' | 'md' }) {
  const { c } = useTheme();
  if (rating == null) {
    return (
      <Text variant={size === 'md' ? 'callout' : 'footnote'} tone="textTertiary">
        No ratings yet
      </Text>
    );
  }
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Rated ${rating.toFixed(1)} out of 5 from ${count.toLocaleString()} reviews`}
    >
      <Ionicons name="star" size={size === 'md' ? 15 : 13} color={c.star} />
      <Text variant={size === 'md' ? 'calloutStrong' : 'footnoteStrong'} style={{ marginLeft: 4 }}>
        {rating.toFixed(1)}
      </Text>
      <Text variant={size === 'md' ? 'callout' : 'footnote'} tone="textSecondary" style={{ marginLeft: 4 }}>
        ({compactCount(count)} {count === 1 ? 'review' : 'reviews'})
      </Text>
    </View>
  );
});

/** ---- Chip (filter / suggestion) -------------------------------------------- */
export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  role?: 'button' | 'checkbox' | 'radio';
}

export function Chip({ label, selected = false, onPress, leading, icon, accessibilityLabel, style, role = 'button' }: ChipProps) {
  const { c } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? undefined : { checked: selected, selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[
        styles.chip,
        continuous,
        { backgroundColor: selected ? c.text : c.surface, borderColor: selected ? c.text : c.border },
        style,
      ]}
    >
      {leading}
      {icon ? <Ionicons name={icon} size={15} color={selected ? c.bg : c.textSecondary} /> : null}
      <Text variant="calloutStrong" color={selected ? c.bg : c.text} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** ---- Buttons ----------------------------------------------------------------- */
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'quiet';
  icon?: keyof typeof Ionicons.glyphMap;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({ label, onPress, kind = 'primary', icon, trailingIcon, disabled, accessibilityLabel, accessibilityHint, style, testID }: ButtonProps) {
  const { c } = useTheme();
  const map = {
    primary: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    secondary: { bg: c.fill, fg: c.text, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: 'transparent' },
    quiet: { bg: 'transparent', fg: c.accentText, border: 'transparent' },
  }[kind];
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.button, continuous, { backgroundColor: map.bg, borderColor: map.border, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={map.fg} /> : null}
      <Text variant="bodyStrong" color={map.fg} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon ? <Ionicons name={trailingIcon} size={16} color={map.fg} /> : null}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active,
  tint,
  filled = true,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  label: string;
  active?: boolean;
  tint?: string;
  filled?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      scaleTo={0.9}
      style={[styles.iconButton, filled && { backgroundColor: c.fill }]}
    >
      <Ionicons name={icon} size={20} color={tint ?? c.text} />
    </PressableScale>
  );
}

/** ---- Card surface --------------------------------------------------------------- */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        continuous,
        { backgroundColor: t.c.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.c.border },
        t.shadow1,
        padded && { padding: space.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string | null; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flex: 1 }}>
        <Text variant="title2" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" tone="textSecondary" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  chip: {
    minHeight: 38,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  iconButton: { width: layout.minTouch, height: layout.minTouch, borderRadius: layout.minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.md },
});
