'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { BarcodeLabelItem, LabelProductData } from './barcode-label-item';
import { lookupBarcode } from '@/src/actions/sales';
import { searchProductsForLabels, getInternalBarcode } from '@/src/actions/products';
import { toast } from 'sonner';
import {
  Printer,
  Search,
  Plus,
  Trash2,
  Barcode,
  Info,
  Loader2,
  Sparkles,
} from 'lucide-react';

export interface QueueItem {
  product: LabelProductData & { stockQty: number; sku: string };
  count: number;
}

interface LabelsPrintViewProps {
  shopName: string;
  initialQueueItem?: QueueItem | null;
}

export function LabelsPrintView({
  shopName,
  initialQueueItem,
}: LabelsPrintViewProps) {
  const [queue, setQueue] = React.useState<QueueItem[]>(
    initialQueueItem ? [initialQueueItem] : [],
  );
  const [layout, setLayout] = React.useState<'thermal' | 'a4'>('thermal');
  const [showPrice, setShowPrice] = React.useState<boolean>(true);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [isSearching, setIsSearching] = React.useState<boolean>(false);
  const [searchResults, setSearchResults] = React.useState<
    Array<LabelProductData & { stockQty: number; sku: string }>
  >([]);

  // Expand queue items into single label list for printing
  const flattenedLabels = React.useMemo(() => {
    const list: LabelProductData[] = [];
    for (const item of queue) {
      for (let i = 0; i < item.count; i++) {
        list.push(item.product);
      }
    }
    return list;
  }, [queue]);

  // One-off print of a single label (used by the per-row "Print 1" button).
  const [singleLabel, setSingleLabel] = React.useState<LabelProductData | null>(null);
  const printLabels = singleLabel ? [singleLabel] : flattenedLabels;

  // The print area is portalled into <body>, outside the app shell, so the shell's
  // fixed heights / scroll containers can't clip it or push labels onto extra pages.
  const isClient = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  React.useEffect(() => {
    if (!singleLabel) return;
    const reset = () => setSingleLabel(null);
    window.addEventListener('afterprint', reset, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', reset);
  }, [singleLabel]);

  const handleSearch = async (query: string) => {
    const clean = query.trim();
    if (!clean) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // 1. Try exact barcode match first
      const barcodeRes = await lookupBarcode(clean);
      if (barcodeRes.success && barcodeRes.data) {
        const p = barcodeRes.data.product;
        // A manufacturer barcode was scanned: label the part with its own internal code.
        const internalCode =
          barcodeRes.data.kind === 'internal'
            ? barcodeRes.data.code
            : await getInternalBarcode(p.id);

        const item = {
          id: p.id,
          sku: p.sku,
          name: p.name,
          partNumber: p.partNumber,
          price: p.price,
          internalBarcode: internalCode,
          stockQty: p.stockQty,
        };
        setSearchResults([item]);
        setIsSearching(false);
        return;
      }

      // 2. Fetch catalog search results
      const items = await searchProductsForLabels(clean);
      setSearchResults(items);
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const addToQueue = (product: LabelProductData & { stockQty: number; sku: string }) => {
    const existingIndex = queue.findIndex((q) => q.product.id === product.id);
    if (existingIndex >= 0) {
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, count: item.count + 1 } : item,
        ),
      );
      toast.success(`Incremented quantity for ${product.partNumber}`);
    } else {
      const defaultCount = product.stockQty > 0 ? product.stockQty : 1;
      setQueue((prev) => [...prev, { product, count: defaultCount }]);
      toast.success(`Added ${product.partNumber} (${defaultCount} labels)`);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const updateCount = (productId: number, count: number) => {
    const validCount = Math.max(1, count || 1);
    setQueue((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, count: validCount } : item,
      ),
    );
  };

  const removeFromQueue = (productId: number) => {
    setQueue((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handlePrintOne = (product: LabelProductData) => {
    setSingleLabel(product);
  };

  const handlePrint = () => {
    if (flattenedLabels.length === 0) {
      toast.error('Add at least one product to the label queue first.');
      return;
    }
    window.print();
  };

  return (
    <>
      {/* Print CSS. Label sizes are set inline on each label; this only handles the
          page size, hiding the app, and page breaks. */}
      <style>{`
        @media screen {
          .print-only-container {
            display: none !important;
          }
        }

        @media print {
          @page {
            size: ${layout === 'thermal' ? '50mm 25mm' : '210mm 297mm'};
            margin: ${layout === 'thermal' ? '0' : '10.7mm 9.75mm'};
          }
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
            color: #000 !important;
          }
          body > *:not(.print-only-container) {
            display: none !important;
          }
          .print-only-container {
            display: block !important;
          }
          .label-thermal-card {
            break-after: page;
            page-break-after: always;
          }
          .label-thermal-card:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .a4-sheet-grid {
            display: grid !important;
            grid-template-columns: repeat(5, 38.1mm);
            grid-auto-rows: 21.2mm;
          }
          .label-a4-card {
            break-inside: avoid;
          }
        }
      `}</style>

      {/* Screen View */}
      <div className="no-print space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Barcode className="h-6 w-6 text-primary" />
              Barcode Label Printing
            </h1>
            <p className="text-sm text-muted-foreground">
              Generate standardized Code 128 barcode labels for shelves, part bins, and packaging.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handlePrint}
              disabled={flattenedLabels.length === 0}
              className="gap-2 font-semibold shadow-xs"
              size="lg"
            >
              <Printer className="h-4 w-4" />
              Print {flattenedLabels.length} Label{flattenedLabels.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>

        {/* Configuration Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Layout Selection */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              1. Choose Label Format
            </Label>
            <RadioGroup
              value={layout}
              onValueChange={(val: 'thermal' | 'a4') => setLayout(val)}
              className="grid grid-cols-2 gap-2"
            >
              <label
                htmlFor="layout-thermal"
                className={`flex flex-col items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                  layout === 'thermal'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'hover:bg-muted/50'
                }`}
              >
                <RadioGroupItem value="thermal" id="layout-thermal" className="sr-only" />
                <span className="text-sm font-semibold">Thermal Roll</span>
                <span className="text-xs text-muted-foreground mt-0.5">50 × 25 mm</span>
                <span className="text-[10px] mt-1 text-muted-foreground">1 label / page</span>
              </label>

              <label
                htmlFor="layout-a4"
                className={`flex flex-col items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                  layout === 'a4'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'hover:bg-muted/50'
                }`}
              >
                <RadioGroupItem value="a4" id="layout-a4" className="sr-only" />
                <span className="text-sm font-semibold">A4 Sticker Sheet</span>
                <span className="text-xs text-muted-foreground mt-0.5">38.1 × 21.2 mm</span>
                <span className="text-[10px] mt-1 text-muted-foreground">65 labels / sheet</span>
              </label>
            </RadioGroup>
          </div>

          {/* Options */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              2. Label Options
            </Label>
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="toggle-price" className="text-sm font-medium cursor-pointer">
                  Show Selling Price
                </Label>
                <p className="text-xs text-muted-foreground">
                  Include LKR retail price on each label
                </p>
              </div>
              <Switch
                id="toggle-price"
                checked={showPrice}
                onCheckedChange={setShowPrice}
              />
            </div>

            <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Header shop name: <strong>{shopName}</strong>
              </span>
            </div>
          </div>

          {/* Queue Summary */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3 flex flex-col justify-between">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                3. Print Queue Summary
              </Label>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Unique Parts:</span>
                  <span className="font-semibold">{queue.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Labels to Print:</span>
                  <span className="font-semibold text-primary">{flattenedLabels.length}</span>
                </div>
                {layout === 'a4' && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>A4 Sheets Required:</span>
                    <span>{Math.ceil(flattenedLabels.length / 65) || 0} sheet(s)</span>
                  </div>
                )}
              </div>
            </div>

            {queue.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQueue([])}
                className="w-full text-xs text-muted-foreground hover:text-destructive"
              >
                Clear Queue
              </Button>
            )}
          </div>
        </div>

        {/* Search & Add Section */}
        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Add Parts to Queue (Search by Name, SKU, Part Number, or Scan Barcode)
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Scan barcode or type part number, name, SKU..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchResults.length > 0) {
                    addToQueue(searchResults[0]);
                  } else {
                    handleSearch(searchQuery);
                  }
                }
              }}
              className="pl-9 pr-9 font-mono"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search Dropdown / Results */}
          {searchResults.length > 0 && (
            <div className="divide-y rounded-lg border bg-background shadow-xs max-h-60 overflow-y-auto">
              {searchResults.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => addToQueue(p)}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {p.partNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-sm font-semibold">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>SKU: {p.sku}</span>
                      <span>Stock: {p.stockQty}</span>
                      <span className="font-mono font-medium">Barcode: {p.internalBarcode}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue Table */}
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
          <div className="border-b px-4 py-3 bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Parts in Queue ({queue.length})</h3>
            <span className="text-xs text-muted-foreground">
              Adjust quantity to match items needing labels
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Barcode className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-sm font-medium">No parts in printing queue</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Scan barcodes or search above to add spare parts.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-40">Part Number</TableHead>
                  <TableHead>Part Name &amp; SKU</TableHead>
                  <TableHead className="w-32">Barcode</TableHead>
                  <TableHead className="w-24 text-center">Stock</TableHead>
                  <TableHead className="w-32 text-center">Label Count</TableHead>
                  <TableHead className="w-36 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map(({ product, count }) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs font-bold text-primary align-middle">
                      {product.partNumber}
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="font-medium text-sm">{product.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        SKU: {product.sku}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground align-middle">
                      {product.internalBarcode}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs align-middle">
                      {product.stockQty}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          value={count}
                          onChange={(e) =>
                            updateCount(product.id, parseInt(e.target.value, 10))
                          }
                          className="h-8 w-20 text-center font-mono text-xs"
                          aria-label={`Label count for ${product.partNumber}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-middle whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintOne(product)}
                        className="mr-1 h-8 gap-1 text-xs"
                        title="Print just one label for this part (good for test prints)"
                        aria-label={`Print one label for ${product.partNumber}`}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print 1
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFromQueue(product.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${product.partNumber} from queue`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Live On-Screen Preview */}
        {flattenedLabels.length > 0 && (
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Live Print Preview ({layout === 'thermal' ? '50 × 25 mm Thermal' : '38.1 × 21.2 mm A4'})
              </h3>
              <span className="text-xs text-muted-foreground">
                Showing sample from {flattenedLabels.length} total labels
              </span>
            </div>

            <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/30 border border-dashed justify-center overflow-x-auto">
              {flattenedLabels.slice(0, 10).map((product, idx) => (
                <div key={idx} className="shrink-0 bg-white shadow-md rounded">
                  <BarcodeLabelItem
                    product={product}
                    shopName={shopName}
                    showPrice={showPrice}
                    layout={layout}
                  />
                </div>
              ))}
              {flattenedLabels.length > 10 && (
                <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
                  + {flattenedLabels.length - 10} more labels
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Print-Only Container (portalled to <body>, shown only by window.print()) */}
      {isClient &&
        createPortal(
          <div className="print-only-container">
            {layout === 'thermal' ? (
              <div>
                {printLabels.map((product, idx) => (
                  <BarcodeLabelItem
                    key={idx}
                    product={product}
                    shopName={shopName}
                    showPrice={showPrice}
                    layout="thermal"
                  />
                ))}
              </div>
            ) : (
              <div className="a4-sheet-grid">
                {printLabels.map((product, idx) => (
                  <BarcodeLabelItem
                    key={idx}
                    product={product}
                    shopName={shopName}
                    showPrice={showPrice}
                    layout="a4"
                  />
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
