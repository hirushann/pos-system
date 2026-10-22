import { db } from '@/src/db';
import {
  suppliers,
  supplierInvoices,
  supplierInvoiceItems,
  supplierPayments,
  supplierPriceItems,
  supplierReturns,
  supplierReturnItems,
  supplierRefunds,
  products,
  stockMovements,
} from '@/src/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { getDbErrorKind, mapDatabaseError } from '@/src/lib/db-errors';
import { paymentCounts, rawCredit, sumCountedPayments } from '@/src/lib/supplier-payables';

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

export const invoiceItemSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().int('Whole numbers only').min(1, 'Quantity must be at least 1').max(1_000_000),
  unitCost: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Unit cost must be a number such as 1500 or 1500.50'),
});

export const invoiceSchema = z
  .object({
    supplierId: z.number().int().positive(),
    invoiceNumber: z.string().trim().min(1, 'Invoice number is required').max(255),
    invoiceDate: ymd,
    dueDate: ymd.nullish().transform((v) => v || null),
    amount: money('Amount'),
    notes: optionalText(2000),
    /** Products received on this invoice. Optional: leave empty for an amount-only invoice. */
    items: z.array(invoiceItemSchema).max(200).optional(),
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


type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface InvoiceFinancials {
  inv: typeof supplierInvoices.$inferSelect;
  pays: (typeof supplierPayments.$inferSelect)[];
  paid: Decimal;
  returned: Decimal;
  refunded: Decimal;
  creditUsed: Decimal;
  net: Decimal;
  balance: Decimal;
  credit: Decimal;
}

/** Locks an invoice row and works out everything owed, paid, returned and refundable on it. */
export async function loadInvoiceFinancials(tx: Tx, invoiceId: number): Promise<InvoiceFinancials | null> {
  const [inv] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId)).for('update');
  if (!inv) return null;
  const pays = await tx.select().from(supplierPayments).where(eq(supplierPayments.invoiceId, invoiceId));
  const [ret] = await tx
    .select({ v: sql<string>`COALESCE(SUM(${supplierReturns.total}), 0)` })
    .from(supplierReturns)
    .where(eq(supplierReturns.invoiceId, invoiceId));
  const [ref] = await tx
    .select({ v: sql<string>`COALESCE(SUM(${supplierRefunds.amount}), 0)` })
    .from(supplierRefunds)
    .where(eq(supplierRefunds.invoiceId, invoiceId));
  const [used] = await tx
    .select({ v: sql<string>`COALESCE(SUM(${supplierPayments.amount}), 0)` })
    .from(supplierPayments)
    .where(eq(supplierPayments.creditFromInvoiceId, invoiceId));

  const paid = sumCountedPayments(pays);
  const returned = new Decimal(String(ret.v));
  const refunded = new Decimal(String(ref.v));
  const creditUsed = new Decimal(String(used.v));
  const net = Decimal.max(new Decimal(inv.amount).minus(returned), 0);
  return {
    inv,
    pays,
    paid,
    returned,
    refunded,
    creditUsed,
    net,
    balance: Decimal.max(net.minus(paid), 0),
    credit: Decimal.max(rawCredit({ amount: inv.amount, paid: paid.toString(), returned: returned.toString(), refunded: refunded.toString(), creditUsed: creditUsed.toString() }), 0),
  };
}

/** Credit the invoice would have with different figures. Negative = the books would not add up. */
function creditWith(f: InvoiceFinancials, change: Partial<{ amount: Decimal; paid: Decimal; returned: Decimal }>): Decimal {
  return rawCredit({
    amount: (change.amount ?? new Decimal(f.inv.amount)).toString(),
    paid: (change.paid ?? f.paid).toString(),
    returned: (change.returned ?? f.returned).toString(),
    refunded: f.refunded.toString(),
    creditUsed: f.creditUsed.toString(),
  });
}

const CREDIT_PROBLEM =
  'Supplier credit from this invoice has already been refunded or used on another invoice, so this change is not possible. Remove the refund or credit payment first.';

/** Locks the given products in id order (prevents deadlocks) and returns them by id. */
async function lockProducts(tx: Tx, ids: number[]) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const rows = await tx.select().from(products).where(inArray(products.id, unique)).orderBy(asc(products.id)).for('update');
  return new Map(rows.map((r) => [r.id, r]));
}

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

