import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, type User, type Session } from './auth';

export interface AuthContext {
  user: User;
  session: Session;
}

/**
 * Retrieves the current session and user from request headers without throwing.
 */
export async function getSessionContext(): Promise<AuthContext | null> {
  const reqHeaders = await headers();
  const res = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (!res || !res.user || !res.session) {
    return null;
  }

  return {
    user: res.user,
    session: res.session,
  };
}

/**
 * Enforces that a user is logged in and not banned.
 * Rejects missing sessions and banned users by redirecting to /login.
 */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getSessionContext();

  if (!ctx) {
    redirect('/login');
  }

  if (ctx.user.banned) {
    redirect('/login?error=banned');
  }

  return ctx;
}

/**
 * Enforces that the logged-in user has the 'owner' role and is not banned.
 * Rejects non-owners by redirecting to /checkout.
 */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireUser();

  if (ctx.user.role !== 'owner') {
    redirect('/checkout');
  }

  return ctx;
}

/**
 * Assertion helper for Server Actions that returns or throws.
 */
export function assertOwner(user: User): void {
  if (user.role !== 'owner') {
    throw new Error('Forbidden: Owner access required');
  }
}
