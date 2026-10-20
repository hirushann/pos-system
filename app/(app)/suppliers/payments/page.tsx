import type { Metadata } from 'next';
import Link from 'next/link';
import { getPayablesSummary, getPayments } from '@/src/data/suppliers';
import { PayablesSummaryCards } from '@/components/suppliers/payables-summary-cards';
import { SuppliersNav } from '@/components/suppliers/suppliers-nav';
import { PaymentsTable } from '@/components/suppliers/payments-table';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Supplier Payments | Jayaweera Logistic & Motors' };

export default async function SupplierPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cheques?: string }>;
}) {
  const params = await searchParams;
  const pendingOnly = params.cheques === 'pending';
  const [summary, payments] = await Promise.all([
    getPayablesSummary(),
    getPayments({ pendingChequesOnly: pendingOnly }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Payments & Cheques</h1>
          <p className="text-sm text-muted-foreground">
            Everything you have paid suppliers. Mark cheques as cleared or bounced when the bank tells you.
          </p>
        </div>
        <SuppliersNav />
      </div>
      <PayablesSummaryCards summary={summary} />
      <div className="flex gap-1.5">
        <Button asChild size="sm" variant={pendingOnly ? 'outline' : 'default'} className="h-8 text-xs">
          <Link href="/suppliers/payments">All payments</Link>
        </Button>
        <Button asChild size="sm" variant={pendingOnly ? 'default' : 'outline'} className="h-8 text-xs">
          <Link href="/suppliers/payments?cheques=pending">Pending cheques</Link>
        </Button>
      </div>
      <PaymentsTable
        payments={payments}
        emptyText={pendingOnly ? 'No cheques waiting to clear.' : 'No payments recorded yet.'}
      />
    </div>
  );
}
