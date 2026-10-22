'use client';

import * as React from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPurchaseHintAction, searchPurchaseProductsAction } from '@/src/actions/suppliers';
import { formatAmount } from '@/src/lib/money';
import type { PurchaseHint, PurchaseProductOption } from '@/src/data/suppliers';

export interface DraftLine {
  key: number;
  product: PurchaseProductOption | null;
  quantity: string;
  unitCost: string;
  hint: PurchaseHint | null;
}

let nextKey = 1;
export const newLine = (): DraftLine => ({ key: nextKey++, product: null, quantity: '1', unitCost: '', hint: null });

export function lineTotal(l: DraftLine): Decimal {
  const q = Number(l.quantity);
  if (!l.product || !Number.isInteger(q) || q < 1 || !/^\d+(\.\d{1,2})?$/.test(l.unitCost.trim())) return new Decimal(0);
  return new Decimal(l.unitCost.trim()).times(q);
}

export function linesTotal(lines: DraftLine[]): Decimal {
  return lines.reduce((acc, l) => acc.plus(lineTotal(l)), new Decimal(0));
}

function ProductSearch({ onPick, supplierId }: { onPick: (p: PurchaseProductOption) => void; supplierId: number | null }) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<PurchaseProductOption[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      const t = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(t);
    }
    let live = true;
    const t = setTimeout(async () => {
      const res = await searchPurchaseProductsAction(query, supplierId);
      if (live) {
        setResults(res);
        setOpen(true);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, supplierId]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search product name, part no. or SKU..."
        className="h-9 pl-8 text-sm"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.partNumber}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.stockQty} in stock</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Products received on a supplier invoice (optional). Shows what this supplier charged last
 * time and the cheapest other supplier, so the same part can be compared across suppliers.
 */
export function InvoiceItemsEditor({
  supplierId,
  lines,
  setLines,
  error,
}: {
  supplierId: number | null;
  lines: DraftLine[];
  setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>;
  error?: string | null;
}) {
  const patch = (key: number, changes: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  const update = patch;
  const remove = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  const pick = async (key: number, product: PurchaseProductOption) => {
    patch(key, { product, hint: null, unitCost: Number(product.costPrice) > 0 ? product.costPrice : '' });
    if (!supplierId) return;
    const hint = await getPurchaseHintAction(product.id, supplierId);
    const suggested = hint.fromSupplier?.unitCost ?? (Number(hint.currentCost) > 0 ? hint.currentCost : '');
    patch(key, { hint, unitCost: suggested });
  };

  return (
    <div className="space-y-2">
      {lines.map((l) => (
        <div key={l.key} className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
          {!l.product ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ProductSearch supplierId={supplierId} onPick={(p) => pick(l.key, p)} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(l.key)} aria-label="Remove line">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{l.product.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {l.product.partNumber} · {l.product.stockQty} {l.product.unit} in stock now
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(l.key)} aria-label="Remove line">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-[90px_1fr_1fr] items-center gap-2">
                <Input
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                  inputMode="numeric"
                  aria-label="Quantity"
                  placeholder="Qty"
                  className="h-9 font-mono text-sm"
                />
                <Input
                  value={l.unitCost}
                  onChange={(e) => update(l.key, { unitCost: e.target.value })}
                  inputMode="decimal"
                  aria-label="Unit cost"
                  placeholder="Unit cost"
                  className="h-9 font-mono text-sm"
                />
                <p className="text-right font-mono text-sm font-semibold">Rs. {formatAmount(lineTotal(l))}</p>
              </div>
              {l.hint && (l.hint.fromSupplier || l.hint.bestOther) && (
                <p className="text-[11px] text-muted-foreground">
                  {l.hint.fromSupplier && (
                    <>Last from this supplier: <strong className="text-foreground">Rs. {formatAmount(l.hint.fromSupplier.unitCost)}</strong> ({l.hint.fromSupplier.date}). </>
                  )}
                  {l.hint.bestOther && (
                    <>
                      Elsewhere: <strong className="text-foreground">{l.hint.bestOther.supplierName}</strong> Rs.{' '}
                      {formatAmount(l.hint.bestOther.unitCost)}.
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((prev) => [...prev, newLine()])}>
        <Plus className="h-4 w-4" /> Add product
      </Button>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
