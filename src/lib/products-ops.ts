/*
 * Logic behind the server actions in src/actions/products.ts. This is deliberately NOT a
 * 'use server' file: every export of such a file is callable from the browser, and the
 * execute* functions here take the acting user as an argument.
 */

import { db } from '@/src/db';
import {
  products,
  productFitments,
  productPartNumbers,
  productBarcodes,
  stockMovements,
  saleItems,
  categories,
  brands,
  vehicleMakes,
  vehicleModels,
  suppliers,
} from '@/src/db/schema';
import { requireUser, assertOwner } from '@/src/lib/auth-guards';
import { normalizeUnit } from '@/src/lib/unit';
import { eq, and, sql, count, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDbErrorKind, mapDatabaseError } from '@/src/lib/db-errors';
import {
  generateUniqueProductCode,
  getOrCreateInternalBarcode,
  isSkuOrCodeCollision,
} from '@/src/lib/internal-barcode';

const nameInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
});

const vehicleModelInputSchema = z.object({
  makeId: z.number().int().positive('Valid vehicle make is required'),
  name: z.string().trim().min(1, 'Model name is required').max(100, 'Model name cannot exceed 100 characters'),
});

const productIdInputSchema = z.object({
  productId: z.number().int().positive('Valid product ID is required'),
});

const fitmentSchema = z.object({
  vehicleModelId: z.number().int().positive('Vehicle model is required'),
  yearFrom: z.number().int().min(1900, 'Year must be 1900 or later').max(2100).nullable().optional(),
  yearTo: z.number().int().min(1900, 'Year must be 1900 or later').max(2100).nullable().optional(),
}).refine(
  (data) => !data.yearFrom || !data.yearTo || data.yearFrom <= data.yearTo,
  { message: 'Year From must be less than or equal to Year To', path: ['yearTo'] }
);

const alternateNumberSchema = z.object({
  partNumber: z.string().trim().min(1, 'Alternate part number is required'),
  kind: z.enum(['oem', 'alternate']),
});

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  partNumber: z.string().trim().min(1, 'Part number is required'),
  categoryId: z.number().int().positive('Category is required'),
  brandId: z.number().int().positive().nullable().optional(),
  preferredSupplierId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  unit: z.string().trim().min(1).default('pcs').transform(normalizeUnit),
  binLocation: z.string().trim().nullable().optional(),
  costPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Cost price must be a valid non-negative amount'),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Selling price must be a valid non-negative amount'),
  reorderLevel: z.number().int().min(0, 'Reorder level cannot be negative').default(0),
  openingStock: z.number().int().min(0, 'Opening stock cannot be negative').default(0),
  isActive: z.boolean().default(true),
  alternatePartNumbers: z.array(alternateNumberSchema).default([]),
  fitments: z.array(fitmentSchema).default([]),
});

const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  partNumber: z.string().trim().min(1, 'Part number is required'),
  categoryId: z.number().int().positive('Category is required'),
  brandId: z.number().int().positive().nullable().optional(),
  preferredSupplierId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  unit: z.string().trim().min(1).default('pcs').transform(normalizeUnit),
  binLocation: z.string().trim().nullable().optional(),
  costPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Cost price must be a valid non-negative amount'),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Selling price must be a valid non-negative amount'),
  reorderLevel: z.number().int().min(0, 'Reorder level cannot be negative').default(0),
  isActive: z.boolean().default(true),
  alternatePartNumbers: z.array(alternateNumberSchema).default([]),
  fitments: z.array(fitmentSchema).default([]),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

interface ServerActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
}

/** Runs `work` again with a fresh code if two products were created at the exact same moment. */
async function retryOnCodeCollision<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (!isSkuOrCodeCollision(err) || attempt >= 5) throw err;
    }
  }
}

export async function createProduct(
  rawInput: CreateProductInput,
): Promise<ServerActionResult<{ id: number }>> {
  const { user } = await requireUser();
  assertOwner(user);
  return executeCreateProduct(rawInput, user);
}

