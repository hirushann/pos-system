/*
 * Logic behind the server actions in src/actions/inventory.ts. This is deliberately NOT a
 * 'use server' file: every export of such a file is callable from the browser, and the
 * execute* functions here take the acting user as an argument.
 */

import { db } from '@/src/db';
import { products, stockMovements } from '@/src/db/schema';
import { requireUser } from '@/src/lib/auth-guards';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { mapDatabaseError } from '@/src/lib/db-errors';

const adjustStockSchema = z.object({
  productId: z.number().int().positive('Please select a valid product'),
  changeQty: z
    .number()
    .int('Quantity must be a whole number')
    .refine((val) => val !== 0, 'Change quantity cannot be zero'),
  reason: z.enum(['received', 'adjustment'], {
    message: "Reason must be 'received' or 'adjustment'",
  }),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

interface ServerActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
}

export async function adjustStock(
  rawInput: AdjustStockInput,
): Promise<ServerActionResult<{ productId: number; newStock: number }>> {
  const { user } = await requireUser();
  return executeAdjustStock(rawInput, user);
}

export async function executeAdjustStock(
  rawInput: AdjustStockInput,
  user: { id: string; role?: string | null },
): Promise<ServerActionResult<{ productId: number; newStock: number }>> {
  if (user.role !== 'owner') {
    return {
      success: false,
      error: 'Forbidden: Only owners are authorized to adjust stock.',
    };
  }

  const parsed = adjustStockSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'form';
      fieldErrors[field] = issue.message;
    }
    return { success: false, error: 'Validation failed', fieldErrors };
  }

  const data = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Lock the product row FOR UPDATE
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, data.productId))
        .for('update');

      if (!product) {
        throw new Error('Selected product does not exist.');
      }

      // 2. Validate that stock does not fall below zero
      const newStock = product.stockQty + data.changeQty;
      if (newStock < 0) {
        throw new Error(
          `Stock cannot fall below zero. Current stock is ${product.stockQty} ${product.unit}, attempted change is ${
            data.changeQty > 0 ? '+' : ''
          }${data.changeQty}.`,
        );
      }

      // 3. Update stock_qty
      await tx
        .update(products)
        .set({ stockQty: newStock })
        .where(eq(products.id, product.id));

      // 4. Insert stock_movements in the SAME transaction
      await tx.insert(stockMovements).values({
        productId: product.id,
        changeQty: data.changeQty,
        qtyAfter: newStock,
        reason: data.reason,
        note: data.note?.trim() || null,
        createdBy: user.id,
      });

      return {
        productId: product.id,
        newStock,
        productName: product.name,
      };
    });

    revalidatePath('/inventory');
    revalidatePath('/products');

    return {
      success: true,
      data: {
        productId: result.productId,
        newStock: result.newStock,
      },
      message: `Stock for "${result.productName}" updated to ${result.newStock}.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to adjust stock.'),
    };
  }
}
