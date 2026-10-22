import { db } from '@/src/db';
import {
  products,
  categories,
  brands,
  suppliers,
  stockMovements,
  sales,
} from '@/src/db/schema';
import { user } from '@/src/db/auth-schema';
import { eq, sql, desc, asc } from 'drizzle-orm';

export interface LowStockProductItem {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  categoryName: string;
  brandName: string | null;
  binLocation: string | null;
  stockQty: number;
  reorderLevel: number;
  deficit: number;
  unit: string;
  /** The supplier this is usually bought from, to build per-supplier reorder sheets. */
  supplierId: number | null;
  supplierName: string | null;
}

export interface StockMovementItem {
  id: number;
  productId: number;
  productName: string;
  partNumber: string;
  changeQty: number;
  qtyAfter: number;
  reason: 'opening' | 'sale' | 'void' | 'received' | 'adjustment' | string;
  note: string | null;
  saleId: number | null;
  receiptNumber: string | null;
  createdByName: string;
  createdAt: Date;
}

export async function getLowStockProducts(): Promise<LowStockProductItem[]> {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      categoryName: categories.name,
      brandName: brands.name,
      binLocation: products.binLocation,
      stockQty: products.stockQty,
      reorderLevel: products.reorderLevel,
      unit: products.unit,
      supplierId: products.preferredSupplierId,
      supplierName: suppliers.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(suppliers, eq(products.preferredSupplierId, suppliers.id))
    .where(
      sql`${products.isActive} = true AND ${products.stockQty} <= ${products.reorderLevel}`,
    )
    .orderBy(
      // Most urgent first: 0 stock first, then lowest stock qty
      asc(products.stockQty),
      asc(sql`${products.stockQty} - ${products.reorderLevel}`),
    );

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    partNumber: r.partNumber,
    categoryName: r.categoryName ?? 'Uncategorized',
    brandName: r.brandName,
    binLocation: r.binLocation,
    stockQty: r.stockQty,
    reorderLevel: r.reorderLevel,
    deficit: Math.max(0, r.reorderLevel - r.stockQty),
    unit: r.unit,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
  }));
}

export async function getProductStockHistory(
  productId: number,
): Promise<StockMovementItem[]> {
  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      partNumber: products.partNumber,
      changeQty: stockMovements.changeQty,
      qtyAfter: stockMovements.qtyAfter,
      reason: stockMovements.reason,
      note: stockMovements.note,
      saleId: stockMovements.saleId,
      receiptNumber: sales.receiptNumber,
      createdByName: user.name,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(sales, eq(stockMovements.saleId, sales.id))
    .leftJoin(user, eq(stockMovements.createdBy, user.id))
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    partNumber: r.partNumber,
    changeQty: r.changeQty,
    qtyAfter: r.qtyAfter,
    reason: r.reason,
    note: r.note,
    saleId: r.saleId,
    receiptNumber: r.receiptNumber,
    createdByName: r.createdByName ?? 'Unknown User',
    createdAt: r.createdAt,
  }));
}

export async function getProductsForPicker() {
  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      stockQty: products.stockQty,
      binLocation: products.binLocation,
      isActive: products.isActive,
    })
    .from(products)
    .orderBy(asc(products.name));
}
