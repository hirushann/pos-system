'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProductListItem } from '@/src/data/products';
import { formatLKR } from '@/src/lib/money';
import {
  Pencil,
  Trash2,
  History,
  PackageOpen,
  ChevronLeft,
  ChevronRight,
  Car,
  Layers,
  Eye,
  Printer,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ProductDetailDialog } from './product-detail-dialog';

interface ProductTableProps {
  products: ProductListItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  isOwner: boolean;
  onEditProduct: (product: ProductListItem) => void;
  onDeleteProduct: (product: ProductListItem) => void;
}

export function ProductTable({
  products,
  totalCount,
  totalPages,
  currentPage,
  pageSize,
  isOwner,
  onEditProduct,
  onDeleteProduct,
}: ProductTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [detailProduct, setDetailProduct] = React.useState<ProductListItem | null>(null);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center shadow-2xs">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <PackageOpen className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-base font-semibold">No spare parts found</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          No catalog items match your search term or filter criteria. Try resetting filters or adding a new part.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-36 font-semibold">Part Number</TableHead>
              <TableHead className="min-w-48 font-semibold">Product Name &amp; SKU</TableHead>
              <TableHead className="w-28 font-semibold">Brand</TableHead>
              <TableHead className="w-32 font-semibold">Category</TableHead>
              <TableHead className="w-24 font-semibold">Bin</TableHead>
              <TableHead className="w-28 font-semibold text-center">Stock</TableHead>
              <TableHead className="w-32 text-right font-semibold">Selling Price</TableHead>
              {isOwner && (
                <>
                  <TableHead className="w-28 text-right font-semibold">Cost Price</TableHead>
                  <TableHead className="w-20 text-right font-semibold">Margin</TableHead>
                </>
              )}
              <TableHead className="w-28 text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const isOut = product.stockQty === 0;
              const isLow = product.stockQty <= product.reorderLevel && !isOut;

              return (
                <TableRow
                  key={product.id}
                  className={`transition-colors ${!product.isActive ? 'opacity-60 bg-muted/20' : ''}`}
                >
                  {/* Part Number & Alternates */}
                  <TableCell className="align-middle font-mono text-xs">
                    <div className="font-semibold text-foreground">{product.partNumber}</div>
                    {product.alternatePartNumbers.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="mt-0.5 inline-flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-3xs font-medium text-muted-foreground">
                            <Layers className="h-2.5 w-2.5" />
                            +{product.alternatePartNumbers.length} alt
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs">
                          <p className="font-semibold mb-1">Alternate / OEM Codes:</p>
                          <ul className="space-y-0.5 font-mono text-3xs">
                            {product.alternatePartNumbers.map((alt) => (
                              <li key={alt.id} className="flex justify-between gap-3">
                                <span>{alt.partNumber}</span>
                                <span className="uppercase text-muted-foreground">({alt.kind})</span>
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>

                  {/* Name & SKU */}
                  <TableCell className="align-middle">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-foreground">{product.name}</span>
                      {!product.isActive && (
                        <Badge variant="outline" className="text-3xs py-0 h-4 border-destructive/40 text-destructive">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-muted-foreground mt-0.5">
                      <span className="font-mono">SKU: {product.sku}</span>
                      <span>•</span>
                      <span>Unit: {product.unit}</span>
                      {product.fitments.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-0.5 text-3xs text-primary">
                              <Car className="h-3 w-3" />
                              {product.fitments.length} fitment{product.fitments.length > 1 ? 's' : ''}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            <p className="font-semibold mb-1">Fits Vehicles:</p>
                            <ul className="space-y-0.5 text-3xs">
                              {product.fitments.map((fit) => (
                                <li key={fit.id}>
                                  {fit.makeName} {fit.modelName}{' '}
                                  {fit.yearFrom || fit.yearTo
                                    ? `(${fit.yearFrom ?? 'Any'} - ${fit.yearTo ?? 'Now'})`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>

                  {/* Brand */}
                  <TableCell className="align-middle text-xs">
                    {product.brandName ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-2xs font-medium text-foreground">
                        {product.brandName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Category */}
                  <TableCell className="align-middle text-xs text-muted-foreground">
                    {product.categoryName}
                  </TableCell>

                  {/* Bin Location */}
                  <TableCell className="align-middle font-mono text-xs">
                    {product.binLocation ? (
                      <span className="rounded bg-accent/60 px-1.5 py-0.5 text-2xs font-medium text-accent-foreground">
                        {product.binLocation}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Stock Quantity */}
                  <TableCell className="align-middle text-center">
                    {isOut ? (
                      <Badge variant="destructive" className="font-semibold px-2">
                        Out of stock
                      </Badge>
                    ) : isLow ? (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 font-semibold px-2">
                        Low: {product.stockQty} {product.unit}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-medium px-2">
                        {product.stockQty} {product.unit}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Selling Price */}
                  <TableCell className="align-middle text-right font-mono font-medium tabular-nums text-foreground">
                    {formatLKR(product.price)}
                  </TableCell>

                  {/* Cost Price (Owner only) */}
                  {isOwner && (
                    <TableCell className="align-middle text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {product.costPrice ? formatLKR(product.costPrice) : '-'}
                    </TableCell>
                  )}

                  {/* Margin % (Owner only) */}
                  {isOwner && (
                    <TableCell className="align-middle text-right font-mono tabular-nums text-xs">
                      {product.marginPct !== undefined && product.marginPct !== null ? (
                        <span
                          className={
                            parseFloat(product.marginPct) > 20
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : parseFloat(product.marginPct) > 0
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : 'text-destructive font-medium'
                          }
                        >
                          {product.marginPct}%
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  )}

                  {/* Actions */}
                  <TableCell className="align-middle text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View Product Details & Barcodes */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailProduct(product)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            aria-label="View product details and barcodes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">View Details &amp; Barcode</TooltipContent>
                      </Tooltip>

                      {/* View Stock History */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            asChild
                          >
                            <Link href={`/inventory?productId=${product.id}`}>
                              <History className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Stock History</TooltipContent>
                      </Tooltip>

                      {/* Owner Label Print, Edit & Delete actions */}
                      {isOwner && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                asChild
                              >
                                <Link href={`/labels?productId=${product.id}`}>
                                  <Printer className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Print Barcode Labels</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEditProduct(product)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Edit Part</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteProduct(product)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Remove / Deactivate</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <div>
          Showing {products.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{' '}
          {Math.min(currentPage * pageSize, totalCount)} of {totalCount} spare parts
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="h-8 gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>

          <span className="px-2 font-medium text-foreground">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="h-8 gap-1 text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ProductDetailDialog
        product={detailProduct}
        open={!!detailProduct}
        onOpenChange={(open) => !open && setDetailProduct(null)}
        isOwner={isOwner}
        onEdit={onEditProduct}
      />
    </div>
  );
}
