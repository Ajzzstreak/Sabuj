/**
 * Global hourly ceiling on Claude calls, shared by everything that can spend
 * (the background profiler and POST /v1/ask). Per-device limits do not bound
 * total spend, because devices are cheap to register.
 */
export class ClaudeBudget {
  private windowStart = 0;
  private calls = 0;

  /** `maxPerHour` undefined = unlimited; 0 = Claude disabled. */
  constructor(
    private readonly maxPerHour: number | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  /** Reserve one call. False when the hourly ceiling is reached. */
  take(): boolean {
    if (this.maxPerHour === undefined) return true;
    const now = this.now();
    if (now - this.windowStart >= 3_600_000) {
      this.windowStart = now;
      this.calls = 0;
    }
    if (this.calls >= this.maxPerHour) return false;
    this.calls += 1;
    return true;
  }
}
