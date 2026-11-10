import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { continuous, radius, space, useTheme } from '@/theme';
import { MINI_CARD_WIDTH } from './MiniProductCard';

/** A softly pulsing placeholder block. Used instead of spinners everywhere. */
export function Skeleton({ width, height, corner = 8, style }: { width?: DimensionValue; height: DimensionValue; corner?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width: width ?? '100%', height, borderRadius: corner, backgroundColor: c.skeleton }, animated, style]} />;
}

export function ProductCardSkeleton({ rows = 5 }: { rows?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={[styles.card, continuous, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel="Loading product"
      accessibilityRole="progressbar"
    >
      <View style={styles.header}>
        <Skeleton width={76} height={76} corner={radius.md} />
        <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
          <Skeleton width="30%" height={10} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="55%" height={12} />
        </View>
      </View>
      <View style={{ gap: 14, marginTop: space.lg, paddingHorizontal: 4 }}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={styles.row}>
            <Skeleton width={26} height={26} corner={8} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width={`${40 + ((i * 13) % 25)}%`} height={12} />
              <Skeleton width="30%" height={9} />
            </View>
            <Skeleton width={62} height={16} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function MiniCardSkeleton() {
  const { c } = useTheme();
  return (
    <View style={[styles.mini, continuous, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Skeleton height={122} corner={radius.md} />
      <Skeleton width="90%" height={13} style={{ marginTop: 14 }} />
      <Skeleton width="60%" height={13} style={{ marginTop: 7 }} />
      <Skeleton width="50%" height={22} style={{ marginTop: 16 }} />
      <Skeleton width="70%" height={10} style={{ marginTop: 9, marginBottom: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  header: { flexDirection: 'row', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mini: { width: MINI_CARD_WIDTH, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.sm + 2 },
});
