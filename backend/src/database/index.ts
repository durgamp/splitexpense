import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations';

const DB_PATH = process.env.VERCEL
  ? '/tmp/splitease.db'
  : path.resolve(process.cwd(), process.env.DB_PATH ?? 'database/splitease.db');

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  // Ensure the database directory exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _db = new DatabaseSync(DB_PATH);

  // Performance & safety pragmas
  _db.exec('PRAGMA journal_mode = WAL');     // Write-Ahead Logging — better concurrency
  _db.exec('PRAGMA foreign_keys = ON');      // Enforce FK constraints
  _db.exec('PRAGMA busy_timeout = 5000');    // Wait up to 5s on locked db
  _db.exec('PRAGMA synchronous = NORMAL');   // Safe with WAL, faster than FULL
  _db.exec('PRAGMA cache_size = -64000');    // 64 MB page cache
  _db.exec('PRAGMA temp_store = MEMORY');    // Temp tables in memory

  runMigrations(_db);

  return _db;
}

/**
 * Type-cast helpers: node:sqlite returns Record<string, SQLOutputValue>.
 * These casts are safe because our schema guarantees the column shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asRow<T>(v: unknown): T { return v as any; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asRows<T>(v: unknown): T[] { return v as any; }

/** Close the db connection cleanly on process exit. */
process.on('exit', () => _db?.close());
// Do NOT call process.exit() in SIGINT/SIGTERM — it crashes Vercel serverless functions.
process.on('SIGINT', () => _db?.close());
process.on('SIGTERM', () => _db?.close());
