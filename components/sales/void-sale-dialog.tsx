'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { voidSale } from '@/src/actions/sales';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Ban } from 'lucide-react';

interface VoidSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: number;
  receiptNumber: string;
}

export function VoidSaleDialog({
  open,
  onOpenChange,
  saleId,
  receiptNumber,
}: VoidSaleDialogProps) {
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setReason('');
        setError(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('Please provide a specific void reason (at least 3 characters).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await voidSale({
        saleId,
        reason: trimmed,
      });

      if (!res.success) {
        setError(res.error || 'Failed to void sale.');
        setIsSubmitting(false);
        return;
      }

      toast.success(`Sale ${receiptNumber} has been voided. Stock returned.`);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error voiding sale';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Void Sale Transaction</DialogTitle>
              <DialogDescription className="text-xs">
                Receipt: <strong className="font-mono text-foreground">{receiptNumber}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Warning: This action cannot be reversed!</span>
            </div>
            <p className="leading-relaxed text-muted-foreground pl-5.5">
              The sale status will be set to <strong>Voided</strong> and excluded from revenue reports.
              All item quantities will be returned to store stock via atomic void stock movements.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="void-reason" className="text-xs font-semibold">
              Void Reason (Required) <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="void-reason"
              placeholder="e.g. Customer returned items / Cashier mistakenly selected wrong brake pads..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              rows={3}
              className="text-xs resize-none"
              autoFocus
            />
            {error && (
              <p className="text-xs font-medium text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || reason.trim().length < 3}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Voiding...</span>
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  <span>Confirm Void</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
