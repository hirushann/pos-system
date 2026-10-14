import type { Metadata } from 'next';
import { requireUser } from '@/src/lib/auth-guards';
import {
  getPaginatedSales,
  getSalesSummaryTotals,
  getStaffCashiersList,
  type SalesFilterParams,
} from '@/src/data/sales';
import { getColomboDateString } from '@/src/lib/dates';
import { SalesSummaryCards } from '@/components/sales/sales-summary-cards';
import { SalesFilters } from '@/components/sales/sales-filters';
import { SalesTable } from '@/components/sales/sales-table';

export const metadata: Metadata = {
  title: 'Sales & Receipts | AutoParts POS',
  description: 'View sales transaction records, receipts, and order histories.',
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    startDate?: string;
    endDate?: string;
    cashierId?: string;
    paymentMethod?: 'all' | 'cash' | 'card';
    status?: 'all' | 'completed' | 'voided';
    search?: string;
  }>;
}) {
  const { user } = await requireUser();
  const isOwner = user.role === 'owner';

  const resolvedParams = await searchParams;
  const defaultDate = getColomboDateString(new Date());

  const filterParams: SalesFilterParams = {
    page: resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1,
    pageSize: 15,
    startDate: resolvedParams.startDate || defaultDate,
    endDate: resolvedParams.endDate || defaultDate,
    cashierId: resolvedParams.cashierId || null,
    paymentMethod: resolvedParams.paymentMethod || 'all',
    status: resolvedParams.status || 'all',
    search: resolvedParams.search || null,
  };

  // Fetch summary totals and paginated sales concurrently
  const [paginated, summaryTotals, cashiersList] = await Promise.all([
    getPaginatedSales(filterParams, user),
    getSalesSummaryTotals(filterParams, user),
    isOwner ? getStaffCashiersList() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Sales & Receipts</h1>
        <p className="text-sm text-muted-foreground">
          View sales transaction history, reprint customer receipts, and review register totals.
        </p>
      </div>

      {/* Totals for the filtered range */}
      <SalesSummaryCards summary={summaryTotals} />

      {/* Filter Bar */}
      <SalesFilters
        isOwner={isOwner}
        cashiers={cashiersList}
        defaultDate={defaultDate}
      />

      {/* Paginated Transactions Table */}
      <SalesTable
        sales={paginated.items}
        totalCount={paginated.totalCount}
        totalPages={paginated.totalPages}
        currentPage={paginated.currentPage}
        pageSize={paginated.pageSize}
      />
    </div>
  );
}
