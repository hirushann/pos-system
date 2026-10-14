'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatLKR } from '@/src/lib/money';
import { CheckCircle2, Printer, PlusCircle } from 'lucide-react';

interface SaleSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleData: {
    saleId: number;
    receiptNumber: string;
    total: string;
    changeGiven: string | null;
    paymentMethod: 'cash' | 'card';
  } | null;
  onNewSale: () => void;
}

export function SaleSuccessDialog({
  open,
  onOpenChange,
  saleData,
  onNewSale,
}: SaleSuccessDialogProps) {
  const newSaleBtnRef = React.useRef<HTMLButtonElement>(null);

  // Focus New Sale button automatically so Enter starts a new sale immediately
  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        newSaleBtnRef.current?.focus();
      }, 50);
    }
  }, [open]);

  if (!saleData) return null;

  const handlePrint = () => {
    const receiptUrl = `/sales/${saleData.saleId}/receipt`;
    window.open(receiptUrl, '_blank', 'noopener,noreferrer,width=400,height=700');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md text-center p-6"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onNewSale();
          }
        }}
      >
        <DialogHeader>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight">
            Sale Completed!
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Receipt: <strong className="font-mono text-foreground font-semibold">{saleData.receiptNumber}</strong>
          </p>
        </DialogHeader>

        {/* Change Due / Payment Summary */}
        <div className="my-5 rounded-2xl border bg-muted/40 p-5 space-y-3">
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>Payment Method:</span>
            <span className="font-semibold uppercase tracking-wider text-foreground">
              {saleData.paymentMethod}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>Total Paid:</span>
            <span className="font-mono text-base font-bold text-foreground tabular-nums">
              {formatLKR(saleData.total)}
            </span>
          </div>

          <div className="border-t border-border/80 pt-3 flex justify-between items-baseline">
            <span className="text-base font-semibold">Change Due:</span>
            <span className="font-mono text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {saleData.changeGiven ? formatLKR(saleData.changeGiven) : 'Rs. 0.00'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 gap-2 text-sm font-semibold"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" />
            <span>Print Receipt</span>
          </Button>

          <Button
            ref={newSaleBtnRef}
            type="button"
            className="h-12 gap-2 text-sm font-bold bg-primary hover:bg-primary/90"
            onClick={onNewSale}
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Sale (Enter)</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
