import type { Metadata } from 'next';
import { requireUser } from '@/src/lib/auth-guards';
import {
  getPaginatedProducts,
  getCategories,
  getBrands,
  getVehicleMakes,
  getVehicleModels,
} from '@/src/data/products';
import { ProductsView } from '@/components/products/products-view';

export const metadata: Metadata = {
  title: 'Spare Parts Catalog | AutoParts POS',
};

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    brand?: string;
    make?: string;
    model?: string;
    stock?: 'all' | 'low' | 'out';
    active?: 'all' | 'active' | 'inactive';
    page?: string;
    pageSize?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { user } = await requireUser();
  const isOwner = user.role === 'owner';

  const params = await searchParams;

  const q = typeof params.q === 'string' ? params.q : undefined;
  const categoryId = params.category && params.category !== 'all' ? parseInt(params.category, 10) : undefined;
  const brandId = params.brand && params.brand !== 'all' ? parseInt(params.brand, 10) : undefined;
  const makeId = params.make && params.make !== 'all' ? parseInt(params.make, 10) : undefined;
  const modelId = params.model && params.model !== 'all' ? parseInt(params.model, 10) : undefined;
  const stockStatus = params.stock ?? 'all';
  const activeStatus = params.active ?? 'all';
  const page = params.page ? parseInt(params.page, 10) : 1;
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : 15;

  const [productsResult, categories, brands, vehicleMakes, vehicleModels] =
    await Promise.all([
      getPaginatedProducts(
        {
          search: q,
          categoryId,
          brandId,
          makeId,
          modelId,
          stockStatus,
          activeStatus,
          page,
          pageSize,
        },
        isOwner,
      ),
      getCategories(),
      getBrands(),
      getVehicleMakes(),
      getVehicleModels(),
    ]);

  return (
    <ProductsView
      isOwner={isOwner}
      data={productsResult}
      categories={categories}
      brands={brands}
      vehicleMakes={vehicleMakes}
      vehicleModels={vehicleModels}
    />
  );
}
