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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adjustStock } from '@/src/actions/inventory';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowUpDown, AlertCircle, PlusCircle, MinusCircle } from 'lucide-react';

interface ProductPickerItem {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  stockQty: number;
  binLocation: string | null;
  isActive: boolean;
}

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductPickerItem[];
  defaultProductId?: number;
  onSuccess?: () => void;
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  products,
  defaultProductId,
  onSuccess,
}: StockAdjustDialogProps) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = React.useState<string>(
    defaultProductId ? defaultProductId.toString() : (products[0]?.id?.toString() || ''),
  );
  const [prevDefaultId, setPrevDefaultId] = React.useState<number | undefined>(defaultProductId);
  const [direction, setDirection] = React.useState<'add' | 'deduct'>('add');
  const [qtyString, setQtyString] = React.useState('1');
  const [reason, setReason] = React.useState<'received' | 'adjustment'>('received');
  const [note, setNote] = React.useState('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (prevDefaultId !== defaultProductId) {
    setPrevDefaultId(defaultProductId);
    if (defaultProductId) {
      setSelectedProductId(defaultProductId.toString());
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id.toString());
    }
    setError(null);
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setError(null);
    }
    onOpenChange(isOpen);
  };

  const selectedProduct = React.useMemo(() => {
    const id = parseInt(selectedProductId, 10);
    return products.find((p) => p.id === id);
  }, [products, selectedProductId]);

  const numQty = parseInt(qtyString, 10) || 0;
  const signedQty = direction === 'add' ? numQty : -numQty;
  const currentStock = selectedProduct?.stockQty ?? 0;
  const projectedStock = currentStock + signedQty;
  const isInvalidNegative = projectedStock < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError('Please select a product');
      return;
    }

    if (numQty <= 0) {
      setError('Adjustment quantity must be greater than zero');
      return;
    }

    if (isInvalidNegative) {
      setError(
        `Cannot reduce stock below zero. Current stock is ${currentStock}, deduction is ${numQty}.`,
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await adjustStock({
        productId: selectedProduct.id,
        changeQty: signedQty,
        reason,
        note: note.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || 'Failed to adjust stock');
        return;
      }

      if (reason === 'received' && signedQty > 0) {
        toast.success(
          `Received ${signedQty} pcs of ${selectedProduct.name}`,
          {
            description: `Stock is now ${projectedStock} pcs.`,
            action: {
              label: `Print ${signedQty} labels`,
              onClick: () =>
                router.push(`/labels?productId=${selectedProduct.id}&qty=${signedQty}`),
            },
            duration: 12000,
          },
        );
      } else {
        toast.success(
          res.message || `Stock updated: ${selectedProduct.name} is now ${projectedStock} pcs`,
        );
      }
      setQtyString('1');
      setNote('');
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5 text-primary" />
            <span>Stock Level Adjustment</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Product Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="adj-product">Select Spare Part Product</Label>
            <Select
              value={selectedProductId}
              onValueChange={setSelectedProductId}
            >
              <SelectTrigger id="adj-product" className="w-full">
                <SelectValue placeholder="Choose product..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.partNumber} - {p.name} ({p.stockQty} in stock)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProduct && (
              <div className="flex items-center justify-between text-2xs text-muted-foreground px-0.5">
                <span>SKU: {selectedProduct.sku}</span>
                <span>Bin: {selectedProduct.binLocation || 'None'}</span>
              </div>
            )}
          </div>

          {/* Direction toggle: Add vs Deduct */}
          <div className="space-y-1.5">
            <Label>Adjustment Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDirection('add');
                  if (reason === 'adjustment' && note === '') setReason('received');
                }}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                  direction === 'add'
                    ? 'border-emerald-600 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <PlusCircle className="h-4 w-4" />
                <span>Receive / Add (+)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirection('deduct');
                  setReason('adjustment');
                }}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                  direction === 'deduct'
                    ? 'border-destructive bg-destructive/10 text-destructive shadow-2xs'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <MinusCircle className="h-4 w-4" />
                <span>Deduct / Reduce (-)</span>
              </button>
            </div>
          </div>

          {/* Quantity & Reason */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Quantity ({direction === 'add' ? '+' : '-'})</Label>
              <Input
                id="adj-qty"
                type="number"
                min="1"
                step="1"
                value={qtyString}
                onChange={(e) => setQtyString(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">Audit Reason</Label>
              <Select
                value={reason}
                onValueChange={(val: 'received' | 'adjustment') => setReason(val)}
              >
                <SelectTrigger id="adj-reason" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received (New Stock)</SelectItem>
                  <SelectItem value="adjustment">Stock Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Calculation preview */}
          {selectedProduct && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                isInvalidNegative
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted/40 text-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Stock:</span>
                <span className="font-semibold">{currentStock} pcs</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Change:</span>
                <span
                  className={`font-semibold ${
                    signedQty > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-destructive'
                  }`}
                >
                  {signedQty > 0 ? `+${signedQty}` : signedQty} pcs
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t pt-1 font-medium">
                <span>Resulting Stock:</span>
                <span className={`text-sm font-bold ${isInvalidNegative ? 'text-destructive' : ''}`}>
                  {projectedStock} pcs
                </span>
              </div>
              {isInvalidNegative && (
                <p className="mt-1.5 text-2xs font-medium text-destructive">
                  Error: Resulting stock cannot be negative!
                </p>
              )}
            </div>
          )}

          {/* Note / Memo */}
          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Note / Justification</Label>
            <Textarea
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Supplier delivery invoice #8841, damaged stock write-off..."
              className="h-16"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isInvalidNegative || numQty <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                'Save Adjustment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
