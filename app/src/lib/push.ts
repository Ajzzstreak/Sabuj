import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { putPushToken } from '@/api/queries';
import { alertPrefsStore } from '@/state';
import { getDeviceId } from './session';

/**
 * Push notifications for price-drop alerts (iOS and Android; the web build
 * uses push.web.ts, which does nothing, and relies on in-app polling).
 *
 * Permission is never requested at startup: only from the alert sheet, the
 * first time the user creates an alert, after an explanation.
 */
export const pushSupported = true;

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export async function getPushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return p.canAskAgain && p.status !== 'denied' ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Shows the system prompt. Resolves true when notifications are allowed. */
export async function requestPushPermission(): Promise<boolean> {
  try {
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
    return p.granted;
  } catch {
    return false;
  }
}

/**
 * If notifications are allowed, get the Expo push token and send it to the
 * server (once per device + token). Quietly does nothing otherwise: alerts
 * still work in-app.
 */
export async function syncPushToken(): Promise<boolean> {
  try {
    if ((await getPushPermission()) !== 'granted') return false;
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    // Without an EAS project id (set by `eas build:configure`) Expo cannot issue a token.
    if (!projectId) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const sentFor = `${getDeviceId()}:${token}`;
    if (alertPrefsStore.get().pushSentFor === sentFor) return true;
    await putPushToken(token);
    alertPrefsStore.set((s) => ({ ...s, pushSentFor: sentFor }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The product a notification points at. The server is expected to send
 * `data: { productId }`; a `data.url` of the form "/product/<id>" also works.
 */
function productIdOf(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  if (typeof data?.productId === 'string' && data.productId) return data.productId;
  const m = typeof data?.url === 'string' ? /\/product\/([^/?#]+)/.exec(data.url) : null;
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Call once at startup. Tapping a notification (also from a cold start) opens its product. */
export function initNotifications(openProduct: (productId: string) => void): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('price-alerts', {
      name: 'Price alerts',
      description: 'When a product you are watching drops to your target price.',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
  }
  const handle = (response: Notifications.NotificationResponse | null) => {
    const id = productIdOf(response);
    if (id) openProduct(id);
  };
  try {
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      handle(last);
      Notifications.clearLastNotificationResponse();
    }
  } catch {
    /* not available in this runtime */
  }
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
