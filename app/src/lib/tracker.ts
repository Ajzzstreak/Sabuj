import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { ApiRequestError, request } from '@/api/client';
import type { ActivityEvent, EventsRequest, EventsResponse } from '@/api/contract';
import { TRACKING } from '@/config';
import { settingsStore } from '@/state';
import { kv } from './storage';

/**
 * Activity event queue.
 *
 * - track() is synchronous and never touches the network on the caller's path.
 * - Events are batched and sent every few seconds, at 20 queued, or when the
 *   app goes to the background.
 * - Unsent events are persisted and survive a relaunch.
 * - A failed batch is retried with exponential backoff and dropped after
 *   TRACKING.maxAttempts so a dead server cannot grow the queue forever.
 * - While learning is paused nothing is recorded, and the queue is emptied.
 */

const KEY = 'events.queue';

let queue: ActivityEvent[] = [];
let flushing = false;
let attempts = 0;
let retryAt = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());
const paused = () => settingsStore.get().learningPaused;

function persistNow(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  void kv.set(KEY, queue);
}
function persistSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 400);
}

function schedule(): void {
  if (flushTimer || queue.length === 0 || paused()) return;
  const delay = Math.max(TRACKING.flushIntervalMs, retryAt - Date.now());
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, delay);
}

export type TrackInput = Omit<ActivityEvent, 'ts'>;

/** Record one event. Cheap and non-blocking. */
export function track(event: TrackInput): void {
  if (paused()) return;
  queue.push({ ...event, ts: Date.now() });
  if (queue.length > TRACKING.maxQueue) queue = queue.slice(queue.length - TRACKING.maxQueue);
  notify();
  persistSoon();
  if (queue.length >= TRACKING.flushAtCount && Date.now() >= retryAt) void flush();
  else schedule();
}

/** Send the next batch. `urgent` is used when the app is being backgrounded. */
export async function flush(urgent = false): Promise<void> {
  if (flushing || queue.length === 0 || paused()) return;
  if (!urgent && Date.now() < retryAt) return schedule();
  flushing = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const batch = queue.slice(0, TRACKING.maxBatch);
  const sent = new Set(batch);
  const drop = () => {
    queue = queue.filter((e) => !sent.has(e));
  };

  try {
    // The server knows the device from the bearer token; no id goes in the body.
    const body: EventsRequest = { events: batch };
    await request<EventsResponse>('/events', { method: 'POST', body, keepalive: urgent && Platform.OS === 'web' });
    // "Delete my data" may have run while this was in flight; the queue was
    // then already cleared and drop() is a no-op.
    drop();
    attempts = 0;
    retryAt = 0;
  } catch (err) {
    const retryable = !(err instanceof ApiRequestError) || err.transient;
    attempts += 1;
    if (!retryable || attempts >= TRACKING.maxAttempts) {
      drop();
      attempts = 0;
      retryAt = 0;
    } else {
      retryAt = Date.now() + Math.min(60_000, 1000 * 2 ** attempts);
    }
  } finally {
    flushing = false;
    notify();
    persistNow();
    schedule();
  }
}

/** Forget everything that has not been sent. */
export function clearQueue(): void {
  queue = [];
  attempts = 0;
  retryAt = 0;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  notify();
  persistNow();
}

/** Load persisted events and hook app lifecycle. Call once at startup. */
export async function startTracker(): Promise<void> {
  if (started) return;
  started = true;
  const stored = await kv.get<ActivityEvent[]>(KEY);
  if (Array.isArray(stored) && stored.length && !paused()) {
    queue = [...stored, ...queue].slice(-TRACKING.maxQueue);
    notify();
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      persistNow();
      void flush(true);
    } else if (state === 'active') {
      schedule();
    }
  });
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        persistNow();
        void flush(true);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
  }
  settingsStore.subscribe(() => {
    if (paused()) clearQueue();
  });
  schedule();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const pendingCount = () => queue.length;

/** Number of events recorded but not yet sent. */
export function usePendingEvents(): number {
  return useSyncExternalStore(subscribe, pendingCount, pendingCount);
}
