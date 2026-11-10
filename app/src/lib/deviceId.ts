import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { secure } from './storage';

const KEY = 'deviceId';
let current = '';
const listeners = new Set<() => void>();

function generate(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // Extremely old runtimes: fall back to a non-cryptographic id.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

/** Loads the anonymous device id, creating one on first launch. */
export async function loadDeviceId(): Promise<string> {
  const stored = await secure.get(KEY);
  current = stored && stored.length >= 8 ? stored : generate();
  if (current !== stored) await secure.set(KEY, current);
  listeners.forEach((l) => l());
  return current;
}

/** Replaces the id with a fresh one. Used by "Delete my data". */
export async function rotateDeviceId(): Promise<string> {
  current = generate();
  await secure.set(KEY, current);
  listeners.forEach((l) => l());
  return current;
}

export function getDeviceId(): string {
  return current;
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
