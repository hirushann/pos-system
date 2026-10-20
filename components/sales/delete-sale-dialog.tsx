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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteSale } from '@/src/actions/sales';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface DeleteSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: number;
  receiptNumber: string;
  isVoided: boolean;
  /** Where to go after deleting (e.g. back to the list from the detail page). Default: stay and refresh. */
  redirectTo?: string;
}

export function DeleteSaleDialog({
  open,
  onOpenChange,
  saleId,
  receiptNumber,
  isVoided,
  redirectTo,
}: DeleteSaleDialogProps) {
  const router = useRouter();
  const [typed, setTyped] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setTyped('');
        setError(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const matches = typed.trim().toLowerCase() === receiptNumber.toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await deleteSale({ saleId, confirmReceipt: typed.trim() });

      if (!res.success) {
        setError(res.error || 'Failed to delete sale.');
        return;
      }

      toast.success(
        res.data?.stockRestored
          ? `Sale ${receiptNumber} deleted. Its items were put back into stock.`
          : `Sale ${receiptNumber} deleted.`,
      );
      onOpenChange(false);
      if (redirectTo) router.replace(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error deleting sale');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Delete Sale</DialogTitle>
              <DialogDescription className="text-xs">
                Receipt: <strong className="font-mono text-foreground">{receiptNumber}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>This permanently deletes the sale and cannot be undone.</span>
            </div>
            <ul className="list-disc space-y-1 pl-9 leading-relaxed text-muted-foreground">
              <li>
                The sale, its items and its stock history lines are removed. It disappears from
                reports and totals.
              </li>
              <li>
                {isVoided ? (
                  <>Stock is not changed: the void already returned the items to stock.</>
                ) : (
                  <>
                    <strong className="text-foreground">The sold items are put back into stock.</strong>
                  </>
                )}
              </li>
              <li>The invoice number is not reused, so the numbering will skip this number.</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm" className="text-xs font-semibold">
              Type <span className="font-mono">{receiptNumber}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
              placeholder={receiptNumber}
              autoComplete="off"
              autoFocus
              className="font-mono text-xs"
            />
            {error && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 sm:gap-0">
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
              disabled={isSubmitting || !matches}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Sale</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
