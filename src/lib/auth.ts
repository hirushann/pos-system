import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { db } from '../db/index';
import * as authSchema from '../db/auth-schema';

const ac = createAccessControl({
  user: [
    'create',
    'list',
    'set-role',
    'ban',
    'impersonate',
    'delete',
    'set-password',
    'set-email',
    'get',
    'update',
  ],
  session: ['list', 'revoke', 'delete'],
});

const ownerRole = ac.newRole({
  user: [
    'create',
    'list',
    'set-role',
    'ban',
    'impersonate',
    'delete',
    'set-password',
    'set-email',
    'get',
    'update',
  ],
  session: ['list', 'revoke', 'delete'],
});

const cashierRole = ac.newRole({
  user: [],
  session: [],
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'mysql',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [
    admin({
      defaultRole: 'cashier',
      adminRoles: ['owner'],
      roles: {
        owner: ownerRole,
        cashier: cashierRole,
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
