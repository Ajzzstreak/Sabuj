import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useHome } from '@/api/queries';
import { Chip, SectionTitle } from '@/components/bits';
import { Carousel, CarouselSkeleton } from '@/components/Carousel';
import { PressableScale } from '@/components/PressableScale';
import { Page, Screen } from '@/components/Screen';
import { SearchField, SuggestionList } from '@/components/Search';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState, OfflineBanner } from '@/components/StateView';
import { Text } from '@/components/Text';
import { APP_NAME } from '@/config';
import { useLayout } from '@/hooks/useLayout';
import { useTypeahead } from '@/hooks/useTypeahead';
import { haptic } from '@/lib/haptics';
import { addRecent, recentsStore } from '@/state';
import { continuous, fonts, radius, space, useTheme } from '@/theme';

export default function HomeScreen() {
  const t = useTheme();
  const { c } = t;
  const router = useRouter();
  const { isPhone, isDesktop } = useLayout();
  const [text, setText] = useState('');
  const typing = text.trim().length > 0;
  const { suggestions } = useTypeahead(text);
  const home = useHome();
  const recents = recentsStore.use();

  const submit = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      Keyboard.dismiss();
      haptic.light();
      addRecent(q);
      router.push({ pathname: '/search', params: { q } });
      setText('');
    },
    [router],
  );

  const trending = home.data?.trendingQueries ?? [];
  const sections = home.data?.sections.filter((s) => s.products.length > 0) ?? [];

  return (
    <Screen topInset={isPhone}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={home.isRefetching && !home.isLoading} onRefresh={() => void home.refetch()} tintColor={c.textTertiary} />}
      >
        <Page>
          {isPhone ? (
            <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel={APP_NAME}>
              <View style={[styles.logo, { backgroundColor: c.accent }]}>
                <Ionicons name="pricetags" size={13} color={c.onAccent} />
              </View>
              <Text style={{ fontFamily: fonts.displayBold, fontSize: 17, letterSpacing: -0.3 }}>{APP_NAME}</Text>
            </View>
          ) : null}

          <View style={[styles.hero, isDesktop && styles.heroWide]}>
            <Text variant="display" accessibilityRole="header" style={isDesktop ? styles.displayWide : undefined}>
              Every store’s price,{'\n'}side by side.
            </Text>
            <View style={styles.searchWrap}>
              <SearchField value={text} onChangeText={setText} onSubmit={submit} large placeholder="Search rice cooker, AirPods, diapers…" />
            </View>

            {typing ? (
              <Animated.View entering={FadeIn.duration(140)} style={[styles.suggestions, continuous, { backgroundColor: c.surface, borderColor: c.border }, t.shadow1]}>
                <PressableScale
                  testID="search-submit"
                  onPress={() => submit(text)}
                  scaleTo={0.99}
                  accessibilityLabel={`Search for ${text.trim()}`}
                  style={[styles.searchFor, suggestions.length > 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
                >
                  <View style={[styles.searchForIcon, { backgroundColor: c.accentSoft }]}>
                    <Ionicons name="search" size={15} color={c.accentText} />
                  </View>
                  <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    Compare prices for <Text variant="bodyStrong">“{text.trim()}”</Text>
                  </Text>
                  <Ionicons name="return-down-back" size={17} color={c.textTertiary} />
                </PressableScale>
                <SuggestionList query={text} suggestions={suggestions} onPick={submit} />
              </Animated.View>
            ) : null}
          </View>
        </Page>

        {typing ? null : (
          <>
            <Page>
              <View style={styles.banner}>
                <OfflineBanner />
              </View>

              {recents.length > 0 ? (
                <View style={styles.block}>
                  <SectionTitle
                    title="Recent"
                    right={
                      <PressableScale onPress={() => recentsStore.set([])} accessibilityLabel="Clear recent searches" hitSlop={12}>
                        <Text variant="calloutStrong" tone="accentText">
                          Clear
                        </Text>
                      </PressableScale>
                    }
                  />
                  <View style={styles.chips}>
                    {recents.map((q) => (
                      <Chip key={q} label={q} icon="time-outline" onPress={() => submit(q)} accessibilityLabel={`Search again for ${q}`} />
                    ))}
                  </View>
                </View>
              ) : null}

              {home.isLoading ? (
                <View style={styles.block}>
                  <Skeleton width={130} height={22} />
                  <View style={[styles.chips, { marginTop: space.md }]}>
                    {[96, 132, 84, 118, 104].map((w, i) => (
                      <Skeleton key={i} width={w} height={38} corner={19} />
                    ))}
                  </View>
                </View>
              ) : trending.length > 0 ? (
                <View style={styles.block}>
                  <SectionTitle title="Trending" />
                  <View style={styles.chips}>
                    {trending.map((q) => (
                      <Chip key={q} label={q} icon="trending-up" onPress={() => submit(q)} accessibilityLabel={`Search trending: ${q}`} />
                    ))}
                  </View>
                </View>
              ) : null}
            </Page>

            {home.isLoading ? (
              <>
                <CarouselSkeleton />
                <CarouselSkeleton />
              </>
            ) : home.isError && !home.data ? (
              <ErrorState error={home.error} onRetry={() => void home.refetch()} />
            ) : (
              sections.map((s) => <Carousel key={s.id} title={s.title} subtitle={s.subtitle} products={s.products} />)
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
  logo: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingTop: space.xxl },
  heroWide: { paddingTop: space.xxxl + space.lg, maxWidth: 760 },
  displayWide: { fontSize: 56, lineHeight: 58, letterSpacing: -2 },
  searchWrap: { marginTop: space.xl },
  suggestions: { marginTop: space.sm + 2, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  searchFor: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 2 },
  searchForIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  banner: { marginTop: space.lg },
  block: { marginTop: space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
