'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StockMovementItem } from '@/src/data/inventory';
import { formatColomboTimestamp } from '@/src/lib/dates';
import {
  History,
  Receipt,
  User,
  ArrowUpRight,
  ArrowDownRight,
  PackageOpen,
} from 'lucide-react';

interface ProductPickerItem {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  stockQty: number;
  binLocation: string | null;
  isActive: boolean;
}

interface StockHistoryViewProps {
  products: ProductPickerItem[];
  selectedProductId?: number;
  movements: StockMovementItem[];
}

export function StockHistoryView({
  products,
  selectedProductId,
  movements,
}: StockHistoryViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleProductSelect = (idStr: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('productId', idStr);
    router.push(`${pathname}?${params.toString()}`);
  };

  const selectedProduct = React.useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'opening':
        return (
          <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 font-medium">
            Opening
          </Badge>
        );
      case 'received':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium">
            Received
          </Badge>
        );
      case 'sale':
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium">
            Sale
          </Badge>
        );
      case 'void':
        return (
          <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 font-medium">
            Void Restock
          </Badge>
        );
      case 'adjustment':
        return (
          <Badge variant="secondary" className="font-medium">
            Adjustment
          </Badge>
        );
      default:
        return <Badge variant="outline">{reason}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Product Selector bar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Select Spare Part</label>
          <div className="w-full sm:w-96">
            <Select
              value={selectedProductId ? selectedProductId.toString() : ''}
              onValueChange={handleProductSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a part to inspect history..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.partNumber} - {p.name} ({p.stockQty} in stock)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedProduct && (
          <div className="flex items-center gap-4 text-xs sm:border-l sm:pl-4">
            <div>
              <span className="text-muted-foreground block text-2xs">Current Stock</span>
              <span className="font-bold text-foreground text-sm">{selectedProduct.stockQty} pcs</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-2xs">Bin Location</span>
              <span className="font-mono text-foreground">{selectedProduct.binLocation || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-2xs">SKU</span>
              <span className="font-mono text-foreground">{selectedProduct.sku}</span>
            </div>
          </div>
        )}
      </div>

      {/* Movement Ledger */}
      {!selectedProductId ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center shadow-2xs">
          <History className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold">Select a spare part</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Choose a part from the dropdown above to inspect its stock movements, sales, adjustments, and opening ledger.
          </p>
        </div>
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center shadow-2xs">
          <PackageOpen className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold">No stock movements recorded</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No stock events have been logged for this product yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-48 font-semibold">Date &amp; Time (Colombo)</TableHead>
                <TableHead className="w-28 font-semibold">Reason</TableHead>
                <TableHead className="w-28 text-center font-semibold">Change</TableHead>
                <TableHead className="w-28 text-center font-semibold">Qty After</TableHead>
                <TableHead className="w-36 font-semibold">Recorded By</TableHead>
                <TableHead className="min-w-48 font-semibold">Note / Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const isPositive = m.changeQty > 0;

                return (
                  <TableRow key={m.id} className="transition-colors">
                    {/* Date & Time */}
                    <TableCell className="align-middle font-mono text-xs text-muted-foreground">
                      {formatColomboTimestamp(m.createdAt)}
                    </TableCell>

                    {/* Reason */}
                    <TableCell className="align-middle">
                      {getReasonBadge(m.reason)}
                    </TableCell>

                    {/* Change */}
                    <TableCell className="align-middle text-center font-mono font-semibold text-xs">
                      <div className="inline-flex items-center gap-1">
                        {isPositive ? (
                          <>
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{m.changeQty}
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                            <span className="text-destructive">{m.changeQty}</span>
                          </>
                        )}
                      </div>
                    </TableCell>

                    {/* Qty After */}
                    <TableCell className="align-middle text-center font-mono font-medium text-xs text-foreground">
                      {m.qtyAfter} pcs
                    </TableCell>

                    {/* User */}
                    <TableCell className="align-middle text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{m.createdByName}</span>
                      </div>
                    </TableCell>

                    {/* Note / Receipt */}
                    <TableCell className="align-middle text-xs">
                      <div className="space-y-0.5">
                        {m.receiptNumber && (
                          <div className="flex items-center gap-1 font-mono text-2xs text-primary">
                            <Receipt className="h-3 w-3" />
                            <span>Receipt #{m.receiptNumber}</span>
                          </div>
                        )}
                        {m.note ? (
                          <div className="text-muted-foreground">{m.note}</div>
                        ) : !m.receiptNumber ? (
                          <span className="text-muted-foreground">-</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
