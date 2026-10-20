'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { InvoiceStatusFilter } from '@/src/data/suppliers';
import { InvoiceFormDialog, type SupplierOption } from './invoice-form-dialog';

const FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'open', label: 'To be paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'partial', label: 'Partially paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
];

export function InvoicesToolbar({
  status,
  query,
  suppliers,
}: {
  status: InvoiceStatusFilter;
  query: string;
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(query);

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={status === f.value ? 'default' : 'outline'}
            className={cn('h-8 text-xs', f.value === 'overdue' && status !== 'overdue' && 'text-red-600')}
            onClick={() => update({ status: f.value })}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: text.trim() });
          }}
          className="relative"
        >
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Invoice no. or supplier..."
            className="h-9 w-56 pl-8 text-sm"
          />
        </form>
        <Button className="gap-1.5" onClick={() => setOpen(true)} disabled={suppliers.length === 0}>
          <Plus className="h-4 w-4" /> Add invoice
        </Button>
      </div>
      <InvoiceFormDialog open={open} onOpenChange={setOpen} suppliers={suppliers} />
    </div>
  );
}
