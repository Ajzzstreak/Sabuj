import { Ionicons } from '@expo/vector-icons';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, ThemeScope, useTheme } from '@/theme';
import { Text } from '../Text';
import { Button, type Glyph } from './Button';

export type ToastTone = 'neutral' | 'success' | 'danger';
export interface ToastAction {
  label: string;
  onPress: () => void;
}
export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
}

let current: ToastMessage | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const dismiss = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
};

/** Show a short confirmation. A new toast replaces the one on screen. With an action (Undo) it stays longer. */
export function toast(text: string, tone: ToastTone = 'neutral', action?: ToastAction): void {
  current = { id: ++seq, text, tone, action };
  if (timer) clearTimeout(timer);
  timer = setTimeout(dismiss, action ? 6000 : 3600);
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

function ToastPill({ text, tone, action }: { text: string; tone: ToastTone; action?: ToastAction }) {
  const t = useTheme();
  const { c } = t;
  return (
    <View style={[styles.toast, { backgroundColor: c.fillStrong, borderColor: c.borderStrong }, action ? styles.withAction : null]}>
      <Ionicons name={ICONS[tone]} size={17} color={tone === 'danger' ? c.danger : c.text} />
      <Text variant="calloutStrong" style={styles.text}>
        {text}
      </Text>
      {action ? <Button label={action.label} variant="tertiary" size="sm" onPress={action.onPress} testID="toast-action" style={styles.action} /> : null}
    </View>
  );
}

/**
 * The toast's visible pill, exported for the gallery. It is drawn in the
 * opposite scheme to the screen it floats over, so it stands out in both.
 */
export function ToastView(props: { text: string; tone: ToastTone; action?: ToastAction }) {
  const { dark } = useTheme();
  return (
    <ThemeScope value={dark ? 'light' : 'dark'}>
      <ToastPill {...props} />
    </ThemeScope>
  );
}

/** Mount once at the root. */
export function ToastHost() {
  const message = useSyncExternalStore(subscribe, get, get);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 84 }]} accessibilityLiveRegion="polite" aria-live="polite">
      {message ? (
        // A toast without an action must never block the content under it; one with Undo takes taps on itself only.
        <Animated.View key={message.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} testID="toast" pointerEvents={message.action ? 'box-none' : 'none'}>
          <ToastView
            text={message.text}
            tone={message.tone}
            action={
              message.action
                ? {
                    label: message.action.label,
                    onPress: () => {
                      message.action?.onPress();
                      dismiss();
                    },
                  }
                : undefined
            }
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: 480 },
  withAction: { paddingVertical: space.xs, paddingRight: space.sm },
  text: { flexShrink: 1 },
  action: { marginLeft: space.xs },
});
