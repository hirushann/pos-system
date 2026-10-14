import { db } from '@/src/db';
import { sales, saleItems, user } from '@/src/db/schema';
import { eq, sql, and, desc, asc, inArray, count, gte, lte } from 'drizzle-orm';
import { getColomboDateRange, getColomboDateString } from '@/src/lib/dates';
import Decimal from 'decimal.js';

export interface SalesFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  cashierId?: string | null;
  paymentMethod?: 'all' | 'cash' | 'card';
  status?: 'all' | 'completed' | 'voided';
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface SaleListItem {
  id: number;
  receiptNumber: string;
  createdAt: Date;
  status: 'completed' | 'voided';
  subtotal: string;
  discount: string;
  total: string;
  amountTendered: string | null;
  changeGiven: string | null;
  paymentMethod: 'Cash' | 'Card';
  cashierId: string;
  cashierName: string;
  customerName: string | null;
  customerPhone: string | null;
  vehicleNo: string | null;
  itemCount: number;
  voidedAt: Date | null;
  voidReason: string | null;
}

export interface PaginatedSalesResult {
  items: SaleListItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export interface SalesSummaryTotals {
  salesCount: number;
  completedSalesCount: number;
  voidedSalesCount: number;
  totalRevenue: string; // Excludes voided
  cashRevenue: string; // Excludes voided
  cashCount: number;
  cardRevenue: string; // Excludes voided
  cardCount: number;
}

export interface SaleDetailItem {
  id: number;
  productId: number;
  productName: string;
  partNumber: string;
  quantity: number;
  unitPrice: string;
  unitCost?: string | null; // Omitted for cashiers
  lineTotal: string;
}

export interface SaleDetail {
  id: number;
  receiptNumber: string;
  createdAt: Date;
  status: 'completed' | 'voided';
  subtotal: string;
  discount: string;
  total: string;
  amountTendered: string | null;
  changeGiven: string | null;
  paymentMethod: 'Cash' | 'Card';
  cashierId: string;
  cashierName: string;
  customerName: string | null;
  customerPhone: string | null;
  vehicleNo: string | null;
  voidedAt: Date | null;
  voidedById: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  items: SaleDetailItem[];
}

/**
 * Builds SQL where conditions respecting cashier vs owner role boundaries.
 */
function buildSalesWhereConditions(
  params: SalesFilterParams,
  currentUser: { id: string; role?: string | null },
) {
  const isOwner = currentUser.role === 'owner';
  const conditions = [];

  // 1. Role enforcement: Cashiers can only ever see their own sales from TODAY
  if (!isOwner) {
    conditions.push(eq(sales.cashierId, currentUser.id));
    const todayStr = getColomboDateString(new Date());
    const { startUtc, endUtc } = getColomboDateRange(todayStr, todayStr);
    conditions.push(gte(sales.createdAt, startUtc));
    conditions.push(lte(sales.createdAt, endUtc));
  } else {
    // Owner date range (defaults to today if empty)
    const { startUtc, endUtc } = getColomboDateRange(params.startDate, params.endDate);
    conditions.push(gte(sales.createdAt, startUtc));
    conditions.push(lte(sales.createdAt, endUtc));

    // Owner can filter by cashier
    if (params.cashierId && params.cashierId !== 'all') {
      conditions.push(eq(sales.cashierId, params.cashierId));
    }
  }

  // 2. Status filter
  if (params.status && params.status !== 'all') {
    conditions.push(eq(sales.status, params.status));
  }

  // 3. Payment method filter
  if (params.paymentMethod === 'cash') {
    conditions.push(sql`${sales.amountTendered} IS NOT NULL`);
  } else if (params.paymentMethod === 'card') {
    conditions.push(sql`${sales.amountTendered} IS NULL`);
  }

  // 4. Search by receipt no, customer name or phone, vehicle no
  if (params.search && params.search.trim().length > 0) {
    const term = `%${params.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(${sales.receiptNumber} LIKE ${term} OR ${sales.customerName} LIKE ${term} OR ${sales.customerPhone} LIKE ${term} OR ${sales.vehicleNo} LIKE ${term})`,
    );
  }

  return conditions;
}

/**
 * Fetches server-paginated sales list with filters and role boundaries.
 */
export async function getPaginatedSales(
  params: SalesFilterParams,
  currentUser: { id: string; role?: string | null },
): Promise<PaginatedSalesResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 15));
  const offset = (page - 1) * pageSize;

  const conditions = buildSalesWhereConditions(params, currentUser);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count
  const countRes = await db
    .select({ total: count() })
    .from(sales)
    .where(whereClause);
  const totalCount = Number(countRes[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Query page of sales joined with cashier user
  const rows = await db
    .select({
      id: sales.id,
      receiptNumber: sales.receiptNumber,
      createdAt: sales.createdAt,
      status: sales.status,
      subtotal: sales.subtotal,
      discount: sales.discount,
      total: sales.total,
      amountTendered: sales.amountTendered,
      changeGiven: sales.changeGiven,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      vehicleNo: sales.vehicleNo,
      voidedAt: sales.voidedAt,
      voidReason: sales.voidReason,
      cashierId: sales.cashierId,
      cashierName: user.name,
    })
    .from(sales)
    .leftJoin(user, eq(sales.cashierId, user.id))
    .where(whereClause)
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(pageSize)
    .offset(offset);

  if (rows.length === 0) {
    return {
      items: [],
      totalCount,
      totalPages,
      currentPage: page,
      pageSize,
    };
  }

  const saleIds = rows.map((r) => r.id);

  // Batch query item counts for the returned sales
  const itemCounts = await db
    .select({
      saleId: saleItems.saleId,
      totalItems: count(saleItems.id),
    })
    .from(saleItems)
    .where(inArray(saleItems.saleId, saleIds))
    .groupBy(saleItems.saleId);

  const countMap = new Map<number, number>();
  for (const ic of itemCounts) {
    countMap.set(ic.saleId, Number(ic.totalItems));
  }

  const items: SaleListItem[] = rows.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    createdAt: r.createdAt,
    status: r.status as 'completed' | 'voided',
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    amountTendered: r.amountTendered,
    changeGiven: r.changeGiven,
    paymentMethod: r.amountTendered !== null ? 'Cash' : 'Card',
    cashierId: r.cashierId,
    cashierName: r.cashierName || 'Cashier',
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    vehicleNo: r.vehicleNo,
    itemCount: countMap.get(r.id) || 0,
    voidedAt: r.voidedAt,
    voidReason: r.voidReason,
  }));

  return {
    items,
    totalCount,
    totalPages,
    currentPage: page,
    pageSize,
  };
}

