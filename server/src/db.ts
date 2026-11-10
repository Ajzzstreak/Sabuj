import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ActivityEvent, UserProfile } from './contract.js';

export interface StoredProfileRow {
  totalEvents: number;
  heuristic: UserProfile | null;
  claude: UserProfile | null;
  /** totalEvents at the time of the last Claude run. */
  claudeEventCount: number;
  claudeAt: number | null;
}

export function emptyProfile(deviceId: string, eventCount = 0): UserProfile {
  return {
    deviceId,
    eventCount,
    retailerAffinity: {},
    priceSensitivity: 1,
    speedPreference: 0,
    qualityPreference: 0,
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

/** SQLite persistence for activity events and learned profiles. */
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

  /** Erase everything stored for a device. */
  deleteDevice(deviceId: string): void {
    this.db.transaction(() => {
      this.stmts.deleteEvents.run(deviceId);
      this.stmts.deleteProfile.run(deviceId);
    })();
  }

  close(): void {
    this.db.close();
  }
}