export async function executeCreateProduct(
  rawInput: CreateProductInput,
  user: { id: string },
): Promise<ServerActionResult<{ id: number }>> {
  const parsed = createProductSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'form';
      fieldErrors[field] = issue.message;
    }
    return { success: false, error: 'Validation failed', fieldErrors };
  }

  const data = parsed.data;

  try {
    const newId = await retryOnCodeCollision(() => db.transaction(async (tx) => {
      // 1. Generate a unique SKU. It is also the product's barcode.
      const sku = await generateUniqueProductCode(tx);

      // 2. Insert product
      const [inserted] = await tx
        .insert(products)
        .values({
          sku,
          name: data.name,
          partNumber: data.partNumber,
          categoryId: data.categoryId,
          brandId: data.brandId || null,
          preferredSupplierId: data.preferredSupplierId || null,
          description: data.description || null,
          unit: data.unit || 'pcs',
          binLocation: data.binLocation || null,
          costPrice: data.costPrice,
          price: data.price,
          stockQty: data.openingStock,
          reorderLevel: data.reorderLevel,
          isActive: data.isActive,
        })
        .$returningId();

      // 3. The SKU is the product's internal barcode
      await tx.insert(productBarcodes).values({ productId: inserted.id, code: sku, kind: 'internal' });

      // 3. Insert opening stock movement if openingStock > 0
      if (data.openingStock > 0) {
        await tx.insert(stockMovements).values({
          productId: inserted.id,
          changeQty: data.openingStock,
          qtyAfter: data.openingStock,
          reason: 'opening',
          note: 'Initial opening stock',
          createdBy: user.id,
        });
      }

      // 3. Insert alternate part numbers
      if (data.alternatePartNumbers && data.alternatePartNumbers.length > 0) {
        const seen = new Set<string>();
        const toInsert = [];
        for (const alt of data.alternatePartNumbers) {
          const trimmed = alt.partNumber.trim();
          if (trimmed && !seen.has(trimmed.toLowerCase())) {
            seen.add(trimmed.toLowerCase());
            toInsert.push({
              productId: inserted.id,
              partNumber: trimmed,
              kind: alt.kind,
            });
          }
        }
        if (toInsert.length > 0) {
          await tx.insert(productPartNumbers).values(toInsert);
        }
      }

      // 4. Insert fitments
      if (data.fitments && data.fitments.length > 0) {
        const seenFitments = new Set<string>();
        const toInsert = [];
        for (const fit of data.fitments) {
          const key = `${fit.vehicleModelId}_${fit.yearFrom ?? 'null'}_${fit.yearTo ?? 'null'}`;
          if (!seenFitments.has(key)) {
            seenFitments.add(key);
            toInsert.push({
              productId: inserted.id,
              vehicleModelId: fit.vehicleModelId,
              yearFrom: fit.yearFrom || null,
              yearTo: fit.yearTo || null,
            });
          }
        }
        if (toInsert.length > 0) {
          await tx.insert(productFitments).values(toInsert);
        }
      }

      return inserted.id;
    }));

    try {
      revalidatePath('/products');
      revalidatePath('/inventory');
    } catch {
      // Ignore outside Next.js request context
    }
    return { success: true, data: { id: newId }, message: 'Product created successfully' };
  } catch (err: unknown) {
    const dbErr = err as { message?: string };
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: 'Could not generate a unique SKU. Please try again.' };
    }
    if (getDbErrorKind(err) === 'check') {
      return { success: false, error: 'Database check constraint failed: please check your numbers (prices/stock cannot be negative).' };
    }
    if (getDbErrorKind(err) === 'foreign_key') {
      return { success: false, error: 'Invalid reference: selected category, brand, or model does not exist.' };
    }
    return { success: false, error: dbErr.message || 'Failed to create product' };
  }
}

