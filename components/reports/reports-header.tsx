'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Calendar as CalendarIcon, ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getColomboDateString } from '@/src/lib/dates';

interface ReportsHeaderProps {
  lowStockCount: number;
  currentStartDate: string;
  currentEndDate: string;
}

export function ReportsHeader({
  lowStockCount,
  currentStartDate,
  currentEndDate,
}: ReportsHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [startDate, setStartDate] = React.useState(currentStartDate);
  const [endDate, setEndDate] = React.useState(currentEndDate);

  const todayStr = getColomboDateString(new Date());

  const handleApplyPreset = (preset: 'today' | '7d' | '30d' | 'this_month') => {
    const [y, m, d] = todayStr.split('-').map(Number);
    let start = todayStr;
    const end = todayStr;

    if (preset === 'today') {
      start = todayStr;
    } else if (preset === '7d') {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 6);
      start = dt.toISOString().slice(0, 10);
    } else if (preset === '30d') {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 29);
      start = dt.toISOString().slice(0, 10);
    } else if (preset === 'this_month') {
      start = `${y}-${m.toString().padStart(2, '0')}-01`;
    }

    setStartDate(start);
    setEndDate(end);

    const params = new URLSearchParams(searchParams.toString());
    params.set('startDate', start);
    params.set('endDate', end);
    params.set('range', preset);
    router.push(`/reports?${params.toString()}`);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    params.delete('range');
    router.push(`/reports?${params.toString()}`);
  };

  const isToday = currentStartDate === todayStr && currentEndDate === todayStr;

  return (
    <div className="space-y-4">
      {/* Top Banner & Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl text-foreground">
            Store Reports & Analytics
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Clock className="h-3.5 w-3.5" />
            <span>Time Zone: Asia/Colombo (UTC+05:30) • Non-voided sales only</span>
          </p>
        </div>

        {/* Low Stock count banner */}
        {lowStockCount > 0 && (
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong className="font-semibold">{lowStockCount}</strong>{' '}
              {lowStockCount === 1 ? 'part requires' : 'parts require'} reordering
            </span>
            <ArrowRight className="h-3.5 w-3.5 ml-1 text-amber-600 dark:text-amber-400" />
          </Link>
        )}
      </div>

      {/* Date Range Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" /> Range:
          </span>
          <Button
            size="sm"
            variant={isToday ? 'default' : 'outline'}
            className="h-7 text-xs px-2.5"
            onClick={() => handleApplyPreset('today')}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={() => handleApplyPreset('7d')}
          >
            Last 7 Days
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={() => handleApplyPreset('30d')}
          >
            Last 30 Days
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={() => handleApplyPreset('this_month')}
          >
            This Month
          </Button>
        </div>

        {/* Custom date range form */}
        <form onSubmit={handleApplyCustom} className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <label htmlFor="startDate" className="text-muted-foreground text-[11px] uppercase font-semibold">
              From
            </label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-7 w-32 text-xs px-2 font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="endDate" className="text-muted-foreground text-[11px] uppercase font-semibold">
              To
            </label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-7 w-32 text-xs px-2 font-mono"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs px-3 font-semibold">
            Apply
          </Button>
        </form>
      </div>
    </div>
  );
}
