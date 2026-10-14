'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { DailyRevenueChartPoint } from '@/src/data/reports';

interface RevenueChartProps {
  data: DailyRevenueChartPoint[];
}

const chartConfig = {
  revenue: {
    label: 'Daily Revenue',
    color: 'var(--color-primary, #2563eb)',
  },
} satisfies ChartConfig;

export function RevenueChart({ data }: RevenueChartProps) {
  // Compute total 30-day revenue and average daily revenue
  const totalRevenueNum = React.useMemo(() => {
    return data.reduce((acc, curr) => acc + curr.revenue, 0);
  }, [data]);

  const activeSalesDays = React.useMemo(() => {
    return data.filter((d) => d.salesCount > 0).length;
  }, [data]);

  const formattedTotal = React.useMemo(() => {
    const intPart = Math.floor(totalRevenueNum).toLocaleString('en-US');
    const decPart = totalRevenueNum.toFixed(2).split('.')[1] || '00';
    return `Rs. ${intPart}.${decPart}`;
  }, [totalRevenueNum]);

  return (
    <Card className="shadow-xs">
      <CardHeader className="flex flex-col gap-1 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">30-Day Revenue Trend</CardTitle>
          <CardDescription className="text-xs">
            Daily non-voided sales revenue in Asia/Colombo calendar days.
          </CardDescription>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">30-Day Total:</span>
          <span className="text-lg font-bold font-mono tabular-nums text-foreground">
            {formattedTotal}
          </span>
          <span className="text-xs text-muted-foreground">
            ({activeSalesDays} active {activeSalesDays === 1 ? 'day' : 'days'})
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/50" />
            <XAxis
              dataKey="dayLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={2}
              className="text-[11px] fill-muted-foreground font-mono"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-[11px] fill-muted-foreground font-mono"
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                return `${value}`;
              }}
            />
            <ChartTooltip
              cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(value, name, item) => (
                    <div className="flex flex-col gap-1 py-0.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">Date:</span>
                        <span className="font-mono text-xs font-semibold">{item.payload.date}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">Revenue:</span>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {item.payload.revenueDisplay}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">Orders:</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.payload.salesCount} {item.payload.salesCount === 1 ? 'sale' : 'sales'}
                        </span>
                      </div>
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="revenue"
              fill="var(--color-primary, #2563eb)"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
