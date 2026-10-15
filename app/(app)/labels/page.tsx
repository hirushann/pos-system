import type { Metadata } from 'next';
import { requireOwner } from '@/src/lib/auth-guards';
import { db } from '@/src/db';
import { settings } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { getProductById } from '@/src/data/products';
import { getOrCreateInternalBarcode } from '@/src/lib/internal-barcode';
import { LabelsPrintView, QueueItem } from '@/components/labels/labels-print-view';

export const metadata: Metadata = {
  title: 'Print Barcode Labels | AutoParts POS',
  description: 'Print Code 128 barcode labels for thermal printers and A4 sticker sheets.',
};

interface LabelsPageProps {
  searchParams: Promise<{
    productId?: string;
    qty?: string;
  }>;
}

export default async function LabelsPage({ searchParams }: LabelsPageProps) {
  await requireOwner();

  // Load shop settings for label header
  const [storeSettings] = await db
    .select({ shopName: settings.shopName })
    .from(settings)
    .where(eq(settings.id, 1));

  const shopName = storeSettings?.shopName || 'Colombo Auto Spares & Parts';

  const params = await searchParams;
  let initialQueueItem: QueueItem | null = null;

  if (params.productId) {
    const prodId = parseInt(params.productId, 10);
    if (!isNaN(prodId) && prodId > 0) {
      const product = await getProductById(prodId, true);
      if (product) {
        const count = params.qty ? parseInt(params.qty, 10) : product.stockQty > 0 ? product.stockQty : 1;
        initialQueueItem = {
          product: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            partNumber: product.partNumber,
            price: product.price,
            internalBarcode: product.internalBarcode || (await getOrCreateInternalBarcode(product.id)),
            stockQty: product.stockQty,
          },
          count: isNaN(count) || count < 1 ? 1 : count,
        };
      }
    }
  }

  return (
    <LabelsPrintView
      shopName={shopName}
      initialQueueItem={initialQueueItem}
    />
  );
}
