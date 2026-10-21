'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatLKR } from '@/src/lib/money';
import type { CashierPerformanceItem } from '@/src/data/reports';
import { Users, Banknote, CreditCard, Landmark } from 'lucide-react';

interface CashierSalesTableProps {
  cashiers: CashierPerformanceItem[];
}

export function CashierSalesTable({ cashiers }: CashierSalesTableProps) {
  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Sales by Cashier</CardTitle>
        <CardDescription className="text-xs">
          Performance, transaction volume, and payment breakdown per cashier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cashiers.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
            No cashier sales recorded for this date range.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">Card</TableHead>
                  <TableHead className="text-right">Cheque</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {cashiers.map((c) => (
                  <TableRow key={c.cashierId}>
                    <TableCell>
                      <div className="font-medium text-foreground">{c.cashierName}</div>
                      <div className="text-[11px] text-muted-foreground">{c.cashierEmail}</div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-semibold">
                      {c.salesCount}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      <div className="inline-flex items-center gap-1">
                        <Banknote className="h-3 w-3 text-emerald-600" />
                        <span>{formatLKR(c.cashRevenue)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      <div className="inline-flex items-center gap-1">
                        <CreditCard className="h-3 w-3 text-blue-600" />
                        <span>{formatLKR(c.cardRevenue)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      <div className="inline-flex items-center gap-1">
                        <Landmark className="h-3 w-3 text-sky-600" />
                        <span>{formatLKR(c.chequeRevenue)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                      {formatLKR(c.grossProfit)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-bold text-foreground">
                      {formatLKR(c.totalRevenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
