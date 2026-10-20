'use client';

import * as React from 'react';
import { normalizeUnit } from '@/src/lib/unit';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductListItem } from '@/src/data/products';
import { createProduct, updateProduct } from '@/src/actions/products';
import { toast } from 'sonner';
import { ManufacturerBarcodesManager } from './manufacturer-barcodes-manager';
import {
  Plus,
  Trash2,
  Loader2,
  PackagePlus,
  Pencil,
  Info,
} from 'lucide-react';

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

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductListItem | null;
  categories: CategoryItem[];
  brands: BrandItem[];
  vehicleMakes: VehicleMakeItem[];
  vehicleModels: VehicleModelItem[];
  onOpenMetadata?: (tab: 'category' | 'brand' | 'make' | 'model') => void;
  onSuccess?: () => void;
}

interface AltPartNumberState {
  partNumber: string;
  kind: 'oem' | 'alternate';
}

interface FitmentState {
  makeId: number;
  vehicleModelId: number;
  yearFrom: string;
  yearTo: string;
}

interface ProductFormContentProps {
  product?: ProductListItem | null;
  categories: CategoryItem[];
  brands: BrandItem[];
  vehicleMakes: VehicleMakeItem[];
  vehicleModels: VehicleModelItem[];
  onOpenMetadata?: (tab: 'category' | 'brand' | 'make' | 'model') => void;
  onClose: () => void;
  onSuccess?: () => void;
}

