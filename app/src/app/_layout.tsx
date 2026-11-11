import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Ionicons } from '@expo/vector-icons';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AlertSheet } from '@/components/AlertSheet';
import { PriceBreakdownSheet } from '@/components/PriceBreakdownSheet';
import { Onboarding } from '@/components/Shopper';
import { useConnectivitySync } from '@/components/StateView';
import { ToastHost } from '@/components/ui';
import { APP_NAME } from '@/config';
import { initNotifications } from '@/lib/push';
import { onCacheRestored, persistOptions, queryClient } from '@/lib/queryClient';
import { loadSession } from '@/lib/session';
import { startTracker } from '@/lib/tracker';
import { hydrateStores, shopperStore } from '@/state';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Local state every screen assumes is ready: the device session (registered
 * with POST /v1/devices on first launch), settings, watchlist, unsent events.
 * If registration fails (offline) the app still opens; the first request that
 * needs a token registers then.
 */
async function bootstrap(): Promise<void> {
  await Promise.all([loadSession(), hydrateStores()]);
  await startTracker();
}

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    ...Ionicons.font,
  });
  const [booted, setBooted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const onboarded = shopperStore.use((s) => s.onboarded);
  useConnectivitySync();

  useEffect(() => {
    let alive = true;
    bootstrap()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBooted(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const ready = booted && (fontsLoaded || fontError != null);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.c.bg).catch(() => undefined);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.c.bg;
      document.documentElement.style.colorScheme = theme.scheme;
    }
  }, [theme]);

  const navTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: theme.c.bg, card: theme.c.surface, text: theme.c.text, border: theme.c.border, primary: theme.c.accent },
    };
  }, [theme]);

  // Tapping a price-alert notification opens that product (also from a cold start).
  useEffect(() => {
    if (!ready) return;
    return initNotifications((productId) => router.push({ pathname: '/product/[id]', params: { id: productId } }));
  }, [ready, router]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.c.bg }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions} onSuccess={onCacheRestored}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.c.bg }, title: APP_NAME }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="search" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="product/[id]" />
            <Stack.Screen name="ask" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
            <Stack.Screen name="legal/[doc]" />
            <Stack.Screen name="dev/components" />
          </Stack>
          <PriceBreakdownSheet />
          <AlertSheet />
          <ToastHost />
          {/* First run only. The component gallery is reviewable without answering it. */}
          {!onboarded && !pathname.startsWith('/dev') ? <Onboarding /> : null}
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
