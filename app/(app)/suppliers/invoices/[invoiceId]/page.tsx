import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getInvoiceDetail } from '@/src/data/suppliers';
import { formatLKR } from '@/src/lib/money';
import { Card, CardContent } from '@/components/ui/card';
import { InvoiceActions } from '@/components/suppliers/invoice-actions';
import { PaymentsTable } from '@/components/suppliers/payments-table';
import { InvoiceStatusBadge } from '@/components/suppliers/status-badges';

export const metadata: Metadata = { title: 'Supplier Invoice | Jayaweera Logistic & Motors' };

export default async function SupplierInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const id = Number(invoiceId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, payments } = detail;

  const stats = [
    { label: 'Invoice amount', value: formatLKR(invoice.amount) },
    { label: 'Paid so far', value: formatLKR(invoice.paid) },
    { label: 'Balance', value: formatLKR(invoice.balance), strong: true },
  ];

  return (
    <div className="space-y-6">
      <Link
        href={`/suppliers/${invoice.supplierId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {invoice.supplierName}
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">{invoice.invoiceNumber}</h1>
            <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} daysOverdue={invoice.daysOverdue} />
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.supplierName} · Dated {invoice.invoiceDate}
            {invoice.dueDate ? ` · Due ${invoice.dueDate}` : ' · No due date'}
          </p>
          {invoice.notes && <p className="max-w-2xl text-sm">{invoice.notes}</p>}
        </div>
        <InvoiceActions invoice={invoice} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-xs">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold ${s.strong ? 'text-primary' : ''}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payments</h2>
        <PaymentsTable payments={payments} showSupplier={false} showInvoice={false} />
      </section>
    </div>
  );
}
