import type { Metadata } from 'next';
import { desc } from 'drizzle-orm';
import { db } from '@/src/db';
import { user } from '@/src/db/auth-schema';
import { requireOwner } from '@/src/lib/auth-guards';
import { formatColomboDate } from '@/src/lib/dates';
import { UsersTable, type StaffUser } from './users-table';

export const metadata: Metadata = {
  title: 'Staff Management | Jayaweera Logistic & Motors',
};

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { user: currentOwner } = await requireOwner();

  const userRecords = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));

  const staffUsers: StaffUser[] = userRecords.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: u.banned,
    banReason: u.banReason,
    createdAt: formatColomboDate(u.createdAt),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Staff Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage shop staff accounts, assign cashier access, and manage security credentials.
        </p>
      </div>

      <UsersTable users={staffUsers} currentUserId={currentOwner.id} />
    </div>
  );
}
