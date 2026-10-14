import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { getColomboDateString, getColomboDayRange } from '@/src/lib/dates';
import Decimal from 'decimal.js';

export interface MetricWithComparison {
  value: string; // Formatted or raw string
  displayValue: string; // Formatted with currency or count
  rawNumber: number;
  lastWeekValue: string;
  lastWeekDisplayValue: string;
  diffAmount: string; // positive or negative
  diffPercentage: number | null; // null if last week was 0 and today is 0
  isIncrease: boolean;
  isNeutral: boolean;
}

export interface DashboardMetricsSummary {
  todayDateStr: string;
  lastWeekDateStr: string;
  lastWeekDayName: string;
  salesCount: MetricWithComparison;
  revenue: MetricWithComparison;
  grossProfit: MetricWithComparison;
  averageSale: MetricWithComparison;
}

export interface DailyRevenueChartPoint {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g., "06 Oct"
  revenue: number; // for recharts rendering
  revenueDisplay: string; // e.g. "Rs. 64,022.00"
  salesCount: number;
}

export interface TopPartItem {
  productId: number;
  sku: string;
  partNumber: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: string; // e.g. "29600.00"
}

export interface CashierPerformanceItem {
  cashierId: string;
  cashierName: string;
  cashierEmail: string;
  salesCount: number;
  totalRevenue: string;
  cashRevenue: string;
  cardRevenue: string;
  grossProfit: string;
}

export interface DailySalesReportItem {
  saleDate: string;
  salesCount: number;
  revenue: string;
  discount: string;
  profit: string;
  cash: string;
  card: string;
}

export interface StockValuationCategoryItem {
  categoryId: number;
  categoryName: string;
  itemsCount: number;
  totalUnits: number;
  valuation: string;
}

export interface StockValuationReport {
  categories: StockValuationCategoryItem[];
  totalItemsCount: number;
  totalUnits: number;
  totalValuation: string;
}

export interface DeadStockItem {
  id: number;
  sku: string;
  partNumber: string;
  name: string;
  categoryName: string;
  brandName: string | null;
  stockQty: number;
  costPrice: string;
  sellingPrice: string;
  tiedUpCapital: string;
  lastSoldAt: string | null;
}

/**
 * Helper to compute comparison stats between today and last week's same weekday
 */
function computeComparison(
  currentStr: string,
  lastWeekStr: string,
  isCurrency: boolean = false,
): MetricWithComparison {
  const currentDec = new Decimal(currentStr || '0');
  const lastWeekDec = new Decimal(lastWeekStr || '0');
  const diffDec = currentDec.minus(lastWeekDec);

  let diffPercentage: number | null = null;
  if (!lastWeekDec.isZero()) {
    diffPercentage = diffDec
      .dividedBy(lastWeekDec.abs())
      .times(100)
      .toDecimalPlaces(1)
      .toNumber();
  } else if (!currentDec.isZero()) {
    diffPercentage = 100;
  } else {
    diffPercentage = 0;
  }

  const formatVal = (dec: Decimal) => {
    if (!isCurrency) return dec.toString();
    const absStr = dec.abs().toFixed(2);
    const [intP, decP] = absStr.split('.');
    const formatted = intP.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec.isNegative() ? `-Rs. ${formatted}.${decP}` : `Rs. ${formatted}.${decP}`;
  };

  return {
    value: currentDec.toFixed(isCurrency ? 2 : 0),
    displayValue: formatVal(currentDec),
    rawNumber: currentDec.toNumber(),
    lastWeekValue: lastWeekDec.toFixed(isCurrency ? 2 : 0),
    lastWeekDisplayValue: formatVal(lastWeekDec),
    diffAmount: diffDec.toFixed(isCurrency ? 2 : 0),
    diffPercentage,
    isIncrease: diffDec.isPositive() && !diffDec.isZero(),
    isNeutral: diffDec.isZero(),
  };
}

/**
 * 1. Today's Dashboard Metrics:
 * - Number of sales
 * - Revenue
 * - Gross profit: SUM((unit_price - unit_cost) * quantity) - discount
 * - Average sale: Revenue / Count
 * Each compared with the same weekday last week.
 * Voided sales excluded everywhere.
 */
