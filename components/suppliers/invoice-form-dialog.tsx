'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createSupplierInvoice, updateSupplierInvoice } from '@/src/actions/suppliers';
import { getColomboDateString } from '@/src/lib/dates';
import { addDays } from '@/src/lib/supplier-payables';

export interface SupplierOption {
  id: number;
  name: string;
  paymentTermsDays: number;
}

export interface EditableInvoice {
  id: number;
  supplierId: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  amount: string;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierOption[];
  /** Pre-selected (and locked) supplier, e.g. when opened from a supplier page. */
  supplierId?: number;
  invoice?: EditableInvoice | null;
}

export function InvoiceFormDialog({ open, onOpenChange, suppliers, supplierId, invoice }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [supplier, setSupplier] = React.useState('');
  const [invoiceDate, setInvoiceDate] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [dueTouched, setDueTouched] = React.useState(false);

  const terms = (id: string) => suppliers.find((s) => String(s.id) === id)?.paymentTermsDays ?? 0;
  const suggestDue = (date: string, id: string) => {
    const days = terms(id);
    return date && days > 0 ? addDays(date, days) : '';
  };

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setError(null);
        setErrors({});
        const id = String(invoice?.supplierId ?? supplierId ?? '');
        const date = invoice?.invoiceDate ?? getColomboDateString(new Date());
        setSupplier(id);
        setInvoiceDate(date);
        setDueDate(invoice ? (invoice.dueDate ?? '') : suggestDue(date, id));
        setDueTouched(!!invoice);
      }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice, supplierId]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      supplierId: Number(supplier),
      invoiceNumber: String(f.get('invoiceNumber') ?? ''),
      invoiceDate,
      dueDate: dueDate || null,
      amount: String(f.get('amount') ?? '').replace(/,/g, ''),
      notes: String(f.get('notes') ?? ''),
    };
    if (!supplier) {
      setErrors({ supplierId: 'Choose a supplier' });
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = invoice ? await updateSupplierInvoice(invoice.id, input) : await createSupplierInvoice(input);
      if (!res.success) {
        setError(res.error ?? 'Could not save the invoice.');
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast.success(invoice ? 'Invoice updated.' : 'Invoice added.');
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  const field = (name: string) =>
    errors[name] ? <p className="text-xs font-medium text-destructive">{errors[name]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{invoice ? 'Edit invoice' : 'Add supplier invoice'}</DialogTitle>
          <DialogDescription>Record a bill you received from a supplier.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <Select
              value={supplier}
              onValueChange={(v) => {
                setSupplier(v);
                if (!dueTouched) setDueDate(suggestDue(invoiceDate, v));
              }}
              disabled={!!supplierId || !!invoice}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field('supplierId')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-number">Invoice number *</Label>
              <Input id="inv-number" name="invoiceNumber" defaultValue={invoice?.invoiceNumber ?? ''} required />
              {field('invoiceNumber')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-amount">Amount (Rs.) *</Label>
              <Input
                id="inv-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={invoice?.amount ?? ''}
                required
                className="font-mono"
              />
              {field('amount')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-date">Invoice date *</Label>
              <Input
                id="inv-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                  if (!dueTouched) setDueDate(suggestDue(e.target.value, supplier));
                }}
                required
              />
              {field('invoiceDate')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setDueTouched(true);
                }}
              />
              {field('dueDate')}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-notes">Notes</Label>
            <Textarea id="inv-notes" name="notes" rows={2} defaultValue={invoice?.notes ?? ''} />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {invoice ? 'Save changes' : 'Add invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
