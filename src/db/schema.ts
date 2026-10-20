import { sql, defineRelations } from 'drizzle-orm';
import {
  mysqlTable,
  bigint,
  text,
  varchar,
  decimal,
  int,
  boolean,
  check,
  index,
  unique,
  uniqueIndex,
  date,
} from 'drizzle-orm/mysql-core';
import { ts, nowSql } from './columns';
import { user } from './auth-schema';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const categories = mysqlTable('categories', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  createdAt: ts('created_at').notNull().default(nowSql),
});

// ---------------------------------------------------------------------------
// Brands (Part manufacturers, e.g. Toyota Genuine, Denso, NGK, Bosch)
// ---------------------------------------------------------------------------
export const brands = mysqlTable('brands', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  createdAt: ts('created_at').notNull().default(nowSql),
});

// ---------------------------------------------------------------------------
// Vehicle Makes & Models
// ---------------------------------------------------------------------------
export const vehicleMakes = mysqlTable('vehicle_makes', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  createdAt: ts('created_at').notNull().default(nowSql),
});

export const vehicleModels = mysqlTable(
  'vehicle_models',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    makeId: bigint('make_id', { mode: 'number' })
      .notNull()
      .references(() => vehicleMakes.id),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: ts('created_at').notNull().default(nowSql),
  },
  (t) => [
    unique('vehicle_models_make_id_name_unique').on(t.makeId, t.name),
    index('vehicle_models_make_id_idx').on(t.makeId),
  ],
);

// ---------------------------------------------------------------------------
// Products (Catalog parts)
// ---------------------------------------------------------------------------
export const products = mysqlTable(
  'products',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    sku: varchar('sku', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    partNumber: varchar('part_number', { length: 255 }).notNull(),
    categoryId: bigint('category_id', { mode: 'number' })
      .notNull()
      .references(() => categories.id),
    brandId: bigint('brand_id', { mode: 'number' }).references(() => brands.id),
    description: text('description'),
    unit: varchar('unit', { length: 255 }).notNull().default('pcs'),
    binLocation: varchar('bin_location', { length: 255 }),
    costPrice: decimal('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    stockQty: int('stock_qty').notNull().default(0),
    reorderLevel: int('reorder_level').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: ts('created_at').notNull().default(nowSql),
    updatedAt: ts('updated_at')
      .notNull()
      .default(nowSql)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('products_price_check', sql`${t.price} >= 0`),
    check('products_cost_price_check', sql`${t.costPrice} >= 0`),
    check('products_stock_qty_check', sql`${t.stockQty} >= 0`),
    check('products_reorder_level_check', sql`${t.reorderLevel} >= 0`),
    index('products_part_number_idx').on(t.partNumber),
    index('products_name_idx').on(t.name),
    index('products_category_id_idx').on(t.categoryId),
    index('products_brand_id_idx').on(t.brandId),
  ],
);

// ---------------------------------------------------------------------------
// Product Fitments (Which vehicle models & years a part fits)
// ---------------------------------------------------------------------------
export const productFitments = mysqlTable(
  'product_fitments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    vehicleModelId: bigint('vehicle_model_id', { mode: 'number' })
      .notNull()
      .references(() => vehicleModels.id),
    yearFrom: int('year_from'),
    yearTo: int('year_to'),
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
export const productPartNumbers = mysqlTable(
  'product_part_numbers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    partNumber: varchar('part_number', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 255 }).notNull(),
  },
  (t) => [
    check('product_part_numbers_kind_check', sql`${t.kind} IN ('oem', 'alternate')`),
    unique('product_part_numbers_product_id_part_number_unique').on(
      t.productId,
      t.partNumber,
    ),
    index('product_part_numbers_product_id_idx').on(t.productId),
    index('product_part_numbers_part_number_idx').on(t.partNumber),
  ],
);

// ---------------------------------------------------------------------------
// Product Barcodes (Internal & Manufacturer Barcodes)
// ---------------------------------------------------------------------------
export const productBarcodes = mysqlTable(
  'product_barcodes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 255 }).notNull().unique(),
    kind: varchar('kind', { length: 255 }).notNull(),
    // MySQL has no partial indexes: this column is the product_id for internal
    // barcodes and NULL otherwise, so a UNIQUE index on it allows at most one
    // internal barcode per product (NULLs never collide).
    internalProductId: bigint('internal_product_id', { mode: 'number' }).generatedAlwaysAs(
      sql`IF(kind = 'internal', product_id, NULL)`,
      { mode: 'virtual' },
    ),
    createdAt: ts('created_at').notNull().default(nowSql),
  },
  (t) => [
    check('product_barcodes_kind_check', sql`${t.kind} IN ('internal', 'manufacturer')`),
    check('product_barcodes_code_check', sql`${t.kind} <> 'internal' OR ${t.code} REGEXP '^20[0-9]{8}$'`),
    index('product_barcodes_product_id_idx').on(t.productId),
    uniqueIndex('product_barcodes_product_id_internal_idx').on(t.internalProductId),
  ],
);

