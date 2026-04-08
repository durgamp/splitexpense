/**
 * SQLite database layer (better-sqlite3).
 *
 * Provides a thin mssql-compatible shim so existing route files need only
 * minimal changes: replace BigInt() wrappers → plain numbers, and
 * "SELECT TOP 1" → "SELECT ... LIMIT 1".
 *
 * Named params: routes use @name syntax which is natively supported by SQLite.
 */
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

const DB_PATH =
  process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', '..', '..', 'splitease.db');

let _db: BetterSqlite3.Database | null = null;

function getDb(): BetterSqlite3.Database {
  if (_db) return _db;
  _db = new BetterSqlite3(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');   // safe with WAL, much faster than FULL
  _db.pragma('cache_size = -32000');    // 32 MB page cache
  _db.pragma('temp_store = MEMORY');    // temp tables in RAM
  _db.pragma('mmap_size = 134217728'); // 128 MB memory-mapped I/O
  console.log('[DB] SQLite opened:', DB_PATH);
  return _db;
}

// ── Async pool initialiser (keeps the startup interface the same) ─────────────
export async function getPool(): Promise<BetterSqlite3.Database> {
  return getDb();
}

// ── Request shim ──────────────────────────────────────────────────────────────
// Mimics mssql's Request.input(...).query(sql) chaining.
// Types (sql.NVarChar, sql.BigInt …) are accepted but ignored — SQLite is
// dynamically typed so they are not needed.

interface QueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordset: any[];
}

class SqliteRequest {
  private params: Record<string, unknown> = {};
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  // Accept (name, type, value) or (name, value) — type is ignored.
  input(name: string, typeOrValue: unknown, value?: unknown): this {
    this.params[name] = value !== undefined ? value : typeOrValue;
    return this;
  }

  query(sqlStr: string): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare(sqlStr);
        const upper = sqlStr.trimStart().toUpperCase();
        if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
          const rows = stmt.all(this.params) as Record<string, unknown>[];
          resolve({ recordset: rows });
        } else {
          stmt.run(this.params);
          resolve({ recordset: [] });
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}

/** Return a new Request bound to the SQLite connection. */
export async function getRequest(): Promise<SqliteRequest> {
  return new SqliteRequest(getDb());
}

// ── Transaction shim ──────────────────────────────────────────────────────────
// Provides a mssql-compatible transaction object with a nested Request factory.

class SqliteTransaction {
  readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  request(): SqliteRequest {
    return new SqliteRequest(this.db);
  }
}

/**
 * Wrap multiple DB operations in a single IMMEDIATE transaction.
 * The callback receives a transaction handle; use `new sql.Request(t)` to
 * create requests inside the transaction.
 */
export async function withTransaction<T>(
  fn: (t: SqliteTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  const tx = new SqliteTransaction(db);
  try {
    const result = await fn(tx);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Cast a value to JS number (BigInt or otherwise). */
export const toNum = (v: unknown): number => Number(v);

// ── sql namespace stub ────────────────────────────────────────────────────────
// Routes call sql.NVarChar(255), sql.BigInt, etc. as type tags for mssql.
// In SQLite these are meaningless — stubs keep call sites compiling unchanged.

export const sql = {
  // Called as sql.NVarChar(255) — returns a type tag (ignored)
  NVarChar: (_n?: number) => 'NVarChar',
  VarChar:  (_n?: number) => 'VarChar',
  Int:      'Int',
  BigInt:   'BigInt',
  Bit:      'Bit',
  Float:    'Float',
  // Request used inside transactions: new sql.Request(t)
  Request: class SqliteRequestFromTx {
    private params: Record<string, unknown> = {};
    private db: BetterSqlite3.Database;

    constructor(tx: SqliteTransaction) {
      this.db = tx.db;
    }

    input(name: string, typeOrValue: unknown, value?: unknown): this {
      this.params[name] = value !== undefined ? value : typeOrValue;
      return this;
    }

    query(sqlStr: string): Promise<QueryResult> {
      return new Promise((resolve, reject) => {
        try {
          const stmt = this.db.prepare(sqlStr);
          const upper = sqlStr.trimStart().toUpperCase();
          if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
            resolve({ recordset: stmt.all(this.params) as Record<string, unknown>[] });
          } else {
            stmt.run(this.params);
            resolve({ recordset: [] });
          }
        } catch (err) {
          reject(err);
        }
      });
    }
  },
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
    console.log('[DB] SQLite connection closed');
  }
}

process.on('SIGINT',  () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
