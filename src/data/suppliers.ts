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
  type Supplier,
  type SupplierPriceItem,
} from '@/src/db/schema';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
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
  /** Invoice amount less returned goods. */
  net: string;
  returned: string;
  /** Money the supplier still owes back (returns paid for, minus refunds and credit used). */
  credit: string;
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

  const ids = rows.map((r) => r.id);
  const sumBy = async (table: 'returns' | 'refunds' | 'used') => {
    if (ids.length === 0) return new Map<number, string>();
    if (table === 'returns') {
      const res = await db
        .select({ id: supplierReturns.invoiceId, v: sql<string>`SUM(${supplierReturns.total})` })
        .from(supplierReturns)
        .where(inArray(supplierReturns.invoiceId, ids))
        .groupBy(supplierReturns.invoiceId);
      return new Map(res.map((x) => [x.id, String(x.v)]));
    }
    if (table === 'refunds') {
      const res = await db
        .select({ id: supplierRefunds.invoiceId, v: sql<string>`SUM(${supplierRefunds.amount})` })
        .from(supplierRefunds)
        .where(inArray(supplierRefunds.invoiceId, ids))
        .groupBy(supplierRefunds.invoiceId);
      return new Map(res.map((x) => [x.id, String(x.v)]));
    }
    const res = await db
      .select({ id: supplierPayments.creditFromInvoiceId, v: sql<string>`SUM(${supplierPayments.amount})` })
      .from(supplierPayments)
      .where(inArray(supplierPayments.creditFromInvoiceId, ids))
      .groupBy(supplierPayments.creditFromInvoiceId);
    return new Map(res.map((x) => [x.id as number, String(x.v)]));
  };
  const [returnedBy, refundedBy, usedBy] = await Promise.all([sumBy('returns'), sumBy('refunds'), sumBy('used')]);

  const mapped = rows.map((r): InvoiceRow => {
    const b = computeInvoiceBalance({
      amount: r.amount,
      paid: String(r.paid),
      dueDate: r.dueDate,
      today,
      returned: returnedBy.get(r.id),
      refunded: refundedBy.get(r.id),
      creditUsed: usedBy.get(r.id),
    });
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
  /** Money suppliers owe you back for returned goods. */
  creditDue: string;
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
      creditDue: sum((i) => i.credit).toFixed(2),
    };
  });
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return row ?? null;
}

/** Every supplier (active or not), for choosing a product's preferred supplier. */
export async function getAllSupplierOptions(): Promise<{ id: number; name: string }[]> {
  return db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name));
}

export interface SupplierProductRow {
  id: number;
  name: string;
  partNumber: string;
  sku: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  costPrice: string;
  isActive: boolean;
}

