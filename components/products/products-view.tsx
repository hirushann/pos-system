'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ProductFilters } from './product-filters';
import { ProductTable } from './product-table';
import { ProductFormDialog } from './product-form-dialog';
import { DeleteProductDialog } from './delete-product-dialog';
import { ProductImportDialog } from './product-import-dialog';
import { MetadataDialogs } from './metadata-dialogs';
import {
  PaginatedProductsResult,
  ProductListItem,
} from '@/src/data/products';
import { Download, FileSpreadsheet, Plus, Tags } from 'lucide-react';

interface CategoryItem {
  id: number;
  name: string;
}

interface BrandItem {
  id: number;
  name: string;
}

interface VehicleMakeItem {
  id: number;
  name: string;
}

interface VehicleModelItem {
  id: number;
  makeId: number;
  name: string;
  makeName: string;
}

interface ProductsViewProps {
  isOwner: boolean;
  data: PaginatedProductsResult;
  categories: CategoryItem[];
  brands: BrandItem[];
  suppliers: { id: number; name: string }[];
  vehicleMakes: VehicleMakeItem[];
  vehicleModels: VehicleModelItem[];
}

export function ProductsView({
  isOwner,
  data,
  categories,
  brands,
  suppliers,
  vehicleMakes,
  vehicleModels,
}: ProductsViewProps) {
  const router = useRouter();

  // Modals state
  const [productFormOpen, setProductFormOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<ProductListItem | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingProduct, setDeletingProduct] = React.useState<ProductListItem | null>(null);

  const [importOpen, setImportOpen] = React.useState(false);
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [metadataTab, setMetadataTab] = React.useState<'category' | 'brand' | 'make' | 'model'>('category');

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setProductFormOpen(true);
  };

  const handleOpenEdit = (product: ProductListItem) => {
    setEditingProduct(product);
    setProductFormOpen(true);
  };

  const handleOpenDelete = (product: ProductListItem) => {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleOpenMetadata = (tab: 'category' | 'brand' | 'make' | 'model' = 'category') => {
    setMetadataTab(tab);
    setMetadataOpen(true);
  };

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Spare Parts Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Search parts by SKU, OEM numbers, vehicle fitment, and manage catalog pricing.
          </p>
        </div>

        {/* Owner Controls */}
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href="/api/products/export" download>
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </a>
            </Button>

            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Import CSV</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenMetadata('category')}
              className="gap-1.5"
            >
              <Tags className="h-4 w-4" />
              <span>Manage Metadata</span>
            </Button>

            <Button size="sm" onClick={handleOpenAdd} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Add Product</span>
            </Button>
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <ProductFilters
        categories={categories}
        brands={brands}
        suppliers={isOwner ? suppliers : undefined}
        vehicleMakes={vehicleMakes}
        vehicleModels={vehicleModels}
      />

      {/* Paginated Products Table */}
      <ProductTable
        products={data.items}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        currentPage={data.currentPage}
        pageSize={data.pageSize}
        isOwner={isOwner}
        onEditProduct={handleOpenEdit}
        onDeleteProduct={handleOpenDelete}
      />

      {/* Add / Edit Dialog (Owner Only) */}
      {isOwner && (
        <ProductFormDialog
          open={productFormOpen}
          onOpenChange={setProductFormOpen}
          product={editingProduct}
          categories={categories}
          brands={brands}
          suppliers={suppliers}
          vehicleMakes={vehicleMakes}
          vehicleModels={vehicleModels}
          onOpenMetadata={handleOpenMetadata}
          onSuccess={handleRefresh}
        />
      )}

      {/* Import products from CSV (Owner Only) */}
      {isOwner && (
        <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={handleRefresh} />
      )}

      {/* Delete / Deactivate Dialog (Owner Only) */}
      {isOwner && (
        <DeleteProductDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          product={deletingProduct}
          onSuccess={handleRefresh}
        />
      )}

      {/* Manage Metadata Dialog (Owner Only) */}
      {isOwner && (
        <MetadataDialogs
          open={metadataOpen}
          onOpenChange={setMetadataOpen}
          initialTab={metadataTab}
          vehicleMakes={vehicleMakes}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}
