import { db } from '@/src/db';
import {
  suppliers,
  supplierInvoices,
  supplierPayments,
  supplierPriceItems,
  type Supplier,
  type SupplierPriceItem,
} from '@/src/db/schema';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { getColomboDateString } from '@/src/lib/dates';
import {
  addDays,
  computeInvoiceBalance,
  type ChequeStatus,
  type InvoiceStatus,
  type PaymentMethod,
} from '@/src/lib/supplier-payables';

export interface InvoiceRow {
  id: number;
  supplierId: number;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  amount: string;
  notes: string | null;
  paid: string;
  balance: string;
  status: InvoiceStatus;
  overdue: boolean;
  daysOverdue: number;
}

export type InvoiceStatusFilter = 'all' | 'open' | 'unpaid' | 'partial' | 'paid' | 'overdue';

export interface InvoiceFilters {
  supplierId?: number | null;
  status?: InvoiceStatusFilter;
  search?: string | null;
}

export interface PaymentRow {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  supplierId: number;
  supplierName: string;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  chequeNumber: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
  chequeStatus: ChequeStatus | null;
  notes: string | null;
}

// A bounced cheque no longer counts as paid
const countedAmount = sql`CASE WHEN ${supplierPayments.method} = 'cheque' AND ${supplierPayments.chequeStatus} = 'bounced' THEN 0 ELSE ${supplierPayments.amount} END`;

export async function getInvoiceRows(filters: InvoiceFilters = {}): Promise<InvoiceRow[]> {
  const today = getColomboDateString(new Date());
  const conditions = [];
  if (filters.supplierId) conditions.push(eq(supplierInvoices.supplierId, filters.supplierId));
  const term = filters.search?.trim();
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(or(like(supplierInvoices.invoiceNumber, pattern), like(suppliers.name, pattern)));
  }

  const rows = await db
    .select({
      id: supplierInvoices.id,
      supplierId: supplierInvoices.supplierId,
      supplierName: suppliers.name,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
      amount: supplierInvoices.amount,
      notes: supplierInvoices.notes,
      paid: sql<string>`COALESCE(SUM(${countedAmount}), 0)`,
    })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
    .leftJoin(supplierPayments, eq(supplierPayments.invoiceId, supplierInvoices.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(supplierInvoices.id, suppliers.name)
    .orderBy(desc(supplierInvoices.invoiceDate), desc(supplierInvoices.id));

  const mapped = rows.map((r): InvoiceRow => {
    const b = computeInvoiceBalance({ amount: r.amount, paid: String(r.paid), dueDate: r.dueDate, today });
    return { ...r, ...b };
  });

  const status = filters.status ?? 'all';
  return mapped.filter((r) => {
    if (status === 'all') return true;
    if (status === 'open') return r.status !== 'paid';
    if (status === 'overdue') return r.overdue;
    return r.status === status;
  });
}

export interface SupplierListItem extends Supplier {
  invoiceCount: number;
  totalInvoiced: string;
  totalPaid: string;
  outstanding: string;
  overdueAmount: string;
  overdueCount: number;
}

export async function getSupplierList(search?: string | null): Promise<SupplierListItem[]> {
  const term = search?.trim();
  const list = await db
    .select()
    .from(suppliers)
    .where(term ? like(suppliers.name, `%${term.replace(/[\\%_]/g, '\\$&')}%`) : undefined)
    .orderBy(asc(suppliers.name));
  const invoices = await getInvoiceRows();

  return list.map((s) => {
    const mine = invoices.filter((i) => i.supplierId === s.id);
    const sum = (pick: (i: InvoiceRow) => string, only: (i: InvoiceRow) => boolean = () => true) =>
      mine.filter(only).reduce((acc, i) => acc.plus(pick(i)), new Decimal(0));
    return {
      ...s,
      invoiceCount: mine.length,
      totalInvoiced: sum((i) => i.amount).toFixed(2),
      totalPaid: sum((i) => i.paid).toFixed(2),
      outstanding: sum((i) => i.balance).toFixed(2),
      overdueAmount: sum((i) => i.balance, (i) => i.overdue).toFixed(2),
      overdueCount: mine.filter((i) => i.overdue).length,
    };
  });
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return row ?? null;
}

export async function getSupplierOptions(): Promise<{ id: number; name: string; paymentTermsDays: number }[]> {
  return db
    .select({ id: suppliers.id, name: suppliers.name, paymentTermsDays: suppliers.paymentTermsDays })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));
}

