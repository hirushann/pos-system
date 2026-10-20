import { db } from '@/src/db';
import {
  suppliers,
  supplierInvoices,
  supplierPayments,
  supplierPriceItems,
} from '@/src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { getDbErrorKind, mapDatabaseError } from '@/src/lib/db-errors';
import { paymentCounts, sumCountedPayments } from '@/src/lib/supplier-payables';

/*
 * Supplier money logic: suppliers, their invoices, payments and price lists.
 *
 * This is deliberately NOT a 'use server' file: every export of such a file is a public
 * endpoint, and these functions take the acting user as an argument. The server actions in
 * src/actions/suppliers.ts authenticate the owner and then call these.
 */

export interface OpResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

type Actor = { id: string; role?: string | null };

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Not a real date');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Cannot exceed ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const money = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be a number such as 1500 or 1500.50`)
    .refine((v) => new Decimal(v).greaterThan(0), `${label} must be more than zero`)
    .refine((v) => new Decimal(v).lessThan('10000000000'), `${label} is too large`);

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(255),
  contactPerson: optionalText(255),
  phone: optionalText(255),
  email: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email address')
    .transform((v) => (v ? v : null)),
  address: optionalText(500),
  paymentTermsDays: z.coerce.number().int('Whole days only').min(0).max(365),
  notes: optionalText(2000),
  active: z.boolean().default(true),
});

export const invoiceSchema = z
  .object({
    supplierId: z.number().int().positive(),
    invoiceNumber: z.string().trim().min(1, 'Invoice number is required').max(255),
    invoiceDate: ymd,
    dueDate: ymd.nullish().transform((v) => v || null),
    amount: money('Amount'),
    notes: optionalText(2000),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.invoiceDate, {
    path: ['dueDate'],
    message: 'The due date cannot be before the invoice date',
  });

export const paymentSchema = z
  .object({
    invoiceId: z.number().int().positive(),
    paymentDate: ymd,
    amount: money('Amount'),
    method: z.enum(['cash', 'bank_transfer', 'cheque']),
    reference: optionalText(255),
    chequeNumber: optionalText(64),
    chequeBank: optionalText(255),
    chequeDate: ymd.nullish().transform((v) => v || null),
    chequeStatus: z.enum(['pending', 'cleared', 'bounced']).default('pending'),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'cheque' && !v.chequeNumber) {
      ctx.addIssue({ code: 'custom', path: ['chequeNumber'], message: 'Cheque number is required' });
    }
  });

export const priceItemSchema = z.object({
  id: z.number().int().positive().optional(),
  supplierId: z.number().int().positive(),
  itemName: z.string().trim().min(1, 'Item name is required').max(255),
  partNumber: optionalText(255),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Price must be a number such as 1500 or 1500.50'),
  priceDate: ymd,
  notes: optionalText(500),
});

function fail(error: z.ZodError): OpResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { success: false, error: error.issues[0]?.message || 'Check the form', fieldErrors };
}

const forbidden = (): OpResult<never> => ({ success: false, error: 'Forbidden: Only owners can manage suppliers.' });
const isOwner = (a: Actor) => a.role === 'owner';

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof UserFacingError) return err.message;
  if (getDbErrorKind(err) === 'foreign_key') return 'This record is still used by other records.';
  return mapDatabaseError(err, fallback);
}

class UserFacingError extends Error {}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export async function createSupplierOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  try {
    const [res] = await db.insert(suppliers).values(parsed.data).$returningId();
    return { success: true, data: { id: res.id } };
  } catch (err) {
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: 'A supplier with this name already exists.', fieldErrors: { name: 'Already exists' } };
    }
    return { success: false, error: errMessage(err, 'Could not save the supplier.') };
  }
}

export async function updateSupplierOp(id: number, raw: unknown, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  try {
    await db.update(suppliers).set(parsed.data).where(eq(suppliers.id, id));
    return { success: true };
  } catch (err) {
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: 'A supplier with this name already exists.', fieldErrors: { name: 'Already exists' } };
    }
    return { success: false, error: errMessage(err, 'Could not save the supplier.') };
  }
}

/** Only a supplier with no invoices can be deleted (otherwise mark it inactive). */
export async function deleteSupplierOp(id: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.transaction(async (tx) => {
      const [{ n }] = await tx
        .select({ n: sql<number>`COUNT(*)` })
        .from(supplierInvoices)
        .where(eq(supplierInvoices.supplierId, id));
      if (Number(n) > 0) {
        throw new UserFacingError(
          'This supplier has invoices, so it cannot be deleted. Mark it inactive instead to hide it from new invoices.',
        );
      }
      await tx.delete(suppliers).where(eq(suppliers.id, id)); // price list rows cascade
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the supplier.') };
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
const DUPLICATE_INVOICE = {
  success: false,
  error: 'This supplier already has an invoice with that number.',
  fieldErrors: { invoiceNumber: 'Already used for this supplier' },
} as const;

export async function createInvoiceOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  try {
    const [res] = await db
      .insert(supplierInvoices)
      .values({ ...parsed.data, createdBy: actor.id })
      .$returningId();
    return { success: true, data: { id: res.id } };
  } catch (err) {
    if (getDbErrorKind(err) === 'unique') return { ...DUPLICATE_INVOICE };
    return { success: false, error: errMessage(err, 'Could not save the invoice.') };
  }
}

export async function updateInvoiceOp(id: number, raw: unknown, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  try {
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).for('update');
      if (!inv) throw new UserFacingError('Invoice not found.');
      const pays = await tx.select().from(supplierPayments).where(eq(supplierPayments.invoiceId, id));
      const paid = sumCountedPayments(pays);
      if (new Decimal(parsed.data.amount).lessThan(paid)) {
        throw new UserFacingError(
          `Rs. ${paid.toFixed(2)} has already been paid on this invoice, so the amount cannot be lower than that.`,
        );
      }
      await tx.update(supplierInvoices).set(parsed.data).where(eq(supplierInvoices.id, id));
    });
    return { success: true };
  } catch (err) {
    if (getDbErrorKind(err) === 'unique') return { ...DUPLICATE_INVOICE };
    return { success: false, error: errMessage(err, 'Could not save the invoice.') };
  }
}

