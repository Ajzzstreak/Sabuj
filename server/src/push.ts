/**
 * Push notifications. `PushSender` is the seam: alerts only know this
 * interface. The Expo implementation talks to Expo's push service; the no-op
 * one is used when push is disabled.
 *
 * Push tokens are credentials for a user's device: they are never logged.
 */

export interface PushMessage {
  /** Expo push token. */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  /** Tokens the push service reported as permanently dead (unregistered). */
  invalidTokens: string[];
}

export interface PushSender {
  /** Never rejects: delivery is best effort and failures are logged. */
  send(messages: PushMessage[]): Promise<PushResult>;
}

export class NoopPushSender implements PushSender {
  async send(): Promise<PushResult> {
    return { invalidTokens: [] };
  }
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

export interface ExpoPushOptions {
  timeoutMs: number;
  /** Optional Expo access token (only needed when "enhanced push security" is on). */
  accessToken?: string | null;
  fetch?: typeof fetch;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
}

interface ExpoTicket {
  status?: string;
  details?: { error?: string };
}

export class ExpoPushSender implements PushSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ExpoPushOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async send(messages: PushMessage[]): Promise<PushResult> {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        const res = await this.fetchImpl(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(this.opts.accessToken ? { authorization: `Bearer ${this.opts.accessToken}` } : {}),
          },
          body: JSON.stringify(batch.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default' }))),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (!res.ok) {
          this.opts.log?.('push: Expo returned an error status', { status: res.status, messages: batch.length });
          continue;
        }
        const body = (await res.json()) as { data?: ExpoTicket[] };
        const tickets = Array.isArray(body.data) ? body.data : [];
        let failed = 0;
        tickets.forEach((t, j) => {
          if (t?.status === 'ok') return;
          failed += 1;
          if (t?.details?.error === 'DeviceNotRegistered' && batch[j]) invalidTokens.push(batch[j].to);
        });
        if (failed > 0) this.opts.log?.('push: some messages were rejected', { failed, messages: batch.length });
      } catch (err) {
        // Deliberately only the error name: messages and tokens never reach the log.
        this.opts.log?.('push: request failed', { error: err instanceof Error ? err.name : 'unknown', messages: batch.length });
      }
    }
    return { invalidTokens };
  }
}
