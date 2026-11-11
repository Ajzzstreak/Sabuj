import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { STORAGE_PREFIX } from '@/config';

const k = (key: string) => `${STORAGE_PREFIX}${key}`;

/** JSON key-value storage. Failures are swallowed: storage must never crash the UI. */
export const kv = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(k(key));
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(k(key), JSON.stringify(value));
    } catch {
      /* quota or private mode: keep running from memory */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(k(key));
    } catch {
      /* ignore */
    }
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return kv.remove(key);
    try {
      await SecureStore.deleteItemAsync(k(key).replace(/[^A-Za-z0-9._-]/g, '_'));
    } catch {
      /* ignore */
    }
  },
};

/** Keychain / Keystore on native. The web has no equivalent, so it uses localStorage. */
export const secure = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return kv.get<string>(key);
    try {
      return await SecureStore.getItemAsync(k(key).replace(/[^A-Za-z0-9._-]/g, '_'));
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return kv.set(key, value);
    try {
      await SecureStore.setItemAsync(k(key).replace(/[^A-Za-z0-9._-]/g, '_'), value);
    } catch {
      /* ignore */
    }
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return kv.remove(key);
    try {
      await SecureStore.deleteItemAsync(k(key).replace(/[^A-Za-z0-9._-]/g, '_'));
    } catch {
      /* ignore */
    }
  },
};
