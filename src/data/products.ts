import { db } from '@/src/db';
import {
  products,
  categories,
  brands,
  vehicleMakes,
  vehicleModels,
  productFitments,
  productPartNumbers,
  productBarcodes,
  suppliers,
} from '@/src/db/schema';
import { eq, sql, and, desc, inArray, count } from 'drizzle-orm';
import Decimal from 'decimal.js';

export interface ProductBarcodeItem {
  id: number;
  code: string;
  kind: 'internal' | 'manufacturer';
  createdAt: Date;
}

export interface ProductFilterParams {
  search?: string;
  categoryId?: number;
  brandId?: number;
  /** Owner only: products whose preferred supplier is this one. */
  supplierId?: number;
  makeId?: number;
  modelId?: number;
  stockStatus?: 'all' | 'low' | 'out';
  activeStatus?: 'all' | 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

export interface ProductListItem {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  categoryId: number;
  categoryName: string;
  brandId: number | null;
  brandName: string | null;
  /** Owner only (null for cashiers). */
  preferredSupplierId: number | null;
  preferredSupplierName: string | null;
  description: string | null;
  unit: string;
  binLocation: string | null;
  price: string;
  costPrice?: string | null; // Omitted / undefined for cashier
  marginPct?: string | null; // Omitted / undefined for cashier
  stockQty: number;
  reorderLevel: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  internalBarcode: string | null;
  barcodes: ProductBarcodeItem[];
  alternatePartNumbers: Array<{
    id: number;
    partNumber: string;
    kind: string;
  }>;
  fitments: Array<{
    id: number;
    modelId: number;
    modelName: string;
    makeId: number;
    makeName: string;
    yearFrom: number | null;
    yearTo: number | null;
  }>;
}

export interface PaginatedProductsResult {
  items: ProductListItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export async function getPaginatedProducts(
  params: ProductFilterParams,
  isOwner: boolean,
): Promise<PaginatedProductsResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 15));
  const offset = (page - 1) * pageSize;

  const conditions = [];

  // 1. Search across name, sku, part_number, alternate part numbers, and barcodes
  if (params.search && params.search.trim().length > 0) {
    const rawSearch = params.search.trim();
    const pattern = `%${rawSearch.toLowerCase()}%`;
    conditions.push(
      sql`(${products.name} LIKE ${pattern} OR ${products.sku} LIKE ${pattern} OR ${products.partNumber} LIKE ${pattern} OR EXISTS (
        SELECT 1 FROM ${productPartNumbers}
        WHERE ${productPartNumbers.productId} = ${products.id}
        AND ${productPartNumbers.partNumber} LIKE ${pattern}
      ) OR EXISTS (
        SELECT 1 FROM ${productBarcodes}
        WHERE ${productBarcodes.productId} = ${products.id}
        AND ${productBarcodes.code} = ${rawSearch}
      ))`,
    );
  }

  // 2. Category filter
  if (params.categoryId && params.categoryId > 0) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  // 3. Brand filter
  if (params.brandId && params.brandId > 0) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  // 3b. Preferred supplier filter (owners only)
  if (isOwner && params.supplierId && params.supplierId > 0) {
    conditions.push(eq(products.preferredSupplierId, params.supplierId));
  }

  // 4. Vehicle Make & Model cascading filter
  if (params.modelId && params.modelId > 0) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${productFitments}
        WHERE ${productFitments.productId} = ${products.id}
        AND ${productFitments.vehicleModelId} = ${params.modelId}
      )`,
    );
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

  // 5. Stock status filter
  if (params.stockStatus === 'low') {
    conditions.push(sql`${products.stockQty} <= ${products.reorderLevel} AND ${products.stockQty} > 0`);
  } else if (params.stockStatus === 'out') {
    conditions.push(eq(products.stockQty, 0));
  }

  // 6. Active status filter
  if (params.activeStatus === 'active') {
    conditions.push(eq(products.isActive, true));
  } else if (params.activeStatus === 'inactive') {
    conditions.push(eq(products.isActive, false));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count
  const countResult = await db
    .select({ total: count() })
    .from(products)
    .where(whereClause);
  const totalCount = Number(countResult[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Query page items
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brandId: products.brandId,
      brandName: brands.name,
      preferredSupplierId: products.preferredSupplierId,
      preferredSupplierName: suppliers.name,
      description: products.description,
      unit: products.unit,
      binLocation: products.binLocation,
      price: products.price,
      costPrice: products.costPrice,
      stockQty: products.stockQty,
      reorderLevel: products.reorderLevel,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(suppliers, eq(products.preferredSupplierId, suppliers.id))
    .where(whereClause)
    .orderBy(desc(products.id))
    .limit(pageSize)
    .offset(offset);

  const productIds = rows.map((r) => r.id);

  // Fetch alternate part numbers & fitments in batch if there are products
  const altPartNumbersByProduct: Record<
    number,
    Array<{ id: number; partNumber: string; kind: string }>
  > = {};
  const fitmentsByProduct: Record<
    number,
    Array<{
      id: number;
      modelId: number;
      modelName: string;
      makeId: number;
      makeName: string;
      yearFrom: number | null;
      yearTo: number | null;
    }>
  > = {};
  const barcodesByProduct: Record<number, ProductBarcodeItem[]> = {};

  if (productIds.length > 0) {
    const altRows = await db
      .select({
        id: productPartNumbers.id,
        productId: productPartNumbers.productId,
        partNumber: productPartNumbers.partNumber,
        kind: productPartNumbers.kind,
      })
      .from(productPartNumbers)
      .where(inArray(productPartNumbers.productId, productIds));

    for (const alt of altRows) {
      if (!altPartNumbersByProduct[alt.productId]) {
        altPartNumbersByProduct[alt.productId] = [];
      }
      altPartNumbersByProduct[alt.productId].push({
        id: alt.id,
        partNumber: alt.partNumber,
        kind: alt.kind,
      });
    }

    const fitmentRows = await db
      .select({
        id: productFitments.id,
        productId: productFitments.productId,
        modelId: productFitments.vehicleModelId,
        modelName: vehicleModels.name,
        makeId: vehicleModels.makeId,
        makeName: vehicleMakes.name,
        yearFrom: productFitments.yearFrom,
        yearTo: productFitments.yearTo,
      })
      .from(productFitments)
      .innerJoin(vehicleModels, eq(productFitments.vehicleModelId, vehicleModels.id))
      .innerJoin(vehicleMakes, eq(vehicleModels.makeId, vehicleMakes.id))
      .where(inArray(productFitments.productId, productIds));

    for (const fit of fitmentRows) {
      if (!fitmentsByProduct[fit.productId]) {
        fitmentsByProduct[fit.productId] = [];
      }
      fitmentsByProduct[fit.productId].push({
        id: fit.id,
        modelId: fit.modelId,
        modelName: fit.modelName,
        makeId: fit.makeId,
        makeName: fit.makeName,
        yearFrom: fit.yearFrom,
        yearTo: fit.yearTo,
      });
    }

    const barcodeRows = await db
      .select({
        id: productBarcodes.id,
        productId: productBarcodes.productId,
        code: productBarcodes.code,
        kind: productBarcodes.kind,
        createdAt: productBarcodes.createdAt,
      })
      .from(productBarcodes)
      .where(inArray(productBarcodes.productId, productIds));

    for (const b of barcodeRows) {
      if (!barcodesByProduct[b.productId]) {
        barcodesByProduct[b.productId] = [];
      }
      barcodesByProduct[b.productId].push({
        id: b.id,
        code: b.code,
        kind: b.kind as 'internal' | 'manufacturer',
        createdAt: b.createdAt,
      });
    }
  }

  // Format list items
  const items: ProductListItem[] = rows.map((r) => {
    let costPrice: string | null | undefined = undefined;
    let marginPct: string | null | undefined = undefined;

    if (isOwner) {
      costPrice = r.costPrice;
      const selling = new Decimal(r.price);
      const cost = new Decimal(r.costPrice || '0');
      if (selling.greaterThan(0)) {
        marginPct = selling.minus(cost).dividedBy(selling).times(100).toFixed(1);
      } else {
        marginPct = '0.0';
      }
    }

    const productBarcodesList = barcodesByProduct[r.id] || [];
    const internalBarcode =
      productBarcodesList.find((b) => b.kind === 'internal')?.code || null;

    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      partNumber: r.partNumber,
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? 'Uncategorized',
      brandId: r.brandId,
      brandName: r.brandName,
      preferredSupplierId: isOwner ? r.preferredSupplierId : null,
      preferredSupplierName: isOwner ? r.preferredSupplierName : null,
      description: r.description,
      unit: r.unit,
      binLocation: r.binLocation,
      price: r.price,
      costPrice,
      marginPct,
      stockQty: r.stockQty,
      reorderLevel: r.reorderLevel,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      internalBarcode,
      barcodes: productBarcodesList,
      alternatePartNumbers: altPartNumbersByProduct[r.id] || [],
      fitments: fitmentsByProduct[r.id] || [],
    };
  });

  return {
    items,
    totalCount,
    totalPages,
    currentPage: page,
    pageSize,
  };
}

export async function getCategories() {
  return db.select().from(categories).orderBy(categories.name);
}

export async function getBrands() {
  return db.select().from(brands).orderBy(brands.name);
}

export async function getVehicleMakes() {
  return db.select().from(vehicleMakes).orderBy(vehicleMakes.name);
}

export async function getVehicleModels() {
  return db
    .select({
      id: vehicleModels.id,
      makeId: vehicleModels.makeId,
      name: vehicleModels.name,
      makeName: vehicleMakes.name,
    })
    .from(vehicleModels)
    .innerJoin(vehicleMakes, eq(vehicleModels.makeId, vehicleMakes.id))
    .orderBy(vehicleMakes.name, vehicleModels.name);
}

export async function getProductById(
  id: number,
  isOwner = false,
): Promise<ProductListItem | null> {
  // Directly query the single product with exact id
  const [row] = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brandId: products.brandId,
      brandName: brands.name,
      preferredSupplierId: products.preferredSupplierId,
      preferredSupplierName: suppliers.name,
      description: products.description,
      unit: products.unit,
      binLocation: products.binLocation,
      price: products.price,
      costPrice: products.costPrice,
      stockQty: products.stockQty,
      reorderLevel: products.reorderLevel,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(suppliers, eq(products.preferredSupplierId, suppliers.id))
    .where(eq(products.id, id))
    .limit(1);

  if (!row) return null;

  const [altRows, fitmentRows, barcodeRows] = await Promise.all([
    db
      .select({
        id: productPartNumbers.id,
        partNumber: productPartNumbers.partNumber,
        kind: productPartNumbers.kind,
      })
      .from(productPartNumbers)
      .where(eq(productPartNumbers.productId, id)),
    db
      .select({
        id: productFitments.id,
        modelId: productFitments.vehicleModelId,
        modelName: vehicleModels.name,
        makeId: vehicleModels.makeId,
        makeName: vehicleMakes.name,
        yearFrom: productFitments.yearFrom,
        yearTo: productFitments.yearTo,
      })
      .from(productFitments)
      .innerJoin(vehicleModels, eq(productFitments.vehicleModelId, vehicleModels.id))
      .innerJoin(vehicleMakes, eq(vehicleModels.makeId, vehicleMakes.id))
      .where(eq(productFitments.productId, id)),
    db
      .select({
        id: productBarcodes.id,
        code: productBarcodes.code,
        kind: productBarcodes.kind,
        createdAt: productBarcodes.createdAt,
      })
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, id)),
  ]);

  let costPrice: string | null | undefined = undefined;
  let marginPct: string | null | undefined = undefined;

  if (isOwner) {
    costPrice = row.costPrice;
    const selling = new Decimal(row.price);
    const cost = new Decimal(row.costPrice || '0');
    if (selling.greaterThan(0)) {
      marginPct = selling.minus(cost).dividedBy(selling).times(100).toFixed(1);
    } else {
      marginPct = '0.0';
    }
  }

  const typedBarcodes: ProductBarcodeItem[] = barcodeRows.map((b) => ({
    id: b.id,
    code: b.code,
    kind: b.kind as 'internal' | 'manufacturer',
    createdAt: b.createdAt,
  }));

  const internalBarcode =
    typedBarcodes.find((b) => b.kind === 'internal')?.code || null;

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    partNumber: row.partNumber,
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? 'Uncategorized',
    brandId: row.brandId,
    brandName: row.brandName,
    preferredSupplierId: isOwner ? row.preferredSupplierId : null,
    preferredSupplierName: isOwner ? row.preferredSupplierName : null,
    description: row.description,
    unit: row.unit,
    binLocation: row.binLocation,
    price: row.price,
    costPrice,
    marginPct,
    stockQty: row.stockQty,
    reorderLevel: row.reorderLevel,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    internalBarcode,
    barcodes: typedBarcodes,
    alternatePartNumbers: altRows,
    fitments: fitmentRows,
  };
}

