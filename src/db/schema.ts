import { sql, defineRelations } from 'drizzle-orm';
import {
  pgTable,
  bigint,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
  check,
  index,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const categories = pgTable('categories', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Brands (Part manufacturers, e.g. Toyota Genuine, Denso, NGK, Bosch)
// ---------------------------------------------------------------------------
export const brands = pgTable('brands', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Vehicle Makes & Models
// ---------------------------------------------------------------------------
export const vehicleMakes = pgTable('vehicle_makes', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vehicleModels = pgTable(
  'vehicle_models',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    makeId: bigint('make_id', { mode: 'number' })
      .notNull()
      .references(() => vehicleMakes.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('vehicle_models_make_id_name_unique').on(t.makeId, t.name),
    index('vehicle_models_make_id_idx').on(t.makeId),
  ],
);

// ---------------------------------------------------------------------------
// Products (Catalog parts)
// ---------------------------------------------------------------------------
export const products = pgTable(
  'products',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    partNumber: text('part_number').notNull(),
    categoryId: bigint('category_id', { mode: 'number' })
      .notNull()
      .references(() => categories.id),
    brandId: bigint('brand_id', { mode: 'number' }).references(() => brands.id),
    description: text('description'),
    unit: text('unit').notNull().default('pcs'),
    binLocation: text('bin_location'),
    costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    stockQty: integer('stock_qty').notNull().default(0),
    reorderLevel: integer('reorder_level').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('products_price_check', sql`${t.price} >= 0`),
    check('products_cost_price_check', sql`${t.costPrice} >= 0`),
    check('products_stock_qty_check', sql`${t.stockQty} >= 0`),
    check('products_reorder_level_check', sql`${t.reorderLevel} >= 0`),
    index('products_part_number_idx').on(sql`lower(${t.partNumber})`),
    index('products_name_idx').on(sql`lower(${t.name})`),
    index('products_category_id_idx').on(t.categoryId),
    index('products_brand_id_idx').on(t.brandId),
  ],
);

// ---------------------------------------------------------------------------
// Product Fitments (Which vehicle models & years a part fits)
// ---------------------------------------------------------------------------
export const productFitments = pgTable(
  'product_fitments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    vehicleModelId: bigint('vehicle_model_id', { mode: 'number' })
      .notNull()
      .references(() => vehicleModels.id),
    yearFrom: integer('year_from'),
    yearTo: integer('year_to'),
  },
  (t) => [
    check(
      'product_fitments_year_range_check',
      sql`${t.yearFrom} IS NULL OR ${t.yearTo} IS NULL OR ${t.yearFrom} <= ${t.yearTo}`,
    ),
    unique('product_fitments_unique').on(
      t.productId,
      t.vehicleModelId,
      t.yearFrom,
      t.yearTo,
    ),
    index('product_fitments_product_id_idx').on(t.productId),
    index('product_fitments_vehicle_model_id_idx').on(t.vehicleModelId),
  ],
);

// ---------------------------------------------------------------------------
// Product Part Numbers (Alternate / OEM cross-references)
// ---------------------------------------------------------------------------
export const productPartNumbers = pgTable(
  'product_part_numbers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    partNumber: text('part_number').notNull(),
    kind: text('kind').notNull(),
  },
  (t) => [
    check('product_part_numbers_kind_check', sql`${t.kind} IN ('oem', 'alternate')`),
    unique('product_part_numbers_product_id_part_number_unique').on(
      t.productId,
      t.partNumber,
    ),
    index('product_part_numbers_product_id_idx').on(t.productId),
    index('product_part_numbers_part_number_idx').on(sql`lower(${t.partNumber})`),
  ],
);

// ---------------------------------------------------------------------------
// Product Barcodes (Internal & Manufacturer Barcodes)
// ---------------------------------------------------------------------------
export const productBarcodes = pgTable(
  'product_barcodes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('product_barcodes_kind_check', sql`${t.kind} IN ('internal', 'manufacturer')`),
    check('product_barcodes_code_check', sql`${t.kind} <> 'internal' OR ${t.code} ~ '^20[0-9]{8}$'`),
    index('product_barcodes_product_id_idx').on(t.productId),
    uniqueIndex('product_barcodes_product_id_internal_idx')
      .on(t.productId)
      .where(sql`${t.kind} = 'internal'`),
  ],
);

