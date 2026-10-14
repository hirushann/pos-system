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
import { Badge } from '@/components/ui/badge';
import { formatLKR } from '@/src/lib/money';
import Decimal from 'decimal.js';
import { Percent, Banknote, AlertCircle, Check } from 'lucide-react';

export interface DiscountState {
  type: 'none' | 'amount' | 'percent';
  value: string;
}

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: Decimal;
  currentDiscount: DiscountState;
  onApplyDiscount: (discount: DiscountState) => void;
  isOwner: boolean;
  cashierMaxDiscountPct: string;
}

export function DiscountDialog({
  open,
  onOpenChange,
  subtotal,
  currentDiscount,
  onApplyDiscount,
  isOwner,
  cashierMaxDiscountPct,
}: DiscountDialogProps) {
  const [type, setType] = React.useState<'amount' | 'percent'>(
    currentDiscount.type === 'amount' ? 'amount' : 'percent',
  );
  const [inputValue, setInputValue] = React.useState(
    currentDiscount.type !== 'none' ? currentDiscount.value : '',
  );
  const [error, setError] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const maxPct = React.useMemo(
    () => new Decimal(cashierMaxDiscountPct || '5.00'),
    [cashierMaxDiscountPct],
  );

  // Reset when opened
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setType(currentDiscount.type === 'amount' ? 'amount' : 'percent');
        setInputValue(currentDiscount.type !== 'none' ? currentDiscount.value : '');
        setError(null);
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, currentDiscount]);

  // Calculate preview
  const preview = React.useMemo(() => {
    const rawVal = inputValue.trim();
    if (!rawVal || isNaN(Number(rawVal)) || Number(rawVal) <= 0) {
      return {
        discountAmount: new Decimal(0),
        newTotal: subtotal,
        isValid: true,
        errorMessage: null,
      };
    }

    try {
      const valDec = new Decimal(rawVal);
      if (valDec.isNegative()) {
        return {
          discountAmount: new Decimal(0),
          newTotal: subtotal,
          isValid: false,
          errorMessage: 'Discount cannot be negative',
        };
      }

      let discountAmount = new Decimal(0);

      if (type === 'percent') {
        if (valDec.greaterThan(100)) {
          return {
            discountAmount: new Decimal(0),
            newTotal: subtotal,
            isValid: false,
            errorMessage: 'Percentage cannot exceed 100%',
          };
        }

        if (!isOwner && valDec.greaterThan(maxPct)) {
          return {
            discountAmount: new Decimal(0),
            newTotal: subtotal,
            isValid: false,
            errorMessage: `Cashier discount capped at ${maxPct.toString()}%`,
          };
        }

        discountAmount = subtotal
          .times(valDec)
          .dividedBy(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        // Fixed amount
        if (valDec.greaterThan(subtotal)) {
          return {
            discountAmount: new Decimal(0),
            newTotal: subtotal,
            isValid: false,
            errorMessage: 'Discount cannot exceed subtotal',
          };
        }

        if (!isOwner) {
          const maxAllowedAmt = subtotal
            .times(maxPct)
            .dividedBy(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

          if (valDec.greaterThan(maxAllowedAmt)) {
            return {
              discountAmount: new Decimal(0),
              newTotal: subtotal,
              isValid: false,
              errorMessage: `Cashier discount capped at ${maxPct.toString()}% (max ${formatLKR(maxAllowedAmt)})`,
            };
          }
        }

        discountAmount = valDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }

      return {
        discountAmount,
        newTotal: subtotal.minus(discountAmount),
        isValid: true,
        errorMessage: null,
      };
    } catch {
      return {
        discountAmount: new Decimal(0),
        newTotal: subtotal,
        isValid: false,
        errorMessage: 'Invalid number format',
      };
    }
  }, [inputValue, type, subtotal, isOwner, maxPct]);

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!preview.isValid) {
      setError(preview.errorMessage);
      return;
    }

    const rawVal = inputValue.trim();
    if (!rawVal || Number(rawVal) === 0) {
      onApplyDiscount({ type: 'none', value: '0' });
      onOpenChange(false);
      return;
    }

    onApplyDiscount({
      type,
      value: rawVal,
    });
    onOpenChange(false);
  };

  const handleRemove = () => {
    onApplyDiscount({ type: 'none', value: '0' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <span>Apply Sale Discount</span>
              <kbd className="hidden sm:inline-block rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                F4
              </kbd>
            </DialogTitle>
            {!isOwner && (
              <Badge variant="outline" className="text-[11px] font-normal">
                Cashier limit: {maxPct.toString()}%
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleApply} className="space-y-4 py-2">
          {/* Discount Type Selector */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === 'percent' ? 'default' : 'outline'}
              className="gap-2 h-10 font-medium"
              onClick={() => {
                setType('percent');
                setError(null);
              }}
            >
              <Percent className="h-4 w-4" />
              <span>Percentage (%)</span>
            </Button>
            <Button
              type="button"
              variant={type === 'amount' ? 'default' : 'outline'}
              className="gap-2 h-10 font-medium"
              onClick={() => {
                setType('amount');
                setError(null);
              }}
            >
              <Banknote className="h-4 w-4" />
              <span>Fixed Amount (LKR)</span>
            </Button>
          </div>

          {/* Quick presets for percentage */}
          {type === 'percent' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground mr-1">Presets:</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setInputValue('2')}
              >
                2%
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setInputValue('5')}
              >
                5%
              </Button>
              {isOwner && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setInputValue('10')}
                  >
                    10%
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setInputValue('15')}
                  >
                    15%
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setInputValue('20')}
                  >
                    20%
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Value Input */}
          <div className="space-y-1.5">
            <Label htmlFor="discount-input">
              {type === 'percent' ? 'Discount Percentage (%)' : 'Discount Amount (Rs.)'}
            </Label>
            <div className="relative">
              <Input
                ref={inputRef}
                id="discount-input"
                type="number"
                step={type === 'percent' ? '0.1' : '1'}
                min="0"
                max={type === 'percent' ? (isOwner ? '100' : maxPct.toString()) : subtotal.toString()}
                placeholder={type === 'percent' ? 'e.g. 5' : 'e.g. 250'}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError(null);
                }}
                className="font-mono text-base pr-12"
              />
              <div className="absolute right-3 top-2.5 text-xs font-semibold text-muted-foreground select-none">
                {type === 'percent' ? '%' : 'LKR'}
              </div>
            </div>
            {error && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </p>
            )}
            {!error && !preview.isValid && preview.errorMessage && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{preview.errorMessage}</span>
              </p>
            )}
          </div>

          {/* Live Calculation Box */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-mono tabular-nums">{formatLKR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount ({preview.discountAmount.isZero() ? '0%' : type === 'percent' ? `${inputValue}%` : 'Amount'}):</span>
              <span className="font-mono tabular-nums text-destructive">
                -{formatLKR(preview.discountAmount)}
              </span>
            </div>
            <div className="border-t pt-1.5 flex justify-between font-semibold">
              <span>Payable Total:</span>
              <span className="font-mono tabular-nums text-base text-primary">
                {formatLKR(preview.newTotal)}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            {currentDiscount.type !== 'none' && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                onClick={handleRemove}
              >
                Clear Discount
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!preview.isValid || !!error}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              <span>Apply Discount</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
