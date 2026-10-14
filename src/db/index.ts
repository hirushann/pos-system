import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
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

export const pool =
  globalThis.__dbPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dbPool = pool;
}

export const db = drizzle({ client: pool, ...({ schema } as object) });
