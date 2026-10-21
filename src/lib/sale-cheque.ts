import { db } from '@/src/db';
import { sales } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export type SaleChequeStatus = 'pending' | 'cleared' | 'bounced';

/**
 * Owner marks a customer's cheque as cleared or bounced. Not a 'use server' file on purpose:
 * the server action in src/actions/sales.ts checks the owner first.
 */
export async function setSaleChequeStatusOp(
  saleId: number,
  status: SaleChequeStatus,
  actor: { role?: string | null },
): Promise<{ success: boolean; error?: string }> {
  if (actor.role !== 'owner') return { success: false, error: 'Forbidden: Only owners can update cheques.' };
  if (!['pending', 'cleared', 'bounced'].includes(status)) return { success: false, error: 'Invalid cheque status.' };

  const [sale] = await db.select({ method: sales.paymentMethod }).from(sales).where(eq(sales.id, saleId));
  if (!sale) return { success: false, error: 'Sale not found.' };
  if (sale.method !== 'cheque') return { success: false, error: 'This sale was not paid by cheque.' };

  await db.update(sales).set({ chequeStatus: status }).where(eq(sales.id, saleId));
  return { success: true };
}
