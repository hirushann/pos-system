'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Filter,
  X,
  Plus,
  Car,
  MapPin,
  Package,
  Loader2,
} from 'lucide-react';
import { formatLKR } from '@/src/lib/money';
import { searchPartsAction } from '@/src/actions/sales';
import type { CheckoutPartItem, VehicleMakeOption } from '@/src/data/checkout';
import { toast } from 'sonner';

interface CheckoutSearchPanelProps {
  initialProducts: CheckoutPartItem[];
  vehicleMakes: VehicleMakeOption[];
  onAddToCart: (product: CheckoutPartItem) => void;
  onProcessBarcodeScan?: (code: string) => Promise<boolean>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function CheckoutSearchPanel({
  initialProducts,
  vehicleMakes,
  onAddToCart,
  onProcessBarcodeScan,
  searchInputRef,
}: CheckoutSearchPanelProps) {
  const [query, setQuery] = React.useState('');
  const [selectedMakeId, setSelectedMakeId] = React.useState<number | undefined>(undefined);
  const [selectedModelId, setSelectedModelId] = React.useState<number | undefined>(undefined);
  const [selectedYear, setSelectedYear] = React.useState<string>('');
  const [showVehicleFilter, setShowVehicleFilter] = React.useState(false);

  const [products, setProducts] = React.useState<CheckoutPartItem[]>(initialProducts);
  const [isLoading, setIsLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState<number>(0);

  const resultsContainerRef = React.useRef<HTMLDivElement>(null);

  // Available models based on selected make
  const availableModels = React.useMemo(() => {
    if (!selectedMakeId) return [];
    const make = vehicleMakes.find((m) => m.id === selectedMakeId);
    return make ? make.models : [];
  }, [selectedMakeId, vehicleMakes]);

  // Debounced server search
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const yearNum = selectedYear.trim() ? parseInt(selectedYear.trim(), 10) : undefined;
        const res = await searchPartsAction({
          query: query.trim() || undefined,
          makeId: selectedMakeId,
          modelId: selectedModelId,
          year: !isNaN(yearNum as number) ? yearNum : undefined,
        });
        setProducts(res);
        setHighlightedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, selectedMakeId, selectedModelId, selectedYear]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (resultsContainerRef.current && highlightedIndex >= 0) {
      const activeEl = resultsContainerRef.current.querySelector(
        `[data-product-index="${highlightedIndex}"]`,
      );
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Check and add product to cart
  const handleAdd = React.useCallback(
    (product: CheckoutPartItem) => {
      if (product.stockQty <= 0) {
        toast.error(`"${product.partNumber}" (${product.name}) is out of stock`);
        return;
      }
      onAddToCart(product);
      toast.success(`Added ${product.partNumber} to cart`, { duration: 1500 });
      // Keep search focused and ready for next scan/search
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    },
    [onAddToCart, searchInputRef],
  );

  // Handle keyboard navigation inside search input
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < products.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const rawInput = query.trim();

      // 1. Enter first looks for an exact barcode match (one indexed query)
      if (rawInput.length > 0 && onProcessBarcodeScan) {
        const isBarcodeMatch = await onProcessBarcodeScan(rawInput);
        if (isBarcodeMatch) {
          setQuery('');
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            searchInputRef.current.select();
          }
          return;
        }
      }

      // 2. If not found as barcode, fall back to the existing search
      const trimmed = rawInput.toLowerCase();

      // 2a. Check exact match in current products list for SKU or Part Number or Alternate number
      if (trimmed.length > 0) {
        const exactMatch = products.find(
          (p) =>
            p.partNumber.toLowerCase() === trimmed ||
            p.sku.toLowerCase() === trimmed ||
            p.alternateNumbers.some((alt) => alt.toLowerCase() === trimmed),
        );

        if (exactMatch) {
          handleAdd(exactMatch);
          setQuery('');
          return;
        }
      }

      // 2. Barcode scanner fallback: if query is non-empty and not yet matched in current list,
      // search server directly for exact part/sku
      if (trimmed.length > 0) {
        setIsLoading(true);
        try {
          const directSearch = await searchPartsAction({ query: query.trim() });
          const directMatch = directSearch.find(
            (p) =>
              p.partNumber.toLowerCase() === trimmed ||
              p.sku.toLowerCase() === trimmed ||
              p.alternateNumbers.some((alt) => alt.toLowerCase() === trimmed),
          );
          if (directMatch) {
            handleAdd(directMatch);
            setQuery('');
            setIsLoading(false);
            return;
          }
        } catch {
          // ignore error and proceed to highlighted
        } finally {
          setIsLoading(false);
        }
      }

      // 3. Fallback to currently highlighted product
      if (products.length > 0 && highlightedIndex >= 0 && highlightedIndex < products.length) {
        const item = products[highlightedIndex];
        if (item) {
          handleAdd(item);
          setQuery('');
        }
      }
    }
  };

  // Clear filters
  const handleClearFilters = () => {
    setSelectedMakeId(undefined);
    setSelectedModelId(undefined);
    setSelectedYear('');
    setShowVehicleFilter(false);
  };

  const hasActiveVehicleFilter =
    selectedMakeId !== undefined || selectedModelId !== undefined || selectedYear.trim() !== '';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      {/* Search Header */}
      <div className="border-b bg-card/60 p-3 sm:p-4 space-y-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              autoFocus
              aria-label="Search spare parts"
              placeholder="Search part #, alternate #, SKU or name (e.g. BP-4521)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9 pr-9 h-10 font-mono text-sm bg-background border-input focus-visible:ring-primary"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search query"
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button
            type="button"
            variant={showVehicleFilter || hasActiveVehicleFilter ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowVehicleFilter((prev) => !prev)}
            className="h-10 gap-1.5 px-3 shrink-0"
          >
            <Car className="h-4 w-4" />
            <span className="hidden sm:inline">Vehicle Filter</span>
            {hasActiveVehicleFilter && (
              <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
            )}
          </Button>
        </div>

        {/* Collapsible Vehicle Filter Bar */}
        {showVehicleFilter && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5 animate-in fade-in-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                <span>Vehicle Fitment Narrowing (Make → Model → Year)</span>
              </span>
              {hasActiveVehicleFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-6 text-[11px] px-2 text-destructive hover:bg-destructive/10"
                >
                  Clear filter
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Make select */}
              <Select
                value={selectedMakeId ? selectedMakeId.toString() : 'all'}
                onValueChange={(val) => {
                  const id = val === 'all' ? undefined : parseInt(val, 10);
                  setSelectedMakeId(id);
                  setSelectedModelId(undefined); // Reset model
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Makes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Makes</SelectItem>
                  {vehicleMakes.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Model select */}
              <Select
                disabled={!selectedMakeId}
                value={selectedModelId ? selectedModelId.toString() : 'all'}
                onValueChange={(val) => {
                  const id = val === 'all' ? undefined : parseInt(val, 10);
                  setSelectedModelId(id);
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder={selectedMakeId ? 'All Models' : 'Select Make First'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {availableModels.map((mod) => (
                    <SelectItem key={mod.id} value={mod.id.toString()}>
                      {mod.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Year input */}
              <Input
                type="number"
                min="1980"
                max="2035"
                aria-label="Filter by vehicle year"
                placeholder="Year (e.g. 2018)"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="h-8 text-xs font-mono bg-background"
              />
            </div>
          </div>
        )}

        {/* Results summary & keyboard instruction */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
          <div className="flex items-center gap-2">
            <span>
              Showing {products.length} {products.length === 1 ? 'part' : 'parts'}
            </span>
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px]">
            <span>Use</span>
            <kbd className="rounded border bg-muted px-1 font-mono">↑</kbd>
            <kbd className="rounded border bg-muted px-1 font-mono">↓</kbd>
            <span>to navigate,</span>
            <kbd className="rounded border bg-muted px-1.5 font-mono font-bold text-foreground">
              Enter
            </kbd>
            <span>to add</span>
          </div>
        </div>
      </div>

      {/* Results List / Table */}
      <div
        ref={resultsContainerRef}
        className="flex-1 overflow-y-auto divide-y divide-border/60"
      >
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 stroke-[1.5] text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium">No matching parts found</p>
            <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
              Check spelling, try alternate numbers, or adjust the vehicle filter.
            </p>
          </div>
        ) : (
          products.map((item, index) => {
            const isHighlighted = index === highlightedIndex;
            const isOutOfStock = item.stockQty <= 0;
            const isLowStock = item.stockQty > 0 && item.stockQty <= 5;

            return (
              <div
                key={item.id}
                data-product-index={index}
                onClick={() => {
                  setHighlightedIndex(index);
                  if (!isOutOfStock) handleAdd(item);
                }}
                className={`group flex items-center justify-between gap-3 p-3 transition-colors cursor-pointer select-none ${
                  isHighlighted
                    ? 'bg-primary/10 border-l-4 border-l-primary'
                    : 'hover:bg-muted/40 border-l-4 border-l-transparent'
                } ${isOutOfStock ? 'opacity-60 bg-muted/20' : ''}`}
              >
                {/* Left product details */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-foreground tracking-tight">
                      {item.partNumber}
                    </span>
                    {item.brandName && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {item.brandName}
                      </Badge>
                    )}
                    {item.binLocation && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                        <MapPin className="h-3 w-3" />
                        <span>{item.binLocation}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-foreground line-clamp-1">{item.name}</p>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                    <span className="font-mono text-[10px]">SKU: {item.sku}</span>
                    {item.alternateNumbers.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/80 font-mono">
                        Alt: {item.alternateNumbers.slice(0, 2).join(', ')}
                        {item.alternateNumbers.length > 2 ? '...' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right stock and price */}
                <div className="flex items-center gap-4 shrink-0 text-right">
                  {/* Stock Badge */}
                  <div>
                    {isOutOfStock ? (
                      <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                        Out of stock
                      </Badge>
                    ) : (
                      <div className="text-right">
                        <span
                          className={`font-mono text-xs font-bold tabular-nums ${
                            isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {item.stockQty} {item.unit}
                        </span>
                        <div className="text-[10px] text-muted-foreground">in stock</div>
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="min-w-[90px] text-right">
                    <div className="font-mono text-base font-extrabold text-foreground tabular-nums tracking-tight">
                      {formatLKR(item.price)}
                    </div>
                  </div>

                  {/* Action icon */}
                  <Button
                    type="button"
                    size="icon"
                    variant={isHighlighted ? 'default' : 'outline'}
                    disabled={isOutOfStock}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAdd(item);
                    }}
                    className="h-8 w-8 shrink-0"
                    aria-label={`Add ${item.name} to cart`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
