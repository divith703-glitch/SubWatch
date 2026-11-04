import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

/**
 * SQLite is used so the app runs with zero setup. The schema below is written in
 * portable SQL so it can be moved to PostgreSQL by swapping the driver in `db.ts`
 * (see README -> "Moving to PostgreSQL").
 */
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'subwatch.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'Other',
  cost                REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  billing_cycle       TEXT NOT NULL DEFAULT 'monthly',
  next_renewal_date   TEXT NOT NULL,
  started_on          TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  payment_method      TEXT,
  cancel_url          TEXT,
  cancel_instructions TEXT,
  notes               TEXT,
  reminder_days       INTEGER NOT NULL DEFAULT 7,
  cancelled_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS price_changes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  old_cost        REAL NOT NULL,
  new_cost        REAL NOT NULL,
  currency        TEXT NOT NULL,
  billing_cycle   TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual',
  note            TEXT,
  changed_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pc_sub ON price_changes(subscription_id);
`);

/**
 * Lightweight in-place migrations for databases created by an earlier build.
 * Additive only — never destructive.
 */
function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

if (!columnExists('users', 'token_version')) {
  db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
}
