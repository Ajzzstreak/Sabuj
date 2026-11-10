import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { APP_NAME } from '@/config';
import { useLayout } from '@/hooks/useLayout';
import { haptic } from '@/lib/haptics';
import { savedStore } from '@/state';
import { fonts, layout, radius, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Glyph = keyof typeof Ionicons.glyphMap;
const TABS: Record<string, { label: string; icon: Glyph; iconActive: Glyph }> = {
  index: { label: 'Search', icon: 'search-outline', iconActive: 'search' },
  saved: { label: 'Saved', icon: 'bookmark-outline', iconActive: 'bookmark' },
  profile: { label: 'Your profile', icon: 'sparkles-outline', iconActive: 'sparkles' },
};

export const WIDE_TAB_BAR_MIN = layout.tabletMin;

/** Bottom bar on phones; a top navigation bar with the wordmark on tablets and desktops. */
export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { c } = useTheme();
  const { width, gutter } = useLayout();
  const wide = width >= WIDE_TAB_BAR_MIN;
  const savedCount = savedStore.use((s) => Object.keys(s).length);

  const items = state.routes.map((route, index) => {
    const meta = TABS[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    const badge = route.name === 'saved' && savedCount > 0 ? savedCount : 0;
    return (
      <PressableScale
        key={route.key}
        testID={`tab-${route.name}`}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${meta.label}, ${badge} items` : meta.label}
        scaleTo={0.94}
        onPress={() => {
          if (!focused) haptic.selection();
          navigateToTab(route.key);
        }}
        style={wide ? [styles.wideItem, focused && { backgroundColor: c.fill }] : styles.item}
      >
        <View>
          <Ionicons name={focused ? meta.iconActive : meta.icon} size={wide ? 17 : 23} color={focused ? c.accent : c.textSecondary} />
          {badge && !wide ? <View style={[styles.dot, { backgroundColor: c.accent, borderColor: c.surface }]} /> : null}
        </View>
        <Text
          variant={wide ? 'calloutStrong' : 'captionStrong'}
          color={focused ? (wide ? c.text : c.accentText) : c.textSecondary}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {meta.label}
          {badge && wide ? `  ${badge}` : ''}
        </Text>
      </PressableScale>
    );
  });

  if (wide) {
    return (
      <View style={[styles.wideBar, { backgroundColor: c.bg, borderBottomColor: c.border, paddingTop: insets.top }]}>
        <View style={[styles.wideInner, { paddingHorizontal: gutter }]}>
          <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel={APP_NAME}>
            <View style={[styles.logo, { backgroundColor: c.accent }]}>
              <Ionicons name="pricetags" size={15} color={c.onAccent} />
            </View>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 21, letterSpacing: -0.5 }}>{APP_NAME}</Text>
          </View>
          <View style={styles.wideTabs} accessibilityRole="tablist">
            {items}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 6) }]}
    >
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  item: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dot: { position: 'absolute', top: -2, right: -6, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  wideBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  wideInner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  logo: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  wideTabs: { flexDirection: 'row', gap: 4 },
  wideItem: { minHeight: layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: space.lg, borderRadius: radius.pill },
});
