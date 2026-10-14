'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Calendar,
  X,
  Clock,
} from 'lucide-react';
import { getColomboDateString } from '@/src/lib/dates';

interface SalesFiltersProps {
  isOwner: boolean;
  cashiers: Array<{ id: string; name: string }>;
  defaultDate: string;
}

export function SalesFilters({ isOwner, cashiers, defaultDate }: SalesFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current filters from URL
  const currentSearch = searchParams.get('search') || '';
  const currentStartDate = searchParams.get('startDate') || defaultDate;
  const currentEndDate = searchParams.get('endDate') || defaultDate;
  const currentCashierId = searchParams.get('cashierId') || 'all';
  const currentPaymentMethod = searchParams.get('paymentMethod') || 'all';
  const currentStatus = searchParams.get('status') || 'all';

  const [searchValue, setSearchValue] = React.useState(currentSearch);
  const [prevSearch, setPrevSearch] = React.useState(currentSearch);

  // Sync search input if URL search changes externally (e.g. clear/reset)
  if (prevSearch !== currentSearch) {
    setPrevSearch(currentSearch);
    setSearchValue(currentSearch);
  }

  // Push new params to URL
  const updateParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      // Reset to page 1 on filter changes
      params.delete('page');

      for (const [key, val] of Object.entries(updates)) {
        if (val === null || val === '' || val === 'all') {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      }

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Debounced search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== currentSearch) {
        updateParams({ search: searchValue.trim() || null });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchValue, currentSearch, updateParams]);

  // Date range presets
  const handleDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days') => {
    const today = new Date();
    const todayStr = getColomboDateString(today);

    if (preset === 'today') {
      updateParams({ startDate: todayStr, endDate: todayStr });
    } else if (preset === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yestStr = getColomboDateString(yesterday);
      updateParams({ startDate: yestStr, endDate: yestStr });
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      const pastStr = getColomboDateString(past);
      updateParams({ startDate: pastStr, endDate: todayStr });
    } else if (preset === '30days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 29);
      const pastStr = getColomboDateString(past);
      updateParams({ startDate: pastStr, endDate: todayStr });
    }
  };

  const hasActiveFilters =
    currentSearch !== '' ||
    currentStartDate !== defaultDate ||
    currentEndDate !== defaultDate ||
    currentCashierId !== 'all' ||
    currentPaymentMethod !== 'all' ||
    currentStatus !== 'all';

  const handleResetFilters = () => {
    setSearchValue('');
    router.push(pathname);
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4 shadow-2xs">
      {/* Search and Primary Status Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search receipt #, customer name, phone, or vehicle no..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 pr-8 h-9 text-xs font-mono bg-background"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => {
                setSearchValue('');
                updateParams({ search: null });
              }}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status Select */}
        <div className="w-full sm:w-[160px]">
          <Select
            value={currentStatus}
            onValueChange={(val) => updateParams({ status: val })}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed Only</SelectItem>
              <SelectItem value="voided">Voided Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Payment Method Select */}
        <div className="w-full sm:w-[160px]">
          <Select
            value={currentPaymentMethod}
            onValueChange={(val) => updateParams({ paymentMethod: val })}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue placeholder="All Payment Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash Only</SelectItem>
              <SelectItem value="card">Card Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cashier Select (Owners only) */}
        {isOwner && (
          <div className="w-full sm:w-[170px]">
            <Select
              value={currentCashierId}
              onValueChange={(val) => updateParams({ cashierId: val })}
            >
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cashiers</SelectItem>
                {cashiers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Date Range Row */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1 border-t border-border/60">
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mr-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>Date Range:</span>
            </span>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={currentStartDate}
                onChange={(e) => {
                  updateParams({ startDate: e.target.value });
                }}
                className="h-8 text-xs font-mono w-[130px] bg-background"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={currentEndDate}
                onChange={(e) => {
                  updateParams({ endDate: e.target.value });
                }}
                className="h-8 text-xs font-mono w-[130px] bg-background"
              />
            </div>

            {/* Quick Date Presets */}
            <div className="flex items-center gap-1 ml-1">
              <Button
                type="button"
                variant={currentStartDate === defaultDate && currentEndDate === defaultDate ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleDatePreset('today')}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleDatePreset('yesterday')}
              >
                Yesterday
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleDatePreset('7days')}
              >
                Last 7 Days
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleDatePreset('30days')}
              >
                Last 30 Days
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Showing your register sales from <strong>Today ({defaultDate})</strong></span>
          </div>
        )}

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="h-7 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2.5 ml-auto"
          >
            <X className="h-3.5 w-3.5" />
            <span>Reset filters</span>
          </Button>
        )}
      </div>
    </div>
  );
}
