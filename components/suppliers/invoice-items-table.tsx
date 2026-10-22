import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAmount } from '@/src/lib/money';
import type { InvoiceItemRow } from '@/src/data/suppliers';

export function InvoiceItemsTable({ items }: { items: InvoiceItemRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 text-xs">
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Returned</TableHead>
            <TableHead className="text-right">Unit cost</TableHead>
            <TableHead className="text-right">Line total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-xs">
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                <p className="font-medium">{i.productName}</p>
                <p className="font-mono text-muted-foreground">{i.partNumber}</p>
              </TableCell>
              <TableCell className="text-right font-mono">{i.quantity}</TableCell>
              <TableCell className="text-right font-mono">
                {i.returnedQty > 0 ? <span className="text-rose-600 dark:text-rose-400">{i.returnedQty}</span> : '-'}
              </TableCell>
              <TableCell className="text-right font-mono">{formatAmount(i.unitCost)}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{formatAmount(i.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
