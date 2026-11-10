import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (p: Promise<void>) => void p.catch(() => undefined);

/** Subtle haptics. Every call is a no-op on the web. */
export const haptic = {
  selection() {
    if (enabled) safe(Haptics.selectionAsync());
  },
  light() {
    if (enabled) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  medium() {
    if (enabled) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  success() {
    if (enabled) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning() {
    if (enabled) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
};