export async function getDashboardSummaryMetrics(): Promise<DashboardMetricsSummary> {
  const todayStr = getColomboDateString(new Date());

  // Calculate same weekday last week (exactly 7 calendar days prior in Colombo)
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 7);
  const lastWeekStr = dt.toISOString().slice(0, 10);

  const todayRange = getColomboDayRange(todayStr);
  const lastWeekRange = getColomboDayRange(lastWeekStr);

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const lastWeekDayName = weekdayNames[new Date(`${lastWeekStr}T12:00:00+05:30`).getDay()];

  // Single query for today and last week aggregates in SQL
  const querySingleDay = async (startUtc: Date, endUtc: Date) => {
    const res = await db.execute<{
      sales_count: string;
      total_revenue: string;
      total_discount: string;
      gross_profit: string;
      average_sale: string;
    }>(sql`
      SELECT
        COUNT(s.id)::int AS sales_count,
        COALESCE(SUM(s.total), 0)::numeric(12,2) AS total_revenue,
        COALESCE(SUM(s.discount), 0)::numeric(12,2) AS total_discount,
        (COALESCE(SUM(items.items_margin), 0) - COALESCE(SUM(s.discount), 0))::numeric(12,2) AS gross_profit,
        CASE
          WHEN COUNT(s.id) > 0 THEN (SUM(s.total) / COUNT(s.id))::numeric(12,2)
          ELSE 0::numeric(12,2)
        END AS average_sale
      FROM sales s
      LEFT JOIN (
        SELECT
          si.sale_id,
          SUM((si.unit_price - si.unit_cost) * si.quantity) AS items_margin
        FROM sale_items si
        GROUP BY si.sale_id
      ) items ON items.sale_id = s.id
      WHERE s.status != 'voided'
        AND s.created_at >= ${startUtc.toISOString()}::timestamptz
        AND s.created_at <= ${endUtc.toISOString()}::timestamptz;
    `);

    return res.rows[0] ?? {
      sales_count: '0',
      total_revenue: '0.00',
      total_discount: '0.00',
      gross_profit: '0.00',
      average_sale: '0.00',
    };
  };

  const [todayData, lastWeekData] = await Promise.all([
    querySingleDay(todayRange.startUtc, todayRange.endUtc),
    querySingleDay(lastWeekRange.startUtc, lastWeekRange.endUtc),
  ]);

  return {
    todayDateStr: todayStr,
    lastWeekDateStr: lastWeekStr,
    lastWeekDayName,
    salesCount: computeComparison(todayData.sales_count, lastWeekData.sales_count, false),
    revenue: computeComparison(todayData.total_revenue, lastWeekData.total_revenue, true),
    grossProfit: computeComparison(todayData.gross_profit, lastWeekData.gross_profit, true),
    averageSale: computeComparison(todayData.average_sale, lastWeekData.average_sale, true),
  };
}

/**
 * 2. Revenue per day for the last 30 days as a bar chart (shadcn charts)
 * Calendar days in Asia/Colombo. Excludes voided sales.
 */
