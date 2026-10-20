'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatLKR } from '@/src/lib/money';
import { computeCashPayment } from '@/src/lib/cash-payment';
import Decimal from 'decimal.js';
import { Banknote, CreditCard, Loader2, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: Decimal;
  subtotal: Decimal;
  discountAmount: Decimal;
  itemCount: number;
  onConfirmSale: (payment: {
    method: 'cash' | 'card';
    amountTendered?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  subtotal,
  discountAmount,
  itemCount,
  onConfirmSale,
  isSubmitting,
}: PaymentDialogProps) {
  const [method, setMethod] = React.useState<'cash' | 'card'>('cash');
  const [tenderedStr, setTenderedStr] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const tenderedInputRef = React.useRef<HTMLInputElement>(null);

  // Initialize or reset when dialog opens
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setMethod('cash');
        setTenderedStr(''); // empty on purpose: the cashier types what the customer really handed over
        setValidationError(null);
        tenderedInputRef.current?.focus();
        tenderedInputRef.current?.select();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, total]);

  // Balance to give back (or how much is still missing)
  const paymentState = React.useMemo(() => {
    if (method === 'card') {
      return {
        status: 'ok' as const,
        isValid: true,
        tendered: total,
        changeDue: new Decimal(0),
        shortAmount: new Decimal(0),
      };
    }
    return computeCashPayment(tenderedStr, total);
  }, [method, tenderedStr, total]);

  // Quick tender helpers
  const handleQuickTender = (type: 'exact' | 500 | 1000 | 5000) => {
    if (type === 'exact') {
      setTenderedStr(total.toFixed(2));
      setValidationError(null);
      tenderedInputRef.current?.focus();
      return;
    }

    const step = new Decimal(type);
    let rounded = total.dividedBy(step).ceil().times(step);
    if (rounded.equals(total)) {
      rounded = rounded.plus(step);
    }
    setTenderedStr(rounded.toFixed(2));
    setValidationError(null);
    tenderedInputRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (method === 'cash') {
      if (!paymentState.isValid) {
        setValidationError(
          paymentState.status === 'empty'
            ? 'Enter the cash given by the customer first.'
            : paymentState.status === 'invalid'
              ? 'Enter a valid amount, for example 5000 or 5000.50.'
              : `Amount tendered must be at least ${formatLKR(total)}. Short by ${formatLKR(paymentState.shortAmount)}.`,
        );
        tenderedInputRef.current?.focus();
        return;
      }

      await onConfirmSale({
        method: 'cash',
        amountTendered: paymentState.tendered.toFixed(2),
      });
    } else {
      await onConfirmSale({
        method: 'card',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <span>Checkout & Payment</span>
              <kbd className="hidden sm:inline-block rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                F9
              </kbd>
            </DialogTitle>
            <span className="text-xs text-muted-foreground">
              {itemCount} {itemCount === 1 ? 'part' : 'parts'} in cart
            </span>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Method Selection Tabs */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setMethod('cash');
                setValidationError(null);
                setTimeout(() => tenderedInputRef.current?.focus(), 50);
              }}
              className={`flex items-center justify-center gap-2.5 rounded-lg border p-3 font-semibold text-sm transition-all ${
                method === 'cash'
                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                  : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <Banknote className="h-5 w-5" />
              <span>Cash Payment</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('card');
                setValidationError(null);
              }}
              className={`flex items-center justify-center gap-2.5 rounded-lg border p-3 font-semibold text-sm transition-all ${
                method === 'card'
                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                  : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <CreditCard className="h-5 w-5" />
              <span>Card Payment</span>
            </button>
          </div>

          {/* Amount Due Display */}
          <div className="rounded-xl bg-muted/60 p-4 border space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-mono tabular-nums">{formatLKR(subtotal)}</span>
            </div>
            {!discountAmount.isZero() && (
              <div className="flex justify-between text-xs text-destructive">
                <span>Discount applied:</span>
                <span className="font-mono tabular-nums">-{formatLKR(discountAmount)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border/80 pt-2">
              <span className="font-semibold text-sm">Total Due:</span>
              <span className="font-mono text-2xl font-black text-primary tracking-tight">
                {formatLKR(total)}
              </span>
            </div>
          </div>

          {/* Cash Payment Details */}
          {method === 'cash' ? (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="tendered-input" className="text-xs font-semibold text-muted-foreground">
                  Cash Given by Customer (Rs.)
                </Label>
                <div className="relative">
                  <Input
                    ref={tenderedInputRef}
                    id="tendered-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Enter cash given"
                    value={tenderedStr}
                    onChange={(e) => {
                      setTenderedStr(e.target.value);
                      setValidationError(null);
                    }}
                    className="font-mono text-xl font-bold h-12 pr-16"
                  />
                  <div className="absolute right-3.5 top-3 text-xs font-bold text-muted-foreground select-none">
                    LKR
                  </div>
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-semibold"
                  onClick={() => handleQuickTender('exact')}
                >
                  Exact
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-mono"
                  onClick={() => handleQuickTender(500)}
                >
                  Next 500
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-mono"
                  onClick={() => handleQuickTender(1000)}
                >
                  Next 1,000
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-mono"
                  onClick={() => handleQuickTender(5000)}
                >
                  Next 5,000
                </Button>
              </div>

              {/* Balance / Status Banner */}
              {paymentState.status === 'ok' ? (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-semibold">Balance to give back:</span>
                  </div>
                  <span className="font-mono text-2xl font-black tabular-nums">
                    {formatLKR(paymentState.changeDue)}
                  </span>
                </div>
              ) : paymentState.status === 'empty' ? (
                <div className="rounded-lg bg-muted/50 border border-dashed p-3 flex items-center justify-between text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">Enter the cash given to see the balance</span>
                  </div>
                </div>
              ) : paymentState.status === 'invalid' ? (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">Enter a valid amount, e.g. 5000 or 5000.50</span>
                </div>
              ) : (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-center justify-between text-destructive">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">Not enough cash:</span>
                  </div>
                  <span className="font-mono text-base font-bold tabular-nums">
                    Short by {formatLKR(paymentState.shortAmount)}
                  </span>
                </div>
              )}

              {validationError && (
                <p className="text-xs font-medium text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{validationError}</span>
                </p>
              )}
            </div>
          ) : (
            /* Card Payment View */
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CreditCard className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-base">Process POS Card Terminal</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Insert or swipe customer card on the bank terminal for{' '}
                <strong className="text-foreground">{formatLKR(total)}</strong>. Click Complete Sale once approved.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Back (Esc)
            </Button>
            <Button
              type="submit"
              disabled={!paymentState.isValid || isSubmitting}
              className="gap-2 h-11 px-6 text-base font-bold sm:min-w-[160px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Complete Sale</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