// ---------------------------------------------------------------------------
// Sales (Orders / Receipts)
// ---------------------------------------------------------------------------
export const sales = mysqlTable(
  'sales',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    receiptNumber: varchar('receipt_number', { length: 255 }).notNull().unique(),
    cashierId: varchar('cashier_id', { length: 255 })
      .notNull()
      .references(() => user.id),
    status: varchar('status', { length: 255 }).notNull().default('completed'),
    voidedAt: ts('voided_at'),
    voidedBy: varchar('voided_by', { length: 255 }).references(() => user.id),
    voidReason: text('void_reason'),
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    discount: decimal('discount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),
    amountTendered: decimal('amount_tendered', { precision: 12, scale: 2 }),
    changeGiven: decimal('change_given', { precision: 12, scale: 2 }),
    customerName: varchar('customer_name', { length: 255 }),
    customerPhone: varchar('customer_phone', { length: 255 }),
    vehicleNo: varchar('vehicle_no', { length: 255 }),
    createdAt: ts('created_at').notNull().default(nowSql),
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
export const saleItems = mysqlTable(
  'sale_items',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    saleId: bigint('sale_id', { mode: 'number' })
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    productName: varchar('product_name', { length: 255 }).notNull(),
    partNumber: varchar('part_number', { length: 255 }).notNull(),
    quantity: int('quantity').notNull(),
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
    unitCost: decimal('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
    createdAt: ts('created_at').notNull().default(nowSql),
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
export const stockMovements = mysqlTable(
  'stock_movements',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    changeQty: int('change_qty').notNull(),
    qtyAfter: int('qty_after').notNull(),
    reason: varchar('reason', { length: 255 }).notNull(),
    saleId: bigint('sale_id', { mode: 'number' }).references(() => sales.id),
    note: text('note'),
    createdBy: varchar('created_by', { length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: ts('created_at').notNull().default(nowSql),
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
export const receiptCounters = mysqlTable('receipt_counters', {
  year: int('year').primaryKey(),
  lastNumber: int('last_number').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Settings (Single-row store settings)
// ---------------------------------------------------------------------------
export const settings = mysqlTable(
  'settings',
  {
    id: int('id').primaryKey().default(1),
    shopName: varchar('shop_name', { length: 255 }).notNull().default('Colombo Auto Spares & Parts'),
    address: text('address'),
    phone: varchar('phone', { length: 255 }),
    receiptFooter: text('receipt_footer'),
    cashierMaxDiscountPct: decimal('cashier_max_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('5.00'),
    updatedAt: ts('updated_at')
      .notNull()
      .default(nowSql)
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
// Suppliers, their invoices (what the shop owes), payments and price lists
// ---------------------------------------------------------------------------
export const suppliers = mysqlTable(
  'suppliers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    contactPerson: varchar('contact_person', { length: 255 }),
    phone: varchar('phone', { length: 255 }),
    email: varchar('email', { length: 255 }),
    address: varchar('address', { length: 500 }),
    /** Default credit period in days; pre-fills the due date of new invoices. */
    paymentTermsDays: int('payment_terms_days').notNull().default(0),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: ts('created_at').notNull().default(nowSql),
  },
  (t) => [check('suppliers_terms_check', sql`${t.paymentTermsDays} >= 0`)],
);

export const supplierInvoices = mysqlTable(
  'supplier_invoices',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    supplierId: bigint('supplier_id', { mode: 'number' })
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: varchar('invoice_number', { length: 255 }).notNull(),
    invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 255 }).references(() => user.id),
    createdAt: ts('created_at').notNull().default(nowSql),
  },
  (t) => [
    unique('supplier_invoices_supplier_number_unique').on(t.supplierId, t.invoiceNumber),
    check('supplier_invoices_amount_check', sql`${t.amount} > 0`),
    index('supplier_invoices_supplier_id_idx').on(t.supplierId),
    index('supplier_invoices_due_date_idx').on(t.dueDate),
  ],
);

export const supplierPayments = mysqlTable(
  'supplier_payments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    invoiceId: bigint('invoice_id', { mode: 'number' })
      .notNull()
      .references(() => supplierInvoices.id),
    paymentDate: date('payment_date', { mode: 'string' }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }).notNull(), // cash | bank_transfer | cheque
    /** Bank transfer reference / receipt number. */
    reference: varchar('reference', { length: 255 }),
    chequeNumber: varchar('cheque_number', { length: 64 }),
    chequeBank: varchar('cheque_bank', { length: 255 }),
    /** Date written on the cheque (may be post-dated). */
    chequeDate: date('cheque_date', { mode: 'string' }),
    /** pending | cleared | bounced. A bounced cheque no longer counts as paid. */
    chequeStatus: varchar('cheque_status', { length: 16 }),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 255 }).references(() => user.id),
    createdAt: ts('created_at').notNull().default(nowSql),
  },
  (t) => [
    check('supplier_payments_amount_check', sql`${t.amount} > 0`),
    check('supplier_payments_method_check', sql`${t.method} IN ('cash', 'bank_transfer', 'cheque')`),
    check(
      'supplier_payments_cheque_check',
      sql`(${t.method} = 'cheque') = (${t.chequeStatus} IS NOT NULL) AND (${t.chequeStatus} IS NULL OR ${t.chequeStatus} IN ('pending', 'cleared', 'bounced'))`,
    ),
    index('supplier_payments_invoice_id_idx').on(t.invoiceId),
    index('supplier_payments_date_idx').on(t.paymentDate),
  ],
);

export const supplierPriceItems = mysqlTable(
  'supplier_price_items',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    supplierId: bigint('supplier_id', { mode: 'number' })
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    itemName: varchar('item_name', { length: 255 }).notNull(),
    partNumber: varchar('part_number', { length: 255 }),
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
    /** The day the supplier quoted this price. */
    priceDate: date('price_date', { mode: 'string' }).notNull(),
    notes: varchar('notes', { length: 500 }),
    updatedAt: ts('updated_at').notNull().default(nowSql),
  },
  (t) => [
    check('supplier_price_items_price_check', sql`${t.unitPrice} >= 0`),
    index('supplier_price_items_supplier_id_idx').on(t.supplierId),
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
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type SupplierPriceItem = typeof supplierPriceItems.$inferSelect;
