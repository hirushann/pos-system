import type { Metadata } from 'next';
import { requireOwner } from '@/src/lib/auth-guards';
import { getColomboDateString } from '@/src/lib/dates';
import {
  getDashboardSummaryMetrics,
  getLast30DaysRevenue,
  getTopParts,
  getLowStockCount,
  getSalesByCashier,
  getDailySalesReport,
  getStockValuationReport,
  getDeadStockReport,
} from '@/src/data/reports';
import { OverviewCards } from '@/components/reports/overview-cards';
import { RevenueChart } from '@/components/reports/revenue-chart';
import { TopPartsTable } from '@/components/reports/top-parts-table';
import { CashierSalesTable } from '@/components/reports/cashier-sales-table';
import { ReportsTabs } from '@/components/reports/reports-tabs';
import { ReportsHeader } from '@/components/reports/reports-header';

export const metadata: Metadata = {
  title: 'Reports & Analytics | Jayaweera Logistic & Motors',
};

interface ReportsPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    range?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  // 1. Strict Owner Authentication Guard (Cashiers redirected to /checkout)
  await requireOwner();

  const params = await searchParams;
  const todayStr = getColomboDateString(new Date());

  // Default date range for filtered sections: Last 30 days
  let startDate = params.startDate;
  let endDate = params.endDate;

  if (!startDate || !endDate) {
    const [y, m, d] = todayStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 29);
    startDate = dt.toISOString().slice(0, 10);
    endDate = todayStr;
  }

  // 2. Fetch all reports and metrics concurrently using SQL aggregations
  const [
    summaryMetrics,
    revenueChartData,
    topParts,
    lowStockCount,
    cashierSales,
    dailySales,
    stockValuation,
    deadStock,
  ] = await Promise.all([
    getDashboardSummaryMetrics(),
    getLast30DaysRevenue(),
    getTopParts(startDate, endDate),
    getLowStockCount(),
    getSalesByCashier(startDate, endDate),
    getDailySalesReport(startDate, endDate),
    getStockValuationReport(),
    getDeadStockReport(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header, Low-Stock Notification, and Date Range Filter */}
      <ReportsHeader
        lowStockCount={lowStockCount}
        currentStartDate={startDate}
        currentEndDate={endDate}
      />

      {/* 1. Today's Key Metrics Compared with Same Weekday Last Week */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Today at a Glance
        </h2>
        <OverviewCards metrics={summaryMetrics} />
      </section>

      {/* 2. 30-Day Revenue Trend Bar Chart (shadcn charts) */}
      <section>
        <RevenueChart data={revenueChartData} />
      </section>

      {/* 3. Range-Specific Analytics: Top Parts & Cashier Sales */}
      <section className="grid gap-6 lg:grid-cols-2">
        <TopPartsTable
          byQuantity={topParts.byQuantity}
          byRevenue={topParts.byRevenue}
        />
        <CashierSalesTable cashiers={cashierSales} />
      </section>

      {/* 4. Tabular Reports with Excel CSV Exports */}
      <section>
        <ReportsTabs
          dailySales={dailySales}
          stockValuation={stockValuation}
          deadStock={deadStock}
          startDate={startDate}
          endDate={endDate}
        />
      </section>
    </div>
  );
}
