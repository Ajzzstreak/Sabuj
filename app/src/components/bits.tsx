import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { RetailerId } from '@/api/contract';
import { compactCount } from '@/lib/format';
import { getRetailer } from '@/lib/retailers';
import { continuous, fonts, radius, space, useTheme } from '@/theme';
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
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.md },
});
