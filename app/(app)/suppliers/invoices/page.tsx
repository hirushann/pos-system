import type { Metadata } from 'next';
import { getInvoiceRows, getPayablesSummary, getSupplierOptions, type InvoiceStatusFilter } from '@/src/data/suppliers';
import { PayablesSummaryCards } from '@/components/suppliers/payables-summary-cards';
import { SuppliersNav } from '@/components/suppliers/suppliers-nav';
import { InvoicesToolbar } from '@/components/suppliers/invoices-toolbar';
import { InvoicesTable } from '@/components/suppliers/invoices-table';

export const metadata: Metadata = { title: 'Supplier Invoices | Jayaweera Logistic & Motors' };

const STATUSES: InvoiceStatusFilter[] = ['all', 'open', 'unpaid', 'partial', 'paid', 'overdue'];

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status as InvoiceStatusFilter)
    ? (params.status as InvoiceStatusFilter)
    : 'open';
  const query = (params.q ?? '').slice(0, 100);

  const [summary, invoices, supplierOptions] = await Promise.all([
    getPayablesSummary(),
    getInvoiceRows({ status, search: query }),
    getSupplierOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Supplier Invoices</h1>
          <p className="text-sm text-muted-foreground">Every bill from your suppliers and how much of it is paid.</p>
        </div>
        <SuppliersNav />
      </div>
      <PayablesSummaryCards summary={summary} />
      <InvoicesToolbar status={status} query={query} suppliers={supplierOptions} />
      <InvoicesTable invoices={invoices} />
    </div>
  );
}
