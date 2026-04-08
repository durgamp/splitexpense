import * as sql from 'mssql';

// ── Connection config ─────────────────────────────────────────────────────────

const config: sql.config = {
  server: process.env.DB_SERVER ?? 'localhost',
  database: process.env.DB_NAME ?? 'SplitEase',
  user: process.env.DB_USER ?? 'sa',
  password: process.env.DB_PASS ?? '',
  port: Number(process.env.DB_PORT ?? 1433),
  options: {
    // true for Azure SQL; false for on-prem / local SSMS
    encrypt: process.env.DB_ENCRYPT !== 'false',
    // allow self-signed certs in non-production (SSMS local dev)
    trustServerCertificate: process.env.NODE_ENV !== 'production',
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: 15_000,
  requestTimeout: 15_000,
};

let _pool: sql.ConnectionPool | null = null;

// ── Pool singleton ────────────────────────────────────────────────────────────

export async function getPool(): Promise<sql.ConnectionPool> {
  if (_pool?.connected) return _pool;
  _pool = await new sql.ConnectionPool(config).connect();
  console.log('[DB] Connected to SQL Server:', config.server, '/', config.database);
  return _pool;
}

/** Return a new Request on the pool (no transaction). */
export async function getRequest(): Promise<sql.Request> {
  const pool = await getPool();
  return pool.request();
}

/**
 * Wrap multiple DB operations in a single serialisable transaction.
 * Commits on success, rolls back on any thrown error.
 */
export async function withTransaction<T>(
  fn: (t: sql.Transaction) => Promise<T>,
): Promise<T> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await fn(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/** Cast a mssql BIGINT result (BigInt) to JS number safely. */
export const toNum = (v: unknown): number => Number(v);

// Re-export sql namespace so routes can use sql.NVarChar, sql.BigInt, etc.
export { sql };

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function closePool() {
  if (_pool) {
    await _pool.close();
    _pool = null;
    console.log('[DB] Connection pool closed');
  }
}

process.on('SIGINT', () => closePool().then(() => process.exit(0)));
process.on('SIGTERM', () => closePool().then(() => process.exit(0)));
