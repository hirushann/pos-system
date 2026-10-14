import * as React from 'react';
import { formatLKR } from '@/src/lib/money';
import { Receipt, Banknote, CreditCard, TrendingUp, AlertTriangle } from 'lucide-react';
import type { SalesSummaryTotals } from '@/src/data/sales';

interface SalesSummaryCardsProps {
  summary: SalesSummaryTotals;
}

export function SalesSummaryCards({ summary }: SalesSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Sales Count */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Sales
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Receipt className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold tracking-tight">
            {summary.completedSalesCount}
          </span>
          <span className="text-xs text-muted-foreground">completed orders</span>
        </div>
        {summary.voidedSalesCount > 0 && (
          <p className="mt-1 text-[11px] text-destructive flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3 w-3" />
            <span>{summary.voidedSalesCount} voided order{summary.voidedSalesCount === 1 ? '' : 's'}</span>
          </p>
        )}
      </div>

      {/* Net Total Revenue */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Net Revenue
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-extrabold text-foreground tracking-tight tabular-nums">
            {formatLKR(summary.totalRevenue)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Voided transactions excluded
        </p>
      </div>

      {/* Cash Split */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Cash Payments
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Banknote className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-xl font-bold tracking-tight tabular-nums text-foreground">
            {formatLKR(summary.cashRevenue)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {summary.cashCount} cash {summary.cashCount === 1 ? 'sale' : 'sales'}
        </p>
      </div>

      {/* Card Split */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Card Payments
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <CreditCard className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-xl font-bold tracking-tight tabular-nums text-foreground">
            {formatLKR(summary.cardRevenue)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {summary.cardCount} card {summary.cardCount === 1 ? 'sale' : 'sales'}
        </p>
      </div>
    </div>
  );
}
