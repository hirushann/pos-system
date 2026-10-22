import Link from 'next/link';
import { Truck } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/src/lib/money';
import type { ProductSupplierHistory } from '@/src/data/suppliers';

/** Owner-only: who this part was bought from, at what price. Cheapest last price first. */
export function ProductSuppliersCard({ history }: { history: ProductSupplierHistory[] }) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Truck className="h-4 w-4 text-muted-foreground" />
          Bought from ({history.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Compare what each supplier charged. Based on supplier invoices that list this product.
        </p>
      </div>
      {history.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          No supplier invoice lists this product yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs">
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Last cost</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead className="text-right">Bought</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead>Last bought</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {history.map((h, i) => (
                <TableRow key={h.supplierId}>
                  <TableCell>
                    <Link href={`/suppliers/${h.supplierId}`} className="font-medium text-primary hover:underline">
                      {h.supplierName}
                    </Link>
                    {i === 0 && history.length > 1 && (
                      <Badge className="ml-2 border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        Cheapest
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatAmount(h.lastUnitCost)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(h.averageCost)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {h.quotedPrice ? formatAmount(h.quotedPrice) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{h.qtyBought}</TableCell>
                  <TableCell className="text-right font-mono">
                    {h.qtyReturned > 0 ? <span className="text-rose-600 dark:text-rose-400">{h.qtyReturned}</span> : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{h.lastDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
