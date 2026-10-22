'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Truck } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/src/lib/money';
import type { SupplierListItem } from '@/src/data/suppliers';
import { SupplierFormDialog } from './supplier-form-dialog';

export function SuppliersView({ suppliers }: { suppliers: SupplierListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? suppliers.filter((s) => `${s.name} ${s.contactPerson ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(q))
    : suppliers;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suppliers..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add supplier
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          <Truck className="mb-2 h-9 w-9 text-muted-foreground/50" />
          No suppliers yet. Add your first one to start tracking what you owe.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs">
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Still owed</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead className="text-right">Owes you</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {shown.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => router.push(`/suppliers/${s.id}`)}
                >
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="text-sm font-semibold text-primary hover:underline">
                      {s.name}
                    </Link>
                    {!s.active && (
                      <Badge variant="secondary" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[s.contactPerson, s.phone].filter(Boolean).join(' · ') || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(s.totalInvoiced)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                    {formatAmount(s.totalPaid)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatAmount(s.outstanding)}</TableCell>
                  <TableCell>
                    {s.overdueCount > 0 ? (
                      <Badge className="border-0 bg-red-500/15 text-red-700 dark:text-red-400">
                        {s.overdueCount} · Rs. {formatAmount(s.overdueAmount)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                    {Number(s.creditDue) > 0 ? formatAmount(s.creditDue) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                    No match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <SupplierFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
