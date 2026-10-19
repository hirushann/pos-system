import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/src/lib/auth-guards';
import { getSaleDetail } from '@/src/data/sales';
import { getShopProfile } from '@/src/data/shop';
import { InvoiceView } from '@/components/sales/invoice-view';

export const metadata: Metadata = {
  title: 'Print Invoice | Jayaweera Logistic & Motors',
  description: 'A4 invoice for dot-matrix printing.',
};

export default async function SaleInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reprint?: string }>;
}) {
  const { user } = await requireUser();

  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const saleId = parseInt(resolvedParams.id, 10);

  if (isNaN(saleId) || saleId <= 0) {
    notFound();
  }

  // Cashiers can only open their own sales; owners can open any
  const [sale, shop] = await Promise.all([getSaleDetail(saleId, user), getShopProfile()]);

  if (!sale) {
    notFound();
  }

  return (
    <InvoiceView
      sale={sale}
      shop={shop}
      isReprint={resolvedSearchParams.reprint === 'true'}
    />
  );
}
