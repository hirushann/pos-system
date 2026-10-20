'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ListChecks, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { deleteSupplierPriceItem, saveSupplierPriceItem } from '@/src/actions/suppliers';
import { formatAmount } from '@/src/lib/money';
import { getColomboDateString } from '@/src/lib/dates';
import type { SupplierPriceItem } from '@/src/db/schema';
import { ConfirmDialog } from './confirm-dialog';

export function PriceList({ supplierId, items }: { supplierId: number; items: SupplierPriceItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<SupplierPriceItem | 'new' | null>(null);
  const [toDelete, setToDelete] = React.useState<SupplierPriceItem | null>(null);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [priceDate, setPriceDate] = React.useState('');

  React.useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        setError(null);
        setErrors({});
        setPriceDate(editing === 'new' ? getColomboDateString(new Date()) : editing.priceDate);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => i.itemName.toLowerCase().includes(q) || (i.partNumber ?? '').toLowerCase().includes(q))
    : items;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      id: editing && editing !== 'new' ? editing.id : undefined,
      supplierId,
      itemName: String(f.get('itemName') ?? ''),
      partNumber: String(f.get('partNumber') ?? ''),
      unitPrice: String(f.get('unitPrice') ?? '').replace(/,/g, ''),
      priceDate,
      notes: String(f.get('notes') ?? ''),
    };
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = await saveSupplierPriceItem(input);
      if (!res.success) {
        setError(res.error ?? 'Could not save.');
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast.success('Price saved.');
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  const field = (name: string) =>
    errors[name] ? <p className="text-xs font-medium text-destructive">{errors[name]}</p> : null;
  const current = editing && editing !== 'new' ? editing : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item or part number..."
          className="h-9 max-w-xs text-sm"
        />
        <Button size="sm" className="gap-1.5" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add price
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          <ListChecks className="mb-2 h-8 w-8 text-muted-foreground/50" />
          No prices saved for this supplier yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs">
                <TableHead>Item</TableHead>
                <TableHead>Part number</TableHead>
                <TableHead className="text-right">Price (Rs.)</TableHead>
                <TableHead>Quoted on</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {shown.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.itemName}</TableCell>
                  <TableCell className="font-mono">{i.partNumber ?? '-'}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatAmount(i.unitPrice)}</TableCell>
                  <TableCell className="whitespace-nowrap">{i.priceDate}</TableCell>
                  <TableCell className="text-muted-foreground">{i.notes ?? ''}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(i)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setToDelete(i)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                    No match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !busy && !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{current ? 'Edit price' : 'Add price'}</DialogTitle>
            <DialogDescription>The price this supplier quoted for a part.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pl-name">Item name *</Label>
              <Input id="pl-name" name="itemName" defaultValue={current?.itemName ?? ''} required autoFocus />
              {field('itemName')}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pl-part">Part number</Label>
                <Input id="pl-part" name="partNumber" defaultValue={current?.partNumber ?? ''} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pl-price">Price (Rs.) *</Label>
                <Input
                  id="pl-price"
                  name="unitPrice"
                  inputMode="decimal"
                  defaultValue={current?.unitPrice ?? ''}
                  className="font-mono"
                  required
                />
                {field('unitPrice')}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-date">Quoted on *</Label>
              <Input id="pl-date" type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} required />
              {field('priceDate')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-notes">Notes</Label>
              <Input id="pl-notes" name="notes" defaultValue={current?.notes ?? ''} placeholder="e.g. minimum order 10" />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Remove this price?"
        description={toDelete ? `"${toDelete.itemName}" will be removed from this supplier's price list.` : ''}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!toDelete) return null;
          const res = await deleteSupplierPriceItem(toDelete.id);
          if (!res.success) return res.error ?? 'Could not delete.';
          toast.success('Price removed.');
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