export async function getLast30DaysRevenue(): Promise<DailyRevenueChartPoint[]> {
  const todayStr = getColomboDateString(new Date());
  const [y, m, d] = todayStr.split('-').map(Number);

  // 30 days window: from (today - 29 days) to today
  const startDateObj = new Date(Date.UTC(y, m - 1, d));
  startDateObj.setUTCDate(startDateObj.getUTCDate() - 29);
  const startDayStr = startDateObj.toISOString().slice(0, 10);

  const startRange = getColomboDayRange(startDayStr);
  const endRange = getColomboDayRange(todayStr);

  const res = await db.execute<{
    day: string;
    revenue: string;
    sales_count: string;
  }>(sql`
    SELECT
      to_char(created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD') AS day,
      COALESCE(SUM(total), 0)::numeric(12,2) AS revenue,
      COUNT(id)::int AS sales_count
    FROM sales
    WHERE status != 'voided'
      AND created_at >= ${startRange.startUtc.toISOString()}::timestamptz
      AND created_at <= ${endRange.endUtc.toISOString()}::timestamptz
    GROUP BY to_char(created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD')
    ORDER BY day ASC;
  `);

  const resultMap = new Map<string, { revenue: string; count: number }>();
  for (const row of res.rows) {
    resultMap.set(row.day, {
      revenue: row.revenue,
      count: Number(row.sales_count),
    });
  }

  // Build continuous 30-day array so days with 0 sales are rendered cleanly
  const chartPoints: DailyRevenueChartPoint[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 30; i++) {
    const cur = new Date(Date.UTC(y, m - 1, d));
    cur.setUTCDate(cur.getUTCDate() - (29 - i));
    const dayStr = cur.toISOString().slice(0, 10);
    const [, curM, curD] = dayStr.split('-').map(Number);
    const dayLabel = `${curD.toString().padStart(2, '0')} ${monthNames[curM - 1]}`;

    const data = resultMap.get(dayStr);
    const revStr = data?.revenue ?? '0.00';
    const revNum = parseFloat(revStr);

    const intPart = Math.floor(revNum).toLocaleString('en-US');
    const decPart = revNum.toFixed(2).split('.')[1] || '00';

    chartPoints.push({
      date: dayStr,
      dayLabel,
      revenue: revNum,
      revenueDisplay: `Rs. ${intPart}.${decPart}`,
      salesCount: data?.count ?? 0,
    });
  }

  return chartPoints;
}

/**
 * 3. Top 10 parts by quantity and by revenue for a chosen date range.
 * Excludes voided sales.
 */
export async function getTopParts(
  startDateStr?: string,
  endDateStr?: string,
): Promise<{
  byQuantity: TopPartItem[];
  byRevenue: TopPartItem[];
}> {
  const startRange = getColomboDayRange(startDateStr || getColomboDateString(new Date()));
  const endRange = getColomboDayRange(endDateStr || startDateStr || getColomboDateString(new Date()));

  const [resQty, resRev] = await Promise.all([
    db.execute<{
      product_id: number;
      sku: string;
      part_number: string;
      product_name: string;
      total_quantity: string;
      total_revenue: string;
    }>(sql`
      SELECT
        p.id AS product_id,
        p.sku AS sku,
        si.part_number AS part_number,
        si.product_name AS product_name,
        SUM(si.quantity)::int AS total_quantity,
        COALESCE(SUM(si.line_total), 0)::numeric(12,2) AS total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ${startRange.startUtc.toISOString()}::timestamptz
        AND s.created_at <= ${endRange.endUtc.toISOString()}::timestamptz
      GROUP BY p.id, p.sku, si.part_number, si.product_name
      ORDER BY total_quantity DESC, total_revenue DESC
      LIMIT 10;
    `),
    db.execute<{
      product_id: number;
      sku: string;
      part_number: string;
      product_name: string;
      total_quantity: string;
      total_revenue: string;
    }>(sql`
      SELECT
        p.id AS product_id,
        p.sku AS sku,
        si.part_number AS part_number,
        si.product_name AS product_name,
        SUM(si.quantity)::int AS total_quantity,
        COALESCE(SUM(si.line_total), 0)::numeric(12,2) AS total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ${startRange.startUtc.toISOString()}::timestamptz
        AND s.created_at <= ${endRange.endUtc.toISOString()}::timestamptz
      GROUP BY p.id, p.sku, si.part_number, si.product_name
      ORDER BY total_revenue DESC, total_quantity DESC
      LIMIT 10;
    `),
  ]);

  return {
    byQuantity: resQty.rows.map((r) => ({
      productId: Number(r.product_id),
      sku: r.sku,
      partNumber: r.part_number,
      productName: r.product_name,
      totalQuantity: Number(r.total_quantity),
      totalRevenue: r.total_revenue,
    })),
    byRevenue: resRev.rows.map((r) => ({
      productId: Number(r.product_id),
      sku: r.sku,
      partNumber: r.part_number,
      productName: r.product_name,
      totalQuantity: Number(r.total_quantity),
      totalRevenue: r.total_revenue,
    })),
  };
}

/**
 * 4. Low stock count: active products with stock_qty <= reorder_level
 */
