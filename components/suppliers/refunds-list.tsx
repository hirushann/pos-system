'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSupplierRefund } from '@/src/actions/suppliers';
import { formatAmount } from '@/src/lib/money';
import { PAYMENT_METHOD_LABELS } from '@/src/lib/supplier-payables';
import type { RefundRow } from '@/src/data/suppliers';
import { ConfirmDialog } from './confirm-dialog';

export function RefundsList({ refunds }: { refunds: RefundRow[] }) {
  const router = useRouter();
  const [toDelete, setToDelete] = React.useState<RefundRow | null>(null);
  if (refunds.length === 0) return null;

  return (
    <>
      <ul className="divide-y rounded-lg border text-sm">
        {refunds.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div>
              <p className="font-medium">
                {r.refundDate} · {PAYMENT_METHOD_LABELS[r.method]}
              </p>
              {(r.reference || r.notes) && <p className="text-xs text-muted-foreground">{r.reference || r.notes}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                + Rs. {formatAmount(r.amount)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setToDelete(r)}
                aria-label="Delete refund"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this refund?"
        description="The amount goes back to being credit the supplier owes you. Use this only to correct a mistake."
        confirmLabel="Delete refund"
        onConfirm={async () => {
          if (!toDelete) return null;
          const res = await deleteSupplierRefund(toDelete.id);
          if (!res.success) return res.error ?? 'Could not delete the refund.';
          toast.success('Refund deleted.');
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
