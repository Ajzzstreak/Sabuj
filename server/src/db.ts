import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ActivityEvent, RetailerId, UserProfile } from './contract.js';

export interface StoredProfileRow {
  totalEvents: number;
  heuristic: UserProfile | null;
  claude: UserProfile | null;
  /** totalEvents at the time of the last Claude run. */
  claudeEventCount: number;
  claudeAt: number | null;
}

export interface DeviceRow {
  deviceId: string;
  lastSeenAt: number;
}

/** A stored price alert, including the shopper context it was created with. */
export interface AlertRow {
  id: string;
  deviceId: string;
  productId: string;
  productTitle: string;
  targetPrice: number;
  priceAtCreation: number;
  zip: string | null;
  /** null = memberships were not stated. */
  memberships: RetailerId[] | null;
  status: 'active' | 'triggered';
  createdAt: number;
  triggeredAt: number | null;
}

interface RawAlert {
  id: string;
  device_id: string;
  product_id: string;
  product_title: string;
  target_price: number;
  price_at_creation: number;
  zip: string | null;
  memberships_json: string | null;
  status: string;
  created_at: number;
  triggered_at: number | null;
}

function toAlert(r: RawAlert): AlertRow {
  let memberships: RetailerId[] | null = null;
  if (r.memberships_json !== null) {
    try {
      memberships = JSON.parse(r.memberships_json) as RetailerId[];
    } catch {
      memberships = null;
    }
  }
  return {
    id: r.id,
    deviceId: r.device_id,
    productId: r.product_id,
    productTitle: r.product_title,
    targetPrice: r.target_price,
    priceAtCreation: r.price_at_creation,
    zip: r.zip,
    memberships,
    status: r.status === 'triggered' ? 'triggered' : 'active',
    createdAt: r.created_at,
    triggeredAt: r.triggered_at,
  };
}

export function emptyProfile(eventCount = 0): UserProfile {
  return {
    eventCount,
    retailerAffinity: {},
    priceSensitivity: 1,
    speedPreference: 0,
    qualityPreference: 0,
    maxObservedPremiumPct: 0,
    memberships: [],
    categoryAffinity: {},
    brandAffinity: {},
    summary: '',
    insights: [],
    suggestedQueries: [],
    source: 'none',
    updatedAt: null,
  };
}

function parseProfile(json: string | null): UserProfile | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as UserProfile;
  } catch {
    return null;
  }
}

/** SQLite persistence for devices, activity events, learned profiles and price alerts. */
export class Store {
  private readonly db: Database.Database;
  private readonly stmts;
  private readonly insertMany: (deviceId: string, events: ActivityEvent[], now: number) => number;

