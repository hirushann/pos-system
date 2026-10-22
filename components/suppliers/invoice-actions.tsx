'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2, Undo2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSupplierInvoice } from '@/src/actions/suppliers';
import type { InvoiceItemRow, InvoiceRow } from '@/src/data/suppliers';
import { ReturnGoodsDialog } from './return-goods-dialog';
import { InvoiceFormDialog } from './invoice-form-dialog';
import { PaymentFormDialog } from './payment-form-dialog';
import { ConfirmDialog } from './confirm-dialog';

export function InvoiceActions({ invoice, items }: { invoice: InvoiceRow; items: InvoiceItemRow[] }) {
  const router = useRouter();
  const [pay, setPay] = React.useState(false);
  const [edit, setEdit] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [ret, setRet] = React.useState(false);
  const canReturn = items.some((i) => i.returnableQty > 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="gap-1.5" onClick={() => setPay(true)} disabled={invoice.status === 'paid'}>
        <Wallet className="h-4 w-4" /> Record payment
      </Button>
      {items.length > 0 && (
        <Button variant="outline" className="gap-1.5" onClick={() => setRet(true)} disabled={!canReturn}>
          <Undo2 className="h-4 w-4" /> Return goods
        </Button>
      )}
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

      <ReturnGoodsDialog
        open={ret}
        onOpenChange={setRet}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        supplierName={invoice.supplierName}
        items={items}
      />
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
        description="Products it received are taken back out of stock. An invoice with payments or returns cannot be deleted: remove those first."
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
