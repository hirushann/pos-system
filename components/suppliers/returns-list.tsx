'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSupplierReturn } from '@/src/actions/suppliers';
import { formatAmount } from '@/src/lib/money';
import type { ReturnRow } from '@/src/data/suppliers';
import { ConfirmDialog } from './confirm-dialog';

export function ReturnsList({ returns, showInvoice = true }: { returns: ReturnRow[]; showInvoice?: boolean }) {
  const router = useRouter();
  const [toDelete, setToDelete] = React.useState<ReturnRow | null>(null);

  if (returns.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        <Undo2 className="mb-2 h-7 w-7 text-muted-foreground/50" />
        No returns yet.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {returns.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {r.returnDate}
                  {r.creditNoteNumber && <span className="ml-2 font-mono text-xs text-muted-foreground">CN {r.creditNoteNumber}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {showInvoice && (
                    <>
                      {r.supplierName} ·{' '}
                      <Link href={`/suppliers/invoices/${r.invoiceId}`} className="font-mono text-primary hover:underline">
                        {r.invoiceNumber}
                      </Link>
                      {r.reason ? ' · ' : ''}
                    </>
                  )}
                  {r.reason}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">Rs. {formatAmount(r.total)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setToDelete(r)}
                  aria-label="Delete return"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {r.items.map((i, idx) => (
                <li key={idx}>
                  {i.quantity} × {i.productName} <span className="font-mono">({i.partNumber})</span> at Rs. {formatAmount(i.unitCost)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this return?"
        description="The goods go back into your stock and the credit from this return is removed. Use this only to correct a mistake."
        confirmLabel="Delete return"
        onConfirm={async () => {
          if (!toDelete) return null;
          const res = await deleteSupplierReturn(toDelete.id);
          if (!res.success) return res.error ?? 'Could not delete the return.';
          toast.success('Return deleted.');
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
