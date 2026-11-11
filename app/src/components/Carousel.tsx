import { memo, useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { Product } from '@/api/contract';
import { useLayout } from '@/hooks/useLayout';
import { layout, space } from '@/theme';
import { SectionTitle } from './bits';
import { MINI_CARD_WIDTH, MiniProductCard } from './MiniProductCard';
import { MiniCardSkeleton } from './Skeleton';
import { IconButton } from './ui';

const GAP = space.md;
const STEP = MINI_CARD_WIDTH + GAP;
const keyOf = (p: Product) => p.id;
const renderItem: ListRenderItem<Product> = ({ item }) => <MiniProductCard product={item} />;
const Separator = () => <View style={{ width: GAP }} />;

/** A titled, horizontally scrolling row of products that bleeds to the screen edge. */
export const Carousel = memo(function Carousel({ title, subtitle, products }: { title: string; subtitle?: string | null; products: Product[] }) {
  const { gutter, isDesktop, width } = useLayout();
  const ref = useRef<FlatList<Product>>(null);
  const [x, setX] = useState(0);
  // Bleed past the gutter, but keep the first card aligned with the page column.
  const side = Math.max(gutter, (width - layout.maxContentWidth) / 2 + gutter);
  const overflow = products.length * STEP - GAP > width - side * 2;

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => setX(e.nativeEvent.contentOffset.x), []);
  const page = (dir: 1 | -1) => ref.current?.scrollToOffset({ offset: Math.max(0, x + dir * STEP * 3), animated: true });

  return (
    <View style={styles.section}>
      <View style={[styles.head, { paddingHorizontal: side }]}>
        <SectionTitle
          title={title}
          subtitle={subtitle}
          right={
            isDesktop && overflow ? (
              <View style={styles.arrows}>
                <IconButton icon="chevron-back" label={`Scroll ${title} back`} onPress={() => page(-1)} />
                <IconButton icon="chevron-forward" label={`Scroll ${title} forward`} onPress={() => page(1)} />
              </View>
            ) : undefined
          }
        />
      </View>
      <FlatList
        ref={ref}
        horizontal
        data={products}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingHorizontal: side }]}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        onScroll={onScroll}
        scrollEventThrottle={64}
        getItemLayout={(_, index) => ({ length: STEP, offset: STEP * index, index })}
      />
    </View>
  );
});

export function CarouselSkeleton() {
  const { gutter, width } = useLayout();
  const side = Math.max(gutter, (width - layout.maxContentWidth) / 2 + gutter);
  return (
    <View style={[styles.section, { paddingLeft: side, overflow: 'hidden' }]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View style={styles.skeletonRow}>
        {Array.from({ length: 7 }, (_, i) => (
          <MiniCardSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xxl + 4 },
  head: {},
  arrows: { flexDirection: 'row', gap: space.xs },
  list: { paddingBottom: space.xl, paddingTop: 2 },
  skeletonRow: { flexDirection: 'row', gap: GAP },
});
