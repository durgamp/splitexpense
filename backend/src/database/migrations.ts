/**
 * SQL Server (MSSQL) schema migrations.
 * All DDL is idempotent: uses IF OBJECT_ID / IF NOT EXISTS guards.
 * Timestamps are stored as BIGINT (Unix epoch milliseconds).
 */
import * as sql from 'mssql';
import { getPool } from './index.js';

export async function runMigrations(): Promise<void> {
  const pool = await getPool();

  // ── Migration tracking table ───────────────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('_migrations', 'U') IS NULL
    CREATE TABLE _migrations (
      name   NVARCHAR(100) NOT NULL PRIMARY KEY,
      run_at BIGINT        NOT NULL
    );
  `);

  await migration001(pool);
  await migration002(pool);
  await migration003(pool);

  console.log('[DB] Migrations complete');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ran(pool: sql.ConnectionPool, name: string): Promise<boolean> {
  const r = await pool.request()
    .input('name', sql.NVarChar(100), name)
    .query('SELECT 1 AS x FROM _migrations WHERE name = @name');
  return r.recordset.length > 0;
}

async function mark(pool: sql.ConnectionPool, name: string): Promise<void> {
  await pool.request()
    .input('name', sql.NVarChar(100), name)
    .input('runAt', sql.BigInt, BigInt(Date.now()))
    .query(`
      IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = @name)
        INSERT INTO _migrations (name, run_at) VALUES (@name, @runAt);
    `);
}

// ── 001: Initial schema ───────────────────────────────────────────────────────

async function migration001(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    IF OBJECT_ID('users', 'U') IS NULL
    CREATE TABLE users (
      id             NVARCHAR(36)  NOT NULL PRIMARY KEY,
      email          NVARCHAR(255) NULL,
      phone          NVARCHAR(20)  NULL,
      name           NVARCHAR(100) NOT NULL DEFAULT '',
      created_at     BIGINT        NOT NULL,
      last_active_at BIGINT        NOT NULL,
      CONSTRAINT uq_users_email UNIQUE (email),
      CONSTRAINT uq_users_phone UNIQUE (phone)
    );

    IF OBJECT_ID('otp_requests', 'U') IS NULL
    CREATE TABLE otp_requests (
      id         NVARCHAR(36)  NOT NULL PRIMARY KEY,
      email      NVARCHAR(255) NOT NULL,
      code_hash  NVARCHAR(100) NOT NULL,
      expires_at BIGINT        NOT NULL,
      attempts   INT           NOT NULL DEFAULT 0,
      created_at BIGINT        NOT NULL
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_otp_email' AND object_id = OBJECT_ID('otp_requests')
    )
    CREATE INDEX idx_otp_email ON otp_requests(email, expires_at);

    IF OBJECT_ID('refresh_tokens', 'U') IS NULL
    CREATE TABLE refresh_tokens (
      id         NVARCHAR(36) NOT NULL PRIMARY KEY,
      user_id    NVARCHAR(36) NOT NULL,
      token_hash NVARCHAR(64) NOT NULL,
      expires_at BIGINT       NOT NULL,
      created_at BIGINT       NOT NULL,
      CONSTRAINT fk_rt_user   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT uq_rt_hash   UNIQUE (token_hash)
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_rt_user' AND object_id = OBJECT_ID('refresh_tokens')
    )
    CREATE INDEX idx_rt_user ON refresh_tokens(user_id);

    IF OBJECT_ID('groups', 'U') IS NULL
    CREATE TABLE groups (
      id                      NVARCHAR(36) NOT NULL PRIMARY KEY,
      name                    NVARCHAR(80) NOT NULL,
      type                    NVARCHAR(10) NOT NULL DEFAULT 'group'
                                CHECK (type IN ('group','direct')),
      created_by              NVARCHAR(36) NOT NULL,
      invite_token            NVARCHAR(64) NOT NULL,
      invite_token_created_at BIGINT       NOT NULL,
      created_at              BIGINT       NOT NULL,
      CONSTRAINT fk_groups_creator FOREIGN KEY (created_by) REFERENCES users(id),
      CONSTRAINT uq_groups_token   UNIQUE (invite_token)
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_groups_token' AND object_id = OBJECT_ID('groups')
    )
    CREATE INDEX idx_groups_token ON groups(invite_token);

    IF OBJECT_ID('group_members', 'U') IS NULL
    CREATE TABLE group_members (
      group_id   NVARCHAR(36)  NOT NULL,
      phone      NVARCHAR(20)  NOT NULL,
      user_id    NVARCHAR(36)  NULL,
      name       NVARCHAR(100) NOT NULL DEFAULT '',
      status     NVARCHAR(10)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('active','pending','removed')),
      role       NVARCHAR(10)  NOT NULL DEFAULT 'member'
                   CHECK (role IN ('admin','member')),
      invited_by NVARCHAR(100) NOT NULL,
      joined_at  BIGINT        NULL,
      CONSTRAINT pk_group_members PRIMARY KEY (group_id, phone),
      CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      CONSTRAINT fk_gm_user  FOREIGN KEY (user_id)  REFERENCES users(id)
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_gm_phone' AND object_id = OBJECT_ID('group_members')
    )
    CREATE INDEX idx_gm_phone ON group_members(phone);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_gm_user' AND object_id = OBJECT_ID('group_members')
    )
    CREATE INDEX idx_gm_user ON group_members(user_id);

    IF OBJECT_ID('expenses', 'U') IS NULL
    CREATE TABLE expenses (
      id            NVARCHAR(36)  NOT NULL PRIMARY KEY,
      group_id      NVARCHAR(36)  NOT NULL,
      description   NVARCHAR(200) NOT NULL,
      amount_paise  BIGINT        NOT NULL CHECK (amount_paise > 0),
      paid_by_phone NVARCHAR(20)  NOT NULL,
      category      NVARCHAR(20)  NOT NULL DEFAULT 'other',
      split_type    NVARCHAR(20)  NOT NULL DEFAULT 'equal',
      notes         NVARCHAR(500) NULL,
      created_by    NVARCHAR(36)  NOT NULL,
      created_at    BIGINT        NOT NULL,
      updated_at    BIGINT        NOT NULL,
      deleted_at    BIGINT        NULL,
      CONSTRAINT fk_exp_group   FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE CASCADE,
      CONSTRAINT fk_exp_creator FOREIGN KEY (created_by) REFERENCES users(id)
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_exp_group' AND object_id = OBJECT_ID('expenses')
    )
    CREATE INDEX idx_exp_group ON expenses(group_id, deleted_at, created_at DESC);

    IF OBJECT_ID('expense_shares', 'U') IS NULL
    CREATE TABLE expense_shares (
      expense_id   NVARCHAR(36) NOT NULL,
      phone        NVARCHAR(20) NOT NULL,
      amount_paise BIGINT       NOT NULL CHECK (amount_paise >= 0),
      CONSTRAINT pk_expense_shares PRIMARY KEY (expense_id, phone),
      CONSTRAINT fk_es_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_es_phone' AND object_id = OBJECT_ID('expense_shares')
    )
    CREATE INDEX idx_es_phone ON expense_shares(phone);

    IF OBJECT_ID('payments', 'U') IS NULL
    CREATE TABLE payments (
      id           NVARCHAR(36)  NOT NULL PRIMARY KEY,
      group_id     NVARCHAR(36)  NOT NULL,
      from_phone   NVARCHAR(20)  NOT NULL,
      to_phone     NVARCHAR(20)  NOT NULL,
      amount_paise BIGINT        NOT NULL CHECK (amount_paise > 0),
      notes        NVARCHAR(200) NULL,
      created_by   NVARCHAR(36)  NOT NULL,
      created_at   BIGINT        NOT NULL,
      CONSTRAINT fk_pay_group   FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE CASCADE,
      CONSTRAINT fk_pay_creator FOREIGN KEY (created_by) REFERENCES users(id)
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'idx_pay_group' AND object_id = OBJECT_ID('payments')
    )
    CREATE INDEX idx_pay_group ON payments(group_id, created_at DESC);

    IF OBJECT_ID('contact_hashes', 'U') IS NULL
    CREATE TABLE contact_hashes (
      hash       NVARCHAR(64) NOT NULL PRIMARY KEY,
      user_id    NVARCHAR(36) NOT NULL,
      created_at BIGINT       NOT NULL,
      CONSTRAINT fk_ch_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await mark(pool, '001_initial_schema');
}

// ── 002: Email auth (no-op for fresh installs — schema already has email) ─────

async function migration002(pool: sql.ConnectionPool): Promise<void> {
  if (await ran(pool, '002_email_auth')) return;
  // Fresh SQL Server installs have email from the start (migration 001).
  // This entry exists only to keep the migration log in sync with the SQLite version.
  await mark(pool, '002_email_auth');
}

// ── 003: Splitwise features (split_type, notes, type, payments) ───────────────

async function migration003(pool: sql.ConnectionPool): Promise<void> {
  if (await ran(pool, '003_splitwise_features')) return;

  // Add split_type column if upgrading from an older schema
  const splitTypeExists = await pool.request().query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'expenses' AND COLUMN_NAME = 'split_type'
  `);
  if (splitTypeExists.recordset.length === 0) {
    await pool.request().query(
      `ALTER TABLE expenses ADD split_type NVARCHAR(20) NOT NULL DEFAULT 'equal'`
    );
  }

  // Add notes column
  const notesExists = await pool.request().query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'expenses' AND COLUMN_NAME = 'notes'
  `);
  if (notesExists.recordset.length === 0) {
    await pool.request().query(
      `ALTER TABLE expenses ADD notes NVARCHAR(500) NULL`
    );
  }

  // Add type column to groups
  const typeExists = await pool.request().query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'groups' AND COLUMN_NAME = 'type'
  `);
  if (typeExists.recordset.length === 0) {
    await pool.request().query(
      `ALTER TABLE groups ADD type NVARCHAR(10) NOT NULL DEFAULT 'group' CHECK (type IN ('group','direct'))`
    );
  }

  await mark(pool, '003_splitwise_features');
}
