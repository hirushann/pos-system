'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  Eye,
  Printer,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { formatLKR } from '@/src/lib/money';
import { formatColomboTimestamp } from '@/src/lib/dates';
import type { SaleListItem } from '@/src/data/sales';
import { DeleteSaleDialog } from './delete-sale-dialog';

interface SalesTableProps {
  sales: SaleListItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  isOwner?: boolean;
}

export function SalesTable({
  sales,
  totalCount,
  totalPages,
  currentPage,
  pageSize,
  isOwner = false,
}: SalesTableProps) {
  const [saleToDelete, setSaleToDelete] = React.useState<SaleListItem | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="rounded-xl border bg-card shadow-xs overflow-hidden flex flex-col">
      <div className="overflow-x-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[140px] font-semibold text-xs">Receipt No</TableHead>
              <TableHead className="min-w-[150px] font-semibold text-xs">Date / Time</TableHead>
              <TableHead className="font-semibold text-xs">Cashier</TableHead>
              <TableHead className="min-w-[160px] font-semibold text-xs">Customer / Vehicle</TableHead>
              <TableHead className="text-center font-semibold text-xs">Items</TableHead>
              <TableHead className="text-right font-semibold text-xs">Total Amount</TableHead>
              <TableHead className="font-semibold text-xs text-center">Payment</TableHead>
              <TableHead className="font-semibold text-xs text-center">Status</TableHead>
              <TableHead className="text-right font-semibold text-xs pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-40 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Receipt className="h-9 w-9 stroke-[1.4] text-muted-foreground/50" />
                    <p className="text-sm font-medium text-foreground">No sales transactions found</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Try widening the date range, clearing filters, or searching for a different receipt number.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => {
                const isVoided = sale.status === 'voided';

                return (
                  <TableRow
                    key={sale.id}
                    className={`transition-colors hover:bg-muted/30 ${
                      isVoided ? 'bg-destructive/5 opacity-80' : ''
                    }`}
                  >
                    {/* Receipt No */}
                    <TableCell className="font-mono text-xs font-bold">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-primary hover:underline flex items-center gap-1.5"
                      >
                        <span>{sale.receiptNumber}</span>
                      </Link>
                    </TableCell>

                    {/* Colombo Timestamp */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatColomboTimestamp(sale.createdAt, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </TableCell>

                    {/* Cashier */}
                    <TableCell className="text-xs">
                      <span className="font-medium text-foreground">{sale.cashierName}</span>
                    </TableCell>

                    {/* Customer & Vehicle */}
                    <TableCell className="text-xs">
                      {sale.customerName || sale.vehicleNo ? (
                        <div className="space-y-0.5">
                          {sale.customerName && (
                            <div className="flex items-center gap-1 font-medium text-foreground">
                              <span>{sale.customerName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                            {sale.vehicleNo && (
                              <span className="bg-muted px-1.5 py-0.2 rounded font-semibold text-[10px] uppercase text-foreground">
                                {sale.vehicleNo}
                              </span>
                            )}
                            {sale.customerPhone && <span>{sale.customerPhone}</span>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 text-xs">-</span>
                      )}
                    </TableCell>

                    {/* Items count */}
                    <TableCell className="text-center text-xs font-mono tabular-nums">
                      {sale.itemCount} {sale.itemCount === 1 ? 'part' : 'parts'}
                    </TableCell>

                    {/* Total Amount */}
                    <TableCell className="text-right">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          isVoided ? 'line-through text-muted-foreground' : 'text-foreground'
                        }`}
                      >
                        {formatLKR(sale.total)}
                      </span>
                    </TableCell>

                    {/* Payment Method */}
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold gap-1 px-2 py-0.5"
                      >
                        {sale.paymentMethod === 'Cash' ? (
                          <Banknote className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <CreditCard className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                        )}
                        <span>{sale.paymentMethod}</span>
                      </Badge>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="text-center">
                      {isVoided ? (
                        <Badge
                          variant="destructive"
                          className="text-[10px] gap-1 px-2 py-0.5 bg-destructive/15 text-destructive border-destructive/20 hover:bg-destructive/20 font-semibold uppercase"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          <span>Voided</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold uppercase"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Completed</span>
                        </Badge>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                          <Link href={`/sales/${sale.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            <span>Details</span>
                          </Link>
                        </Button>

                        <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2">
                          <Link
                            href={`/sales/${sale.id}/invoice?reprint=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Printer className="h-3.5 w-3.5 mr-1" />
                            <span>Reprint</span>
                          </Link>
                        </Button>

                        {isOwner && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSaleToDelete(sale)}
                            className="h-7 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Delete sale ${sale.receiptNumber}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            <span>Delete</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground bg-muted/20">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} sales
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="h-7 text-xs px-2 gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </Button>

            <span className="font-medium text-foreground px-2">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="h-7 text-xs px-2 gap-1"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {isOwner && saleToDelete && (
        <DeleteSaleDialog
          open
          onOpenChange={(next) => {
            if (!next) setSaleToDelete(null);
          }}
          saleId={saleToDelete.id}
          receiptNumber={saleToDelete.receiptNumber}
          isVoided={saleToDelete.status === 'voided'}
        />
      )}
    </div>
  );
}
