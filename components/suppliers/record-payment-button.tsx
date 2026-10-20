'use client';

import * as React from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatAmount } from '@/src/lib/money';
import type { InvoiceRow } from '@/src/data/suppliers';
import { InvoiceStatusBadge } from './status-badges';
import { PaymentFormDialog } from './payment-form-dialog';

/** Record a payment for a supplier: pick which unpaid invoice it is for, then fill in the payment. */
export function RecordPaymentButton({ invoices }: { invoices: InvoiceRow[] }) {
  const open_ = invoices.filter((i) => i.status !== 'paid');
  const [picking, setPicking] = React.useState(false);
  const [selected, setSelected] = React.useState<InvoiceRow | null>(null);

  const start = () => {
    if (open_.length === 1) setSelected(open_[0]);
    else setPicking(true);
  };

  return (
    <>
      <Button className="gap-1.5" variant="secondary" onClick={start} disabled={open_.length === 0}>
        <Wallet className="h-4 w-4" /> Record payment
      </Button>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Which invoice are you paying?</DialogTitle>
            <DialogDescription>Choose an unpaid invoice. Oldest first.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {[...open_]
              .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    setSelected(i);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent',
                  )}
                >
                  <div>
                    <p className="font-mono font-semibold">{i.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.invoiceDate}
                      {i.dueDate ? ` · due ${i.dueDate}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold">Rs. {formatAmount(i.balance)}</p>
                    <InvoiceStatusBadge status={i.status} overdue={i.overdue} daysOverdue={i.daysOverdue} />
                  </div>
                </button>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && (
        <PaymentFormDialog
          open
          onOpenChange={(v) => !v && setSelected(null)}
          invoiceId={selected.id}
          invoiceNumber={selected.invoiceNumber}
          supplierName={selected.supplierName}
          balance={selected.balance}
        />
      )}
    </>
  );
}
