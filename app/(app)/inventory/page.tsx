import type { Metadata } from 'next';
import { requireUser } from '@/src/lib/auth-guards';
import {
  getLowStockProducts,
  getProductStockHistory,
  getProductsForPicker,
} from '@/src/data/inventory';
import { InventoryView } from '@/components/inventory/inventory-view';

export const metadata: Metadata = {
  title: 'Inventory & Stock Tracking | AutoParts POS',
};

interface InventoryPageProps {
  searchParams: Promise<{
    productId?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const { user } = await requireUser();
  const isOwner = user.role === 'owner';

  const params = await searchParams;
  const productId = params.productId ? parseInt(params.productId, 10) : undefined;

  const [lowStockItems, productsForPicker] = await Promise.all([
    getLowStockProducts(),
    getProductsForPicker(),
  ]);

  // If productId is provided, load its history; otherwise if none provided and there are products,
  // we can load movements for productId if defined
  const movements = productId ? await getProductStockHistory(productId) : [];

  return (
    <InventoryView
      isOwner={isOwner}
      lowStockItems={lowStockItems}
      productsForPicker={productsForPicker}
      selectedProductId={productId}
      movements={movements}
    />
  );
}
