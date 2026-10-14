'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { addManufacturerBarcode } from '@/src/actions/products';
import { searchPartsAction } from '@/src/actions/sales';
import type { CheckoutPartItem } from '@/src/data/checkout';
import { formatLKR } from '@/src/lib/money';
import { playScanSuccessBeep, playScanErrorBeep } from '@/src/lib/audio-beeper';
import { toast } from 'sonner';
import { Link2, Search, Loader2, Plus } from 'lucide-react';

interface LinkBarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  qty?: number;
  onLinkedAndAdded?: (product: CheckoutPartItem, qty: number) => void;
}

export function LinkBarcodeDialog({
  open,
  onOpenChange,
  barcode,
  qty = 1,
  onLinkedAndAdded,
}: LinkBarcodeDialogProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [results, setResults] = React.useState<CheckoutPartItem[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isLinking, setIsLinking] = React.useState<number | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSearchTerm('');
      setResults([]);
    }
    onOpenChange(newOpen);
  };

  // Search debounced
  React.useEffect(() => {
    if (!open) return;
    const q = searchTerm.trim();
    if (!q) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const parts = await searchPartsAction({ query: q });
        setResults(parts);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm, open]);

  const handleLink = async (product: CheckoutPartItem) => {
    setIsLinking(product.id);
    const res = await addManufacturerBarcode({
      productId: product.id,
      code: barcode,
    });
    setIsLinking(null);

    if (res.success) {
      playScanSuccessBeep();
      toast.success(`Linked barcode ${barcode} to ${product.name}`);
      handleOpenChange(false);
      onLinkedAndAdded?.(product, qty);
    } else {
      playScanErrorBeep();
      toast.error(res.error || 'Failed to link barcode');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <span>Link Barcode to Product</span>
          </DialogTitle>
          <DialogDescription>
            Register unrecognised code{' '}
            <strong className="font-mono text-foreground font-semibold">
              {barcode}
            </strong>{' '}
            as a manufacturer barcode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="link-search">Search Catalog Product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="link-search"
                placeholder="Search by name, SKU, or part number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Results list */}
          <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border p-2">
            {isSearching ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching...
              </div>
            ) : results.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {searchTerm.trim()
                  ? 'No matching catalog parts found.'
                  : 'Type a name or part number to search.'}
              </div>
            ) : (
              results.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {product.partNumber}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {product.sku}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground truncate max-w-[240px]">
                      {product.name}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {formatLKR(product.price)} · Stock: {product.stockQty} {product.unit}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleLink(product)}
                    disabled={isLinking === product.id}
                    className="gap-1 text-xs shrink-0"
                  >
                    {isLinking === product.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Link
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