/** Products that name this supplier as their preferred supplier. */
export async function getSupplierProducts(supplierId: number): Promise<SupplierProductRow[]> {
  return db
    .select({
      id: products.id,
      name: products.name,
      partNumber: products.partNumber,
      sku: products.sku,
      unit: products.unit,
      stockQty: products.stockQty,
      reorderLevel: products.reorderLevel,
      costPrice: products.costPrice,
      isActive: products.isActive,
    })
    .from(products)
    .where(eq(products.preferredSupplierId, supplierId))
    .orderBy(asc(products.name));
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


// ---------------------------------------------------------------------------
// Products received, returns and refunds
// ---------------------------------------------------------------------------
export interface InvoiceItemRow {
  id: number;
  productId: number;
  productName: string;
  partNumber: string;
  quantity: number;
  unitCost: string;
  lineTotal: string;
  returnedQty: number;
  returnableQty: number;
}

export async function getInvoiceItems(invoiceId: number): Promise<InvoiceItemRow[]> {
  const rows = await db
    .select({
      id: supplierInvoiceItems.id,
      productId: supplierInvoiceItems.productId,
      productName: products.name,
      partNumber: products.partNumber,
      quantity: supplierInvoiceItems.quantity,
      unitCost: supplierInvoiceItems.unitCost,
      lineTotal: supplierInvoiceItems.lineTotal,
    })
    .from(supplierInvoiceItems)
    .innerJoin(products, eq(products.id, supplierInvoiceItems.productId))
    .where(eq(supplierInvoiceItems.invoiceId, invoiceId))
    .orderBy(asc(supplierInvoiceItems.id));
  if (rows.length === 0) return [];

  const returned = await db
    .select({ id: supplierReturnItems.invoiceItemId, q: sql<number>`SUM(${supplierReturnItems.quantity})` })
    .from(supplierReturnItems)
    .where(inArray(supplierReturnItems.invoiceItemId, rows.map((r) => r.id)))
    .groupBy(supplierReturnItems.invoiceItemId);
  const map = new Map(returned.map((r) => [r.id, Number(r.q)]));
  return rows.map((r) => ({ ...r, returnedQty: map.get(r.id) ?? 0, returnableQty: r.quantity - (map.get(r.id) ?? 0) }));
}

export interface ReturnRow {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  supplierId: number;
  supplierName: string;
  returnDate: string;
  creditNoteNumber: string | null;
  reason: string | null;
  total: string;
  items: { productName: string; partNumber: string; quantity: number; unitCost: string; lineTotal: string }[];
}

export async function getReturns(filter: { supplierId?: number; invoiceId?: number } = {}): Promise<ReturnRow[]> {
  const conditions = [];
  if (filter.supplierId) conditions.push(eq(supplierReturns.supplierId, filter.supplierId));
  if (filter.invoiceId) conditions.push(eq(supplierReturns.invoiceId, filter.invoiceId));
  const rows = await db
    .select({
      id: supplierReturns.id,
      invoiceId: supplierReturns.invoiceId,
      invoiceNumber: supplierInvoices.invoiceNumber,
      supplierId: supplierReturns.supplierId,
      supplierName: suppliers.name,
      returnDate: supplierReturns.returnDate,
      creditNoteNumber: supplierReturns.creditNoteNumber,
      reason: supplierReturns.reason,
      total: supplierReturns.total,
    })
    .from(supplierReturns)
    .innerJoin(supplierInvoices, eq(supplierInvoices.id, supplierReturns.invoiceId))
    .innerJoin(suppliers, eq(suppliers.id, supplierReturns.supplierId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supplierReturns.returnDate), desc(supplierReturns.id))
    .limit(300);
  if (rows.length === 0) return [];

  const items = await db
    .select({
      returnId: supplierReturnItems.returnId,
      productName: products.name,
      partNumber: products.partNumber,
      quantity: supplierReturnItems.quantity,
      unitCost: supplierReturnItems.unitCost,
      lineTotal: supplierReturnItems.lineTotal,
    })
    .from(supplierReturnItems)
    .innerJoin(products, eq(products.id, supplierReturnItems.productId))
    .where(inArray(supplierReturnItems.returnId, rows.map((r) => r.id)))
    .orderBy(asc(supplierReturnItems.id));
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.returnId === r.id) }));
}

export interface RefundRow {
  id: number;
  invoiceId: number;
  refundDate: string;
  amount: string;
  method: 'cash' | 'bank_transfer' | 'cheque';
  reference: string | null;
  notes: string | null;
}

export async function getRefunds(invoiceId: number): Promise<RefundRow[]> {
  const rows = await db
    .select({
      id: supplierRefunds.id,
      invoiceId: supplierRefunds.invoiceId,
      refundDate: supplierRefunds.refundDate,
      amount: supplierRefunds.amount,
      method: supplierRefunds.method,
      reference: supplierRefunds.reference,
      notes: supplierRefunds.notes,
    })
    .from(supplierRefunds)
    .where(eq(supplierRefunds.invoiceId, invoiceId))
    .orderBy(desc(supplierRefunds.refundDate), desc(supplierRefunds.id));
  return rows as RefundRow[];
}

/** Open invoices of a supplier that credit can be applied to. */
export async function getOpenInvoicesForSupplier(supplierId: number): Promise<InvoiceRow[]> {
  return getInvoiceRows({ supplierId, status: 'open' });
}

// ---------------------------------------------------------------------------
// Same product, different suppliers
// ---------------------------------------------------------------------------
export interface ProductSupplierHistory {
  supplierId: number;
  supplierName: string;
  invoices: number;
  qtyBought: number;
  qtyReturned: number;
  averageCost: string;
  lastUnitCost: string;
  lastDate: string;
  /** Price this supplier quoted in their price list for the same part number, if any. */
  quotedPrice: string | null;
  quotedDate: string | null;
}

