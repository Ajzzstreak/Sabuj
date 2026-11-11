/**
 * Web build: no push. Alerts are polled (GET /v1/alerts whenever the tab
 * regains focus) and triggered ones are badged on the Saved tab.
 * Same exports as push.ts.
 */
export const pushSupported = false;

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export async function getPushPermission(): Promise<PushPermission> {
  return 'denied';
}
export async function requestPushPermission(): Promise<boolean> {
  return false;
}
export async function syncPushToken(): Promise<boolean> {
  return false;
}
export function initNotifications(_openProduct: (productId: string) => void): () => void {
  return () => undefined;
}
