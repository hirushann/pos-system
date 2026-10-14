'use server';

import { db } from '@/src/db';
import { settings } from '@/src/db/schema';
import { requireOwner } from '@/src/lib/auth-guards';
import { mapDatabaseError } from '@/src/lib/db-errors';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const updateSettingsSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(1, 'Shop name is required')
    .max(100, 'Shop name cannot exceed 100 characters'),
  address: z
    .string()
    .trim()
    .max(255, 'Address cannot exceed 255 characters')
    .nullable()
    .optional(),
  phone: z
    .string()
    .trim()
    .max(50, 'Phone cannot exceed 50 characters')
    .nullable()
    .optional(),
  receiptFooter: z
    .string()
    .trim()
    .max(255, 'Receipt footer cannot exceed 255 characters')
    .nullable()
    .optional(),
  cashierMaxDiscountPct: z
    .string()
    .trim()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      'Discount percentage must be a valid number (e.g. 5 or 5.00)',
    )
    .refine((val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, 'Cashier maximum discount percentage must be between 0% and 100%'),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export interface SettingsData {
  shopName: string;
  address: string | null;
  phone: string | null;
  receiptFooter: string | null;
  cashierMaxDiscountPct: string;
}

export async function getSettingsData(): Promise<SettingsData> {
  await requireOwner();

  const [row] = await db
    .select({
      shopName: settings.shopName,
      address: settings.address,
      phone: settings.phone,
      receiptFooter: settings.receiptFooter,
      cashierMaxDiscountPct: settings.cashierMaxDiscountPct,
    })
    .from(settings)
    .where(eq(settings.id, 1));

  if (!row) {
    // Ensure default settings row exists
    const [inserted] = await db
      .insert(settings)
      .values({
        id: 1,
        shopName: 'Colombo Auto Spares & Parts',
        address: 'No. 142, Panchikawatta Road, Colombo 10, Sri Lanka',
        phone: '+94 11 234 5678',
        receiptFooter: 'Thank you! Parts can be exchanged within 7 days with this bill.',
        cashierMaxDiscountPct: '5.00',
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return {
        shopName: inserted.shopName,
        address: inserted.address,
        phone: inserted.phone,
        receiptFooter: inserted.receiptFooter,
        cashierMaxDiscountPct: inserted.cashierMaxDiscountPct,
      };
    }
  }

  return (
    row ?? {
      shopName: 'Colombo Auto Spares & Parts',
      address: 'No. 142, Panchikawatta Road, Colombo 10, Sri Lanka',
      phone: '+94 11 234 5678',
      receiptFooter: 'Thank you! Parts can be exchanged within 7 days with this bill.',
      cashierMaxDiscountPct: '5.00',
    }
  );
}

export async function updateSettings(rawInput: UpdateSettingsInput): Promise<{
  success: boolean;
  data?: SettingsData;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
}> {
  await requireOwner();

  const parsed = updateSettingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'form';
      fieldErrors[field] = issue.message;
    }
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Validation failed',
      fieldErrors,
    };
  }

  const data = parsed.data;

  try {
    const [updated] = await db
      .insert(settings)
      .values({
        id: 1,
        shopName: data.shopName,
        address: data.address || null,
        phone: data.phone || null,
        receiptFooter: data.receiptFooter || null,
        cashierMaxDiscountPct: parseFloat(data.cashierMaxDiscountPct).toFixed(2),
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          shopName: data.shopName,
          address: data.address || null,
          phone: data.phone || null,
          receiptFooter: data.receiptFooter || null,
          cashierMaxDiscountPct: parseFloat(data.cashierMaxDiscountPct).toFixed(2),
        },
      })
      .returning({
        shopName: settings.shopName,
        address: settings.address,
        phone: settings.phone,
        receiptFooter: settings.receiptFooter,
        cashierMaxDiscountPct: settings.cashierMaxDiscountPct,
      });

    revalidatePath('/settings');
    revalidatePath('/checkout');
    revalidatePath('/sales');

    return {
      success: true,
      data: updated,
      message: 'Store settings updated successfully.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to update store settings.'),
    };
  }
}
