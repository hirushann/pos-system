'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Printer,
  ArrowLeft,
  Ban,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  Car,
  Banknote,
  CreditCard,
  Phone,
} from 'lucide-react';
import { formatLKR } from '@/src/lib/money';
import { formatColomboTimestamp } from '@/src/lib/dates';
import { VoidSaleDialog } from './void-sale-dialog';
import { DeleteSaleDialog } from './delete-sale-dialog';
import type { SaleDetail } from '@/src/data/sales';

interface SaleDetailViewProps {
  sale: SaleDetail;
  isOwner: boolean;
}

export function SaleDetailView({ sale, isOwner }: SaleDetailViewProps) {
  const [isVoidDialogOpen, setIsVoidDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const isVoided = sale.status === 'voided';

  const handlePrint = () => {
    const invoiceUrl = `/sales/${sale.id}/invoice?reprint=true`;
    window.open(invoiceUrl, '_blank', 'noopener,noreferrer,width=980,height=900');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link href="/sales">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Sales</span>
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <h1 className="font-mono text-xl sm:text-2xl font-black text-foreground">
              {sale.receiptNumber}
            </h1>
            {isVoided ? (
              <Badge
                variant="destructive"
                className="gap-1 px-2.5 py-0.5 text-xs font-semibold uppercase bg-destructive/15 text-destructive border-destructive/30"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Voided</span>
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="gap-1 px-2.5 py-0.5 text-xs font-semibold uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Completed</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 text-xs font-semibold"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Reprint Invoice</span>
          </Button>

          {isOwner && !isVoided && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setIsVoidDialogOpen(true)}
              className="gap-1.5 text-xs font-semibold"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Void Sale</span>
            </Button>
          )}

          {isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="gap-1.5 border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          )}
        </div>
      </div>

      {/* Void Notice Banner if Voided */}
      {isVoided && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This sale was voided on {formatColomboTimestamp(sale.voidedAt!)}</span>
          </div>
          <div className="text-xs space-y-1 text-foreground/90 pl-6">
            <p>
              <strong className="text-destructive font-medium">Voided by:</strong>{' '}
              {sale.voidedByName || 'Owner'}
            </p>
            <p>
              <strong className="text-destructive font-medium">Reason:</strong>{' '}
              {sale.voidReason || 'No reason provided'}
            </p>
            <p className="text-muted-foreground italic text-[11px] pt-1">
              All sold quantities have been added back to inventory under void stock movements.
            </p>
          </div>
        </div>
      )}

      {/* Meta Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date & Time */}
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>Date & Time (Colombo)</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {formatColomboTimestamp(sale.createdAt)}
          </p>
        </div>

        {/* Cashier */}
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <User className="h-3.5 w-3.5 text-primary" />
            <span>Processed By</span>
          </div>
          <p className="text-sm font-semibold text-foreground">{sale.cashierName}</p>
        </div>

        {/* Customer */}
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <User className="h-3.5 w-3.5 text-primary" />
            <span>Customer Details</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {sale.customerName || 'Walk-in Customer'}
          </p>
          {sale.customerPhone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
              <Phone className="h-3 w-3" />
              <span>{sale.customerPhone}</span>
            </p>
          )}
        </div>

        {/* Vehicle / Payment */}
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            {sale.paymentMethod === 'Cash' ? (
              <Banknote className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CreditCard className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            )}
            <span>Payment Method</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">{sale.paymentMethod}</p>
            {sale.vehicleNo && (
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                <Car className="h-3 w-3 mr-1" />
                <span>{sale.vehicleNo}</span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Sale Items Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-bold">Line Items ({sale.items.length})</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="font-semibold text-xs">Part Number</TableHead>
              <TableHead className="font-semibold text-xs">Product Description</TableHead>
              <TableHead className="text-center font-semibold text-xs">Quantity</TableHead>
              <TableHead className="text-right font-semibold text-xs">Unit Price</TableHead>
              <TableHead className="text-right font-semibold text-xs pr-4">Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs font-bold text-foreground">
                  {item.partNumber}
                </TableCell>
                <TableCell className="text-xs font-medium">{item.productName}</TableCell>
                <TableCell className="text-center font-mono text-xs font-bold tabular-nums">
                  {item.quantity}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatLKR(item.unitPrice)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-bold tabular-nums pr-4 text-foreground">
                  {formatLKR(item.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Totals Breakdown */}
        <div className="border-t bg-muted/20 p-4 flex flex-col items-end space-y-1.5 text-xs">
          <div className="flex justify-between w-64 text-muted-foreground">
            <span>Subtotal:</span>
            <span className="font-mono tabular-nums font-medium">{formatLKR(sale.subtotal)}</span>
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between w-64 text-destructive font-medium">
              <span>Discount Applied:</span>
              <span className="font-mono tabular-nums">-{formatLKR(sale.discount)}</span>
            </div>
          )}
          <div className="flex justify-between w-64 text-base font-bold border-t border-border/80 pt-1.5 text-foreground">
            <span>Total:</span>
            <span
              className={`font-mono tabular-nums font-black ${
                isVoided ? 'line-through text-muted-foreground' : 'text-primary'
              }`}
            >
              {formatLKR(sale.total)}
            </span>
          </div>

          {sale.amountTendered && (
            <div className="flex justify-between w-64 text-muted-foreground pt-1">
              <span>Cash Tendered:</span>
              <span className="font-mono tabular-nums">{formatLKR(sale.amountTendered)}</span>
            </div>
          )}
          {sale.changeGiven && (
            <div className="flex justify-between w-64 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span>Change Given:</span>
              <span className="font-mono tabular-nums">{formatLKR(sale.changeGiven)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Void Dialog Modal */}
      {isOwner && (
        <VoidSaleDialog
          open={isVoidDialogOpen}
          onOpenChange={setIsVoidDialogOpen}
          saleId={sale.id}
          receiptNumber={sale.receiptNumber}
        />
      )}

      {/* Delete Dialog Modal */}
      {isOwner && (
        <DeleteSaleDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          saleId={sale.id}
          receiptNumber={sale.receiptNumber}
          isVoided={isVoided}
          redirectTo="/sales"
        />
      )}
    </div>
  );
}
