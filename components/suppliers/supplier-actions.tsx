'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSupplier } from '@/src/actions/suppliers';
import type { Supplier } from '@/src/db/schema';
import type { InvoiceRow } from '@/src/data/suppliers';
import { RecordPaymentButton } from './record-payment-button';
import { SupplierFormDialog } from './supplier-form-dialog';
import { InvoiceFormDialog } from './invoice-form-dialog';
import { ConfirmDialog } from './confirm-dialog';

export function SupplierActions({ supplier, invoices }: { supplier: Supplier; invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [invoice, setInvoice] = React.useState(false);
  const [del, setDel] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="gap-1.5" onClick={() => setInvoice(true)} disabled={!supplier.active}>
        <Plus className="h-4 w-4" /> Add invoice
      </Button>
      <RecordPaymentButton invoices={invoices} />
      <Button variant="outline" className="gap-1.5" onClick={() => setEdit(true)}>
        <Pencil className="h-4 w-4" /> Edit
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setDel(true)}
        aria-label="Delete supplier"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <SupplierFormDialog open={edit} onOpenChange={setEdit} supplier={supplier} />
      <InvoiceFormDialog
        open={invoice}
        onOpenChange={setInvoice}
        supplierId={supplier.id}
        suppliers={[{ id: supplier.id, name: supplier.name, paymentTermsDays: supplier.paymentTermsDays }]}
      />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={`Delete ${supplier.name}?`}
        description="Its price list is removed too. A supplier that has invoices cannot be deleted; mark it inactive instead."
        confirmLabel="Delete supplier"
        onConfirm={async () => {
          const res = await deleteSupplier(supplier.id);
          if (!res.success) return res.error ?? 'Could not delete the supplier.';
          toast.success('Supplier deleted.');
          router.replace('/suppliers');
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
