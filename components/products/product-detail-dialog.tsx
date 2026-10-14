'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductListItem } from '@/src/data/products';
import { formatLKR } from '@/src/lib/money';
import { ManufacturerBarcodesManager } from './manufacturer-barcodes-manager';
import { BarcodeDisplay } from './barcode-display';
import { Printer, Pencil, Shield } from 'lucide-react';
import Link from 'next/link';

interface ProductDetailDialogProps {
  product: ProductListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  onEdit?: (product: ProductListItem) => void;
}

export function ProductDetailDialog({
  product,
  open,
  onOpenChange,
  isOwner,
  onEdit,
}: ProductDetailDialogProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-primary">
                  {product.partNumber}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {product.sku}
                </span>
                <Badge variant={product.isActive ? 'default' : 'secondary'} className="text-[10px]">
                  {product.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <DialogTitle className="mt-1 text-lg font-bold">
                {product.name}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && (
                <>
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <Link href={`/labels?productId=${product.id}`}>
                      <Printer className="h-3.5 w-3.5" />
                      Print Labels
                    </Link>
                  </Button>
                  {onEdit && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        onEdit(product);
                      }}
                      className="gap-1.5 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Part
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <span className="text-xs text-muted-foreground">Selling Price</span>
              <p className="mt-1 font-mono text-base font-bold text-foreground">
                {formatLKR(product.price)}
              </p>
            </div>

            {isOwner && product.costPrice && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">Cost Price / Margin</span>
                <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                  {formatLKR(product.costPrice)}
                  <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                    ({product.marginPct}%)
                  </span>
                </p>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3">
              <span className="text-xs text-muted-foreground">Stock on Hand</span>
              <p className="mt-1 font-mono text-base font-bold text-foreground">
                {product.stockQty}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {product.unit}
                </span>
              </p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <span className="text-xs text-muted-foreground">Bin Location</span>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                {product.binLocation || '-'}
              </p>
            </div>
          </div>

          {/* Barcodes Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" />
              Barcodes
            </h3>
            {isOwner ? (
              <ManufacturerBarcodesManager
                productId={product.id}
                internalBarcode={product.internalBarcode}
                barcodes={product.barcodes || []}
              />
            ) : (
              <div className="rounded-lg border p-4 bg-card">
                <div className="text-center">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">
                    Internal Barcode
                  </span>
                  {product.internalBarcode ? (
                    <div className="mt-2 flex justify-center">
                      <BarcodeDisplay code={product.internalBarcode} height={12} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">None</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* General Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Category & Brand
              </span>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-medium">{product.categoryName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Brand:</span>
                  <span className="font-medium">{product.brandName || 'Generic / Unbranded'}</span>
                </div>
              </div>
            </div>

            {/* Alternate Numbers */}
            <div className="space-y-2 rounded-lg border p-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cross-Reference Part Numbers
              </span>
              {product.alternatePartNumbers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">None</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {product.alternatePartNumbers.map((alt) => (
                    <Badge key={alt.id} variant="outline" className="font-mono text-xs">
                      {alt.partNumber} ({alt.kind.toUpperCase()})
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Fitments */}
          {product.fitments.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Vehicle Fitments ({product.fitments.length})
              </span>
              <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                {product.fitments.map((fit) => (
                  <div key={fit.id} className="rounded border bg-muted/20 px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-foreground">
                      {fit.makeName} {fit.modelName}
                    </span>
                    {(fit.yearFrom || fit.yearTo) && (
                      <span className="ml-1 text-muted-foreground">
                        ({fit.yearFrom || '...'} - {fit.yearTo || '...'})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