export async function getProductSupplierHistory(productId: number): Promise<ProductSupplierHistory[]> {
  const [product] = await db.select({ partNumber: products.partNumber }).from(products).where(eq(products.id, productId));
  if (!product) return [];

  const lines = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      invoiceId: supplierInvoices.id,
      invoiceDate: supplierInvoices.invoiceDate,
      quantity: supplierInvoiceItems.quantity,
      unitCost: supplierInvoiceItems.unitCost,
      lineTotal: supplierInvoiceItems.lineTotal,
      itemId: supplierInvoiceItems.id,
    })
    .from(supplierInvoiceItems)
    .innerJoin(supplierInvoices, eq(supplierInvoices.id, supplierInvoiceItems.invoiceId))
    .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
    .where(eq(supplierInvoiceItems.productId, productId))
    .orderBy(desc(supplierInvoices.invoiceDate), desc(supplierInvoiceItems.id));
  if (lines.length === 0) return [];

  const returned = await db
    .select({ supplierId: supplierInvoices.supplierId, q: sql<number>`SUM(${supplierReturnItems.quantity})` })
    .from(supplierReturnItems)
    .innerJoin(supplierInvoiceItems, eq(supplierInvoiceItems.id, supplierReturnItems.invoiceItemId))
    .innerJoin(supplierInvoices, eq(supplierInvoices.id, supplierInvoiceItems.invoiceId))
    .where(eq(supplierReturnItems.productId, productId))
    .groupBy(supplierInvoices.supplierId);
  const returnedBy = new Map(returned.map((r) => [r.supplierId, Number(r.q)]));

  const quotes = await db
    .select()
    .from(supplierPriceItems)
    .where(sql`LOWER(${supplierPriceItems.partNumber}) = LOWER(${product.partNumber})`);

  const bySupplier = new Map<number, ProductSupplierHistory>();
  const spend = new Map<number, Decimal>();
  const invoiceSet = new Map<number, Set<number>>();
  for (const l of lines) {
    // lines are newest first, so the first one seen per supplier is the latest purchase
    if (!bySupplier.has(l.supplierId)) {
      const quote = quotes.find((q) => q.supplierId === l.supplierId);
      bySupplier.set(l.supplierId, {
        supplierId: l.supplierId,
        supplierName: l.supplierName,
        invoices: 0,
        qtyBought: 0,
        qtyReturned: returnedBy.get(l.supplierId) ?? 0,
        averageCost: '0.00',
        lastUnitCost: l.unitCost,
        lastDate: l.invoiceDate,
        quotedPrice: quote?.unitPrice ?? null,
        quotedDate: quote?.priceDate ?? null,
      });
      spend.set(l.supplierId, new Decimal(0));
      invoiceSet.set(l.supplierId, new Set());
    }
    const row = bySupplier.get(l.supplierId)!;
    row.qtyBought += l.quantity;
    spend.set(l.supplierId, spend.get(l.supplierId)!.plus(l.lineTotal));
    invoiceSet.get(l.supplierId)!.add(l.invoiceId);
  }
  for (const [id, row] of bySupplier) {
    row.invoices = invoiceSet.get(id)!.size;
    row.averageCost = row.qtyBought > 0 ? spend.get(id)!.dividedBy(row.qtyBought).toFixed(2) : '0.00';
  }
  return [...bySupplier.values()].sort((a, b) => Number(a.lastUnitCost) - Number(b.lastUnitCost));
}

export interface PurchaseHint {
  fromSupplier: { unitCost: string; date: string } | null;
  bestOther: { supplierName: string; unitCost: string; date: string } | null;
  currentCost: string;
}

/** While entering an invoice line: what this supplier charged last time and who else sells it cheaper. */
export async function getPurchaseHint(productId: number, supplierId: number): Promise<PurchaseHint> {
  const [product] = await db.select({ costPrice: products.costPrice }).from(products).where(eq(products.id, productId));
  const history = await getProductSupplierHistory(productId);
  const mine = history.find((h) => h.supplierId === supplierId);
  const others = history.filter((h) => h.supplierId !== supplierId);
  const best = others.length ? others[0] : null; // sorted cheapest last cost first
  return {
    fromSupplier: mine ? { unitCost: mine.lastUnitCost, date: mine.lastDate } : null,
    bestOther: best ? { supplierName: best.supplierName, unitCost: best.lastUnitCost, date: best.lastDate } : null,
    currentCost: product?.costPrice ?? '0.00',
  };
}

export interface PurchaseProductOption {
  id: number;
  name: string;
  partNumber: string;
  sku: string;
  stockQty: number;
  unit: string;
  costPrice: string;
  isActive: boolean;
}

/** Products matching the text. When a supplier is given, its preferred products come first. */
export async function searchPurchaseProducts(query: string, supplierId?: number | null): Promise<PurchaseProductOption[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  return db
    .select({
      id: products.id,
      name: products.name,
      partNumber: products.partNumber,
      sku: products.sku,
      stockQty: products.stockQty,
      unit: products.unit,
      costPrice: products.costPrice,
      isActive: products.isActive,
    })
    .from(products)
    .where(or(like(products.name, pattern), like(products.partNumber, pattern), like(products.sku, pattern)))
    .orderBy(
      ...(supplierId ? [sql`(${products.preferredSupplierId} = ${supplierId}) DESC`] : []),
      asc(products.name),
    )
    .limit(15);
}
