'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Wallet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { formatAmount } from '@/src/lib/money';
import { deleteSupplierPayment, setSupplierChequeStatus } from '@/src/actions/suppliers';
import { PAYMENT_METHOD_LABELS, type ChequeStatus } from '@/src/lib/supplier-payables';
import type { PaymentRow } from '@/src/data/suppliers';
import { ChequeStatusBadge } from './status-badges';
import { ConfirmDialog } from './confirm-dialog';

interface Props {
  payments: PaymentRow[];
  showSupplier?: boolean;
  showInvoice?: boolean;
  emptyText?: string;
}

export function PaymentsTable({ payments, showSupplier = true, showInvoice = true, emptyText }: Props) {
  const router = useRouter();
  const [toDelete, setToDelete] = React.useState<PaymentRow | null>(null);

  const changeStatus = async (p: PaymentRow, status: ChequeStatus) => {
    const res = await setSupplierChequeStatus(p.id, status);
    if (res.success) {
      toast.success(`Cheque marked ${status}.`);
      router.refresh();
    } else {
      toast.error(res.error ?? 'Could not update the cheque.');
    }
  };

  if (payments.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        <Wallet className="mb-2 h-8 w-8 text-muted-foreground/50" />
        {emptyText ?? 'No payments recorded yet.'}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead>Date</TableHead>
              {showSupplier && <TableHead>Supplier</TableHead>}
              {showInvoice && <TableHead>Invoice</TableHead>}
              <TableHead>Method</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs">
            {payments.map((p) => (
              <TableRow
                key={p.id}
                className={showInvoice ? 'cursor-pointer hover:bg-muted/30' : undefined}
                onClick={showInvoice ? () => router.push(`/suppliers/invoices/${p.invoiceId}`) : undefined}
              >
                <TableCell className="whitespace-nowrap">{p.paymentDate}</TableCell>
                {showSupplier && (
                  <TableCell>
                    <Link
                      href={`/suppliers/${p.supplierId}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.supplierName}
                    </Link>
                  </TableCell>
                )}
                {showInvoice && (
                  <TableCell>
                    <Link href={`/suppliers/invoices/${p.invoiceId}`} className="font-mono text-primary hover:underline">
                      {p.invoiceNumber}
                    </Link>
                  </TableCell>
                )}
                <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                <TableCell>
                  {p.method === 'cheque' && p.chequeStatus ? (
                    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="font-mono">
                        #{p.chequeNumber}
                        {p.chequeBank ? ` · ${p.chequeBank}` : ''}
                        {p.chequeDate ? ` · ${p.chequeDate}` : ''}
                      </span>
                      <Select value={p.chequeStatus} onValueChange={(v) => changeStatus(p, v as ChequeStatus)}>
                        <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent p-0 shadow-none">
                          <ChequeStatusBadge status={p.chequeStatus} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="cleared">Cleared</SelectItem>
                          <SelectItem value="bounced">Bounced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{p.reference || p.notes || '-'}</span>
                  )}
                </TableCell>
                <TableCell
                  className={
                    p.method === 'cheque' && p.chequeStatus === 'bounced'
                      ? 'text-right font-mono text-muted-foreground line-through'
                      : 'text-right font-mono font-semibold'
                  }
                >
                  {formatAmount(p.amount)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDelete(p);
                    }}
                    aria-label="Delete payment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this payment?"
        description={
          toDelete
            ? `Rs. ${formatAmount(toDelete.amount)} paid on ${toDelete.paymentDate} will be removed and the invoice balance goes back up. Use this only to correct a mistake.`
            : ''
        }
        confirmLabel="Delete payment"
        onConfirm={async () => {
          if (!toDelete) return null;
          const res = await deleteSupplierPayment(toDelete.id);
          if (!res.success) return res.error ?? 'Could not delete the payment.';
          toast.success('Payment deleted.');
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
