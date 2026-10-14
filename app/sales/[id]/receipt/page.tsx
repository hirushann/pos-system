import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/src/lib/auth-guards';
import { getSaleReceiptData } from '@/src/actions/sales';
import { ReceiptView } from '@/components/checkout/receipt-view';

export const metadata: Metadata = {
  title: 'Print Receipt | AutoParts POS',
  description: '80mm thermal receipt print format.',
};

export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reprint?: string }>;
}) {
  await requireUser();

  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const saleId = parseInt(resolvedParams.id, 10);

  if (isNaN(saleId) || saleId <= 0) {
    notFound();
  }

  const receiptData = await getSaleReceiptData(saleId);

  if (!receiptData) {
    notFound();
  }

  return (
    <ReceiptView
      data={receiptData}
      isReprint={resolvedSearchParams.reprint === 'true'}
    />
  );
}
