'use client';

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LowStockProductItem } from '@/src/data/inventory';
import { Printer, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatColomboDate } from '@/src/lib/dates';

interface LowStockTableProps {
  items: LowStockProductItem[];
  shopName?: string;
  onAdjustProduct?: (productId: number) => void;
  isOwner: boolean;
}

export function LowStockTable({
  items,
  shopName = 'Jayaweera Logistic & Motors',
  onAdjustProduct,
  isOwner,
}: LowStockTableProps) {
  const handlePrint = () => {
    window.print();
  };

  const todayStr = formatColomboDate(new Date());

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center shadow-2xs">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold">All inventory levels are healthy!</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          There are currently no active spare parts at or below their reorder threshold.
        </p>
      </div>
    );
  }

  const outOfStockCount = items.filter((i) => i.stockQty === 0).length;

  return (
    <div className="space-y-4">
      {/* Print-only Header */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{shopName}</h1>
            <p className="text-sm font-semibold text-gray-700">
              Supplier Reorder Requisition &amp; Low Stock Report
            </p>
          </div>
          <div className="text-right text-xs text-gray-600">
            <p>Date: {todayStr} (Asia/Colombo)</p>
            <p>Total Items to Reorder: {items.length}</p>
          </div>
        </div>
      </div>

      {/* Screen action bar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-2xs print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {items.length} Parts Need Restocking
            </h3>
            <p className="text-xs text-muted-foreground">
              {outOfStockCount > 0
                ? `${outOfStockCount} parts completely out of stock`
                : 'All listed parts are at or below reorder threshold'}
            </p>
          </div>
        </div>

        <Button
          onClick={handlePrint}
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
        >
          <Printer className="h-4 w-4" />
          <span>Print Supplier Reorder Sheet</span>
        </Button>
      </div>

      {/* Low stock table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-2xs print:border-none print:shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 print:bg-gray-100">
              <TableHead className="w-36 font-semibold">Part Number</TableHead>
              <TableHead className="min-w-44 font-semibold">Product Name &amp; SKU</TableHead>
              <TableHead className="w-28 font-semibold">Brand</TableHead>
              <TableHead className="w-28 font-semibold">Bin Location</TableHead>
              <TableHead className="w-24 text-center font-semibold">Current Stock</TableHead>
              <TableHead className="w-24 text-center font-semibold">Reorder Level</TableHead>
              <TableHead className="w-24 text-center font-semibold text-destructive">
                Deficit
              </TableHead>
              {isOwner && (
                <TableHead className="w-24 text-right font-semibold print:hidden">
                  Action
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isOut = item.stockQty === 0;

              return (
                <TableRow
                  key={item.id}
                  className={`print:border-b ${isOut ? 'bg-destructive/5' : ''}`}
                >
                  {/* Part Number */}
                  <TableCell className="align-middle font-mono text-xs font-semibold">
                    {item.partNumber}
                  </TableCell>

                  {/* Name & SKU */}
                  <TableCell className="align-middle">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="text-2xs font-mono text-muted-foreground">
                      SKU: {item.sku} • {item.categoryName}
                    </div>
                  </TableCell>

                  {/* Brand */}
                  <TableCell className="align-middle text-xs">
                    {item.brandName || '-'}
                  </TableCell>

                  {/* Bin Location */}
                  <TableCell className="align-middle font-mono text-xs font-medium">
                    {item.binLocation ? (
                      <span className="rounded bg-accent/60 px-1.5 py-0.5 print:bg-transparent print:p-0">
                        {item.binLocation}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Current Stock */}
                  <TableCell className="align-middle text-center">
                    {isOut ? (
                      <Badge variant="destructive" className="font-semibold px-2 print:border print:text-black">
                        0 {item.unit}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold px-2 print:border print:text-black">
                        {item.stockQty} {item.unit}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Reorder Level */}
                  <TableCell className="align-middle text-center font-mono text-xs">
                    {item.reorderLevel} {item.unit}
                  </TableCell>

                  {/* Deficit / Needed to Reorder */}
                  <TableCell className="align-middle text-center font-mono text-xs font-bold text-destructive print:text-black">
                    +{item.deficit} {item.unit}
                  </TableCell>

                  {/* Action (Owner adjust) */}
                  {isOwner && (
                    <TableCell className="align-middle text-right print:hidden">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAdjustProduct?.(item.id)}
                        className="h-7 text-xs text-primary hover:text-primary"
                      >
                        Adjust
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="hidden print:block mt-8 text-xs text-gray-500 text-center">
        Generated by Jayaweera Logistic & Motors POS • Confidential Purchase Order List
      </div>
    </div>
  );
}
