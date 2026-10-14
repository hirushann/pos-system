'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatLKR } from '@/src/lib/money';
import type {
  DailySalesReportItem,
  StockValuationReport,
  DeadStockItem,
} from '@/src/data/reports';
import {
  Download,
  Calendar,
  Layers,
  ArchiveX,
  FileSpreadsheet,
  AlertCircle,
  Banknote,
  CreditCard,
} from 'lucide-react';

interface ReportsTabsProps {
  dailySales: DailySalesReportItem[];
  stockValuation: StockValuationReport;
  deadStock: DeadStockItem[];
  startDate?: string;
  endDate?: string;
}

export function ReportsTabs({
  dailySales,
  stockValuation,
  deadStock,
  startDate,
  endDate,
}: ReportsTabsProps) {
  const getExportUrl = (type: string) => {
    const params = new URLSearchParams({ type });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/reports/export?${params.toString()}`;
  };

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Detailed Store Reports & Exports
            </CardTitle>
            <CardDescription className="text-xs">
              Audit-ready tabular reports with instant Excel CSV export in Sri Lankan Rupees (LKR).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily-sales" className="w-full">
          <TabsList className="mb-4 flex flex-wrap h-auto p-1 gap-1">
            <TabsTrigger value="daily-sales" className="flex items-center gap-1.5 text-xs py-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Daily Sales</span>
            </TabsTrigger>
            <TabsTrigger value="stock-valuation" className="flex items-center gap-1.5 text-xs py-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span>Stock Valuation</span>
            </TabsTrigger>
            <TabsTrigger value="dead-stock" className="flex items-center gap-1.5 text-xs py-1.5">
              <ArchiveX className="h-3.5 w-3.5" />
              <span>Dead Stock (90 Days)</span>
              {deadStock.length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px] font-mono">
                  {deadStock.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: DAILY SALES REPORT */}
          <TabsContent value="daily-sales" className="m-0 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-muted/40 p-3 text-xs">
              <div className="text-muted-foreground">
                Showing daily financial aggregates for the selected range. Excludes voided sales.
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-semibold shrink-0">
                <a href={getExportUrl('daily-sales')} download>
                  <Download className="h-3.5 w-3.5" />
                  Export Daily Sales CSV
                </a>
              </Button>
            </div>

            {dailySales.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                <Calendar className="h-8 w-8 text-muted-foreground/50 mb-2" />
                No daily sales found for this date range.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead>Date (Colombo)</TableHead>
                      <TableHead className="text-center">Sales Count</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Card</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {dailySales.map((row) => (
                      <TableRow key={row.saleDate}>
                        <TableCell className="font-mono font-medium">
                          {row.saleDate}
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold">
                          {row.salesCount}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Banknote className="h-3 w-3 text-emerald-600" />
                            {formatLKR(row.cash)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-blue-600" />
                            {formatLKR(row.card)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {formatLKR(row.discount)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                          {formatLKR(row.profit)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-bold text-foreground">
                          {formatLKR(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: STOCK VALUATION REPORT */}
          <TabsContent value="stock-valuation" className="m-0 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Total Valuation: </span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    {formatLKR(stockValuation.totalValuation)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Stock Units: </span>
                  <span className="font-mono font-semibold text-foreground">
                    {stockValuation.totalUnits.toLocaleString()} units
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Active Catalog Parts: </span>
                  <span className="font-mono font-semibold text-foreground">
                    {stockValuation.totalItemsCount}
                  </span>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-semibold shrink-0">
                <a href={getExportUrl('stock-valuation')} download>
                  <Download className="h-3.5 w-3.5" />
                  Export Valuation CSV
                </a>
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Catalog Items</TableHead>
                    <TableHead className="text-right">Units on Hand</TableHead>
                    <TableHead className="text-right">Valuation (Cost Price x Stock)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {stockValuation.categories.map((cat) => (
                    <TableRow key={cat.categoryId}>
                      <TableCell className="font-medium text-foreground">
                        {cat.categoryName}
                      </TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">
                        {cat.itemsCount}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {cat.totalUnits.toLocaleString()} units
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold text-foreground">
                        {formatLKR(cat.valuation)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/60 font-bold">
                    <TableCell>Total Store Inventory</TableCell>
                    <TableCell className="text-center font-mono">
                      {stockValuation.totalItemsCount}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {stockValuation.totalUnits.toLocaleString()} units
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-base text-primary">
                      {formatLKR(stockValuation.totalValuation)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 3: DEAD STOCK REPORT */}
          <TabsContent value="dead-stock" className="m-0 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Active parts with stock on hand (&gt;0) that have had zero non-voided sales in the last 90 calendar days.
                </span>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-semibold shrink-0 bg-background">
                <a href={getExportUrl('dead-stock')} download>
                  <Download className="h-3.5 w-3.5" />
                  Export Dead Stock CSV
                </a>
              </Button>
            </div>

            {deadStock.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-emerald-600 dark:text-emerald-400">
                <ArchiveX className="h-8 w-8 text-emerald-500/50 mb-2" />
                Outstanding inventory turnover! No dead stock detected in the last 90 days.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-[460px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background shadow-xs z-10">
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead>Part Number / SKU</TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead>Category / Brand</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Selling Price</TableHead>
                      <TableHead className="text-right">Tied-Up Capital</TableHead>
                      <TableHead className="text-center">Last Sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {deadStock.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-mono font-medium">{item.partNumber}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{item.sku}</div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[220px] truncate" title={item.name}>
                          {item.name}
                        </TableCell>
                        <TableCell>
                          <div>{item.categoryName}</div>
                          <div className="text-[11px] text-muted-foreground">{item.brandName || '-'}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          <Badge variant="outline" className="font-mono">
                            {item.stockQty}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {formatLKR(item.costPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-foreground">
                          {formatLKR(item.sellingPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                          {formatLKR(item.tiedUpCapital)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {item.lastSoldAt ? item.lastSoldAt : 'Never / >90d'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
