'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, RotateCcw } from 'lucide-react';

interface CategoryItem {
  id: number;
  name: string;
}

interface BrandItem {
  id: number;
  name: string;
}

interface VehicleMakeItem {
  id: number;
  name: string;
}

interface VehicleModelItem {
  id: number;
  makeId: number;
  name: string;
  makeName: string;
}

interface ProductFiltersProps {
  categories: CategoryItem[];
  brands: BrandItem[];
  vehicleMakes: VehicleMakeItem[];
  vehicleModels: VehicleModelItem[];
}

export function ProductFilters({
  categories,
  brands,
  vehicleMakes,
  vehicleModels,
}: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get('q') ?? '';
  const currentCategory = searchParams.get('category') ?? 'all';
  const currentBrand = searchParams.get('brand') ?? 'all';
  const currentMake = searchParams.get('make') ?? 'all';
  const currentModel = searchParams.get('model') ?? 'all';
  const currentStock = searchParams.get('stock') ?? 'all';
  const currentActive = searchParams.get('active') ?? 'all';

  const [searchInput, setSearchInput] = React.useState(currentSearch);
  const [prevSearch, setPrevSearch] = React.useState(currentSearch);

  // Sync state if query string changed outside without triggering cascading renders
  if (prevSearch !== currentSearch) {
    setPrevSearch(currentSearch);
    setSearchInput(currentSearch);
  }

  const updateFilters = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      // Reset to page 1 on filter changes
      params.set('page', '1');

      for (const [key, val] of Object.entries(updates)) {
        if (!val || val === 'all' || val.trim() === '') {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      }

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput.trim() });
  };

  const handleClearSearch = () => {
    setSearchInput('');
    updateFilters({ q: null });
  };

  const handleMakeChange = (makeId: string) => {
    // When make changes, reset model
    updateFilters({ make: makeId, model: null });
  };

  const handleResetAll = () => {
    setSearchInput('');
    router.push(pathname);
  };

  // Filter models based on selected make
  const filteredModels = React.useMemo(() => {
    if (!currentMake || currentMake === 'all') return vehicleModels;
    const makeIdNum = parseInt(currentMake, 10);
    return vehicleModels.filter((m) => m.makeId === makeIdNum);
  }, [vehicleModels, currentMake]);

  const hasActiveFilters =
    Boolean(currentSearch) ||
    currentCategory !== 'all' ||
    currentBrand !== 'all' ||
    currentMake !== 'all' ||
    currentModel !== 'all' ||
    currentStock !== 'all' ||
    currentActive !== 'all';

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        {/* Search bar */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by part name, SKU, OEM / alternate part numbers..."
            className="h-10 pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSearchSubmit} className="h-10">
            Search
          </Button>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={handleResetAll}
              className="h-10 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Category Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
          <Select
            value={currentCategory}
            onValueChange={(val) => updateFilters({ category: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brand Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Brand</label>
          <Select
            value={currentBrand}
            onValueChange={(val) => updateFilters({ brand: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Vehicle Make Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vehicle Make</label>
          <Select
            value={currentMake}
            onValueChange={handleMakeChange}
          >
            <SelectTrigger className="w-full">
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
        </div>

        {/* Vehicle Model Filter (Cascading) */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vehicle Model</label>
          <Select
            value={currentModel}
            onValueChange={(val) => updateFilters({ model: val })}
            disabled={currentMake === 'all' && filteredModels.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={currentMake === 'all' ? 'All Models' : 'Select Model'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {filteredModels.map((m) => (
                <SelectItem key={m.id} value={m.id.toString()}>
                  {m.name} {currentMake === 'all' ? `(${m.makeName})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stock Status Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Stock Status</label>
          <Select
            value={currentStock}
            onValueChange={(val) => updateFilters({ stock: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="low">Low Stock (≤ Reorder)</SelectItem>
              <SelectItem value="out">Out of Stock (0)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active / Inactive Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <Select
            value={currentActive}
            onValueChange={(val) => updateFilters({ active: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="inactive">Inactive Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
