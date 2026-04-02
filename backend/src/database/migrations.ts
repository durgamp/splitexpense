import type { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync): void {
  // ── Migration tracking table ───────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name    TEXT PRIMARY KEY,
      run_at  INTEGER NOT NULL
    )
  `);

  // ── 001_initial_schema ────────────────────────────────────────────────────
  // Idempotent — CREATE TABLE IF NOT EXISTS is safe to run every time.
  // New installs get email from the start; existing installs are upgraded by 002.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT PRIMARY KEY,
      email          TEXT UNIQUE,
      phone          TEXT UNIQUE,
      name           TEXT NOT NULL DEFAULT '',
      created_at     INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_requests (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL,
      code_hash   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id                      TEXT PRIMARY KEY,
      name                    TEXT NOT NULL,
      created_by              TEXT NOT NULL REFERENCES users(id),
      invite_token            TEXT UNIQUE NOT NULL,
      invite_token_created_at INTEGER NOT NULL,
      created_at              INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      phone      TEXT NOT NULL,
      user_id    TEXT REFERENCES users(id),
      name       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('active','pending','removed')),
      role       TEXT NOT NULL DEFAULT 'member'
                   CHECK(role IN ('admin','member')),
      invited_by TEXT NOT NULL,
      joined_at  INTEGER,
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
      expense_id   TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      phone        TEXT NOT NULL,
      amount_paise INTEGER NOT NULL CHECK(amount_paise >= 0),
      PRIMARY KEY (expense_id, phone)
    );

    CREATE TABLE IF NOT EXISTS contact_hashes (
      hash       TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

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
    CREATE INDEX IF NOT EXISTS idx_groups_invite_token
      ON groups(invite_token);
  `);

  db.prepare('INSERT OR IGNORE INTO _migrations (name, run_at) VALUES (?, ?)').run('001_initial_schema', Date.now());

  // ── 002_email_auth ────────────────────────────────────────────────────────
  // Upgrades existing phone-based users table to include email column,
  // and recreates otp_requests with email instead of phone.
  const ran002 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get('002_email_auth');
  if (!ran002) {
    // Add email column if upgrading from a phone-only schema
    const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'email')) {
      db.exec('ALTER TABLE users ADD COLUMN email TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    }

    // Recreate otp_requests with email column (safe — OTPs are ephemeral & short-lived)
    const otpCols = db.prepare('PRAGMA table_info(otp_requests)').all() as Array<{ name: string }>;
    if (!otpCols.some((c) => c.name === 'email')) {
      db.exec('DROP TABLE IF EXISTS otp_requests');
      db.exec(`
        CREATE TABLE otp_requests (
          id          TEXT PRIMARY KEY,
          email       TEXT NOT NULL,
          code_hash   TEXT NOT NULL,
          expires_at  INTEGER NOT NULL,
          attempts    INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL
        )
      `);
    }
    // Create index unconditionally — safe for both new and upgraded installs
    db.exec('CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email, expires_at)');

    db.prepare('INSERT INTO _migrations (name, run_at) VALUES (?, ?)').run('002_email_auth', Date.now());
  }

  // ── 003_splitwise_features ────────────────────────────────────────────────
  // Adds: split_type + notes on expenses, type on groups, payments table.
  const ran003 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get('003_splitwise_features');
  if (!ran003) {
    const expCols = db.prepare('PRAGMA table_info(expenses)').all() as Array<{ name: string }>;
    if (!expCols.some((c) => c.name === 'split_type')) {
      db.exec(`ALTER TABLE expenses ADD COLUMN split_type TEXT NOT NULL DEFAULT 'equal'`);
    }
    if (!expCols.some((c) => c.name === 'notes')) {
      db.exec('ALTER TABLE expenses ADD COLUMN notes TEXT');
    }

    const grpCols = db.prepare('PRAGMA table_info(groups)').all() as Array<{ name: string }>;
    if (!grpCols.some((c) => c.name === 'type')) {
      db.exec(`ALTER TABLE groups ADD COLUMN type TEXT NOT NULL DEFAULT 'group'`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id           TEXT PRIMARY KEY,
        group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        from_phone   TEXT NOT NULL,
        to_phone     TEXT NOT NULL,
        amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
        notes        TEXT,
        created_by   TEXT NOT NULL REFERENCES users(id),
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payments_group
        ON payments(group_id, created_at DESC);
    `);

    db.prepare('INSERT INTO _migrations (name, run_at) VALUES (?, ?)').run('003_splitwise_features', Date.now());
  }
}
