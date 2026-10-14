'use client';

import * as React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Receipt,
  PiggyBank,
  Calculator,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardMetricsSummary, MetricWithComparison } from '@/src/data/reports';

interface OverviewCardsProps {
  metrics: DashboardMetricsSummary;
}

interface StatCardProps {
  title: string;
  metric: MetricWithComparison;
  icon: React.ComponentType<{ className?: string }>;
  isCurrency?: boolean;
  lastWeekDayName: string;
  lastWeekDateStr: string;
}

function StatCard({
  title,
  metric,
  icon: Icon,
  lastWeekDayName,
  lastWeekDateStr,
}: StatCardProps) {
  const isPositive = metric.isIncrease;
  const isNeutral = metric.isNeutral;
  const isNegative = !isPositive && !isNeutral;

  return (
    <Card className="shadow-xs transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold tracking-tight font-mono tabular-nums">
          {metric.displayValue}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums text-[11px]',
              isPositive && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              isNegative && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
              isNeutral && 'bg-muted text-muted-foreground',
            )}
          >
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {isNeutral && <Minus className="h-3 w-3" />}
            <span>
              {metric.diffPercentage !== null
                ? `${metric.diffPercentage >= 0 ? '+' : ''}${metric.diffPercentage}%`
                : 'N/A'}
            </span>
          </span>

          <span className="text-muted-foreground truncate" title={`vs ${lastWeekDayName} (${lastWeekDateStr}): ${metric.lastWeekDisplayValue}`}>
            vs last {lastWeekDayName} ({metric.lastWeekDisplayValue})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewCards({ metrics }: OverviewCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Today's Revenue"
        metric={metrics.revenue}
        icon={DollarSign}
        isCurrency={true}
        lastWeekDayName={metrics.lastWeekDayName}
        lastWeekDateStr={metrics.lastWeekDateStr}
      />
      <StatCard
        title="Today's Gross Profit"
        metric={metrics.grossProfit}
        icon={PiggyBank}
        isCurrency={true}
        lastWeekDayName={metrics.lastWeekDayName}
        lastWeekDateStr={metrics.lastWeekDateStr}
      />
      <StatCard
        title="Completed Sales"
        metric={metrics.salesCount}
        icon={Receipt}
        isCurrency={false}
        lastWeekDayName={metrics.lastWeekDayName}
        lastWeekDateStr={metrics.lastWeekDateStr}
      />
      <StatCard
        title="Average Sale Value"
        metric={metrics.averageSale}
        icon={Calculator}
        isCurrency={true}
        lastWeekDayName={metrics.lastWeekDayName}
        lastWeekDateStr={metrics.lastWeekDateStr}
      />
    </div>
  );
}
