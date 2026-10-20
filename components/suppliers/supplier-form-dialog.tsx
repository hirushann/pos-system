'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { createSupplier, updateSupplier } from '@/src/actions/suppliers';
import type { Supplier } from '@/src/db/schema';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setError(null);
        setErrors({});
        setActive(supplier?.active ?? true);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open, supplier]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      name: String(f.get('name') ?? ''),
      contactPerson: String(f.get('contactPerson') ?? ''),
      phone: String(f.get('phone') ?? ''),
      email: String(f.get('email') ?? ''),
      address: String(f.get('address') ?? ''),
      paymentTermsDays: String(f.get('paymentTermsDays') ?? '0') || '0',
      notes: String(f.get('notes') ?? ''),
      active,
    };
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = supplier ? await updateSupplier(supplier.id, input) : await createSupplier(input);
      if (!res.success) {
        setError(res.error ?? 'Could not save the supplier.');
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast.success(supplier ? 'Supplier updated.' : 'Supplier added.');
      onOpenChange(false);
      const created = res.data as { id: number } | undefined;
      if (!supplier && created) router.push(`/suppliers/${created.id}`);
      else router.refresh();
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
          <DialogTitle>{supplier ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
          <DialogDescription>Who you buy parts from, and how long they give you to pay.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">Supplier name *</Label>
            <Input id="sup-name" name="name" defaultValue={supplier?.name ?? ''} required autoFocus />
            {field('name')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sup-contact">Contact person</Label>
              <Input id="sup-contact" name="contactPerson" defaultValue={supplier?.contactPerson ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input id="sup-phone" name="phone" defaultValue={supplier?.phone ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" name="email" type="email" defaultValue={supplier?.email ?? ''} />
              {field('email')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-terms">Credit period (days)</Label>
              <Input
                id="sup-terms"
                name="paymentTermsDays"
                type="number"
                min={0}
                max={365}
                step={1}
                defaultValue={supplier?.paymentTermsDays ?? 0}
              />
              {field('paymentTermsDays')}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-address">Address</Label>
            <Input id="sup-address" name="address" defaultValue={supplier?.address ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-notes">Notes</Label>
            <Textarea id="sup-notes" name="notes" rows={2} defaultValue={supplier?.notes ?? ''} />
          </div>
          {supplier && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="sup-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive suppliers are hidden when adding new invoices.</p>
              </div>
              <Switch id="sup-active" checked={active} onCheckedChange={setActive} />
            </div>
          )}
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {supplier ? 'Save changes' : 'Add supplier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
