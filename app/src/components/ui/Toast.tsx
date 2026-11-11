import { Ionicons } from '@expo/vector-icons';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, useTheme } from '@/theme';
import { Text } from '../Text';
import type { Glyph } from './Button';

export type ToastTone = 'neutral' | 'success' | 'danger';
export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

let current: ToastMessage | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a short confirmation. A new toast replaces the one on screen. */
export function toast(text: string, tone: ToastTone = 'neutral'): void {
  current = { id: ++seq, text, tone };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, 3600);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => current;

const ICONS: Record<ToastTone, Glyph> = { neutral: 'information-circle', success: 'checkmark-circle', danger: 'alert-circle' };

/** The toast's visible pill, exported for the gallery. */
export function ToastView({ text, tone }: { text: string; tone: ToastTone }) {
  const t = useTheme();
  const { c } = t;
  return (
    <View style={[styles.toast, { backgroundColor: c.text }, t.shadow2]}>
      <Ionicons name={ICONS[tone]} size={17} color={tone === 'danger' ? c.dangerSoft : c.bg} />
      <Text variant="calloutStrong" color={c.bg} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

/** Mount once at the root. */
export function ToastHost() {
  const message = useSyncExternalStore(subscribe, get, get);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 84 }]} accessibilityLiveRegion="polite" aria-live="polite">
      {message ? (
        <Animated.View key={message.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} testID="toast">
          <ToastView text={message.text} tone={message.tone} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.pill, maxWidth: 480 },
  text: { flexShrink: 1 },
});
