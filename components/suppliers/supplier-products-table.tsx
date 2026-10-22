import Link from 'next/link';
import { Package } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/src/lib/money';
import type { SupplierProductRow } from '@/src/data/suppliers';

/** Products that list this supplier as their preferred supplier, with stock so reordering is easy. */
export function SupplierProductsTable({ products }: { products: SupplierProductRow[] }) {
  if (products.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
        <Package className="mb-2 h-8 w-8 text-muted-foreground/50" />
        No product has this supplier as its preferred supplier yet.
        <span className="text-xs">Set it on a product&apos;s Edit form, or with the supplier column in the product CSV.</span>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 text-xs">
            <TableHead>Product</TableHead>
            <TableHead>Part number</TableHead>
            <TableHead className="text-right">In stock</TableHead>
            <TableHead className="text-right">Reorder level</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-xs">
          {products.map((p) => {
            const out = p.stockQty === 0;
            const low = !out && p.stockQty <= p.reorderLevel;
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/products/${p.id}`} className="font-medium text-primary hover:underline">
                    {p.name}
                  </Link>
                  {!p.isActive && (
                    <Badge variant="secondary" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono">{p.partNumber}</TableCell>
                <TableCell className="text-right">
                  {out ? (
                    <Badge className="border-0 bg-red-500/15 text-red-700 dark:text-red-400">Out of stock</Badge>
                  ) : low ? (
                    <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      {p.stockQty} {p.unit} · low
                    </Badge>
                  ) : (
                    <span className="font-mono">
                      {p.stockQty} {p.unit}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">{p.reorderLevel}</TableCell>
                <TableCell className="text-right font-mono">{formatAmount(p.costPrice)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
