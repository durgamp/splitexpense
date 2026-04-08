/**
 * SQLite schema migrations.
 * All DDL uses CREATE TABLE IF NOT EXISTS — fully idempotent on re-runs.
 * Timestamps stored as INTEGER (Unix epoch ms). Text fields use TEXT.
 */
import { getPool } from './index.js';
import type BetterSqlite3 from 'better-sqlite3';

export async function runMigrations(): Promise<void> {
  const db = await getPool();

  // Migration tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name   TEXT    NOT NULL PRIMARY KEY,
      run_at INTEGER NOT NULL
    );
  `);

  migration001(db);
  migration002(db);
  migration003(db);

  console.log('[DB] Migrations complete');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ran(db: BetterSqlite3.Database, name: string): boolean {
  const row = db.prepare('SELECT 1 AS x FROM _migrations WHERE name = ?').get(name);
  return !!row;
}

function mark(db: BetterSqlite3.Database, name: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO _migrations (name, run_at) VALUES (?, ?)'
  ).run(name, Date.now());
}

// ── 001: Initial schema ───────────────────────────────────────────────────────

function migration001(db: BetterSqlite3.Database): void {
  if (ran(db, '001_initial_schema')) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT    NOT NULL PRIMARY KEY,
      email          TEXT    UNIQUE,
      phone          TEXT    UNIQUE,
      name           TEXT    NOT NULL DEFAULT '',
      created_at     INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_requests (
      id         TEXT    NOT NULL PRIMARY KEY,
      email      TEXT    NOT NULL,
      code_hash  TEXT    NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email, expires_at);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         TEXT    NOT NULL PRIMARY KEY,
      user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT    NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);

    CREATE TABLE IF NOT EXISTS groups (
      id                      TEXT    NOT NULL PRIMARY KEY,
      name                    TEXT    NOT NULL,
      type                    TEXT    NOT NULL DEFAULT 'group'
                                CHECK (type IN ('group','direct')),
      created_by              TEXT    NOT NULL REFERENCES users(id),
      invite_token            TEXT    NOT NULL UNIQUE,
      invite_token_created_at INTEGER NOT NULL,
      created_at              INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_groups_token ON groups(invite_token);

    CREATE TABLE IF NOT EXISTS group_members (
      group_id   TEXT    NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      phone      TEXT    NOT NULL,
      user_id    TEXT    REFERENCES users(id),
      name       TEXT    NOT NULL DEFAULT '',
      status     TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('active','pending','removed')),
      role       TEXT    NOT NULL DEFAULT 'member'
                   CHECK (role IN ('admin','member')),
      invited_by TEXT    NOT NULL,
      joined_at  INTEGER,
      PRIMARY KEY (group_id, phone)
    );
    CREATE INDEX IF NOT EXISTS idx_gm_phone ON group_members(phone);
    CREATE INDEX IF NOT EXISTS idx_gm_user  ON group_members(user_id);

    CREATE TABLE IF NOT EXISTS expenses (
      id            TEXT    NOT NULL PRIMARY KEY,
      group_id      TEXT    NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description   TEXT    NOT NULL,
      amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
      paid_by_phone TEXT    NOT NULL,
      category      TEXT    NOT NULL DEFAULT 'other',
      split_type    TEXT    NOT NULL DEFAULT 'equal',
      notes         TEXT,
      created_by    TEXT    NOT NULL REFERENCES users(id),
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      deleted_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_exp_group ON expenses(group_id, deleted_at, created_at);

    CREATE TABLE IF NOT EXISTS expense_shares (
      expense_id   TEXT    NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      phone        TEXT    NOT NULL,
      amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
      PRIMARY KEY (expense_id, phone)
    );
    CREATE INDEX IF NOT EXISTS idx_es_phone ON expense_shares(phone);

    CREATE TABLE IF NOT EXISTS payments (
      id           TEXT    NOT NULL PRIMARY KEY,
      group_id     TEXT    NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      from_phone   TEXT    NOT NULL,
      to_phone     TEXT    NOT NULL,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      notes        TEXT,
      created_by   TEXT    NOT NULL REFERENCES users(id),
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pay_group ON payments(group_id, created_at);

    CREATE TABLE IF NOT EXISTS contact_hashes (
      hash       TEXT    NOT NULL PRIMARY KEY,
      user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
  `);

  mark(db, '001_initial_schema');
}

// ── 002: Email auth (no-op — schema already has email from 001) ───────────────

function migration002(db: BetterSqlite3.Database): void {
  if (ran(db, '002_email_auth')) return;
  mark(db, '002_email_auth');
}

// ── 003: Splitwise features — split_type, notes, groups.type already in 001 ──

function migration003(db: BetterSqlite3.Database): void {
  if (ran(db, '003_splitwise_features')) return;

  // Add split_type if upgrading from a pre-003 SQLite DB
  const cols = db.prepare("PRAGMA table_info(expenses)").all() as { name: string }[];
  const colNames = cols.map((c) => c.name);

  if (!colNames.includes('split_type')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN split_type TEXT NOT NULL DEFAULT 'equal'`);
  }
  if (!colNames.includes('notes')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN notes TEXT`);
  }

  const gcols = db.prepare("PRAGMA table_info(groups)").all() as { name: string }[];
  if (!gcols.map((c) => c.name).includes('type')) {
    db.exec(`ALTER TABLE groups ADD COLUMN type TEXT NOT NULL DEFAULT 'group'`);
  }

  mark(db, '003_splitwise_features');
}