function ProductFormContent({
  product,
  categories,
  brands,
  vehicleMakes,
  vehicleModels,
  onOpenMetadata,
  onClose,
  onSuccess,
}: ProductFormContentProps) {
  const isEdit = Boolean(product);

  // Form states initialized directly from product props
  const [name, setName] = React.useState(product ? product.name : '');
  const [partNumber, setPartNumber] = React.useState(product ? product.partNumber : '');
  const [categoryId, setCategoryId] = React.useState(
    product ? product.categoryId.toString() : categories[0]?.id ? categories[0].id.toString() : '',
  );
  const [brandId, setBrandId] = React.useState(
    product ? (product.brandId ? product.brandId.toString() : 'none') : 'none',
  );
  const [description, setDescription] = React.useState(product ? product.description || '' : '');
  const [unit, setUnit] = React.useState(product ? product.unit || 'pcs' : 'pcs');
  const [binLocation, setBinLocation] = React.useState(product ? product.binLocation || '' : '');
  const [costPrice, setCostPrice] = React.useState(product ? product.costPrice || '0.00' : '0.00');
  const [price, setPrice] = React.useState(product ? product.price : '0.00');
  const [reorderLevel, setReorderLevel] = React.useState(
    product ? product.reorderLevel.toString() : '5',
  );
  const [openingStock, setOpeningStock] = React.useState(
    product ? product.stockQty.toString() : '0',
  );
  const [isActive, setIsActive] = React.useState(product ? product.isActive : true);

  // Dynamic lists
  const [alternateNumbers, setAlternateNumbers] = React.useState<AltPartNumberState[]>(
    product
      ? product.alternatePartNumbers.map((a) => ({
          partNumber: a.partNumber,
          kind: a.kind as 'oem' | 'alternate',
        }))
      : [],
  );

  const [fitments, setFitments] = React.useState<FitmentState[]>(
    product
      ? product.fitments.map((f) => ({
          makeId: f.makeId,
          vehicleModelId: f.modelId,
          yearFrom: f.yearFrom ? f.yearFrom.toString() : '',
          yearTo: f.yearTo ? f.yearTo.toString() : '',
        }))
      : [],
  );

  // Submission & errors
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Alternate part numbers handlers
  const handleAddAltNumber = () => {
    setAlternateNumbers([...alternateNumbers, { partNumber: '', kind: 'alternate' }]);
  };

  const handleRemoveAltNumber = (index: number) => {
    setAlternateNumbers(alternateNumbers.filter((_, i) => i !== index));
  };

  const handleUpdateAltNumber = (index: number, updates: Partial<AltPartNumberState>) => {
    setAlternateNumbers(
      alternateNumbers.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  };

  // Fitments handlers
  const handleAddFitment = () => {
    const defaultMake = vehicleMakes[0]?.id || 0;
    const defaultModel = vehicleModels.find((m) => m.makeId === defaultMake)?.id || 0;
    setFitments([
      ...fitments,
      {
        makeId: defaultMake,
        vehicleModelId: defaultModel,
        yearFrom: '',
        yearTo: '',
      },
    ]);
  };

  const handleRemoveFitment = (index: number) => {
    setFitments(fitments.filter((_, i) => i !== index));
  };

  const handleUpdateFitment = (index: number, updates: Partial<FitmentState>) => {
    setFitments(
      fitments.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        if (updates.makeId && updates.makeId !== item.makeId) {
          const firstModel = vehicleModels.find((m) => m.makeId === updates.makeId)?.id || 0;
          updated.vehicleModelId = firstModel;
        }
        return updated;
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const catIdNum = parseInt(categoryId, 10);
    if (!catIdNum) {
      setFieldErrors({ categoryId: 'Please select a valid category' });
      return;
    }

    const brandIdNum = brandId !== 'none' ? parseInt(brandId, 10) : undefined;
    const reorderLevelNum = parseInt(reorderLevel, 10) || 0;
    const openingStockNum = parseInt(openingStock, 10) || 0;

    // Filter valid alternate numbers
    const validAlts = alternateNumbers
      .filter((a) => a.partNumber.trim().length > 0)
      .map((a) => ({
        partNumber: a.partNumber.trim(),
        kind: a.kind,
      }));

    // Filter valid fitments
    const validFitments = fitments
      .filter((f) => f.vehicleModelId > 0)
      .map((f) => ({
        vehicleModelId: f.vehicleModelId,
        yearFrom: f.yearFrom ? parseInt(f.yearFrom, 10) : null,
        yearTo: f.yearTo ? parseInt(f.yearTo, 10) : null,
      }));

    setIsSubmitting(true);

    try {
      if (isEdit && product) {
        const res = await updateProduct(product.id, {
          name: name.trim(),
          partNumber: partNumber.trim(),
          categoryId: catIdNum,
          brandId: brandIdNum,
          description: description.trim() || null,
          unit: normalizeUnit(unit),
          binLocation: binLocation.trim() || null,
          costPrice: costPrice.trim() || '0.00',
          price: price.trim() || '0.00',
          reorderLevel: reorderLevelNum,
          isActive,
          alternatePartNumbers: validAlts,
          fitments: validFitments,
        });

        if (!res.success) {
          if (res.fieldErrors) setFieldErrors(res.fieldErrors);
          setFormError(res.error || 'Failed to update product');
          return;
        }

        toast.success(`Product "${name.trim()}" updated successfully`);
      } else {
        const res = await createProduct({
          name: name.trim(),
          partNumber: partNumber.trim(),
          categoryId: catIdNum,
          brandId: brandIdNum,
          description: description.trim() || null,
          unit: normalizeUnit(unit),
          binLocation: binLocation.trim() || null,
          costPrice: costPrice.trim() || '0.00',
          price: price.trim() || '0.00',
          reorderLevel: reorderLevelNum,
          openingStock: openingStockNum,
          isActive,
          alternatePartNumbers: validAlts,
          fitments: validFitments,
        });

        if (!res.success) {
          if (res.fieldErrors) setFieldErrors(res.fieldErrors);
          setFormError(res.error || 'Failed to create product');
          return;
        }

        toast.success(`Product "${name.trim()}" created successfully`);
      }

      onClose();
      onSuccess?.();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setFormError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          {isEdit ? (
            <>
              <Pencil className="h-5 w-5 text-primary" />
              <span>Edit Product: {product?.name}</span>
            </>
          ) : (
            <>
              <PackagePlus className="h-5 w-5 text-primary" />
              <span>Add New Spare Part Product</span>
            </>
          )}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </div>
        )}

        {/* Section 1: Basic Information */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* SKU: generated automatically, never typed. It is also the barcode. */}
            <div className="space-y-1">
              <Label htmlFor="prod-sku">SKU / Barcode</Label>
              <Input
                id="prod-sku"
                value={isEdit && product ? product.sku : ''}
                placeholder="Generated when saved"
                readOnly
                disabled
                className="bg-muted font-mono"
              />
              <p className="text-2xs text-muted-foreground">
                {isEdit
                  ? 'Fixed. The SKU is also the barcode.'
                  : 'A unique number is created when you save. It is also the barcode.'}
              </p>
            </div>

            {/* Part Number */}
            <div className="space-y-1">
              <Label htmlFor="prod-partno">
                Part Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prod-partno"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="e.g. 04465-02220"
                required
              />
              {fieldErrors.partNumber && (
                <p className="text-xs font-medium text-destructive">{fieldErrors.partNumber}</p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="prod-name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prod-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Front Brake Pad Set"
                required
              />
              {fieldErrors.name && (
                <p className="text-xs font-medium text-destructive">{fieldErrors.name}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Category */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="prod-cat">
                  Category <span className="text-destructive">*</span>
                </Label>
                {onOpenMetadata && (
                  <button
                    type="button"
                    onClick={() => onOpenMetadata('category')}
                    className="shrink-0 whitespace-nowrap text-2xs text-primary hover:underline"
                  >
                    + New
                  </button>
                )}
              </div>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="prod-cat" className="w-full">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.categoryId && (
                <p className="text-xs font-medium text-destructive">{fieldErrors.categoryId}</p>
              )}
            </div>

            {/* Brand */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="prod-brand">Brand / Maker</Label>
                {onOpenMetadata && (
                  <button
                    type="button"
                    onClick={() => onOpenMetadata('brand')}
                    className="shrink-0 whitespace-nowrap text-2xs text-primary hover:underline"
                  >
                    + New
                  </button>
                )}
              </div>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="prod-brand" className="w-full">
                  <SelectValue placeholder="Select Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Generic</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit */}
            <div className="space-y-1">
              <Label htmlFor="prod-unit">Unit</Label>
              <Input
                id="prod-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs, set, pair"
              />
              <p className="text-[11px] text-muted-foreground">A label only. Stock quantity is set separately.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Bin Location */}
            <div className="space-y-1">
              <Label htmlFor="prod-bin">Bin Location</Label>
              <Input
                id="prod-bin"
                value={binLocation}
                onChange={(e) => setBinLocation(e.target.value)}
                placeholder="e.g. Shelf A-04, Rack 2"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="prod-desc">Description / Notes</Label>
              <Textarea
                id="prod-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Specs, warranty details, material..."
                className="min-h-20"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Pricing & Stock Controls */}
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold text-foreground">Pricing &amp; Stock</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {/* Cost Price (Owner only) */}
            <div className="space-y-1">
              <Label htmlFor="prod-cost">
                Cost Price (Rs.) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prod-cost"
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
              {fieldErrors.costPrice && (
                <p className="text-xs font-medium text-destructive">{fieldErrors.costPrice}</p>
              )}
            </div>

            {/* Selling Price */}
            <div className="space-y-1">
              <Label htmlFor="prod-price">
                Selling Price (Rs.) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prod-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
              {fieldErrors.price && (
                <p className="text-xs font-medium text-destructive">{fieldErrors.price}</p>
              )}
            </div>

            {/* Reorder Level */}
            <div className="space-y-1">
              <Label htmlFor="prod-reorder">Reorder Alert Level</Label>
              <Input
                id="prod-reorder"
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                required
              />
            </div>

            {/* Opening Stock (Create only) or Current Stock (Edit view) */}
            <div className="space-y-1">
              {isEdit ? (
                <>
                  <Label htmlFor="prod-stock-ro">Current Stock</Label>
                  <Input
                    id="prod-stock-ro"
                    value={`${product?.stockQty} ${product?.unit}`}
                    disabled
                    className="bg-muted font-semibold"
                  />
                  <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                    <Info className="h-3 w-3" /> Change via Inventory adjustment
                  </p>
                </>
              ) : (
                <>
                  <Label htmlFor="prod-open-stock">Opening Stock</Label>
                  <Input
                    id="prod-open-stock"
                    type="number"
                    min="0"
                    value={openingStock}
                    onChange={(e) => setOpeningStock(e.target.value)}
                    required
                  />
                  <p className="text-2xs text-muted-foreground">Logged as &apos;opening&apos; movement</p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="prod-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <Label htmlFor="prod-active" className="cursor-pointer font-normal">
              Active in Catalog (Available for Sale and Search)
            </Label>
          </div>
        </div>

        {/* Section: Barcodes (Internal & Manufacturer) in edit mode */}
        {isEdit && product && (
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Barcodes</h3>
              <p className="text-xs text-muted-foreground">
                Primary internal barcode for POS scanners and label printing, plus manufacturer codes.
              </p>
            </div>
            <ManufacturerBarcodesManager
              productId={product.id}
              internalBarcode={product.internalBarcode}
              barcodes={product.barcodes || []}
            />
          </div>
        )}

        {/* Section 3: Alternate / OEM Part Numbers */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Alternate &amp; OEM Part Numbers</h3>
              <p className="text-xs text-muted-foreground">
                Cross-reference codes to help cashiers find this part instantly.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddAltNumber}
              className="gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Code
            </Button>
          </div>

          {alternateNumbers.length === 0 ? (
            <p className="rounded-lg border border-dashed py-3 text-center text-xs text-muted-foreground">
              No alternate part numbers added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {alternateNumbers.map((alt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={alt.partNumber}
                    onChange={(e) =>
                      handleUpdateAltNumber(idx, { partNumber: e.target.value })
                    }
                    placeholder="e.g. 04465-YZZE1"
                    className="flex-1"
                  />
                  <Select
                    value={alt.kind}
                    onValueChange={(val: 'oem' | 'alternate') =>
                      handleUpdateAltNumber(idx, { kind: val })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alternate">Alternate</SelectItem>
                      <SelectItem value="oem">OEM</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAltNumber(idx)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Vehicle Fitments */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Vehicle Fitments</h3>
              <p className="text-xs text-muted-foreground">
                Vehicles and model year ranges compatible with this spare part.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFitment}
              className="gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Fitment
            </Button>
          </div>

          {fitments.length === 0 ? (
            <p className="rounded-lg border border-dashed py-3 text-center text-xs text-muted-foreground">
              No vehicle fitments added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {fitments.map((fit, idx) => {
                const modelsForMake = vehicleModels.filter((m) => m.makeId === fit.makeId);
                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5 sm:flex-row sm:items-center"
                  >
                    {/* Make */}
                    <div className="flex-1">
                      <Select
                        value={fit.makeId ? fit.makeId.toString() : ''}
                        onValueChange={(val) =>
                          handleUpdateFitment(idx, { makeId: parseInt(val, 10) })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select Make" />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicleMakes.map((m) => (
                            <SelectItem key={m.id} value={m.id.toString()}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Model */}
                    <div className="flex-1">
                      <Select
                        value={fit.vehicleModelId ? fit.vehicleModelId.toString() : ''}
                        onValueChange={(val) =>
                          handleUpdateFitment(idx, { vehicleModelId: parseInt(val, 10) })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select Model" />
                        </SelectTrigger>
                        <SelectContent>
                          {modelsForMake.map((m) => (
                            <SelectItem key={m.id} value={m.id.toString()}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Years */}
                    <div className="flex items-center gap-1.5 sm:w-44">
                      <Input
                        type="number"
                        placeholder="From"
                        value={fit.yearFrom}
                        onChange={(e) =>
                          handleUpdateFitment(idx, { yearFrom: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="number"
                        placeholder="To"
                        value={fit.yearTo}
                        onChange={(e) =>
                          handleUpdateFitment(idx, { yearTo: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFitment(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEdit ? (
              'Update Product'
            ) : (
              'Create Product'
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  brands,
  vehicleMakes,
  vehicleModels,
  onOpenMetadata,
  onSuccess,
}: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {open && (
          <ProductFormContent
            key={product ? `edit-${product.id}` : 'create'}
            product={product}
            categories={categories}
            brands={brands}
            vehicleMakes={vehicleMakes}
            vehicleModels={vehicleModels}
            onOpenMetadata={onOpenMetadata}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