/**
 * Adds an invoice. When it lists products, the same transaction adds them to stock
 * ('received' movements) and sets each product's cost price to what was just paid.
 */
export async function createInvoiceOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const { items = [], ...header } = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const [supplier] = await tx.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, header.supplierId));
      if (!supplier) throw new UserFacingError('Supplier not found.');

      const [res] = await tx
        .insert(supplierInvoices)
        .values({ ...header, createdBy: actor.id })
        .$returningId();

      if (items.length > 0) {
        const locked = await lockProducts(tx, items.map((i) => i.productId));
        const stock = new Map([...locked].map(([pid, p]) => [pid, p.stockQty]));

        for (const item of items) {
          const product = locked.get(item.productId);
          if (!product) throw new UserFacingError('One of the products no longer exists.');
          const unitCost = new Decimal(item.unitCost);

          await tx.insert(supplierInvoiceItems).values({
            invoiceId: res.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: unitCost.toFixed(2),
            lineTotal: unitCost.times(item.quantity).toFixed(2),
          });

          const after = (stock.get(item.productId) ?? 0) + item.quantity;
          stock.set(item.productId, after);
          await tx.update(products).set({ stockQty: after, ...(unitCost.greaterThan(0) ? { costPrice: unitCost.toFixed(2) } : {}) }).where(eq(products.id, item.productId));
          await tx.insert(stockMovements).values({
            productId: item.productId,
            changeQty: item.quantity,
            qtyAfter: after,
            reason: 'received',
            createdBy: actor.id,
            note: `Supplier invoice ${header.invoiceNumber} from ${supplier.name}`,
          });
        }
      }
      return res.id;
    });
    return { success: true, data: { id } };
  } catch (err) {
    if (getDbErrorKind(err) === 'unique') return { ...DUPLICATE_INVOICE };
    return { success: false, error: errMessage(err, 'Could not save the invoice.') };
  }
}

/** Edits the invoice header only (number, dates, amount, notes). Products received are not edited. */
export async function updateInvoiceOp(id: number, raw: unknown, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const { items: _ignored, ...header } = parsed.data;
  void _ignored;
  try {
    await db.transaction(async (tx) => {
      const f = await loadInvoiceFinancials(tx, id);
      if (!f) throw new UserFacingError('Invoice not found.');
      const newAmount = new Decimal(header.amount);
      if (newAmount.lessThan(f.returned)) {
        throw new UserFacingError(`Goods worth Rs. ${f.returned.toFixed(2)} were returned on this invoice, so the amount cannot be lower than that.`);
      }
      // An edit must not push the net amount below what was already paid (typo guard); credit only comes from returns
      const floor = Decimal.min(f.paid, f.net);
      if (newAmount.minus(f.returned).lessThan(floor)) {
        throw new UserFacingError(
          `Rs. ${f.paid.toFixed(2)} has already been paid on this invoice, so the amount cannot be lower than that${f.returned.greaterThan(0) ? ' plus returned goods' : ''}.`,
        );
      }
      if (creditWith(f, { amount: newAmount }).isNegative()) throw new UserFacingError(CREDIT_PROBLEM);
      await tx.update(supplierInvoices).set(header).where(eq(supplierInvoices.id, id));
    });
    return { success: true };
  } catch (err) {
    if (getDbErrorKind(err) === 'unique') return { ...DUPLICATE_INVOICE };
    return { success: false, error: errMessage(err, 'Could not save the invoice.') };
  }
}

/**
 * Deletes an invoice. It must have no payments or returns. Products it received are taken
 * back out of stock (a reversing 'adjustment' is logged), which is refused if some were
 * already sold.
 */
