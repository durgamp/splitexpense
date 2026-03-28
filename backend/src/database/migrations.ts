import type { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      phone        TEXT UNIQUE NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_requests (
      id           TEXT PRIMARY KEY,
      phone        TEXT NOT NULL,
      code_hash    TEXT NOT NULL,
      expires_at   INTEGER NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL,
      expires_at   INTEGER NOT NULL,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id                       TEXT PRIMARY KEY,
      name                     TEXT NOT NULL,
      created_by               TEXT NOT NULL REFERENCES users(id),
      invite_token             TEXT UNIQUE NOT NULL,
      invite_token_created_at  INTEGER NOT NULL,
      created_at               INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      phone       TEXT NOT NULL,
      user_id     TEXT REFERENCES users(id),
      name        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('active','pending','removed')),
      role        TEXT NOT NULL DEFAULT 'member'
                    CHECK(role IN ('admin','member')),
      invited_by  TEXT NOT NULL,
      joined_at   INTEGER,
      PRIMARY KEY (group_id, phone)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id            TEXT PRIMARY KEY,
      group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description   TEXT NOT NULL,
      amount_paise  INTEGER NOT NULL CHECK(amount_paise > 0),
      paid_by_phone TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'other',
      created_by    TEXT NOT NULL REFERENCES users(id),
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      deleted_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS expense_shares (
      expense_id    TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      phone         TEXT NOT NULL,
      amount_paise  INTEGER NOT NULL CHECK(amount_paise >= 0),
      PRIMARY KEY (expense_id, phone)
    );

    CREATE TABLE IF NOT EXISTS contact_hashes (
      hash        TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL
    );

    -- Indexes for hot query paths
    CREATE INDEX IF NOT EXISTS idx_group_members_phone
      ON group_members(phone);

    CREATE INDEX IF NOT EXISTS idx_group_members_user_id
      ON group_members(user_id);

    CREATE INDEX IF NOT EXISTS idx_expenses_group_id
      ON expenses(group_id, deleted_at, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_expense_shares_phone
      ON expense_shares(phone);

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
      ON refresh_tokens(user_id);

    CREATE INDEX IF NOT EXISTS idx_otp_phone
      ON otp_requests(phone, expires_at);

    CREATE INDEX IF NOT EXISTS idx_groups_invite_token
      ON groups(invite_token);
  `);
}