const paymentSelect = {
  id: supplierPayments.id,
  invoiceId: supplierPayments.invoiceId,
  invoiceNumber: supplierInvoices.invoiceNumber,
  supplierId: supplierInvoices.supplierId,
  supplierName: suppliers.name,
  paymentDate: supplierPayments.paymentDate,
  amount: supplierPayments.amount,
  method: supplierPayments.method,
  reference: supplierPayments.reference,
  chequeNumber: supplierPayments.chequeNumber,
  chequeBank: supplierPayments.chequeBank,
  chequeDate: supplierPayments.chequeDate,
  chequeStatus: supplierPayments.chequeStatus,
  notes: supplierPayments.notes,
};

export async function getPayments(
  filter: { supplierId?: number; invoiceId?: number; pendingChequesOnly?: boolean; limit?: number } = {},
): Promise<PaymentRow[]> {
  const conditions = [];
  if (filter.supplierId) conditions.push(eq(supplierInvoices.supplierId, filter.supplierId));
  if (filter.invoiceId) conditions.push(eq(supplierPayments.invoiceId, filter.invoiceId));
  if (filter.pendingChequesOnly) conditions.push(eq(supplierPayments.chequeStatus, 'pending'));

  const rows = await db
    .select(paymentSelect)
    .from(supplierPayments)
    .innerJoin(supplierInvoices, eq(supplierInvoices.id, supplierPayments.invoiceId))
    .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supplierPayments.paymentDate), desc(supplierPayments.id))
    .limit(filter.limit ?? 500);

  return rows as PaymentRow[];
}

export async function getInvoiceDetail(id: number): Promise<{ invoice: InvoiceRow; payments: PaymentRow[] } | null> {
  const rows = await getInvoiceRows();
  const invoice = rows.find((r) => r.id === id);
  if (!invoice) return null;
  return { invoice, payments: await getPayments({ invoiceId: id }) };
}

export async function getPriceList(supplierId: number): Promise<SupplierPriceItem[]> {
  return db
    .select()
    .from(supplierPriceItems)
    .where(eq(supplierPriceItems.supplierId, supplierId))
    .orderBy(asc(supplierPriceItems.itemName));
}

export interface PayablesSummary {
  outstanding: string;
  openInvoices: number;
  overdueAmount: string;
  overdueInvoices: number;
  dueSoonAmount: string; // due in the next 7 days
  dueSoonInvoices: number;
  paidThisMonth: string;
  pendingChequesAmount: string;
  pendingChequesCount: number;
}

export async function getPayablesSummary(): Promise<PayablesSummary> {
  const today = getColomboDateString(new Date());
  const weekEnd = addDays(today, 7);
  const monthStart = `${today.slice(0, 8)}01`;

  const [invoices, payments] = await Promise.all([getInvoiceRows(), getPayments({ limit: 5000 })]);
  const open = invoices.filter((i) => i.status !== 'paid');
  const total = (list: InvoiceRow[]) => list.reduce((acc, i) => acc.plus(i.balance), new Decimal(0)).toFixed(2);
  const overdue = open.filter((i) => i.overdue);
  const dueSoon = open.filter((i) => !i.overdue && i.dueDate && i.dueDate <= weekEnd);
  const counted = payments.filter((p) => !(p.method === 'cheque' && p.chequeStatus === 'bounced'));
  const pendingCheques = payments.filter((p) => p.chequeStatus === 'pending');
  const sumPay = (list: PaymentRow[]) => list.reduce((acc, p) => acc.plus(p.amount), new Decimal(0)).toFixed(2);

  return {
    outstanding: total(open),
    openInvoices: open.length,
    overdueAmount: total(overdue),
    overdueInvoices: overdue.length,
    dueSoonAmount: total(dueSoon),
    dueSoonInvoices: dueSoon.length,
    paidThisMonth: sumPay(counted.filter((p) => p.paymentDate >= monthStart && p.paymentDate <= today)),
    pendingChequesAmount: sumPay(pendingCheques),
    pendingChequesCount: pendingCheques.length,
  };
}