export async function deleteInvoiceOp(id: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.transaction(async (tx) => {
      const f = await loadInvoiceFinancials(tx, id);
      if (!f) throw new UserFacingError('Invoice not found.');
      if (f.pays.length > 0) {
        throw new UserFacingError('This invoice has payments recorded. Delete those payments first, then delete the invoice.');
      }
      const [{ n }] = await tx.select({ n: sql<number>`COUNT(*)` }).from(supplierReturns).where(eq(supplierReturns.invoiceId, id));
      if (Number(n) > 0) {
        throw new UserFacingError('This invoice has returns recorded. Delete those returns first, then delete the invoice.');
      }

      const items = await tx.select().from(supplierInvoiceItems).where(eq(supplierInvoiceItems.invoiceId, id));
      if (items.length > 0) {
        const locked = await lockProducts(tx, items.map((i) => i.productId));
        const stock = new Map([...locked].map(([pid, p]) => [pid, p.stockQty]));
        for (const item of items) {
          const product = locked.get(item.productId)!;
          const left = (stock.get(item.productId) ?? 0) - item.quantity;
          if (left < 0) {
            throw new UserFacingError(
              `Cannot delete: ${product.name} has only ${stock.get(item.productId)} in stock but this invoice added ${item.quantity}. Some were already sold.`,
            );
          }
          stock.set(item.productId, left);
          await tx.update(products).set({ stockQty: left }).where(eq(products.id, item.productId));
          await tx.insert(stockMovements).values({
            productId: item.productId,
            changeQty: -item.quantity,
            qtyAfter: left,
            reason: 'adjustment',
            createdBy: actor.id,
            note: `Supplier invoice ${f.inv.invoiceNumber} deleted: stock removed`,
          });
        }
      }
      await tx.delete(supplierInvoices).where(eq(supplierInvoices.id, id)); // items cascade
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
      const f = await loadInvoiceFinancials(tx, input.invoiceId);
      if (!f) throw new UserFacingError('Invoice not found.');

      const counts = paymentCounts({ method: input.method, chequeStatus: isCheque ? input.chequeStatus : null });
      if (counts && new Decimal(input.amount).greaterThan(f.balance)) {
        throw new UserFacingError(`That is more than the balance owed (Rs. ${f.balance.toFixed(2)}).`);
      }

      const [res] = await tx
        .insert(supplierPayments)
        .values({
          invoiceId: f.inv.id,
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
      return { id: res.id, balance: (counts ? f.balance.minus(input.amount) : f.balance).toFixed(2) };
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

      const f = await loadInvoiceFinancials(tx, pay.invoiceId);
      if (!f) throw new UserFacingError('Invoice not found.');
      const paidWithChange = sumCountedPayments(f.pays.map((p) => (p.id === paymentId ? { ...p, chequeStatus: status } : p)));
      // Counting a bounced cheque again must not pay more than the net invoice amount
      if (creditWith(f, { paid: paidWithChange }).isNegative()) throw new UserFacingError(CREDIT_PROBLEM);
      if (paidWithChange.greaterThan(new Decimal(f.inv.amount))) {
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
    await db.transaction(async (tx) => {
      const [pay] = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, paymentId));
      if (!pay) throw new UserFacingError('Payment not found.');
      const f = await loadInvoiceFinancials(tx, pay.invoiceId);
      if (!f) throw new UserFacingError('Invoice not found.');
      const remaining = sumCountedPayments(f.pays.filter((p) => p.id !== paymentId));
      if (creditWith(f, { paid: remaining }).isNegative()) throw new UserFacingError(CREDIT_PROBLEM);
      await tx.delete(supplierPayments).where(eq(supplierPayments.id, paymentId));
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the payment.') };
  }
}

// ---------------------------------------------------------------------------
// Returns to the supplier (credit notes)
// ---------------------------------------------------------------------------
export const returnSchema = z.object({
  invoiceId: z.number().int().positive(),
  returnDate: ymd,
  creditNoteNumber: optionalText(255),
  reason: optionalText(2000),
  items: z
    .array(
      z.object({
        invoiceItemId: z.number().int().positive(),
        quantity: z.number().int('Whole numbers only').min(1, 'Quantity must be at least 1'),
      }),
    )
    .min(1, 'Choose at least one product to return')
    .max(200),
});

/**
 * Sends products back to a supplier. Takes them out of stock ('supplier_return' movements) and
 * credits the invoice: it lowers what is owed, or becomes refundable credit if already paid.
 * Quantities are capped by what the invoice delivered minus earlier returns, and by stock on hand.
 */
export async function createReturnOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number; total: string }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = returnSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const input = parsed.data;

  try {
    const data = await db.transaction(async (tx) => {
      const f = await loadInvoiceFinancials(tx, input.invoiceId);
      if (!f) throw new UserFacingError('Invoice not found.');
      const [supplier] = await tx.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, f.inv.supplierId));

      // Same invoice line chosen twice: add the quantities together
      const wanted = new Map<number, number>();
      for (const it of input.items) wanted.set(it.invoiceItemId, (wanted.get(it.invoiceItemId) ?? 0) + it.quantity);

      const lines = await tx
        .select()
        .from(supplierInvoiceItems)
        .where(and(eq(supplierInvoiceItems.invoiceId, input.invoiceId), inArray(supplierInvoiceItems.id, [...wanted.keys()])))
        .orderBy(asc(supplierInvoiceItems.id))
        .for('update');
      if (lines.length !== wanted.size) throw new UserFacingError('One of the chosen lines is not on this invoice.');

      const already = await tx
        .select({ itemId: supplierReturnItems.invoiceItemId, qty: sql<number>`SUM(${supplierReturnItems.quantity})` })
        .from(supplierReturnItems)
        .where(inArray(supplierReturnItems.invoiceItemId, [...wanted.keys()]))
        .groupBy(supplierReturnItems.invoiceItemId);
      const returnedBefore = new Map(already.map((r) => [r.itemId, Number(r.qty)]));

      let total = new Decimal(0);
      const toReturn = lines.map((line) => {
        const qty = wanted.get(line.id)!;
        const left = line.quantity - (returnedBefore.get(line.id) ?? 0);
        if (qty > left) {
          throw new UserFacingError(`Only ${left} of one line can still be returned (${line.quantity} delivered, ${line.quantity - left} already returned).`);
        }
        const lineTotal = new Decimal(line.unitCost).times(qty);
        total = total.plus(lineTotal);
        return { line, qty, lineTotal };
      });

      if (f.returned.plus(total).greaterThan(new Decimal(f.inv.amount))) {
        throw new UserFacingError('The returned goods are worth more than the invoice amount. Check the invoice amount first.');
      }

      // Stock on hand must cover what goes back (products locked in id order)
      const locked = await lockProducts(tx, toReturn.map((t) => t.line.productId));
      const stock = new Map([...locked].map(([pid, p]) => [pid, p.stockQty]));
      for (const t of toReturn) {
        const have = stock.get(t.line.productId) ?? 0;
        if (have < t.qty) {
          throw new UserFacingError(`Only ${have} of ${locked.get(t.line.productId)?.name ?? 'this product'} in stock, so ${t.qty} cannot be returned. Some were already sold.`);
        }
        stock.set(t.line.productId, have - t.qty);
      }

      const [ret] = await tx
        .insert(supplierReturns)
        .values({
          supplierId: f.inv.supplierId,
          invoiceId: f.inv.id,
          returnDate: input.returnDate,
          creditNoteNumber: input.creditNoteNumber,
          reason: input.reason,
          total: total.toFixed(2),
          createdBy: actor.id,
        })
        .$returningId();

      // Apply per line, tracking running stock so repeated products stay consistent
      const running = new Map([...locked].map(([pid, p]) => [pid, p.stockQty]));
      for (const t of toReturn) {
        await tx.insert(supplierReturnItems).values({
          returnId: ret.id,
          invoiceItemId: t.line.id,
          productId: t.line.productId,
          quantity: t.qty,
          unitCost: t.line.unitCost,
          lineTotal: t.lineTotal.toFixed(2),
        });
        const after = (running.get(t.line.productId) ?? 0) - t.qty;
        running.set(t.line.productId, after);
        await tx.update(products).set({ stockQty: after }).where(eq(products.id, t.line.productId));
        await tx.insert(stockMovements).values({
          productId: t.line.productId,
          changeQty: -t.qty,
          qtyAfter: after,
          reason: 'supplier_return',
          createdBy: actor.id,
          note: `Returned to ${supplier?.name ?? 'supplier'} (invoice ${f.inv.invoiceNumber})`,
        });
      }
      return { id: ret.id, total: total.toFixed(2) };
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not record the return.') };
  }
}

/** Undoes a return: the goods go back into stock and the credit disappears (refused if already refunded or used). */
export async function deleteReturnOp(returnId: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.transaction(async (tx) => {
      const [ret] = await tx.select().from(supplierReturns).where(eq(supplierReturns.id, returnId));
      if (!ret) throw new UserFacingError('Return not found.');
      const f = await loadInvoiceFinancials(tx, ret.invoiceId);
      if (!f) throw new UserFacingError('Invoice not found.');
      if (creditWith(f, { returned: f.returned.minus(ret.total) }).isNegative()) throw new UserFacingError(CREDIT_PROBLEM);

      const items = await tx.select().from(supplierReturnItems).where(eq(supplierReturnItems.returnId, returnId));
      const locked = await lockProducts(tx, items.map((i) => i.productId));
      const running = new Map([...locked].map(([pid, p]) => [pid, p.stockQty]));
      for (const item of items) {
        const after = (running.get(item.productId) ?? 0) + item.quantity;
        running.set(item.productId, after);
        await tx.update(products).set({ stockQty: after }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({
          productId: item.productId,
          changeQty: item.quantity,
          qtyAfter: after,
          reason: 'adjustment',
          createdBy: actor.id,
          note: `Return on invoice ${f.inv.invoiceNumber} deleted: stock put back`,
        });
      }
      await tx.delete(supplierReturns).where(eq(supplierReturns.id, returnId)); // items cascade
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the return.') };
  }
}

// ---------------------------------------------------------------------------
// Refunds and supplier credit
// ---------------------------------------------------------------------------
export const refundSchema = z.object({
  invoiceId: z.number().int().positive(),
  refundDate: ymd,
  amount: money('Amount'),
  method: z.enum(['cash', 'bank_transfer', 'cheque']),
  reference: optionalText(255),
  notes: optionalText(2000),
});

/** The supplier paid money back against the credit from returned goods. */
export async function recordRefundOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = refundSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const input = parsed.data;
  try {
    const id = await db.transaction(async (tx) => {
      const f = await loadInvoiceFinancials(tx, input.invoiceId);
      if (!f) throw new UserFacingError('Invoice not found.');
      if (new Decimal(input.amount).greaterThan(f.credit)) {
        throw new UserFacingError(`The supplier only owes you Rs. ${f.credit.toFixed(2)} on this invoice.`);
      }
      const [res] = await tx.insert(supplierRefunds).values({ ...input, createdBy: actor.id }).$returningId();
      return res.id;
    });
    return { success: true, data: { id } };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not record the refund.') };
  }
}

export async function deleteRefundOp(refundId: number, actor: Actor): Promise<OpResult> {
  if (!isOwner(actor)) return forbidden();
  try {
    await db.delete(supplierRefunds).where(eq(supplierRefunds.id, refundId));
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not delete the refund.') };
  }
}

export const applyCreditSchema = z.object({
  fromInvoiceId: z.number().int().positive(),
  toInvoiceId: z.number().int().positive(),
  date: ymd,
  amount: money('Amount'),
});

/** Uses credit from one invoice to pay another invoice of the same supplier. */
export async function applyCreditOp(raw: unknown, actor: Actor): Promise<OpResult<{ id: number }>> {
  if (!isOwner(actor)) return forbidden();
  const parsed = applyCreditSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const input = parsed.data;
  if (input.fromInvoiceId === input.toInvoiceId) return { success: false, error: 'Choose a different invoice to pay.' };
  try {
    const id = await db.transaction(async (tx) => {
      // Lock both invoices in id order
      const [first, second] = [input.fromInvoiceId, input.toInvoiceId].sort((a, b) => a - b);
      const f1 = await loadInvoiceFinancials(tx, first);
      const f2 = await loadInvoiceFinancials(tx, second);
      const from = first === input.fromInvoiceId ? f1 : f2;
      const to = first === input.toInvoiceId ? f1 : f2;
      if (!from || !to) throw new UserFacingError('Invoice not found.');
      if (from.inv.supplierId !== to.inv.supplierId) throw new UserFacingError('Credit can only be used on invoices from the same supplier.');
      const amount = new Decimal(input.amount);
      if (amount.greaterThan(from.credit)) throw new UserFacingError(`Only Rs. ${from.credit.toFixed(2)} of credit is available.`);
      if (amount.greaterThan(to.balance)) throw new UserFacingError(`That is more than the balance owed on the other invoice (Rs. ${to.balance.toFixed(2)}).`);

      const [res] = await tx
        .insert(supplierPayments)
        .values({
          invoiceId: to.inv.id,
          paymentDate: input.date,
          amount: amount.toFixed(2),
          method: 'credit',
          reference: `Credit from invoice ${from.inv.invoiceNumber}`,
          creditFromInvoiceId: from.inv.id,
          createdBy: actor.id,
        })
        .$returningId();
      return res.id;
    });
    return { success: true, data: { id } };
  } catch (err) {
    return { success: false, error: errMessage(err, 'Could not apply the credit.') };
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
