import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/src/lib/auth-guards';
import { getProductById } from '@/src/data/products';
import { ProductDetailView } from '@/components/products/product-detail-view';

export const metadata: Metadata = {
  title: 'Product Details | Jayaweera Logistic & Motors',
  description: 'View spare part details, barcode specifications, and vehicle fitments.',
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireUser();
  const isOwner = user.role === 'owner';

  const resolvedParams = await params;
  const productId = parseInt(resolvedParams.id, 10);

  if (isNaN(productId) || productId <= 0) {
    notFound();
  }

  const product = await getProductById(productId, isOwner);

  if (!product) {
    notFound();
  }

  return <ProductDetailView product={product} isOwner={isOwner} />;
}
