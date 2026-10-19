import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/src/lib/auth-guards';
import { getSaleDetail } from '@/src/data/sales';
import { getShopProfile } from '@/src/data/shop';
import { buildTextInvoice } from '@/src/lib/escp-invoice';
import { TextInvoiceView } from '@/components/sales/text-invoice-view';

export const metadata: Metadata = {
  title: 'Print Invoice | Jayaweera Logistic & Motors',
  description: 'Plain-text invoice for the Epson LQ-310 dot-matrix printer.',
};

export default async function SaleTextInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reprint?: string; print?: string }>;
}) {
  const { user } = await requireUser();

  const [resolvedParams, query] = await Promise.all([params, searchParams]);
  const saleId = parseInt(resolvedParams.id, 10);

  if (isNaN(saleId) || saleId <= 0) {
    notFound();
  }

  // Cashiers can only open their own sales; owners can open any
  const [sale, shop] = await Promise.all([getSaleDetail(saleId, user), getShopProfile()]);

  if (!sale) {
    notFound();
  }

  const invoice = buildTextInvoice(sale, shop, { isReprint: query.reprint === 'true' });

  return (
    <TextInvoiceView
      saleId={sale.id}
      receiptNumber={sale.receiptNumber}
      preview={invoice.preview}
      bytesBase64={Buffer.from(invoice.bytes).toString('base64')}
      formCount={invoice.pages.length}
      autoPrint={query.print === '1'}
    />
  );
}