export async function updateProduct(
  id: number,
  rawInput: UpdateProductInput,
): Promise<ServerActionResult<{ id: number }>> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = updateProductSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'form';
      fieldErrors[field] = issue.message;
    }
    return { success: false, error: 'Validation failed', fieldErrors };
  }

  const data = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // 1. Update product base fields (stockQty is strictly untouched!)
      await tx
        .update(products)
        .set({
          name: data.name,
          partNumber: data.partNumber,
          categoryId: data.categoryId,
          brandId: data.brandId || null,
          preferredSupplierId: data.preferredSupplierId || null,
          description: data.description || null,
          unit: data.unit || 'pcs',
          binLocation: data.binLocation || null,
          costPrice: data.costPrice,
          price: data.price,
          reorderLevel: data.reorderLevel,
          isActive: data.isActive,
        })
        .where(eq(products.id, id));

      // 2. Replace alternate part numbers
      await tx.delete(productPartNumbers).where(eq(productPartNumbers.productId, id));
      if (data.alternatePartNumbers && data.alternatePartNumbers.length > 0) {
        const seen = new Set<string>();
        const toInsert = [];
        for (const alt of data.alternatePartNumbers) {
          const trimmed = alt.partNumber.trim();
          if (trimmed && !seen.has(trimmed.toLowerCase())) {
            seen.add(trimmed.toLowerCase());
            toInsert.push({
              productId: id,
              partNumber: trimmed,
              kind: alt.kind,
            });
          }
        }
        if (toInsert.length > 0) {
          await tx.insert(productPartNumbers).values(toInsert);
        }
      }

      // 3. Replace fitments
      await tx.delete(productFitments).where(eq(productFitments.productId, id));
      if (data.fitments && data.fitments.length > 0) {
        const seenFitments = new Set<string>();
        const toInsert = [];
        for (const fit of data.fitments) {
          const key = `${fit.vehicleModelId}_${fit.yearFrom ?? 'null'}_${fit.yearTo ?? 'null'}`;
          if (!seenFitments.has(key)) {
            seenFitments.add(key);
            toInsert.push({
              productId: id,
              vehicleModelId: fit.vehicleModelId,
              yearFrom: fit.yearFrom || null,
              yearTo: fit.yearTo || null,
            });
          }
        }
        if (toInsert.length > 0) {
          await tx.insert(productFitments).values(toInsert);
        }
      }
    });

    revalidatePath('/products');
    revalidatePath('/inventory');
    return { success: true, data: { id }, message: 'Product updated successfully' };
  } catch (err: unknown) {
    const dbErr = err as { message?: string };
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: 'A unique constraint was violated.' };
    }
    if (getDbErrorKind(err) === 'check') {
      return { success: false, error: 'Database check constraint failed: values must be valid.' };
    }
    return { success: false, error: dbErr.message || 'Failed to update product' };
  }
}

export async function deleteOrDeactivateProduct(
  rawProductId: number,
): Promise<ServerActionResult<{ actionTaken: 'deactivated' | 'deleted' }>> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = productIdInputSchema.safeParse({ productId: rawProductId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid product ID',
    };
  }

  const { productId } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Check if product has sale items
      const salesCount = await tx
        .select({ count: count() })
        .from(saleItems)
        .where(eq(saleItems.productId, productId));

      if (Number(salesCount[0]?.count ?? 0) > 0) {
        // Must be deactivated, NOT deleted!
        await tx
          .update(products)
          .set({ isActive: false })
          .where(eq(products.id, productId));

        return {
          actionTaken: 'deactivated' as const,
          message: 'Product has recorded sales and was deactivated to preserve sales history.',
        };
      }

      // 2. Check if product has stock movements other than 'opening'
      const nonOpeningMovements = await tx
        .select({ count: count() })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.productId, productId),
            sql`${stockMovements.reason} <> 'opening'`,
          ),
        );

      if (Number(nonOpeningMovements[0]?.count ?? 0) > 0) {
        // Has movements other than opening (e.g. adjustments), deactivate
        await tx
          .update(products)
          .set({ isActive: false })
          .where(eq(products.id, productId));

        return {
          actionTaken: 'deactivated' as const,
          message: 'Product has post-opening stock movements and was deactivated to preserve inventory logs.',
        };
      }

      // 3. No sales and no post-opening movements -> Hard delete in transaction
      // Delete opening stock movement if any
      await tx
        .delete(stockMovements)
        .where(eq(stockMovements.productId, productId));

      // Delete fitments and alternate numbers
      await tx
        .delete(productFitments)
        .where(eq(productFitments.productId, productId));

      await tx
        .delete(productPartNumbers)
        .where(eq(productPartNumbers.productId, productId));

      // Delete product
      await tx.delete(products).where(eq(products.id, productId));

      return {
        actionTaken: 'deleted' as const,
        message: 'Product permanently deleted.',
      };
    });

    revalidatePath('/products');
    revalidatePath('/inventory');
    return {
      success: true,
      data: { actionTaken: result.actionTaken },
      message: result.message,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to delete or deactivate product.'),
    };
  }
}

