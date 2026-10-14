import { sql } from 'drizzle-orm';
import { mysqlTable, text, varchar, boolean, index, check } from 'drizzle-orm/mysql-core';
import { ts, nowSql } from './columns';

export const user = mysqlTable(
  'user',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: ts('created_at').default(nowSql).notNull(),
    updatedAt: ts('updated_at')
      .default(nowSql)
      .$onUpdate(() => new Date())
      .notNull(),
    role: varchar('role', { length: 255 }),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: ts('ban_expires'),
  },
  (table) => [
    check('user_role_check', sql`${table.role} IN ('owner', 'cashier')`),
  ],
);

export const session = mysqlTable(
  'session',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    createdAt: ts('created_at').default(nowSql).notNull(),
    updatedAt: ts('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: varchar('ip_address', { length: 255 }),
    userAgent: text('user_agent'),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: varchar('impersonated_by', { length: 255 }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = mysqlTable(
  'account',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').default(nowSql).notNull(),
    updatedAt: ts('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = mysqlTable(
  'verification',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').default(nowSql).notNull(),
    updatedAt: ts('updated_at')
      .default(nowSql)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
