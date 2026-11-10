import { useSyncExternalStore } from 'react';
import { kv } from './storage';

/** A tiny persisted store: synchronous reads, write-through to storage. */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<void>;
  use(): T;
  use<S>(selector: (state: T) => S): S;
}

export function createStore<T>(key: string, initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const get = () => state;
  function use<S>(selector?: (s: T) => S): T | S {
    return useSyncExternalStore(
      subscribe,
      () => (selector ? selector(state) : state),
      () => (selector ? selector(state) : state),
    );
  }
  return {
    get,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
      void kv.set(key, value);
    },
    subscribe,
    async hydrate() {
      const stored = await kv.get<T>(key);
      if (stored != null) {
        state = stored;
        listeners.forEach((l) => l());
      }
    },
    use: use as Store<T>['use'],
  };
}
