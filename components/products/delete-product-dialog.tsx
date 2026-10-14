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
import { deleteOrDeactivateProduct } from '@/src/actions/products';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ProductListItem } from '@/src/data/products';

interface DeleteProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductListItem | null;
  onSuccess?: () => void;
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: DeleteProductDialogProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!product) return null;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setError(null);
    onOpenChange(isOpen);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await deleteOrDeactivateProduct(product.id);
      if (!res.success) {
        setError(res.error || 'Failed to remove product');
        return;
      }

      if (res.data?.actionTaken === 'deactivated') {
        toast.info(res.message || `Product "${product.name}" was deactivated to preserve sales/stock history.`);
      } else {
        toast.success(res.message || `Product "${product.name}" was permanently removed.`);
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Remove Product</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <p className="text-sm text-foreground">
            Are you sure you want to remove{' '}
            <span className="font-semibold">{product.name}</span> (SKU: {product.sku})?
          </p>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Safety policy:</p>
            <p>
              • If this part has been sold or has stock adjustments, it will be{' '}
              <span className="font-semibold text-foreground">deactivated</span> rather than deleted to protect audit history.
            </p>
            <p>
              • If it was never sold and has no adjustments, it will be{' '}
              <span className="font-semibold text-foreground">permanently deleted</span>.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Confirm Removal'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
