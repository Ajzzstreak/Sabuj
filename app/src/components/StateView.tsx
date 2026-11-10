import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { describeError } from '@/api/client';
import { radius, space, useTheme } from '@/theme';
import { Button } from './bits';
import { Text } from './Text';

/** Centered message for empty and error states. */
export function StateView({
  icon,
  title,
  detail,
  action,
  tone = 'neutral',
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  compact?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compact]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <View style={[styles.icon, { backgroundColor: tone === 'danger' ? c.dangerSoft : c.fill }]}>
        <Ionicons name={icon} size={26} color={tone === 'danger' ? c.danger : c.textSecondary} />
      </View>
      <Text variant="title2" center>
        {title}
      </Text>
      {detail ? (
        <Text variant="body" tone="textSecondary" center style={styles.detail}>
          {detail}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry: () => void; compact?: boolean }) {
  const online = useOnline();
  const { title, detail } = online
    ? describeError(error)
    : { title: "You're offline", detail: 'Reconnect to load this. Saved items still work.' };
  return (
    <StateView
      compact={compact}
      tone="danger"
      icon={online ? 'cloud-offline-outline' : 'wifi-outline'}
      title={title}
      detail={detail}
      action={<Button label="Try again" icon="refresh" kind="secondary" onPress={onRetry} testID="retry" />}
    />
  );
}

/** ---- Connectivity ------------------------------------------------------------ */
const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener);
const getOnline = () => onlineManager.isOnline();

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnline, getOnline);
}

/** Feed device connectivity into TanStack Query so fetches pause while offline and resume after. */
export function useConnectivitySync(): void {
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      onlineManager.setOnline(state.isConnected !== false);
    });
  }, []);
}

export function OfflineBanner() {
  const { c } = useTheme();
  const online = useOnline();
  if (online) return null;
  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(160)} style={[styles.banner, { backgroundColor: c.text }]} accessibilityRole="alert">
      <Ionicons name="cloud-offline" size={15} color={c.bg} />
      <Text variant="footnoteStrong" color={c.bg}>
        Offline — showing what was saved on this device
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.xxxl + space.lg, paddingHorizontal: space.xxl, maxWidth: 460, alignSelf: 'center' },
  compact: { paddingVertical: space.xxl },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  detail: { marginTop: space.sm },
  action: { marginTop: space.xl },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, alignSelf: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, marginBottom: space.sm },
});