  constructor(dbPath: string, private readonly maxEventsPerDevice = 5000) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('secure_delete = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        type TEXT NOT NULL,
        ts INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_device ON events (device_id, id);
      CREATE TABLE IF NOT EXISTS profiles (
        device_id TEXT PRIMARY KEY,
        total_events INTEGER NOT NULL DEFAULT 0,
        heuristic_json TEXT,
        claude_json TEXT,
        claude_event_count INTEGER NOT NULL DEFAULT 0,
        claude_at INTEGER
      );
      -- Only a SHA-256 hash of the device token is stored, never the token.
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        push_token TEXT
      );
      CREATE INDEX IF NOT EXISTS devices_last_seen ON devices (last_seen_at);
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_title TEXT NOT NULL,
        target_price REAL NOT NULL,
        price_at_creation REAL NOT NULL,
        zip TEXT,
        memberships_json TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        triggered_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS alerts_device ON alerts (device_id, created_at);
      CREATE INDEX IF NOT EXISTS alerts_status ON alerts (status, id);
    `);
    this.stmts = {
      insertEvent: this.db.prepare('INSERT INTO events (device_id, type, ts, received_at, data) VALUES (?, ?, ?, ?, ?)'),
      bumpTotal: this.db.prepare(
        `INSERT INTO profiles (device_id, total_events) VALUES (?, ?)
         ON CONFLICT(device_id) DO UPDATE SET total_events = total_events + excluded.total_events`,
      ),
      countEvents: this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE device_id = ?'),
      prune: this.db.prepare(
        `DELETE FROM events WHERE device_id = ? AND id <= (
           SELECT id FROM events WHERE device_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
      ),
      recentEvents: this.db.prepare('SELECT data FROM events WHERE device_id = ? ORDER BY id DESC LIMIT ?'),
      getProfile: this.db.prepare('SELECT * FROM profiles WHERE device_id = ?'),
      saveHeuristic: this.db.prepare('UPDATE profiles SET heuristic_json = ? WHERE device_id = ?'),
      saveClaude: this.db.prepare(
        'UPDATE profiles SET claude_json = ?, claude_event_count = ?, claude_at = ? WHERE device_id = ?',
      ),
      markClaudeAttempt: this.db.prepare('UPDATE profiles SET claude_at = ? WHERE device_id = ?'),
      deleteEvents: this.db.prepare('DELETE FROM events WHERE device_id = ?'),
      deleteProfile: this.db.prepare('DELETE FROM profiles WHERE device_id = ?'),
      insertDevice: this.db.prepare('INSERT INTO devices (device_id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)'),
      deviceByHash: this.db.prepare('SELECT device_id, last_seen_at FROM devices WHERE token_hash = ?'),
      touchDevice: this.db.prepare('UPDATE devices SET last_seen_at = ? WHERE device_id = ?'),
      countDevices: this.db.prepare('SELECT COUNT(*) AS n FROM devices'),
      deleteDeviceRow: this.db.prepare('DELETE FROM devices WHERE device_id = ?'),
      setPushToken: this.db.prepare('UPDATE devices SET push_token = ? WHERE device_id = ?'),
      getPushToken: this.db.prepare('SELECT push_token FROM devices WHERE device_id = ?'),
      clearPushTokenValue: this.db.prepare('UPDATE devices SET push_token = NULL WHERE push_token = ?'),
      insertAlert: this.db.prepare(
        `INSERT INTO alerts (id, device_id, product_id, product_title, target_price, price_at_creation, zip, memberships_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      ),
      alertsForDevice: this.db.prepare('SELECT * FROM alerts WHERE device_id = ? ORDER BY created_at DESC, id'),
      countAlerts: this.db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE device_id = ?'),
      deleteAlert: this.db.prepare('DELETE FROM alerts WHERE id = ? AND device_id = ?'),
      deleteAlertForProduct: this.db.prepare('DELETE FROM alerts WHERE device_id = ? AND product_id = ?'),
      deleteAlerts: this.db.prepare('DELETE FROM alerts WHERE device_id = ?'),
      activeAlerts: this.db.prepare("SELECT * FROM alerts WHERE status = 'active' AND id > ? ORDER BY id LIMIT ?"),
      triggerAlert: this.db.prepare("UPDATE alerts SET status = 'triggered', triggered_at = ? WHERE id = ? AND status = 'active'"),
    };
    this.insertMany = this.db.transaction((deviceId: string, events: ActivityEvent[], now: number) => {
      for (const e of events) this.stmts.insertEvent.run(deviceId, e.type, e.ts, now, JSON.stringify(e));
      this.stmts.bumpTotal.run(deviceId, events.length);
      const { n } = this.stmts.countEvents.get(deviceId) as { n: number };
      if (n > this.maxEventsPerDevice) this.stmts.prune.run(deviceId, deviceId, this.maxEventsPerDevice);
      return events.length;
    });
  }

  insertEvents(deviceId: string, events: ActivityEvent[], now = Date.now()): number {
    if (events.length === 0) return 0;
    return this.insertMany(deviceId, events, now);
  }

  /** Most recent events, returned oldest-first. */
  recentEvents(deviceId: string, limit: number): ActivityEvent[] {
    const rows = this.stmts.recentEvents.all(deviceId, limit) as Array<{ data: string }>;
    const out: ActivityEvent[] = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      try {
        out.push(JSON.parse(rows[i]!.data) as ActivityEvent);
      } catch {
        /* skip corrupt row */
      }
    }
    return out;
  }

  storedEventCount(deviceId: string): number {
    return (this.stmts.countEvents.get(deviceId) as { n: number }).n;
  }

  getRow(deviceId: string): StoredProfileRow | null {
    const row = this.stmts.getProfile.get(deviceId) as
      | {
          total_events: number;
          heuristic_json: string | null;
          claude_json: string | null;
          claude_event_count: number;
          claude_at: number | null;
        }
      | undefined;
    if (!row) return null;
    return {
      totalEvents: row.total_events,
      heuristic: parseProfile(row.heuristic_json),
      claude: parseProfile(row.claude_json),
      claudeEventCount: row.claude_event_count,
      claudeAt: row.claude_at,
    };
  }

  saveHeuristic(deviceId: string, profile: UserProfile): void {
    this.stmts.saveHeuristic.run(JSON.stringify(profile), deviceId);
  }

  saveClaude(deviceId: string, profile: UserProfile, eventCount: number, at: number): void {
    this.stmts.saveClaude.run(JSON.stringify(profile), eventCount, at, deviceId);
  }

  /** Record a failed Claude attempt so the cooldown applies to failures too. */
  markClaudeAttempt(deviceId: string, at: number): void {
    this.stmts.markClaudeAttempt.run(at, deviceId);
  }

  /** Erase everything stored for a device: events, profile, alerts, push token and the device row (which kills its token). */
  deleteDevice(deviceId: string): void {
    this.db.transaction(() => {
      this.stmts.deleteEvents.run(deviceId);
      this.stmts.deleteProfile.run(deviceId);
      this.stmts.deleteAlerts.run(deviceId);
      this.stmts.deleteDeviceRow.run(deviceId);
    })();
  }

  // ---- devices -------------------------------------------------------------

  createDevice(deviceId: string, tokenHash: string, now = Date.now()): void {
    this.stmts.insertDevice.run(deviceId, tokenHash, now, now);
  }

  deviceByTokenHash(tokenHash: string): DeviceRow | null {
    const row = this.stmts.deviceByHash.get(tokenHash) as { device_id: string; last_seen_at: number } | undefined;
    return row ? { deviceId: row.device_id, lastSeenAt: row.last_seen_at } : null;
  }

  touchDevice(deviceId: string, now = Date.now()): void {
    this.stmts.touchDevice.run(now, deviceId);
  }

  countDevices(): number {
    return (this.stmts.countDevices.get() as { n: number }).n;
  }

  setPushToken(deviceId: string, token: string | null): void {
    this.stmts.setPushToken.run(token, deviceId);
  }

  getPushToken(deviceId: string): string | null {
    return (this.stmts.getPushToken.get(deviceId) as { push_token: string | null } | undefined)?.push_token ?? null;
  }

  /** Forget a push token the push service reported as dead. */
  clearPushTokenValue(token: string): void {
    this.stmts.clearPushTokenValue.run(token);
  }

  /**
   * Retention: erase every device not seen since `cutoff` (with all its data),
   * plus any event/profile/alert rows that belong to no registered device.
   * Returns the number of devices removed.
   */
  purgeInactiveDevices(cutoff: number): number {
    return this.db.transaction(() => {
      const stale = '(SELECT device_id FROM devices WHERE last_seen_at < ?)';
      this.db.prepare(`DELETE FROM events WHERE device_id IN ${stale}`).run(cutoff);
      this.db.prepare(`DELETE FROM profiles WHERE device_id IN ${stale}`).run(cutoff);
      this.db.prepare(`DELETE FROM alerts WHERE device_id IN ${stale}`).run(cutoff);
      const removed = this.db.prepare('DELETE FROM devices WHERE last_seen_at < ?').run(cutoff).changes;
      const orphan = 'device_id NOT IN (SELECT device_id FROM devices)';
      this.db.exec(`DELETE FROM events WHERE ${orphan}; DELETE FROM profiles WHERE ${orphan}; DELETE FROM alerts WHERE ${orphan};`);
      return removed;
    })();
  }

  // ---- alerts --------------------------------------------------------------

  /** One alert per (device, product): creating another replaces the earlier one. */
  createAlert(a: Omit<AlertRow, 'status' | 'triggeredAt'>): void {
    this.db.transaction(() => {
      this.stmts.deleteAlertForProduct.run(a.deviceId, a.productId);
      this.stmts.insertAlert.run(
        a.id,
        a.deviceId,
        a.productId,
        a.productTitle,
        a.targetPrice,
        a.priceAtCreation,
        a.zip,
        a.memberships === null ? null : JSON.stringify(a.memberships),
        a.createdAt,
      );
    })();
  }

  alertsForDevice(deviceId: string): AlertRow[] {
    return (this.stmts.alertsForDevice.all(deviceId) as RawAlert[]).map(toAlert);
  }

  countAlerts(deviceId: string): number {
    return (this.stmts.countAlerts.get(deviceId) as { n: number }).n;
  }

  deleteAlert(deviceId: string, id: string): boolean {
    return this.stmts.deleteAlert.run(id, deviceId).changes > 0;
  }

  /** Active alerts in id order, paged with `afterId` (exclusive). */
  activeAlerts(afterId: string, limit: number): AlertRow[] {
    return (this.stmts.activeAlerts.all(afterId, limit) as RawAlert[]).map(toAlert);
  }

  /** Returns false when the alert was already triggered or deleted. */
  markAlertTriggered(id: string, at: number): boolean {
    return this.stmts.triggerAlert.run(at, id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
