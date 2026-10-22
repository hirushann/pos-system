'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Decimal from 'decimal.js';
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
import { createSupplierReturn } from '@/src/actions/suppliers';
import { getColomboDateString } from '@/src/lib/dates';
import { formatAmount } from '@/src/lib/money';
import type { InvoiceItemRow } from '@/src/data/suppliers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: number;
  invoiceNumber: string;
  supplierName: string;
  items: InvoiceItemRow[];
}

/** Choose which delivered products go back to the supplier, and how many. */
export function ReturnGoodsDialog({ open, onOpenChange, invoiceId, invoiceNumber, supplierName, items }: Props) {
  const router = useRouter();
  const returnable = items.filter((i) => i.returnableQty > 0);
  const [qty, setQty] = React.useState<Record<number, string>>({});
  const [date, setDate] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setQty({});
        setError(null);
        setDate(getColomboDateString(new Date()));
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const chosen = returnable
    .map((i) => ({ item: i, quantity: Number(qty[i.id] || 0) }))
    .filter((c) => Number.isInteger(c.quantity) && c.quantity > 0);
  const total = chosen.reduce((acc, c) => acc.plus(new Decimal(c.item.unitCost).times(c.quantity)), new Decimal(0));

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (chosen.length === 0) {
      setError('Enter a quantity for at least one product.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createSupplierReturn({
        invoiceId,
        returnDate: date,
        creditNoteNumber: String(f.get('creditNoteNumber') ?? ''),
        reason: String(f.get('reason') ?? ''),
        items: chosen.map((c) => ({ invoiceItemId: c.item.id, quantity: c.quantity })),
      });
      if (!res.success) {
        setError(res.error ?? 'Could not record the return.');
        return;
      }
      toast.success('Return recorded. The goods were taken out of stock.');
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Return goods to supplier</DialogTitle>
          <DialogDescription>
            {supplierName} · Invoice <span className="font-mono">{invoiceNumber}</span>. The goods leave your stock and
            the invoice is credited at the price you paid.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            {returnable.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.productName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {i.partNumber} · Rs. {formatAmount(i.unitCost)} each · up to {i.returnableQty}
                  </p>
                </div>
                <Input
                  value={qty[i.id] ?? ''}
                  onChange={(e) => setQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={`Quantity of ${i.productName} to return`}
                  className="h-9 w-20 text-center font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setQty((prev) => ({ ...prev, [i.id]: String(i.returnableQty) }))}
                >
                  All
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ret-date">Return date *</Label>
              <Input id="ret-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-cn">Supplier&apos;s credit note no.</Label>
              <Input id="ret-cn" name="creditNoteNumber" placeholder="If they gave one" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ret-reason">Reason</Label>
            <Textarea id="ret-reason" name="reason" rows={2} placeholder="Wrong part, damaged, not selling..." />
          </div>

          <div className="flex justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Credit from this return</span>
            <span className="font-mono font-bold">Rs. {formatAmount(total)}</span>
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || chosen.length === 0} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Return goods
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
