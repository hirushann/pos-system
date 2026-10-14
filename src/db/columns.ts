import { sql } from 'drizzle-orm';
import { datetime } from 'drizzle-orm/mysql-core';

// DATETIME(3) holds UTC values. The connection sets time_zone = '+00:00'
// (see src/db/index.ts), so CURRENT_TIMESTAMP(3) defaults are UTC too, and
// Drizzle reads/writes these columns as UTC Dates.
export const ts = (name: string) => datetime(name, { mode: 'date', fsp: 3 });

export const nowSql = sql`CURRENT_TIMESTAMP(3)`;
