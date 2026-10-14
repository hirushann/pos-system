import { drizzle } from 'drizzle-orm/mysql2';
import { createPool, type Pool } from 'mysql2';
import * as schema from './schema';

const connectionString =
  process.env.NODE_ENV === 'test' && process.env.DATABASE_URL_TEST
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing.');
}

if (process.env.NODE_ENV === 'test') {
  if (!connectionString.includes('pos_test')) {
    throw new Error('FATAL SAFETY VIOLATION: Tests must strictly run against pos_test! Never touch pos_dev.');
  }
}

declare global {
  var __dbPool: Pool | undefined;
}

function createDbPool(): Pool {
  const p = createPool({
    uri: connectionString,
    // Keep DECIMAL as strings (never JS floats) and make Date <-> DATETIME UTC.
    decimalNumbers: false,
    timezone: 'Z',
    connectionLimit: 10,
  });
  // CURRENT_TIMESTAMP defaults and CONVERT_TZ() in reports assume a UTC session,
  // whatever the server's own time zone is.
  p.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return p;
}

export const pool = globalThis.__dbPool ?? createDbPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dbPool = pool;
}

export const db = drizzle({ client: pool, ...({ schema } as object) });

/** Closes every pooled connection (used by one-off scripts so they can exit). */
export function closeDb(): Promise<void> {
  return pool.promise().end();
}
