import { db } from '@/src/db';
import {
  products,
  brands,
  productFitments,
  productPartNumbers,
  settings,
  vehicleMakes,
  vehicleModels,
} from '@/src/db/schema';
import { eq, sql, and, asc, desc, inArray } from 'drizzle-orm';

export interface CheckoutPartItem {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  brandName: string | null;
  binLocation: string | null;
  unit: string;
  price: string;
  stockQty: number;
  alternateNumbers: string[];
}

export interface VehicleMakeOption {
  id: number;
  name: string;
  models: Array<{
    id: number;
    name: string;
  }>;
}

export interface CheckoutInitialData {
  settings: {
    shopName: string;
    address: string | null;
    phone: string | null;
    cashierMaxDiscountPct: string;
    receiptFooter: string | null;
  };
  vehicleMakes: VehicleMakeOption[];
  initialProducts: CheckoutPartItem[];
}

/**
 * Loads shop settings, vehicle makes/models for fitment filtering,
 * and the first 20 active products for the checkout terminal.
 */
export async function getCheckoutInitialData(): Promise<CheckoutInitialData> {
  // 1. Fetch store settings
  const [storeSettings] = await db
    .select({
      shopName: settings.shopName,
      address: settings.address,
      phone: settings.phone,
      cashierMaxDiscountPct: settings.cashierMaxDiscountPct,
      receiptFooter: settings.receiptFooter,
    })
    .from(settings)
    .where(eq(settings.id, 1));

  // 2. Fetch vehicle makes and models
  const makes = await db
    .select({
      id: vehicleMakes.id,
      name: vehicleMakes.name,
    })
    .from(vehicleMakes)
    .orderBy(asc(vehicleMakes.name));

  const models = await db
    .select({
      id: vehicleModels.id,
      makeId: vehicleModels.makeId,
      name: vehicleModels.name,
    })
    .from(vehicleModels)
    .orderBy(asc(vehicleModels.name));

  const makeOptions: VehicleMakeOption[] = makes.map((m) => ({
    id: m.id,
    name: m.name,
    models: models
      .filter((mod) => mod.makeId === m.id)
      .map((mod) => ({ id: mod.id, name: mod.name })),
  }));

  // 3. Initial top 20 active products
  const initialProducts = await searchCheckoutParts({ limit: 20 });

  return {
    settings: storeSettings ?? {
      shopName: 'Colombo Auto Spares & Parts',
      address: 'No. 142, Panchikawatta Road, Colombo 10, Sri Lanka',
      phone: '+94 11 234 5678',
      cashierMaxDiscountPct: '5.00',
      receiptFooter: 'Thank you! Parts can be exchanged within 7 days with this bill.',
    },
    vehicleMakes: makeOptions,
    initialProducts,
  };
}

export interface SearchCheckoutPartsParams {
  query?: string;
  makeId?: number;
  modelId?: number;
  year?: number;
  limit?: number;
}

/**
 * Searches active products for the POS terminal by part number, alternate numbers,
 * SKU, or name, optionally narrowed by vehicle make, model, and year fitments.
 */
export async function searchCheckoutParts(
  params: SearchCheckoutPartsParams,
): Promise<CheckoutPartItem[]> {
  const limit = Math.max(1, Math.min(params.limit || 20, 50));
  const conditions = [eq(products.isActive, true)];

  const rawQuery = params.query?.trim();

  // Search filter across part number, SKU, name, or alternate numbers
  if (rawQuery && rawQuery.length > 0) {
    const pattern = `%${rawQuery.toLowerCase()}%`;
    conditions.push(
      sql`(${products.name} LIKE ${pattern} OR ${products.sku} LIKE ${pattern} OR ${products.partNumber} LIKE ${pattern} OR EXISTS (
        SELECT 1 FROM ${productPartNumbers}
        WHERE ${productPartNumbers.productId} = ${products.id}
        AND ${productPartNumbers.partNumber} LIKE ${pattern}
      ))`,
    );
  }

  // Vehicle fitment filters
  if (params.modelId && params.modelId > 0) {
    if (params.year && params.year > 0) {
      const year = params.year;
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${productFitments}
          WHERE ${productFitments.productId} = ${products.id}
          AND ${productFitments.vehicleModelId} = ${params.modelId}
          AND (${productFitments.yearFrom} IS NULL OR ${productFitments.yearFrom} <= ${year})
          AND (${productFitments.yearTo} IS NULL OR ${productFitments.yearTo} >= ${year})
        )`,
      );
    } else {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${productFitments}
          WHERE ${productFitments.productId} = ${products.id}
          AND ${productFitments.vehicleModelId} = ${params.modelId}
        )`,
      );
    }
  } else if (params.makeId && params.makeId > 0) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${productFitments}
        JOIN ${vehicleModels} ON ${productFitments.vehicleModelId} = ${vehicleModels.id}
        WHERE ${productFitments.productId} = ${products.id}
        AND ${vehicleModels.makeId} = ${params.makeId}
      )`,
    );
  }

  const whereClause = and(...conditions);

  // If there's an exact search query, score exact part number / SKU matches first
  const orderClause = rawQuery && rawQuery.length > 0
    ? [
        sql`CASE 
          WHEN lower(${products.partNumber}) = lower(${rawQuery}) THEN 1
          WHEN lower(${products.sku}) = lower(${rawQuery}) THEN 2
          WHEN lower(${products.partNumber}) LIKE lower(${rawQuery + '%'}) THEN 3
          WHEN lower(${products.name}) LIKE lower(${rawQuery + '%'}) THEN 4
          ELSE 5
        END ASC`,
        desc(products.stockQty),
        asc(products.name),
      ]
    : [desc(products.stockQty), asc(products.name)];

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      brandName: brands.name,
      binLocation: products.binLocation,
      unit: products.unit,
      price: products.price,
      stockQty: products.stockQty,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(whereClause)
    .orderBy(...orderClause)
    .limit(limit);

  if (rows.length === 0) {
    return [];
  }

  const productIds = rows.map((r) => r.id);

  // Fetch alternate part numbers for display
  const altRows = await db
    .select({
      productId: productPartNumbers.productId,
      partNumber: productPartNumbers.partNumber,
    })
    .from(productPartNumbers)
    .where(inArray(productPartNumbers.productId, productIds));

  const altMap = new Map<number, string[]>();
  for (const alt of altRows) {
    const list = altMap.get(alt.productId) || [];
    list.push(alt.partNumber);
    altMap.set(alt.productId, list);
  }

  return rows.map((r) => ({
    ...r,
    alternateNumbers: altMap.get(r.id) || [],
  }));
}
