'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSupplierInvoice } from '@/src/actions/suppliers';
import type { InvoiceRow } from '@/src/data/suppliers';
import { InvoiceFormDialog } from './invoice-form-dialog';
import { PaymentFormDialog } from './payment-form-dialog';
import { ConfirmDialog } from './confirm-dialog';

export function InvoiceActions({ invoice }: { invoice: InvoiceRow }) {
  const router = useRouter();
  const [pay, setPay] = React.useState(false);
  const [edit, setEdit] = React.useState(false);
  const [del, setDel] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="gap-1.5" onClick={() => setPay(true)} disabled={invoice.status === 'paid'}>
        <Wallet className="h-4 w-4" /> Record payment
      </Button>
      <Button variant="outline" className="gap-1.5" onClick={() => setEdit(true)}>
        <Pencil className="h-4 w-4" /> Edit
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setDel(true)}
        aria-label="Delete invoice"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <PaymentFormDialog
        open={pay}
        onOpenChange={setPay}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        supplierName={invoice.supplierName}
        balance={invoice.balance}
      />
      <InvoiceFormDialog
        open={edit}
        onOpenChange={setEdit}
        suppliers={[{ id: invoice.supplierId, name: invoice.supplierName, paymentTermsDays: 0 }]}
        invoice={invoice}
      />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={`Delete invoice ${invoice.invoiceNumber}?`}
        description="An invoice that has payments recorded cannot be deleted. Remove those payments first."
        confirmLabel="Delete invoice"
        onConfirm={async () => {
          const res = await deleteSupplierInvoice(invoice.id);
          if (!res.success) return res.error ?? 'Could not delete the invoice.';
          toast.success('Invoice deleted.');
          router.replace(`/suppliers/${invoice.supplierId}`);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
