import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Ionicons } from '@expo/vector-icons';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useConnectivitySync } from '@/components/StateView';
import { APP_NAME } from '@/config';
import { loadDeviceId } from '@/lib/deviceId';
import { onCacheRestored, persistOptions, queryClient } from '@/lib/queryClient';
import { startTracker } from '@/lib/tracker';
import { hydrateStores } from '@/state';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Local state every screen assumes is ready: device id, settings, watchlist, unsent events. */
async function bootstrap(): Promise<void> {
  await Promise.all([loadDeviceId(), hydrateStores()]);
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
          </Stack>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
