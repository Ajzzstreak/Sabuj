import { useSyncExternalStore } from 'react';
import { request, setAuthBridge } from '@/api/client';
import type { RegisterDeviceResponse } from '@/api/contract';
import { secure } from './storage';

/**
 * The anonymous device session: `deviceId` + bearer `token` from POST /v1/devices.
 * Stored in the Keychain / Keystore on native and in localStorage on the web.
 * The token is the only credential; the id is used locally (cache keys, the
 * "Anonymous ID" shown on the profile tab) and is never sent as a parameter.
 */
export interface Session {
  deviceId: string;
  token: string;
}

const KEY = 'session';
/** The pre-token builds stored a bare client-made id under this key. */
const LEGACY_KEY = 'deviceId';
const RETRY_COOLDOWN_MS = 5000;

let session: Session | null = null;
let inflight: Promise<Session | null> | null = null;
let lastFailure = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Session>;
    return typeof v.deviceId === 'string' && typeof v.token === 'string' && v.token ? { deviceId: v.deviceId, token: v.token } : null;
  } catch {
    return null;
  }
}

/** POST /v1/devices. Concurrent callers share one request. Null when the server cannot be reached. */
function register(before?: () => Promise<void>): Promise<Session | null> {
  inflight ??= (async () => {
    try {
      await before?.();
      const res = await request<RegisterDeviceResponse>('/devices', { method: 'POST', auth: false, timeoutMs: 8000 });
      session = { deviceId: res.deviceId, token: res.token };
      await secure.set(KEY, JSON.stringify(session));
      notify();
      return session;
    } catch {
      lastFailure = Date.now();
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

setAuthBridge({
  getToken: () => session?.token ?? null,
  async ensure() {
    if (session) return session.token;
    if (!inflight && Date.now() - lastFailure < RETRY_COOLDOWN_MS) return null;
    return (await register())?.token ?? null;
  },
  async renew(rejected) {
    // Another request may already have replaced the rejected token.
    if (session && session.token !== rejected) return session.token;
    session = null;
    return (await register())?.token ?? null;
  },
});

/** Startup: use the stored session, or register on first launch. Never throws. */
export async function loadSession(): Promise<void> {
  session = parse(await secure.get(KEY));
  void secure.remove(LEGACY_KEY);
  if (session) notify();
  else await register();
}

/** Forget this device and register a new one. Used after "Delete my data". */
export function replaceSession(): Promise<Session | null> {
  // Synchronous on purpose: from this line on, nothing can send the old token.
  session = null;
  lastFailure = 0;
  notify();
  return register(() => secure.remove(KEY));
}

/** '' until the device has been registered (offline first launch). */
export function getDeviceId(): string {
  return session?.deviceId ?? '';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useDeviceId(): string {
  return useSyncExternalStore(subscribe, getDeviceId, getDeviceId);
}