export async function getLowStockCount(): Promise<number> {
  const res = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE is_active = true AND stock_qty <= reorder_level;
  `);

  return Number(res.rows[0]?.count ?? 0);
}

/**
 * 5. Sales by cashier for the date range
 * Excludes voided sales.
 */
export async function getSalesByCashier(
  startDateStr?: string,
  endDateStr?: string,
): Promise<CashierPerformanceItem[]> {
  const startRange = getColomboDayRange(startDateStr || getColomboDateString(new Date()));
  const endRange = getColomboDayRange(endDateStr || startDateStr || getColomboDateString(new Date()));

  const res = await db.execute<{
    cashier_id: string;
    cashier_name: string | null;
    cashier_email: string | null;
    sales_count: string;
    total_revenue: string;
    cash_revenue: string;
    card_revenue: string;
    gross_profit: string;
  }>(sql`
    SELECT
      s.cashier_id,
      u.name AS cashier_name,
      u.email AS cashier_email,
      COUNT(s.id)::int AS sales_count,
      COALESCE(SUM(s.total), 0)::numeric(12,2) AS total_revenue,
      COALESCE(SUM(CASE WHEN s.amount_tendered IS NOT NULL THEN s.total ELSE 0 END), 0)::numeric(12,2) AS cash_revenue,
      COALESCE(SUM(CASE WHEN s.amount_tendered IS NULL THEN s.total ELSE 0 END), 0)::numeric(12,2) AS card_revenue,
      (COALESCE(SUM(items.items_margin), 0) - COALESCE(SUM(s.discount), 0))::numeric(12,2) AS gross_profit
    FROM sales s
    LEFT JOIN "user" u ON u.id = s.cashier_id
    LEFT JOIN (
      SELECT
        si.sale_id,
        SUM((si.unit_price - si.unit_cost) * si.quantity) AS items_margin
      FROM sale_items si
      GROUP BY si.sale_id
    ) items ON items.sale_id = s.id
    WHERE s.status != 'voided'
      AND s.created_at >= ${startRange.startUtc.toISOString()}::timestamptz
      AND s.created_at <= ${endRange.endUtc.toISOString()}::timestamptz
    GROUP BY s.cashier_id, u.name, u.email
    ORDER BY total_revenue DESC;
  `);

  return res.rows.map((r) => ({
    cashierId: r.cashier_id,
    cashierName: r.cashier_name || 'Unknown Cashier',
    cashierEmail: r.cashier_email || '-',
    salesCount: Number(r.sales_count),
    totalRevenue: r.total_revenue,
    cashRevenue: r.cash_revenue,
    cardRevenue: r.card_revenue,
    grossProfit: r.gross_profit,
  }));
}

/**
 * 6. Daily sales report for a date range:
 * count, revenue, discount, profit, cash, card
 * Grouped by Colombo calendar day. Excludes voided sales.
 */
export async function getDailySalesReport(
  startDateStr?: string,
  endDateStr?: string,
): Promise<DailySalesReportItem[]> {
  const startRange = getColomboDayRange(startDateStr || getColomboDateString(new Date()));
  const endRange = getColomboDayRange(endDateStr || startDateStr || getColomboDateString(new Date()));

  const res = await db.execute<{
    sale_date: string;
    sales_count: string;
    revenue: string;
    discount: string;
    profit: string;
    cash: string;
    card: string;
  }>(sql`
    SELECT
      to_char(s.created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD') AS sale_date,
      COUNT(s.id)::int AS sales_count,
      COALESCE(SUM(s.total), 0)::numeric(12,2) AS revenue,
      COALESCE(SUM(s.discount), 0)::numeric(12,2) AS discount,
      (COALESCE(SUM(items.items_margin), 0) - COALESCE(SUM(s.discount), 0))::numeric(12,2) AS profit,
      COALESCE(SUM(CASE WHEN s.amount_tendered IS NOT NULL THEN s.total ELSE 0 END), 0)::numeric(12,2) AS cash,
      COALESCE(SUM(CASE WHEN s.amount_tendered IS NULL THEN s.total ELSE 0 END), 0)::numeric(12,2) AS card
    FROM sales s
    LEFT JOIN (
      SELECT
        si.sale_id,
        SUM((si.unit_price - si.unit_cost) * si.quantity) AS items_margin
      FROM sale_items si
      GROUP BY si.sale_id
    ) items ON items.sale_id = s.id
    WHERE s.status != 'voided'
      AND s.created_at >= ${startRange.startUtc.toISOString()}::timestamptz
      AND s.created_at <= ${endRange.endUtc.toISOString()}::timestamptz
    GROUP BY to_char(s.created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD')
    ORDER BY sale_date DESC;
  `);

  return res.rows.map((r) => ({
    saleDate: r.sale_date,
    salesCount: Number(r.sales_count),
    revenue: r.revenue,
    discount: r.discount,
    profit: r.profit,
    cash: r.cash,
    card: r.card,
  }));
}

/**
 * 7. Stock valuation:
 * sum of stock_qty * cost_price per category, plus total.
 * Active products only.
 */
export async function getStockValuationReport(): Promise<StockValuationReport> {
  const [catRes, totalRes] = await Promise.all([
    db.execute<{
      category_id: number;
      category_name: string;
      items_count: string;
      total_units: string;
      valuation: string;
    }>(sql`
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        COUNT(p.id)::int AS items_count,
        COALESCE(SUM(p.stock_qty), 0)::int AS total_units,
        COALESCE(SUM(p.stock_qty * p.cost_price), 0)::numeric(12,2) AS valuation
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
      GROUP BY c.id, c.name
      ORDER BY valuation DESC, c.name ASC;
    `),
    db.execute<{
      total_items: string;
      total_units: string;
      total_valuation: string;
    }>(sql`
      SELECT
        COUNT(p.id)::int AS total_items,
        COALESCE(SUM(p.stock_qty), 0)::int AS total_units,
        COALESCE(SUM(p.stock_qty * p.cost_price), 0)::numeric(12,2) AS total_valuation
      FROM products p
      WHERE p.is_active = true;
    `),
  ]);

  const categories = catRes.rows.map((r) => ({
    categoryId: Number(r.category_id),
    categoryName: r.category_name,
    itemsCount: Number(r.items_count),
    totalUnits: Number(r.total_units),
    valuation: r.valuation,
  }));

  const totalRow = totalRes.rows[0];

  return {
    categories,
    totalItemsCount: Number(totalRow?.total_items ?? 0),
    totalUnits: Number(totalRow?.total_units ?? 0),
    totalValuation: totalRow?.total_valuation ?? '0.00',
  };
}

/**
 * 8. Dead stock:
 * Active parts with stock > 0 and no sales in the last 90 days.
 * Excludes voided sales.
 */
export async function getDeadStockReport(): Promise<DeadStockItem[]> {
  const res = await db.execute<{
    id: number;
    sku: string;
    part_number: string;
    name: string;
    category_name: string;
    brand_name: string | null;
    stock_qty: number;
    cost_price: string;
    selling_price: string;
    tied_up_capital: string;
    last_sold_at: string | null;
  }>(sql`
    SELECT
      p.id,
      p.sku,
      p.part_number,
      p.name,
      c.name AS category_name,
      b.name AS brand_name,
      p.stock_qty,
      p.cost_price::numeric(12,2),
      p.price::numeric(12,2) AS selling_price,
      (p.stock_qty * p.cost_price)::numeric(12,2) AS tied_up_capital,
      (
        SELECT to_char(MAX(s.created_at) AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD HH24:MI')
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE si.product_id = p.id AND s.status != 'voided'
      ) AS last_sold_at
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = true
      AND p.stock_qty > 0
      AND NOT EXISTS (
        SELECT 1
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE si.product_id = p.id
          AND s.status != 'voided'
          AND s.created_at >= NOW() - INTERVAL '90 days'
      )
    ORDER BY tied_up_capital DESC, p.name ASC;
  `);

  return res.rows.map((r) => ({
    id: Number(r.id),
    sku: r.sku,
    partNumber: r.part_number,
    name: r.name,
    categoryName: r.category_name,
    brandName: r.brand_name,
    stockQty: Number(r.stock_qty),
    costPrice: r.cost_price,
    sellingPrice: r.selling_price,
    tiedUpCapital: r.tied_up_capital,
    lastSoldAt: r.last_sold_at,
  }));
}
