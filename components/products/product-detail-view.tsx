'use client';

import * as React from 'react';
import Link from 'next/link';
import { ProductListItem } from '@/src/data/products';
import { formatLKR } from '@/src/lib/money';
import { ManufacturerBarcodesManager } from './manufacturer-barcodes-manager';
import { BarcodeDisplay } from './barcode-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Printer,
  History,
  Shield,
  Car,
} from 'lucide-react';

interface ProductDetailViewProps {
  product: ProductListItem;
  isOwner: boolean;
}

export function ProductDetailView({ product, isOwner }: ProductDetailViewProps) {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="h-8 gap-1 pl-1 text-xs text-muted-foreground">
              <Link href="/products">
                <ArrowLeft className="h-4 w-4" />
                Back to Catalog
              </Link>
            </Button>
            <span className="text-muted-foreground">·</span>
            <Badge variant={product.isActive ? 'default' : 'secondary'} className="text-[10px]">
              {product.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {product.name}
          </h1>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="font-semibold text-primary">{product.partNumber}</span>
            <span>•</span>
            <span>SKU: {product.sku}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
              <Link href={`/labels?productId=${product.id}`}>
                <Printer className="h-3.5 w-3.5" />
                Print Labels
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
            <Link href={`/inventory?productId=${product.id}`}>
              <History className="h-3.5 w-3.5" />
              Stock History
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Stats & Barcodes */}
        <div className="space-y-6 lg:col-span-2">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4 shadow-2xs">
              <span className="text-xs text-muted-foreground">Selling Price</span>
              <p className="mt-1 font-mono text-xl font-bold text-foreground">
                {formatLKR(product.price)}
              </p>
            </div>

            {isOwner && product.costPrice && (
              <div className="rounded-xl border bg-card p-4 shadow-2xs">
                <span className="text-xs text-muted-foreground">Cost Price / Margin</span>
                <p className="mt-1 font-mono text-lg font-bold text-foreground">
                  {formatLKR(product.costPrice)}
                  <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                    ({product.marginPct}%)
                  </span>
                </p>
              </div>
            )}

            <div className="rounded-xl border bg-card p-4 shadow-2xs">
              <span className="text-xs text-muted-foreground">Stock on Hand</span>
              <p className="mt-1 font-mono text-xl font-bold text-foreground">
                {product.stockQty}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {product.unit}
                </span>
              </p>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-2xs">
              <span className="text-xs text-muted-foreground">Bin Location</span>
              <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                {product.binLocation || '-'}
              </p>
            </div>
          </div>

          {/* Barcode Manager */}
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              Barcodes
            </h2>
            {isOwner ? (
              <ManufacturerBarcodesManager
                productId={product.id}
                internalBarcode={product.internalBarcode}
                barcodes={product.barcodes || []}
              />
            ) : (
              <div className="rounded-xl border bg-card p-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  Internal Barcode
                </span>
                {product.internalBarcode ? (
                  <div className="mt-3 flex justify-center">
                    <BarcodeDisplay code={product.internalBarcode} height={14} />
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">None</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Catalog Metadata & Fitments */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="space-y-4 rounded-xl border bg-card p-4 shadow-2xs">
            <h3 className="text-sm font-semibold">Classification</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">{product.categoryName}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Brand</span>
                <span className="font-medium">{product.brandName || 'Generic / Unbranded'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Reorder Level</span>
                <span className="font-mono font-medium">{product.reorderLevel} {product.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="text-right text-xs max-w-[200px]">
                  {product.description || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Alternate Numbers */}
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
            <h3 className="text-sm font-semibold">Alternate / OEM Codes</h3>
            {product.alternatePartNumbers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">None added</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {product.alternatePartNumbers.map((alt) => (
                  <Badge key={alt.id} variant="outline" className="font-mono text-xs">
                    {alt.partNumber} ({alt.kind.toUpperCase()})
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Vehicle Fitments */}
          {product.fitments.length > 0 && (
            <div className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Car className="h-4 w-4 text-muted-foreground" />
                Vehicle Fitments ({product.fitments.length})
              </h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {product.fitments.map((fit) => (
                  <div
                    key={fit.id}
                    className="flex items-center justify-between rounded bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium">
                      {fit.makeName} {fit.modelName}
                    </span>
                    {(fit.yearFrom || fit.yearTo) && (
                      <span className="text-muted-foreground font-mono">
                        {fit.yearFrom ?? 'Any'} - {fit.yearTo ?? 'Now'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