// ---------------------------------------------------------------------------
// Metadata Management Server Actions (Owner Only)
// ---------------------------------------------------------------------------

export async function createCategory(name: string): Promise<ServerActionResult<{ id: number; name: string }>> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = nameInputSchema.safeParse({ name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Category name is required' };
  }

  const cleanName = parsed.data.name;

  try {
    const [{ id }] = await db.insert(categories).values({ name: cleanName }).$returningId();
    const inserted = { id, name: cleanName };

    revalidatePath('/products');
    return { success: true, data: inserted, message: 'Category added' };
  } catch (err: unknown) {
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: `Category "${cleanName}" already exists` };
    }
    return { success: false, error: mapDatabaseError(err, 'Failed to create category.') };
  }
}

export async function createBrand(name: string): Promise<ServerActionResult<{ id: number; name: string }>> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = nameInputSchema.safeParse({ name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Brand name is required' };
  }

  const cleanName = parsed.data.name;

  try {
    const [{ id }] = await db.insert(brands).values({ name: cleanName }).$returningId();
    const inserted = { id, name: cleanName };

    revalidatePath('/products');
    return { success: true, data: inserted, message: 'Brand added' };
  } catch (err: unknown) {
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: `Brand "${cleanName}" already exists` };
    }
    return { success: false, error: mapDatabaseError(err, 'Failed to create brand.') };
  }
}

export async function createVehicleMake(name: string): Promise<ServerActionResult<{ id: number; name: string }>> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = nameInputSchema.safeParse({ name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Make name is required' };
  }

  const cleanName = parsed.data.name;

  try {
    const [{ id }] = await db.insert(vehicleMakes).values({ name: cleanName }).$returningId();
    const inserted = { id, name: cleanName };

    revalidatePath('/products');
    return { success: true, data: inserted, message: 'Vehicle make added' };
  } catch (err: unknown) {
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: `Vehicle make "${cleanName}" already exists` };
    }
    return { success: false, error: mapDatabaseError(err, 'Failed to create vehicle make.') };
  }
}

export async function createVehicleModel(
  makeId: number,
  name: string,
): Promise<ServerActionResult<{ id: number; name: string }>> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = vehicleModelInputSchema.safeParse({ makeId, name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid vehicle model data' };
  }

  const { makeId: cleanMakeId, name: cleanName } = parsed.data;

  try {
    const [{ id }] = await db
      .insert(vehicleModels)
      .values({ makeId: cleanMakeId, name: cleanName })
      .$returningId();
    const inserted = { id, name: cleanName };

    revalidatePath('/products');
    return { success: true, data: inserted, message: 'Vehicle model added' };
  } catch (err: unknown) {
    if (getDbErrorKind(err) === 'unique') {
      return { success: false, error: `Model "${cleanName}" already exists for this make` };
    }
    return { success: false, error: mapDatabaseError(err, 'Failed to create vehicle model.') };
  }
}

const addManufacturerBarcodeSchema = z.object({
  productId: z.number().int().positive('Valid product ID is required'),
  code: z
    .string()
    .trim()
    .min(1, 'Barcode cannot be empty')
    .max(100, 'Barcode cannot exceed 100 characters'),
});

const removeBarcodeSchema = z.object({
  barcodeId: z.number().int().positive('Valid barcode ID is required'),
});