/** An invoice with recorded payments must have them removed first, so money is never lost silently. */
export async function deleteInvoiceOp(id: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).for('update');
      if (!inv) throw new UserFacingError('Invoice not found.');
      const [{ n }] = await tx
        .select({ n: sql<number>`COUNT(*)` })
        .from(supplierPayments)
        .where(eq(supplierPayments.invoiceId, id));
      if (Number(n) > 0) {
        throw new UserFacingError('This invoice has payments recorded. Delete those payments first, then delete the invoice.');
      }
      await tx.delete(supplierInvoices).where(eq(supplierInvoices.id, id));
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the invoice.') };
  }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export async function recordPaymentOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number; balance: string }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const input = parsed.data;
  const isCheque = input.method === 'cheque';

  try {
    const data = await db.transaction(async (tx) => {
      // Lock the invoice so two payments recorded at once cannot overpay it
      const [inv] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, input.invoiceId)).for('update');
      if (!inv) throw new UserFacingError('Invoice not found.');

      const pays = await tx.select().from(supplierPayments).where(eq(supplierPayments.invoiceId, inv.id));
      const balance = new Decimal(inv.amount).minus(sumCountedPayments(pays));
      const counts = paymentCounts({ method: input.method, chequeStatus: isCheque ? input.chequeStatus : null });
      if (counts && new Decimal(input.amount).greaterThan(balance)) {
        throw new UserFacingError(`That is more than the balance owed (Rs. ${balance.toFixed(2)}).`);
      }

      const [res] = await tx
        .insert(supplierPayments)
        .values({
          invoiceId: inv.id,
          paymentDate: input.paymentDate,
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          chequeNumber: isCheque ? input.chequeNumber : null,
          chequeBank: isCheque ? input.chequeBank : null,
          chequeDate: isCheque ? input.chequeDate : null,
          chequeStatus: isCheque ? input.chequeStatus : null,
          notes: input.notes,
          createdBy: actor.id,
        })
        .$returningId();
      return { id: res.id, balance: (counts ? balance.minus(input.amount) : balance).toFixed(2) };
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not record the payment.') };
  }
}

export async function setChequeStatusOp(
  paymentId: number,
  status: 'pending' | 'cleared' | 'bounced',
  actor: Actor,
): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  if (!['pending', 'cleared', 'bounced'].includes(status)) return { success: false, error: 'Invalid cheque status.' };
  try {
    await db.transaction(async (tx) => {
      const [pay] = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, paymentId));
      if (!pay) throw new UserFacingError('Payment not found.');
      if (pay.method !== 'cheque') throw new UserFacingError('Only cheque payments have a cheque status.');

      const [inv] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, pay.invoiceId)).for('update');
      const pays = await tx.select().from(supplierPayments).where(eq(supplierPayments.invoiceId, pay.invoiceId));
      // Bringing a bounced cheque back must not push the invoice over its amount
      const paidWithChange = sumCountedPayments(
        pays.map((p) => (p.id === paymentId ? { ...p, chequeStatus: status } : p)),
      );
      if (paidWithChange.greaterThan(inv.amount)) {
        throw new UserFacingError(
          'Counting this cheque again would be more than the invoice amount, because other payments were made after it bounced.',
        );
      }
      await tx.update(supplierPayments).set({ chequeStatus: status }).where(eq(supplierPayments.id, paymentId));
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not update the cheque.') };
  }
}

export async function deletePaymentOp(paymentId: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.delete(supplierPayments).where(eq(supplierPayments.id, paymentId));
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the payment.') };
  }
}

// ---------------------------------------------------------------------------
// Price list
// ---------------------------------------------------------------------------
export async function savePriceItemOp(raw: unknown, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  const parsed = priceItemSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const { id, ...values } = parsed.data;
  try {
    if (id) {
      await db
        .update(supplierPriceItems)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(supplierPriceItems.id, id), eq(supplierPriceItems.supplierId, values.supplierId)));
    } else {
      await db.insert(supplierPriceItems).values(values);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not save the price.') };
  }
}

export async function deletePriceItemOp(id: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.delete(supplierPriceItems).where(eq(supplierPriceItems.id, id));
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the price.') };
  }
}
