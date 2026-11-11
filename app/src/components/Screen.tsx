import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/hooks/useLayout';
import { layout, space, useTheme } from '@/theme';
import { IconButton } from './ui';
import { Text } from './Text';

/** Full-screen background plus top safe-area padding. */
export function Screen({ children, topInset = true }: { children: ReactNode; topInset?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: topInset ? insets.top : 0 }]}>{children}</View>;
}

/** Centers content and caps its width on tablets and desktops. */
export function Page({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { gutter } = useLayout();
  return <View style={[styles.page, { paddingHorizontal: gutter }, style]}>{children}</View>;
}

/** Header row for pushed screens: back button, optional center content, optional actions. */
export function StackHeader({ children, right, title }: { children?: ReactNode; right?: ReactNode; title?: string }) {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Page style={styles.header}>
      <IconButton icon="chevron-back" label="Back" onPress={back} testID="back" />
      <View style={styles.headerMiddle}>
        {children ??
          (title ? (
            <Text variant="title3" numberOfLines={1} center>
              {title}
            </Text>
          ) : null)}
      </View>
      {right}
    </Page>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingTop: space.sm, paddingBottom: space.sm },
  headerMiddle: { flex: 1, minWidth: 0 },
});