export async function addManufacturerBarcode(
  rawInput: z.infer<typeof addManufacturerBarcodeSchema>,
): Promise<ServerActionResult<{ id: number; code: string }>> {
  const { user } = await requireUser();
  assertOwner(user);
  return executeAddManufacturerBarcode(rawInput);
}

export async function executeAddManufacturerBarcode(
  rawInput: z.infer<typeof addManufacturerBarcodeSchema>,
): Promise<ServerActionResult<{ id: number; code: string }>> {
  const parsed = addManufacturerBarcodeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Validation failed',
    };
  }

  const { productId, code } = parsed.data;

  // Verify product exists
  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  try {
    const [{ id }] = await db
      .insert(productBarcodes)
      .values({
        productId,
        code,
        kind: 'manufacturer',
      })
      .$returningId();
    const inserted = { id, code };

    try {
      revalidatePath('/products');
    } catch {
      // Ignore outside Next.js request context
    }
    return {
      success: true,
      data: inserted,
      message: 'Manufacturer barcode added',
    };
  } catch (err: unknown) {
    if (getDbErrorKind(err) === 'unique') {
      const [existing] = await db
        .select({ name: products.name })
        .from(productBarcodes)
        .innerJoin(products, eq(productBarcodes.productId, products.id))
        .where(eq(productBarcodes.code, code))
        .limit(1);

      const ownerName = existing?.name ? ` ${existing.name}` : '';
      return {
        success: false,
        error: `This barcode already belongs to${ownerName}`,
      };
    }
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to add manufacturer barcode'),
    };
  }
}

export async function removeManufacturerBarcode(
  rawInput: z.infer<typeof removeBarcodeSchema>,
): Promise<ServerActionResult> {
  const { user } = await requireUser();
  assertOwner(user);

  const parsed = removeBarcodeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Validation failed',
    };
  }

  const { barcodeId } = parsed.data;

  const [existing] = await db
    .select({
      id: productBarcodes.id,
      kind: productBarcodes.kind,
      productId: productBarcodes.productId,
    })
    .from(productBarcodes)
    .where(eq(productBarcodes.id, barcodeId))
    .limit(1);

  if (!existing) {
    return { success: false, error: 'Barcode not found' };
  }

  if (existing.kind === 'internal') {
    return { success: false, error: 'Internal barcode cannot be removed' };
  }

  try {
    await db
      .delete(productBarcodes)
      .where(
        and(
          eq(productBarcodes.id, barcodeId),
          eq(productBarcodes.kind, 'manufacturer'),
        ),
      );

    revalidatePath('/products');
    return { success: true, message: 'Manufacturer barcode removed' };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to remove barcode'),
    };
  }
}

export async function searchProductsForLabels(
  query: string,
): Promise<
  Array<{
    id: number;
    sku: string;
    name: string;
    partNumber: string;
    price: string;
    internalBarcode: string;
    stockQty: number;
    supplierName: string | null;
  }>
> {
  const { user } = await requireUser();
  assertOwner(user);

  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const { getPaginatedProducts } = await import('@/src/data/products');
  const result = await getPaginatedProducts(
    {
      search: cleanQuery,
      pageSize: 20,
    },
    true,
  );

  return Promise.all(
    result.items.map(async (item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      partNumber: item.partNumber,
      price: item.price,
      internalBarcode: item.internalBarcode || (await getOrCreateInternalBarcode(item.id)),
      stockQty: item.stockQty,
      supplierName: item.preferredSupplierName,
    })),
  );
}

/** Preferred supplier name per product id, for printing on labels (owner only). */
export async function getPreferredSupplierNames(productIds: number[]): Promise<Record<number, string | null>> {
  const { user } = await requireUser();
  assertOwner(user);
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200);
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: products.id, name: suppliers.name })
    .from(products)
    .leftJoin(suppliers, eq(products.preferredSupplierId, suppliers.id))
    .where(inArray(products.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Internal barcode for a product, created on the spot if it has none (owner only). */
export async function getInternalBarcode(productId: number): Promise<string> {
  const { user } = await requireUser();
  assertOwner(user);
  return getOrCreateInternalBarcode(productId);
}

