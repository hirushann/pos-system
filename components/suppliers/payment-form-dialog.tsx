'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Banknote, Landmark, Loader2, Receipt } from 'lucide-react';
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
import { recordSupplierPayment } from '@/src/actions/suppliers';
import { getColomboDateString } from '@/src/lib/dates';
import { formatLKR } from '@/src/lib/money';
import { cn } from '@/lib/utils';
import type { ChequeStatus, PaymentMethod } from '@/src/lib/supplier-payables';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: number;
  invoiceNumber: string;
  supplierName: string;
  balance: string;
}

const METHODS: { value: PaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'bank_transfer', label: 'Bank transfer', icon: Landmark },
  { value: 'cheque', label: 'Cheque', icon: Receipt },
];

export function PaymentFormDialog({ open, onOpenChange, invoiceId, invoiceNumber, supplierName, balance }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [method, setMethod] = React.useState<PaymentMethod>('cash');
  const [chequeStatus, setChequeStatus] = React.useState<ChequeStatus>('pending');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState('');

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setError(null);
        setErrors({});
        setMethod('cash');
        setChequeStatus('pending');
        setAmount(balance);
        setDate(getColomboDateString(new Date()));
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open, balance]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      invoiceId,
      paymentDate: date,
      amount: amount.replace(/,/g, '').trim(),
      method,
      reference: String(f.get('reference') ?? ''),
      chequeNumber: String(f.get('chequeNumber') ?? ''),
      chequeBank: String(f.get('chequeBank') ?? ''),
      chequeDate: String(f.get('chequeDate') ?? '') || null,
      chequeStatus,
      notes: String(f.get('notes') ?? ''),
    };
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = await recordSupplierPayment(input);
      if (!res.success) {
        setError(res.error ?? 'Could not record the payment.');
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast.success('Payment recorded.');
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
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {supplierName} · Invoice <span className="font-mono">{invoiceNumber}</span> · Balance{' '}
            <strong className="text-foreground">{formatLKR(balance)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors',
                    method === m.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount (Rs.) *</Label>
              <Input
                id="pay-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="font-mono"
                required
              />
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setAmount(balance)}
              >
                Pay full balance
              </button>
              {field('amount')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Payment date *</Label>
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              {field('paymentDate')}
            </div>
          </div>

          {method === 'bank_transfer' && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Transfer reference</Label>
              <Input id="pay-ref" name="reference" placeholder="Bank reference / slip number" />
            </div>
          )}

          {method === 'cheque' && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-chq-no">Cheque number *</Label>
                  <Input id="pay-chq-no" name="chequeNumber" className="font-mono" />
                  {field('chequeNumber')}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-chq-bank">Bank</Label>
                  <Input id="pay-chq-bank" name="chequeBank" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-chq-date">Cheque date</Label>
                  <Input id="pay-chq-date" name="chequeDate" type="date" />
                  {field('chequeDate')}
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={chequeStatus} onValueChange={(v) => setChequeStatus(v as ChequeStatus)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending (not yet cleared)</SelectItem>
                      <SelectItem value="cleared">Cleared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea id="pay-notes" name="notes" rows={2} />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
