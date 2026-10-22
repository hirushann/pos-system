'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Banknote, Loader2, Undo2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { applySupplierCredit, recordSupplierRefund } from '@/src/actions/suppliers';
import { getColomboDateString } from '@/src/lib/dates';
import { formatAmount, formatLKR } from '@/src/lib/money';
import type { InvoiceRow } from '@/src/data/suppliers';

interface Props {
  invoice: InvoiceRow;
  /** Other unpaid invoices of the same supplier that credit can be used on. */
  openInvoices: InvoiceRow[];
}

/** Shown when the supplier owes money back: refund it, or use it to pay another invoice. */
export function CreditPanel({ invoice, openInvoices }: Props) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'refund' | 'apply' | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState('');
  const [method, setMethod] = React.useState<'cash' | 'bank_transfer' | 'cheque'>('cash');
  const [target, setTarget] = React.useState('');

  const targets = openInvoices.filter((i) => i.id !== invoice.id);

  React.useEffect(() => {
    if (mode) {
      const t = setTimeout(() => {
        setError(null);
        setAmount(invoice.credit);
        setDate(getColomboDateString(new Date()));
        setMethod('cash');
        setTarget(targets[0] ? String(targets[0].id) : '');
      }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (Number(invoice.credit) <= 0) return null;

  const chosen = targets.find((i) => String(i.id) === target);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'refund'
          ? await recordSupplierRefund({
              invoiceId: invoice.id,
              refundDate: date,
              amount: amount.replace(/,/g, '').trim(),
              method,
              reference: String(f.get('reference') ?? ''),
            })
          : await applySupplierCredit({
              fromInvoiceId: invoice.id,
              toInvoiceId: Number(target),
              date,
              amount: amount.replace(/,/g, '').trim(),
            });
      if (!res.success) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      toast.success(mode === 'refund' ? 'Refund recorded.' : 'Credit applied.');
      setMode(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Supplier owes you
        </p>
        <p className="text-2xl font-bold">{formatLKR(invoice.credit)}</p>
        <p className="text-xs text-muted-foreground">
          Goods were returned after this invoice was paid. Get the money back or use it on another invoice.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="gap-1.5" onClick={() => setMode('refund')}>
          <Banknote className="h-4 w-4" /> Record refund
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => setMode('apply')} disabled={targets.length === 0}>
          <Undo2 className="h-4 w-4" /> Use on another invoice
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(v) => !busy && !v && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'refund' ? 'Record refund received' : 'Use credit on another invoice'}</DialogTitle>
            <DialogDescription>
              Credit available on <span className="font-mono">{invoice.invoiceNumber}</span>: {formatLKR(invoice.credit)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'apply' && (
              <div className="space-y-1.5">
                <Label>Pay this invoice</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose an invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.invoiceNumber} · owes Rs. {formatAmount(i.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cr-amount">Amount (Rs.) *</Label>
                <Input
                  id="cr-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="font-mono"
                  required
                />
                {mode === 'apply' && chosen && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      setAmount(Math.min(Number(invoice.credit), Number(chosen.balance)).toFixed(2))
                    }
                  >
                    Use as much as possible
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr-date">Date *</Label>
                <Input id="cr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>
            {mode === 'refund' && (
              <>
                <div className="space-y-1.5">
                  <Label>How was it paid back?</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cr-ref">Reference</Label>
                  <Input id="cr-ref" name="reference" placeholder="Transfer ref or cheque number" />
                </div>
              </>
            )}
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || (mode === 'apply' && !target)} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'refund' ? 'Record refund' : 'Apply credit'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
