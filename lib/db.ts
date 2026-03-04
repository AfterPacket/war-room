import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), '.warroom-data');
const DB_PATH = path.join(DB_DIR, 'warroom.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      service TEXT PRIMARY KEY,
      encrypted_key TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS layouts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS saved_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS custom_streams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT DEFAULT 'Custom',
      enabled INTEGER DEFAULT 1,
      user_agent TEXT,
      referer TEXT,
      origin_header TEXT,
      cookies TEXT,
      notes TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

export interface ApiKeyRecord {
  service: string;
  encrypted_key: string;
  created_at: number;
  updated_at: number;
}

export function getApiKey(service: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT encrypted_key FROM api_keys WHERE service = ?').get(service) as { encrypted_key: string } | undefined;
  return row?.encrypted_key || null;
}

export function setApiKey(service: string, encryptedKey: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO api_keys (service, encrypted_key, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(service) DO UPDATE SET encrypted_key = excluded.encrypted_key, updated_at = unixepoch()
  `).run(service, encryptedKey);
}

export function deleteApiKey(service: string): void {
  const db = getDb();
  db.prepare('DELETE FROM api_keys WHERE service = ?').run(service);
}

export function getAllApiKeys(): ApiKeyRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM api_keys').all() as ApiKeyRecord[];
}

export function getConfiguredServices(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT service FROM api_keys').all() as { service: string }[];
  return rows.map((r) => r.service);
}

export function saveLayout(id: string, name: string, data: object): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO layouts (id, name, data, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = unixepoch()
  `).run(id, name, JSON.stringify(data));
}

export function getLayout(id: string): object | null {
  const db = getDb();
  const row = db.prepare('SELECT data FROM layouts WHERE id = ?').get(id) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

// ─── Custom Streams ──────────────────────────────────────────────────────────

export interface CustomStream {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  user_agent?: string;
  referer?: string;
  origin_header?: string;
  cookies?: string;
  notes?: string;
  created_at?: number;
  updated_at?: number;
}

type RawStreamRow = Omit<CustomStream, 'enabled'> & { enabled: number };

export function getCustomStream(id: string): CustomStream | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM custom_streams WHERE id = ?').get(id) as RawStreamRow | undefined;
  if (!row) return null;
  return { ...row, enabled: !!row.enabled };
}

export function getCustomStreams(): CustomStream[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM custom_streams ORDER BY created_at DESC').all() as RawStreamRow[];
  return rows.map((r) => ({ ...r, enabled: !!r.enabled }));
}

export function saveCustomStream(stream: Omit<CustomStream, 'created_at' | 'updated_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO custom_streams (id, name, url, category, enabled, user_agent, referer, origin_header, cookies, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, url = excluded.url, category = excluded.category,
      enabled = excluded.enabled, user_agent = excluded.user_agent,
      referer = excluded.referer, origin_header = excluded.origin_header,
      cookies = excluded.cookies, notes = excluded.notes, updated_at = unixepoch()
  `).run(
    stream.id, stream.name, stream.url, stream.category, stream.enabled ? 1 : 0,
    stream.user_agent || null, stream.referer || null, stream.origin_header || null,
    stream.cookies || null, stream.notes || null
  );
}

export function deleteCustomStream(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM custom_streams WHERE id = ?').run(id);
}

export function setCustomStreamEnabled(id: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE custom_streams SET enabled = ?, updated_at = unixepoch() WHERE id = ?').run(enabled ? 1 : 0, id);
}
