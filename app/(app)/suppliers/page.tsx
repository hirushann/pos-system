import type { Metadata } from 'next';
import { getPayablesSummary, getSupplierList } from '@/src/data/suppliers';
import { PayablesSummaryCards } from '@/components/suppliers/payables-summary-cards';
import { SuppliersNav } from '@/components/suppliers/suppliers-nav';
import { SuppliersView } from '@/components/suppliers/suppliers-view';

export const metadata: Metadata = { title: 'Suppliers | Jayaweera Logistic & Motors' };

export default async function SuppliersPage() {
  const [summary, suppliers] = await Promise.all([getPayablesSummary(), getSupplierList()]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Suppliers & Payables</h1>
          <p className="text-sm text-muted-foreground">
            Track supplier invoices, what you still owe and what you have paid.
          </p>
        </div>
        <SuppliersNav />
      </div>
      <PayablesSummaryCards summary={summary} />
      <SuppliersView suppliers={suppliers} />
    </div>
  );
}