/**
 * Computes summary totals for the filtered range:
 * number of sales, total (voided sales excluded), and cash / card split.
 */
export async function getSalesSummaryTotals(
  params: SalesFilterParams,
  currentUser: { id: string; role?: string | null },
): Promise<SalesSummaryTotals> {
  const conditions = buildSalesWhereConditions(params, currentUser);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: sales.id,
      status: sales.status,
      total: sales.total,
      amountTendered: sales.amountTendered,
    })
    .from(sales)
    .where(whereClause);

  let totalRevenueDec = new Decimal(0);
  let cashRevenueDec = new Decimal(0);
  let cardRevenueDec = new Decimal(0);
  let completedCount = 0;
  let voidedCount = 0;
  let cashCount = 0;
  let cardCount = 0;

  for (const row of rows) {
    if (row.status === 'completed') {
      completedCount++;
      const rowTotal = new Decimal(row.total);
      totalRevenueDec = totalRevenueDec.plus(rowTotal);

      if (row.amountTendered !== null) {
        cashCount++;
        cashRevenueDec = cashRevenueDec.plus(rowTotal);
      } else {
        cardCount++;
        cardRevenueDec = cardRevenueDec.plus(rowTotal);
      }
    } else if (row.status === 'voided') {
      voidedCount++;
    }
  }

  return {
    salesCount: rows.length,
    completedSalesCount: completedCount,
    voidedSalesCount: voidedCount,
    totalRevenue: totalRevenueDec.toFixed(2),
    cashRevenue: cashRevenueDec.toFixed(2),
    cashCount,
    cardRevenue: cardRevenueDec.toFixed(2),
    cardCount,
  };
}

/**
 * Loads full sale detail with items and permissions.
 */
export async function getSaleDetail(
  saleId: number,
  currentUser: { id: string; role?: string | null },
): Promise<SaleDetail | null> {
  const isOwner = currentUser.role === 'owner';

  const [saleRow] = await db
    .select({
      id: sales.id,
      receiptNumber: sales.receiptNumber,
      createdAt: sales.createdAt,
      status: sales.status,
      subtotal: sales.subtotal,
      discount: sales.discount,
      total: sales.total,
      amountTendered: sales.amountTendered,
      changeGiven: sales.changeGiven,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      vehicleNo: sales.vehicleNo,
      cashierId: sales.cashierId,
      voidedAt: sales.voidedAt,
      voidedBy: sales.voidedBy,
      voidReason: sales.voidReason,
    })
    .from(sales)
    .where(eq(sales.id, saleId));

  if (!saleRow) return null;

  // Security: Cashiers can ONLY see their own sales
  if (!isOwner && saleRow.cashierId !== currentUser.id) {
    return null;
  }

  // Fetch cashier user name
  const [cashierUser] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, saleRow.cashierId));

  // Fetch voidedBy user name if voided
  let voidedByName: string | null = null;
  if (saleRow.voidedBy) {
    const [voidUser] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, saleRow.voidedBy));
    voidedByName = voidUser?.name || null;
  }

  // Fetch line items
  const itemRows = await db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productName: saleItems.productName,
      partNumber: saleItems.partNumber,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      unitCost: saleItems.unitCost,
      lineTotal: saleItems.lineTotal,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleRow.id))
    .orderBy(asc(saleItems.id));

  const items: SaleDetailItem[] = itemRows.map((it) => ({
    id: it.id,
    productId: it.productId,
    productName: it.productName,
    partNumber: it.partNumber,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    unitCost: isOwner ? it.unitCost : null, // Masked for cashiers
    lineTotal: it.lineTotal,
  }));

  return {
    id: saleRow.id,
    receiptNumber: saleRow.receiptNumber,
    createdAt: saleRow.createdAt,
    status: saleRow.status as 'completed' | 'voided',
    subtotal: saleRow.subtotal,
    discount: saleRow.discount,
    total: saleRow.total,
    amountTendered: saleRow.amountTendered,
    changeGiven: saleRow.changeGiven,
    paymentMethod: saleRow.amountTendered !== null ? 'Cash' : 'Card',
    cashierId: saleRow.cashierId,
    cashierName: cashierUser?.name || 'Cashier',
    customerName: saleRow.customerName,
    customerPhone: saleRow.customerPhone,
    vehicleNo: saleRow.vehicleNo,
    voidedAt: saleRow.voidedAt,
    voidedById: saleRow.voidedBy,
    voidedByName,
    voidReason: saleRow.voidReason,
    items,
  };
}

/**
 * Returns list of staff members for the owner filter dropdown.
 */
export async function getStaffCashiersList(): Promise<Array<{ id: string; name: string }>> {
  const users = await db
    .select({
      id: user.id,
      name: user.name,
    })
    .from(user)
    .orderBy(asc(user.name));

  return users;
}
