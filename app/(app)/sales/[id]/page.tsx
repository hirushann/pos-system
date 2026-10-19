import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/src/lib/auth-guards';
import { getSaleDetail } from '@/src/data/sales';
import { SaleDetailView } from '@/components/sales/sale-detail-view';

export const metadata: Metadata = {
  title: 'Sale Details | Jayaweera Logistic & Motors',
  description: 'View full line items, order summary, and transaction status.',
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireUser();

  const resolvedParams = await params;
  const saleId = parseInt(resolvedParams.id, 10);

  if (isNaN(saleId) || saleId <= 0) {
    notFound();
  }

  const sale = await getSaleDetail(saleId, user);

  if (!sale) {
    notFound();
  }

  return (
    <SaleDetailView
      sale={sale}
      isOwner={user.role === 'owner'}
    />
  );
}