// ---------------------------------------------------------------------------
// Sales (Orders / Receipts)
// ---------------------------------------------------------------------------
export const sales = pgTable(
  'sales',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    receiptNumber: text('receipt_number').notNull().unique(),
    cashierId: text('cashier_id')
      .notNull()
      .references(() => user.id),
    status: text('status').notNull().default('completed'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by').references(() => user.id),
    voidReason: text('void_reason'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    amountTendered: numeric('amount_tendered', { precision: 12, scale: 2 }),
    changeGiven: numeric('change_given', { precision: 12, scale: 2 }),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    vehicleNo: text('vehicle_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('sales_status_check', sql`${t.status} IN ('completed', 'voided')`),
    check(
      'sales_voided_check',
      sql`(${t.status} = 'voided') = (${t.voidedAt} IS NOT NULL)`,
    ),
    check('sales_discount_check', sql`${t.discount} >= 0 AND ${t.discount} <= ${t.subtotal}`),
    check('sales_total_check', sql`${t.total} = ${t.subtotal} - ${t.discount}`),
    index('sales_cashier_id_idx').on(t.cashierId),
    index('sales_voided_by_idx').on(t.voidedBy),
    index('sales_created_at_idx').on(t.createdAt),
    index('sales_status_created_at_idx').on(t.status, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Sale Items (Line items for each sale)
// ---------------------------------------------------------------------------
export const saleItems = pgTable(
  'sale_items',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    saleId: bigint('sale_id', { mode: 'number' })
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    productName: text('product_name').notNull(),
    partNumber: text('part_number').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('sale_items_quantity_check', sql`${t.quantity} > 0`),
    check('sale_items_unit_price_check', sql`${t.unitPrice} >= 0`),
    check('sale_items_unit_cost_check', sql`${t.unitCost} >= 0`),
    check('sale_items_line_total_check', sql`${t.lineTotal} = (${t.quantity} * ${t.unitPrice})`),
    index('sale_items_sale_id_idx').on(t.saleId),
    index('sale_items_product_id_idx').on(t.productId),
  ],
);

// ---------------------------------------------------------------------------
// Stock Movements (Ledger of all stock changes)
// ---------------------------------------------------------------------------
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    changeQty: integer('change_qty').notNull(),
    qtyAfter: integer('qty_after').notNull(),
    reason: text('reason').notNull(),
    saleId: bigint('sale_id', { mode: 'number' }).references(() => sales.id),
    note: text('note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('stock_movements_change_qty_check', sql`${t.changeQty} <> 0`),
    check('stock_movements_qty_after_check', sql`${t.qtyAfter} >= 0`),
    check(
      'stock_movements_reason_check',
      sql`${t.reason} IN ('opening', 'sale', 'void', 'received', 'adjustment')`,
    ),
    index('stock_movements_product_id_idx').on(t.productId),
    index('stock_movements_sale_id_idx').on(t.saleId),
    index('stock_movements_created_by_idx').on(t.createdBy),
    index('stock_movements_created_at_idx').on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Receipt Counters (Gap-free receipt numbering per year)
// ---------------------------------------------------------------------------
export const receiptCounters = pgTable('receipt_counters', {
  year: integer('year').primaryKey(),
  lastNumber: integer('last_number').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Settings (Single-row store settings)
// ---------------------------------------------------------------------------
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    shopName: text('shop_name').notNull().default('Colombo Auto Spares & Parts'),
    address: text('address'),
    phone: text('phone'),
    receiptFooter: text('receipt_footer'),
    cashierMaxDiscountPct: numeric('cashier_max_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('5.00'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('settings_id_check', sql`${t.id} = 1`),
    check(
      'settings_cashier_max_discount_pct_check',
      sql`${t.cashierMaxDiscountPct} >= 0 AND ${t.cashierMaxDiscountPct} <= 100`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Drizzle Relations
// ---------------------------------------------------------------------------
export const relations = defineRelations(
  {
    categories,
    brands,
    vehicleMakes,
    vehicleModels,
    products,
    productFitments,
    productPartNumbers,
    productBarcodes,
    sales,
    saleItems,
    stockMovements,
    user,
  },
  (r) => ({
    categories: {
      products: r.many.products(),
    },
    brands: {
      products: r.many.products(),
    },
    vehicleMakes: {
      models: r.many.vehicleModels(),
    },
    vehicleModels: {
      make: r.one.vehicleMakes({
        from: r.vehicleModels.makeId,
        to: r.vehicleMakes.id,
      }),
      fitments: r.many.productFitments(),
    },
    products: {
      category: r.one.categories({
        from: r.products.categoryId,
        to: r.categories.id,
      }),
      brand: r.one.brands({
        from: r.products.brandId,
        to: r.brands.id,
      }),
      fitments: r.many.productFitments(),
      partNumbers: r.many.productPartNumbers(),
      barcodes: r.many.productBarcodes(),
      stockMovements: r.many.stockMovements(),
      saleItems: r.many.saleItems(),
    },
    productFitments: {
      product: r.one.products({
        from: r.productFitments.productId,
        to: r.products.id,
      }),
      vehicleModel: r.one.vehicleModels({
        from: r.productFitments.vehicleModelId,
        to: r.vehicleModels.id,
      }),
    },
    productPartNumbers: {
      product: r.one.products({
        from: r.productPartNumbers.productId,
        to: r.products.id,
      }),
    },
    productBarcodes: {
      product: r.one.products({
        from: r.productBarcodes.productId,
        to: r.products.id,
      }),
    },
    sales: {
      cashier: r.one.user({
        from: r.sales.cashierId,
        to: r.user.id,
      }),
      voidedByUser: r.one.user({
        from: r.sales.voidedBy,
        to: r.user.id,
      }),
      items: r.many.saleItems(),
      stockMovements: r.many.stockMovements(),
    },
    saleItems: {
      sale: r.one.sales({
        from: r.saleItems.saleId,
        to: r.sales.id,
      }),
      product: r.one.products({
        from: r.saleItems.productId,
        to: r.products.id,
      }),
    },
    stockMovements: {
      product: r.one.products({
        from: r.stockMovements.productId,
        to: r.products.id,
      }),
      sale: r.one.sales({
        from: r.stockMovements.saleId,
        to: r.sales.id,
      }),
      creator: r.one.user({
        from: r.stockMovements.createdBy,
        to: r.user.id,
      }),
    },
  }),
);

// ---------------------------------------------------------------------------
// Export Inferred Types
// ---------------------------------------------------------------------------
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;

export type VehicleMake = typeof vehicleMakes.$inferSelect;
export type NewVehicleMake = typeof vehicleMakes.$inferInsert;

export type VehicleModel = typeof vehicleModels.$inferSelect;
export type NewVehicleModel = typeof vehicleModels.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductFitment = typeof productFitments.$inferSelect;
export type NewProductFitment = typeof productFitments.$inferInsert;

export type ProductPartNumber = typeof productPartNumbers.$inferSelect;
export type NewProductPartNumber = typeof productPartNumbers.$inferInsert;

export type ProductBarcode = typeof productBarcodes.$inferSelect;
export type NewProductBarcode = typeof productBarcodes.$inferInsert;

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;

export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;

export type ReceiptCounter = typeof receiptCounters.$inferSelect;
export type NewReceiptCounter = typeof receiptCounters.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export * from './auth-schema';