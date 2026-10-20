'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAmount } from '@/src/lib/money';
import type { InvoiceRow } from '@/src/data/suppliers';
import { InvoiceStatusBadge } from './status-badges';
import { PaymentFormDialog } from './payment-form-dialog';

export function InvoicesTable({ invoices, showSupplier = true }: { invoices: InvoiceRow[]; showSupplier?: boolean }) {
  const router = useRouter();
  const [paying, setPaying] = React.useState<InvoiceRow | null>(null);
  if (invoices.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        <FileText className="mb-2 h-8 w-8 text-muted-foreground/50" />
        No invoices to show.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 text-xs">
            <TableHead>Invoice</TableHead>
            {showSupplier && <TableHead>Supplier</TableHead>}
            <TableHead>Date</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody className="text-xs">
          {invoices.map((i) => (
            <TableRow
              key={i.id}
              className="cursor-pointer hover:bg-muted/30"
              onClick={() => router.push(`/suppliers/invoices/${i.id}`)}
            >
              <TableCell>
                <Link href={`/suppliers/invoices/${i.id}`} className="font-mono font-semibold text-primary hover:underline">
                  {i.invoiceNumber}
                </Link>
              </TableCell>
              {showSupplier && (
                <TableCell>
                  <Link
                    href={`/suppliers/${i.supplierId}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {i.supplierName}
                  </Link>
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap">{i.invoiceDate}</TableCell>
              <TableCell className="whitespace-nowrap">{i.dueDate ?? '-'}</TableCell>
              <TableCell className="text-right font-mono">{formatAmount(i.amount)}</TableCell>
              <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                {formatAmount(i.paid)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">{formatAmount(i.balance)}</TableCell>
              <TableCell>
                <InvoiceStatusBadge status={i.status} overdue={i.overdue} daysOverdue={i.daysOverdue} />
              </TableCell>
              <TableCell className="text-right">
                {i.status !== 'paid' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPaying(i);
                    }}
                  >
                    <Wallet className="h-3.5 w-3.5" /> Pay
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {paying && (
        <PaymentFormDialog
          open
          onOpenChange={(v) => !v && setPaying(null)}
          invoiceId={paying.id}
          invoiceNumber={paying.invoiceNumber}
          supplierName={paying.supplierName}
          balance={paying.balance}
        />
      )}
    </div>
  );
}
