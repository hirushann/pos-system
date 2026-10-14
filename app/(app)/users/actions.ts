'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/src/lib/auth';
import { requireOwner } from '@/src/lib/auth-guards';
import { mapDatabaseError } from '@/src/lib/db-errors';

const createCashierSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const toggleUserStatusSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  banned: z.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function createCashierAction(formData: {
  name: string;
  email: string;
  password: string;
}) {
  const reqHeaders = await headers();
  await requireOwner();

  const validated = createCashierSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message || 'Validation failed',
    };
  }

  const { name, email, password } = validated.data;

  try {
    const res = await auth.api.createUser({
      headers: reqHeaders,
      body: {
        name,
        email,
        password,
        role: 'cashier',
      },
    });

    revalidatePath('/users');
    return {
      success: true,
      user: res.user,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('already exists') || message.includes('23505')) {
      return {
        success: false,
        error: 'A staff member with this email already exists.',
      };
    }
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to create cashier account.'),
    };
  }
}

export async function toggleUserStatusAction(params: {
  userId: string;
  banned: boolean;
}) {
  const reqHeaders = await headers();
  const { user: currentOwner } = await requireOwner();

  const validated = toggleUserStatusSchema.safeParse(params);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message || 'Validation failed',
    };
  }

  const { userId, banned } = validated.data;

  if (userId === currentOwner.id) {
    return {
      success: false,
      error: 'You cannot deactivate your own account.',
    };
  }

  try {
    if (banned) {
      await auth.api.banUser({
        headers: reqHeaders,
        body: {
          userId,
          banReason: 'Deactivated by store owner',
        },
      });
    } else {
      await auth.api.unbanUser({
        headers: reqHeaders,
        body: {
          userId,
        },
      });
    }

    revalidatePath('/users');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update user status.';
    return {
      success: false,
      error: message,
    };
  }
}

export async function resetPasswordAction(params: {
  userId: string;
  newPassword: string;
}) {
  const reqHeaders = await headers();
  await requireOwner();

  const validated = resetPasswordSchema.safeParse(params);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message || 'Validation failed',
    };
  }

  const { userId, newPassword } = validated.data;

  try {
    await auth.api.setUserPassword({
      headers: reqHeaders,
      body: {
        userId,
        newPassword,
      },
    });

    revalidatePath('/users');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reset password.';
    return {
      success: false,
      error: message,
    };
  }
}
