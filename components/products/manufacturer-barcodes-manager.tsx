'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarcodeDisplay } from './barcode-display';
import { addManufacturerBarcode, removeManufacturerBarcode } from '@/src/actions/products';
import { toast } from 'sonner';
import { Barcode, Plus, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface BarcodeItem {
  id: number;
  code: string;
  kind: 'internal' | 'manufacturer';
}

interface ManufacturerBarcodesManagerProps {
  productId: number;
  internalBarcode?: string | null;
  barcodes: BarcodeItem[];
  onBarcodesUpdated?: () => void;
  readOnly?: boolean;
}

export function ManufacturerBarcodesManager({
  productId,
  internalBarcode,
  barcodes: initialBarcodes,
  onBarcodesUpdated,
  readOnly = false,
}: ManufacturerBarcodesManagerProps) {
  const router = useRouter();
  const [prevInitialBarcodes, setPrevInitialBarcodes] = React.useState(initialBarcodes);
  const [barcodes, setBarcodes] = React.useState<BarcodeItem[]>(initialBarcodes);
  const [newCode, setNewCode] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  if (prevInitialBarcodes !== initialBarcodes) {
    setPrevInitialBarcodes(initialBarcodes);
    setBarcodes(initialBarcodes);
  }

  const manufacturerBarcodes = barcodes.filter((b) => b.kind === 'manufacturer');

  const handleAddBarcode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCode.trim();
    if (!trimmed) return;

    setIsAdding(true);
    setErrorMessage(null);

    const result = await addManufacturerBarcode({
      productId,
      code: trimmed,
    });

    setIsAdding(false);

    if (result.success && result.data) {
      toast.success('Manufacturer barcode added');
      setNewCode('');
      setBarcodes((prev) => [
        ...prev,
        { id: result.data!.id, code: result.data!.code, kind: 'manufacturer' },
      ]);
      router.refresh();
      onBarcodesUpdated?.();
    } else {
      const err = result.error || 'Failed to add barcode';
      setErrorMessage(err);
      toast.error(err);
    }
  };

  const handleRemoveBarcode = async (barcodeId: number) => {
    setRemovingId(barcodeId);
    setErrorMessage(null);

    const result = await removeManufacturerBarcode({ barcodeId });
    setRemovingId(null);

    if (result.success) {
      toast.success('Barcode removed');
      setBarcodes((prev) => prev.filter((b) => b.id !== barcodeId));
      router.refresh();
      onBarcodesUpdated?.();
    } else {
      const err = result.error || 'Failed to remove barcode';
      setErrorMessage(err);
      toast.error(err);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground shadow-2xs">
      {/* Internal Barcode Display */}
      {internalBarcode && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Primary Internal Barcode
            </span>
            <span className="text-[10px] text-muted-foreground">System Generated</span>
          </div>
          <div className="flex flex-col items-center justify-center p-2">
            <BarcodeDisplay code={internalBarcode} height={12} />
          </div>
        </div>
      )}

      {/* Manufacturer Barcodes Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Barcode className="h-4 w-4 text-muted-foreground" />
            Manufacturer Barcodes ({manufacturerBarcodes.length})
          </Label>
        </div>

        {!readOnly && (
          <form onSubmit={handleAddBarcode} className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Scan or enter manufacturer barcode..."
                value={newCode}
                onChange={(e) => {
                  setNewCode(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isAdding}
                className="font-mono text-sm"
                aria-label="Add manufacturer barcode"
              />
            </div>
            <Button
              type="submit"
              disabled={isAdding || !newCode.trim()}
              size="sm"
              className="gap-1"
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </form>
        )}

        {errorMessage && (
          <p className="text-xs font-medium text-destructive">{errorMessage}</p>
        )}

        {manufacturerBarcodes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No manufacturer barcodes registered for this part yet.
          </p>
        ) : (
          <div className="divide-y rounded-lg border bg-background">
            {manufacturerBarcodes.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-medium">{b.code}</span>
                  <div className="w-28 scale-90 origin-left">
                    <BarcodeDisplay code={b.code} showDigits={false} height={8} />
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveBarcode(b.id)}
                    disabled={removingId === b.id}
                    aria-label={`Remove barcode ${b.code}`}
                  >
                    {removingId === b.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
