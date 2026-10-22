import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/src/db';
import {
  supplierPayments,
  supplierReturns,
  products,
  sales,
  saleItems,
  stockMovements,
  receiptCounters,
  productBarcodes,
  productPartNumbers,
  categories,
  brands,
} from '@/src/db/schema';
import { previewProductImport, commitProductImport, exportProductsCsv } from '@/src/data/product-import';
import { eq, sql } from 'drizzle-orm';
import {
  executeCompleteSale,
  executeVoidSale,
  executeLookupBarcode,
  executeDeleteSale,
} from '@/src/lib/sales-ops';
import {
  createSupplierOp,
  updateSupplierOp,
  deleteSupplierOp,
  createInvoiceOp,
  updateInvoiceOp,
  deleteInvoiceOp,
  recordPaymentOp,
  setChequeStatusOp,
  deletePaymentOp,
  savePriceItemOp,
  deletePriceItemOp,
  createReturnOp,
  deleteReturnOp,
  recordRefundOp,
  deleteRefundOp,
  applyCreditOp,
} from '@/src/lib/supplier-ops';
import {
  getInvoiceRows,
  getPayablesSummary,
  getSupplierList,
  getPriceList,
  getInvoiceItems,
  getProductSupplierHistory,
  getPurchaseHint,
} from '@/src/data/suppliers';
import { setSaleChequeStatusOp } from '@/src/lib/sale-cheque';
import { getSalesSummaryTotals, getSaleDetail } from '@/src/data/sales';
import { getDailySalesReport } from '@/src/data/reports';
import { getLowStockProducts } from '@/src/data/inventory';
import { getSupplierProducts, searchPurchaseProducts } from '@/src/data/suppliers';
import { executeAdjustStock } from '@/src/lib/inventory-ops';
import { executeCreateProduct, executeAddManufacturerBarcode } from '@/src/lib/products-ops';
import { generateInternalBarcode, isValidInternalBarcode } from '@/src/lib/barcode';
import {
  insertInternalBarcode,
  getOrCreateInternalBarcode,
  generateUniqueProductCode,
} from '@/src/lib/internal-barcode';
import {
  resetTestDatabase,
  TEST_OWNER,
  TEST_CASHIER,
  type TestSeedData,
} from './test-helper';

describe('POS System Hardening & Core Transactions (pos_test)', () => {
  let seed: TestSeedData;

  beforeEach(async () => {
    seed = await resetTestDatabase();
  });

  // 1. completeSale happy path
  it('completeSale happy path: decrements stock, records sale items and writes stock movements in one transaction', async () => {
    // Product 1 starts with 10 units
    const saleResult = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 2 }],
        paymentMethod: 'cash',
        amountTendered: '10000.00',
        discountType: 'none',
        discountValue: '0',
        customerName: 'Kamal Perera',
        customerPhone: '0771234567',
        vehicleNo: 'CAB-1234',
      },
      TEST_CASHIER,
    );

    expect(saleResult.success).toBe(true);
    expect(saleResult.data).toBeDefined();
    expect(saleResult.data?.receiptNumber).toMatch(/^INV-\d{4}-000001$/);
    expect(saleResult.data?.subtotal).toBe('10000.00');
    expect(saleResult.data?.total).toBe('10000.00');
    expect(saleResult.data?.changeGiven).toBe('0.00');

    // Verify product stock is decremented in DB (10 - 2 = 8)
    const [updatedProduct] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product1Id));
    expect(updatedProduct.stockQty).toBe(8);

    // Verify sale item was created
    const items = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, saleResult.data!.saleId));
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(seed.product1Id);
    expect(items[0].quantity).toBe(2);
    expect(items[0].unitPrice).toBe('5000.00');
    expect(items[0].lineTotal).toBe('10000.00');

    // Verify stock_movements ledger entry
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.saleId, saleResult.data!.saleId));
    expect(movements).toHaveLength(1);
    expect(movements[0].changeQty).toBe(-2);
    expect(movements[0].qtyAfter).toBe(8);
    expect(movements[0].reason).toBe('sale');
    expect(movements[0].createdBy).toBe(TEST_CASHIER.id);
  });

  // 2. Insufficient stock rolls back everything
  it('insufficient stock rolls back everything: no sale row, no stock movement, stock unchanged', async () => {
    // Product 1 has stock = 10, attempt to purchase 25
    const saleResult = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 25 }],
        paymentMethod: 'cash',
        amountTendered: '150000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );

    expect(saleResult.success).toBe(false);
    expect(saleResult.error).toContain('Only 10 left');

    // Verify no sales records created
    const salesCount = await db.select({ count: sql`count(*)` }).from(sales);
    expect(Number(salesCount[0].count)).toBe(0);

    // Verify no sale_items created
    const itemsCount = await db.select({ count: sql`count(*)` }).from(saleItems);
    expect(Number(itemsCount[0].count)).toBe(0);

    // Verify no stock movements recorded
    const movementsCount = await db.select({ count: sql`count(*)` }).from(stockMovements);
    expect(Number(movementsCount[0].count)).toBe(0);

    // Verify stock is untouched
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product1Id));
    expect(product.stockQty).toBe(10);
  });

  // 3. Concurrency test: two concurrent completeSale calls for the last unit
  it('two concurrent completeSale calls for the last unit: exactly one succeeds due to row locking', async () => {
    // Product 2 has stock = 1
    const [initialProduct] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product2Id));
    expect(initialProduct.stockQty).toBe(1);

    const saleInput = {
      items: [{ productId: seed.product2Id, quantity: 1 }],
      paymentMethod: 'cash' as const,
      amountTendered: '7000.00',
      discountType: 'none' as const,
      discountValue: '0',
    };

    // Fire both requests concurrently
    const [res1, res2] = await Promise.all([
      executeCompleteSale(saleInput, TEST_CASHIER),
      executeCompleteSale(saleInput, TEST_CASHIER),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    // Exactly one must succeed and exactly one must fail
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toMatch(/out of stock|Only 0 left/);

    // Final stock of product 2 must be exactly 0
    const [finalProduct] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product2Id));
    expect(finalProduct.stockQty).toBe(0);

    // Exactly 1 sale was created in the database
    const allSales = await db.select().from(sales);
    expect(allSales).toHaveLength(1);
  });

  // 4. No receipt-number gap after a failed sale
  it('no receipt-number gap after a failed sale: receipt counters remain sequential', async () => {
    // Step 1: Successful sale #1 -> Expect receipt 000001
    const res1 = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 1 }],
        paymentMethod: 'cash',
        amountTendered: '5000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );
    expect(res1.success).toBe(true);
    expect(res1.data?.receiptNumber).toMatch(/000001$/);

    // Step 2: Failed sale (product 3 is out of stock, stock = 0)
    const resFailed = await executeCompleteSale(
      {
        items: [{ productId: seed.product3Id, quantity: 1 }],
        paymentMethod: 'cash',
        amountTendered: '5000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );
    expect(resFailed.success).toBe(false);

    // Step 3: Next successful sale -> Must be receipt 000002 without any gaps!
    const res2 = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 1 }],
        paymentMethod: 'cash',
        amountTendered: '5000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );
    expect(res2.success).toBe(true);
    expect(res2.data?.receiptNumber).toMatch(/000002$/);

    // Check receipt_counters table directly
    const [counter] = await db.select().from(receiptCounters);
    expect(counter.lastNumber).toBe(2);
  });

  // 5. Void returns stock and records movement
  it('void returns stock: sale marked voided, stock restored, and movement logged', async () => {
    // 1. Complete sale for 3 units of product 1 (stock 10 -> 7)
    const saleRes = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 3 }],
        paymentMethod: 'cash',
        amountTendered: '15000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );
    expect(saleRes.success).toBe(true);

    const [stockAfterSale] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product1Id));
    expect(stockAfterSale.stockQty).toBe(7);

    // 2. Owner voids the sale
    const voidRes = await executeVoidSale(
      {
        saleId: saleRes.data!.saleId,
        reason: 'Customer cancelled transaction before pickup',
      },
      TEST_OWNER,
    );
    expect(voidRes.success).toBe(true);

    // 3. Verify sale row status
    const [voidedSale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, saleRes.data!.saleId));
    expect(voidedSale.status).toBe('voided');
    expect(voidedSale.voidedAt).toBeInstanceOf(Date);
    expect(voidedSale.voidedBy).toBe(TEST_OWNER.id);
    expect(voidedSale.voidReason).toBe('Customer cancelled transaction before pickup');

    // 4. Verify stock is restored to 10 (7 + 3 = 10)
    const [stockAfterVoid] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product1Id));
    expect(stockAfterVoid.stockQty).toBe(10);

    // 5. Verify void stock movement is written
    const voidMovement = await db
      .select()
      .from(stockMovements)
      .where(
        sql`${stockMovements.saleId} = ${saleRes.data!.saleId} AND ${stockMovements.reason} = 'void'`,
      );
    expect(voidMovement).toHaveLength(1);
    expect(voidMovement[0].changeQty).toBe(3);
    expect(voidMovement[0].qtyAfter).toBe(10);
    expect(voidMovement[0].createdBy).toBe(TEST_OWNER.id);
  });

  // 6. A cashier cannot void or adjust stock
  it('a cashier cannot void or adjust stock: role check strictly forbids non-owners', async () => {
    // 1. Create a sale
    const saleRes = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 1 }],
        paymentMethod: 'cash',
        amountTendered: '5000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );
    expect(saleRes.success).toBe(true);

    // 2. Cashier attempts to void -> Must fail with Forbidden
    const cashierVoidRes = await executeVoidSale(
      {
        saleId: saleRes.data!.saleId,
        reason: 'Attempted cashier void',
      },
      TEST_CASHIER,
    );
    expect(cashierVoidRes.success).toBe(false);
    expect(cashierVoidRes.error).toContain('Forbidden: Only owners are authorized to void sales');

    // Verify sale status is still completed
    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, saleRes.data!.saleId));
    expect(sale.status).toBe('completed');

    // 3. Cashier attempts to adjust stock -> Must fail with Forbidden
    const cashierAdjustRes = await executeAdjustStock(
      {
        productId: seed.product1Id,
        changeQty: 5,
        reason: 'adjustment',
        note: 'Cashier manual boost',
      },
      TEST_CASHIER,
    );
    expect(cashierAdjustRes.success).toBe(false);
    expect(cashierAdjustRes.error).toContain('Forbidden: Only owners are authorized to adjust stock');

    // Verify stock is untouched by the cashier attempt
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product1Id));
    expect(product.stockQty).toBe(9); // 10 minus the 1 sold earlier
  });

  // 7. Internal barcode generated in same transaction on product creation
  it('creates a product with a generated SKU that is also its internal barcode', async () => {
    const [p1] = await db.select().from(products).where(eq(products.id, seed.product1Id));

    const newProdRes = await executeCreateProduct(
      {
        name: 'New Test Oil Filter',
        partNumber: 'OIL-FLT-999',
        categoryId: p1.categoryId,
        costPrice: '1500.00',
        price: '2500.00',
        openingStock: 5,
        reorderLevel: 2,
        unit: 'pcs',
        isActive: true,
        alternatePartNumbers: [],
        fitments: [],
      },
      TEST_OWNER,
    );

    expect(newProdRes.success).toBe(true);
    const newId = newProdRes.data!.id;
    const [created] = await db.select().from(products).where(eq(products.id, newId));

    // The SKU was generated: '20' + 8 random digits, not derived from the id
    expect(created.sku).toMatch(/^20\d{8}$/);
    expect(created.sku).not.toBe('20' + String(newId).padStart(8, '0'));

    // ... and it IS the product's one internal barcode, so scanning the SKU finds the product
    const barcodes = await db.select().from(productBarcodes).where(eq(productBarcodes.productId, newId));
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0].kind).toBe('internal');
    expect(barcodes[0].code).toBe(created.sku);
    const scanned = await executeLookupBarcode(created.sku);
    expect(scanned.success).toBe(true);
    expect(scanned.data?.product.id).toBe(newId);
  });

  it('ignores a SKU sent by the client: SKUs are only ever generated', async () => {
    const [p1] = await db.select().from(products).where(eq(products.id, seed.product1Id));
    const res = await executeCreateProduct(
      {
        sku: 'MY-OWN-SKU',
        name: 'Tries To Pick A SKU',
        partNumber: 'PN-X',
        categoryId: p1.categoryId,
        costPrice: '1.00',
        price: '2.00',
        openingStock: 0,
        reorderLevel: 0,
        unit: 'pcs',
        isActive: true,
        alternatePartNumbers: [],
        fitments: [],
      } as unknown as Parameters<typeof executeCreateProduct>[0],
      TEST_OWNER,
    );
    expect(res.success).toBe(true);
    const [created] = await db.select().from(products).where(eq(products.id, res.data!.id));
    expect(created.sku).not.toBe('MY-OWN-SKU');
    expect(created.sku).toMatch(/^20\d{8}$/);
  });

  it('gives every new product a different SKU, even when created at the same time', async () => {
    const [p1] = await db.select().from(products).where(eq(products.id, seed.product1Id));
    const make = (n: number) =>
      executeCreateProduct(
        {
          name: `Bulk ${n}`,
          partNumber: `BULK-${n}`,
          categoryId: p1.categoryId,
          costPrice: '1.00',
          price: '2.00',
          openingStock: 0,
          reorderLevel: 0,
          unit: 'pcs',
          isActive: true,
          alternatePartNumbers: [],
          fitments: [],
        },
        TEST_OWNER,
      );
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => make(i)));
    expect(results.every((r) => r.success)).toBe(true);

    const skus = (await db.select({ sku: products.sku }).from(products)).map((r) => r.sku);
    expect(new Set(skus.map((s) => s.toLowerCase())).size).toBe(skus.length); // all SKUs unique
    const codes = (await db.select({ code: productBarcodes.code }).from(productBarcodes)).map((r) => r.code);
    expect(new Set(codes.map((c) => c.toLowerCase())).size).toBe(codes.length); // all barcodes unique
  });

  it('a generated SKU never clashes with an existing SKU or any existing barcode', async () => {
    // product 1 has an internal barcode; also add a manufacturer barcode to product 2
    const [internal] = await db.select().from(productBarcodes).where(eq(productBarcodes.productId, seed.product1Id));
    await db.insert(productBarcodes).values({ productId: seed.product2Id, code: '2055555555', kind: 'manufacturer' });
    const taken = [internal.code, '2055555555', 'TEST-PAD-01'];
    const sequence = [...taken, '2066666666'];

    const code = await generateUniqueProductCode(db, { generate: () => sequence.shift()! });
    expect(code).toBe('2066666666');
    expect(sequence).toHaveLength(0); // it skipped all three taken values first

    // codes listed in `avoid` (e.g. barcodes in a CSV being imported) are skipped too
    const seq2 = ['2077777777', '2088888888'];
    const code2 = await generateUniqueProductCode(db, { avoid: new Set(['2077777777']), generate: () => seq2.shift()! });
    expect(code2).toBe('2088888888');
  });

  it('generates random internal barcodes in the 20xxxxxxxx format', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateInternalBarcode();
      expect(code).toMatch(/^20\d{8}$/);
      expect(isValidInternalBarcode(code)).toBe(true);
      codes.add(code);
    }
    // 500 draws from 100M values: duplicates would mean the output is not random
    expect(codes.size).toBeGreaterThan(495);
  });

  it('picks another code when a random internal barcode is already taken', async () => {
    const [existing] = await db
      .select({ code: productBarcodes.code })
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, seed.product1Id));

    // New product with no barcode yet
    const [{ id: newProductId }] = await db
      .insert(products)
      .values({
        sku: 'COLLIDE-01',
        name: 'Collision Test Part',
        partNumber: 'COL-001',
        categoryId: (await db.select().from(products).where(eq(products.id, seed.product1Id)))[0].categoryId,
        costPrice: '100.00',
        price: '200.00',
      })
      .$returningId();

    // Generator first returns a code that is already in use, then a free one
    const candidates = [existing.code, existing.code, '2077777777'];
    const code = await insertInternalBarcode(db, newProductId, () => candidates.shift()!);

    expect(code).toBe('2077777777');
    const rows = await db.select().from(productBarcodes).where(eq(productBarcodes.productId, newProductId));
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('2077777777');
  });

  it('does not retry when the product already has an internal barcode', async () => {
    let calls = 0;
    await expect(
      insertInternalBarcode(db, seed.product1Id, () => {
        calls++;
        return '2088888888';
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('getOrCreateInternalBarcode returns the existing code, or creates one when missing', async () => {
    const [existing] = await db
      .select({ code: productBarcodes.code })
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, seed.product1Id));
    expect(await getOrCreateInternalBarcode(seed.product1Id)).toBe(existing.code);

    await db.delete(productBarcodes).where(eq(productBarcodes.productId, seed.product2Id));
    const created = await getOrCreateInternalBarcode(seed.product2Id);
    expect(created).toMatch(/^20\d{8}$/);
    expect(await getOrCreateInternalBarcode(seed.product2Id)).toBe(created); // stable on repeat
  });

  // 8. Barcode database constraints & duplicate error handling
  it('enforces barcode constraints and rejects duplicate barcodes', async () => {
    // Add manufacturer barcode to product 1
    const addRes1 = await executeAddManufacturerBarcode({
      productId: seed.product1Id,
      code: '4901234567894',
    });
    expect(addRes1.success).toBe(true);

    // Attempt to add the exact same barcode to product 2 -> Must fail with duplicate message
    const addRes2 = await executeAddManufacturerBarcode({
      productId: seed.product2Id,
      code: '4901234567894',
    });
    expect(addRes2.success).toBe(false);
    expect(addRes2.error).toContain('This barcode already belongs to');

    // Partial unique index: product can have at most one internal barcode
    await expect(
      db.insert(productBarcodes).values({
        productId: seed.product1Id,
        code: '2099999999',
        kind: 'internal',
      }),
    ).rejects.toThrow();
  });

  // 9. Barcode lookup: exact match, inactive, out of stock, not found
  it('lookupBarcode correctly returns exact matches and identifies inactive or out-of-stock items', async () => {
    const internalCode1 = '20' + String(seed.product1Id).padStart(8, '0');
    const internalCode3 = '20' + String(seed.product3Id).padStart(8, '0'); // Product 3 has stock = 0

    // Exact match on active product with stock
    const found = await executeLookupBarcode(internalCode1);
    expect(found.success).toBe(true);
    expect(found.data?.product.id).toBe(seed.product1Id);
    expect(found.data?.product.partNumber).toBe('04465-TEST1');
    expect(found.data?.product.stockQty).toBe(10);

    // Out of stock product
    const outOfStock = await executeLookupBarcode(internalCode3);
    expect(outOfStock.success).toBe(false);
    expect(outOfStock.error).toBe('out_of_stock');

    // Inactive product
    await db.update(products).set({ isActive: false }).where(eq(products.id, seed.product1Id));
    const inactive = await executeLookupBarcode(internalCode1);
    expect(inactive.success).toBe(false);
    expect(inactive.error).toBe('inactive');

    // Non-existent barcode
    const notFound = await executeLookupBarcode('9999999999999');
    expect(notFound.success).toBe(false);
    expect(notFound.error).toBe('not_found');
  });

  // 10. Scanning same part twice yields quantity 2
  it('completes checkout sale with quantity 2 when same part is added twice', async () => {
    // Sale with 2 units of product 1
    const saleResult = await executeCompleteSale(
      {
        items: [{ productId: seed.product1Id, quantity: 2 }],
        paymentMethod: 'cash',
        amountTendered: '10000.00',
        discountType: 'none',
        discountValue: '0',
      },
      TEST_CASHIER,
    );

    expect(saleResult.success).toBe(true);

    const [updatedProduct] = await db
      .select()
      .from(products)
      .where(eq(products.id, seed.product1Id));
    expect(updatedProduct.stockQty).toBe(8); // 10 - 2 = 8
  });

  // ---------------------------------------------------------------------------
  // Deleting sales (owner only)
  // ---------------------------------------------------------------------------
  describe('deleting sales', () => {
    async function makeSale(productId: number, quantity: number) {
      const res = await executeCompleteSale(
        {
          items: [{ productId, quantity }],
          paymentMethod: 'cash',
          amountTendered: '100000.00',
          discountType: 'none',
          discountValue: '0',
        },
        TEST_CASHIER,
      );
      expect(res.success).toBe(true);
      return res.data!;
    }

    const stockOf = async (productId: number) =>
      (await db.select().from(products).where(eq(products.id, productId)))[0].stockQty;

    it('deleting a completed sale puts the items back into stock and removes the sale and its history', async () => {
      const sale = await makeSale(seed.product1Id, 3);
      expect(await stockOf(seed.product1Id)).toBe(7);

      const res = await executeDeleteSale(
        { saleId: sale.saleId, confirmReceipt: sale.receiptNumber },
        TEST_OWNER,
      );
      expect(res.success).toBe(true);
      expect(res.data).toMatchObject({ saleId: sale.saleId, receiptNumber: sale.receiptNumber, stockRestored: true });

      expect(await stockOf(seed.product1Id)).toBe(10); // 7 + 3 back

      expect(await db.select().from(sales).where(eq(sales.id, sale.saleId))).toHaveLength(0);
      expect(await db.select().from(saleItems).where(eq(saleItems.saleId, sale.saleId))).toHaveLength(0);
      expect(await db.select().from(stockMovements).where(eq(stockMovements.saleId, sale.saleId))).toHaveLength(0);
    });

    it('deleting a voided sale leaves stock alone (the void already returned it) and removes all its lines', async () => {
      const sale = await makeSale(seed.product1Id, 4);
      const voided = await executeVoidSale({ saleId: sale.saleId, reason: 'Customer cancelled' }, TEST_OWNER);
      expect(voided.success).toBe(true);
      expect(await stockOf(seed.product1Id)).toBe(10);

      const res = await executeDeleteSale(
        { saleId: sale.saleId, confirmReceipt: sale.receiptNumber },
        TEST_OWNER,
      );
      expect(res.success).toBe(true);
      expect(res.data?.stockRestored).toBe(false);

      expect(await stockOf(seed.product1Id)).toBe(10); // not 14
      expect(await db.select().from(sales).where(eq(sales.id, sale.saleId))).toHaveLength(0);
      // both the 'sale' and the 'void' movement are gone
      expect(await db.select().from(stockMovements).where(eq(stockMovements.saleId, sale.saleId))).toHaveLength(0);
    });

    it('only deletes the chosen sale and keeps other history', async () => {
      const first = await makeSale(seed.product1Id, 2);
      const second = await makeSale(seed.product1Id, 1);
      expect(await stockOf(seed.product1Id)).toBe(7);

      const res = await executeDeleteSale(
        { saleId: first.saleId, confirmReceipt: first.receiptNumber },
        TEST_OWNER,
      );
      expect(res.success).toBe(true);

      expect(await stockOf(seed.product1Id)).toBe(9); // only the 2 from the first sale came back
      expect(await db.select().from(sales).where(eq(sales.id, second.saleId))).toHaveLength(1);
      expect(await db.select().from(saleItems).where(eq(saleItems.saleId, second.saleId))).toHaveLength(1);
      expect(await db.select().from(stockMovements).where(eq(stockMovements.saleId, second.saleId))).toHaveLength(1);
    });

    it('refuses when the typed receipt number does not match, and changes nothing', async () => {
      const sale = await makeSale(seed.product1Id, 2);

      const res = await executeDeleteSale(
        { saleId: sale.saleId, confirmReceipt: 'INV-0000-999999' },
        TEST_OWNER,
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('does not match');

      expect(await stockOf(seed.product1Id)).toBe(8);
      expect(await db.select().from(sales).where(eq(sales.id, sale.saleId))).toHaveLength(1);
      expect(await db.select().from(stockMovements).where(eq(stockMovements.saleId, sale.saleId))).toHaveLength(1);
    });

    it('accepts the receipt number typed in lower case or with spaces around it', async () => {
      const sale = await makeSale(seed.product1Id, 1);
      const res = await executeDeleteSale(
        { saleId: sale.saleId, confirmReceipt: `  ${sale.receiptNumber.toLowerCase()} ` },
        TEST_OWNER,
      );
      expect(res.success).toBe(true);
    });

    it('does not let a cashier delete a sale', async () => {
      const sale = await makeSale(seed.product1Id, 2);

      const res = await executeDeleteSale(
        { saleId: sale.saleId, confirmReceipt: sale.receiptNumber },
        TEST_CASHIER,
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('Forbidden');

      expect(await stockOf(seed.product1Id)).toBe(8);
      expect(await db.select().from(sales).where(eq(sales.id, sale.saleId))).toHaveLength(1);
    });

    it('reports a sale that does not exist, and rejects bad input', async () => {
      const missing = await executeDeleteSale({ saleId: 987654, confirmReceipt: 'INV-1' }, TEST_OWNER);
      expect(missing.success).toBe(false);
      expect(missing.error).toContain('not found');

      const bad = await executeDeleteSale({ saleId: 0, confirmReceipt: '' }, TEST_OWNER);
      expect(bad.success).toBe(false);
    });

    it('cannot delete the same sale twice or restore stock twice', async () => {
      const sale = await makeSale(seed.product1Id, 5);
      const input = { saleId: sale.saleId, confirmReceipt: sale.receiptNumber };

      const [a, b] = await Promise.all([
        executeDeleteSale(input, TEST_OWNER),
        executeDeleteSale(input, TEST_OWNER),
      ]);
      expect([a.success, b.success].filter(Boolean)).toHaveLength(1); // exactly one wins
      expect(await stockOf(seed.product1Id)).toBe(10); // restored once, not twice
    });

    it('keeps stock movements that are not tied to the deleted sale', async () => {
      const sale = await makeSale(seed.product1Id, 1);
      // A delivery received after the sale: stock +5 with its own history line (not tied to any sale)
      await db.update(products).set({ stockQty: sql`${products.stockQty} + 5` }).where(eq(products.id, seed.product1Id));
      await db.insert(stockMovements).values({
        productId: seed.product1Id,
        changeQty: 5,
        qtyAfter: 14,
        reason: 'received',
        note: 'New delivery',
        createdBy: TEST_OWNER.id,
      });
      const before = (await db.select().from(stockMovements).where(eq(stockMovements.productId, seed.product1Id))).length;

      const res = await executeDeleteSale(
        { saleId: sale.saleId, confirmReceipt: sale.receiptNumber },
        TEST_OWNER,
      );
      expect(res.success).toBe(true);

      const after = await db.select().from(stockMovements).where(eq(stockMovements.productId, seed.product1Id));
      expect(after).toHaveLength(before - 1); // only the sale's own movement went
      expect(after.some((m) => m.reason === 'received')).toBe(true);
      expect(await stockOf(seed.product1Id)).toBe(15); // 10 - 1 + 5 + 1 back
    });
  });

  // ---------------------------------------------------------------------------
  // Product CSV import / export (owner only)
  // ---------------------------------------------------------------------------
  describe('product CSV import and export', () => {
    const HEADER =
      'sku,name,part_number,category,brand,description,unit,bin_location,cost_price,selling_price,stock,reorder_level,active,alternate_part_numbers,manufacturer_barcodes';
    const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');
    const count = async (table: typeof products | typeof categories | typeof brands | typeof stockMovements) =>
      (await db.select().from(table)).length;
    const productBySku = async (sku: string) =>
      (await db.select().from(products).where(eq(products.sku, sku)))[0];
    const productByName = async (name: string) =>
      (await db.select().from(products).where(eq(products.name, name)))[0];

    it('previews what would happen without writing anything', async () => {
      const before = await count(products);
      const preview = await previewProductImport(
        csv(
          ',Tyre 185/65R15,TY-185,Tyres,Michelin,,pcs,B-1,12000,15000,8,2,yes,,', // empty SKU = new product
          'TEST-PAD-01,Standard Brake Pads,04465-TEST1,Brakes,,,,,3000,5500,,,,,', // price changed
          'TEST-PAD-02,Last Unit Brake Pad,04465-TEST2,Brakes,,,,,4000,7000,,,,,', // identical
          ',Broken,PN,Brakes,,,,,abc,100,,,,,', // bad price
          'NOPE-999,Unknown SKU,PN-9,Brakes,,,,,1,2,,,,,', // SKU that does not exist
        ),
      );
      expect(preview.fileErrors).toEqual([]);
      expect(preview.counts).toEqual({ create: 1, update: 1, unchanged: 1, error: 2 });
      expect(preview.newCategories).toEqual(['Tyres']);
      expect(preview.newBrands).toEqual(['Michelin']);
      const byName = Object.fromEntries(preview.rows.map((r) => [r.name, r]));
      expect(byName['Tyre 185/65R15'].action).toBe('create');
      expect(byName['Standard Brake Pads'].action).toBe('update');
      expect(byName['Standard Brake Pads'].changes.join(' ')).toContain('selling price: 5000.00 -> 5500.00');
      expect(byName['Last Unit Brake Pad'].action).toBe('unchanged');
      expect(byName['Broken'].action).toBe('error');
      expect(byName['Unknown SKU'].errors.join(' ')).toContain('No product has this SKU');

      // nothing was written
      expect(await count(products)).toBe(before);
      expect((await productBySku('TEST-PAD-01')).price).toBe('5000.00');
      expect(await count(categories)).toBe(1);
      expect(await count(brands)).toBe(0);
    });

    it('creates new products with a generated SKU (also the barcode), opening stock, alternates and new category/brand', async () => {
      const result = await commitProductImport(
        csv(',Tyre 185/65R15,TY-185,Tyres,Michelin,Summer tyre,,B-1,12000,15000,7,2,,"oem:TY-OEM-1;ALT-185",4900000000017'),
        TEST_OWNER.id,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toMatchObject({ created: 1, updated: 0, categoriesCreated: 1, brandsCreated: 1 });

      const created = await productByName('Tyre 185/65R15');
      expect(created).toMatchObject({
        partNumber: 'TY-185',
        unit: 'pcs', // default when the cell is blank
        binLocation: 'B-1',
        costPrice: '12000.00',
        price: '15000.00',
        stockQty: 7,
        reorderLevel: 2,
        isActive: true, // default when blank
      });
      expect(created.sku).toMatch(/^20\d{8}$/); // generated
      expect((await db.select().from(categories).where(eq(categories.id, created.categoryId)))[0].name).toBe('Tyres');
      expect((await db.select().from(brands).where(eq(brands.id, created.brandId!)))[0].name).toBe('Michelin');

      // stock history: one 'opening' movement for the imported quantity
      const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, created.id));
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ reason: 'opening', changeQty: 7, qtyAfter: 7, createdBy: TEST_OWNER.id, note: 'Imported from CSV' });

      // barcodes: the SKU is the internal barcode, plus the manufacturer one
      const barcodes = await db.select().from(productBarcodes).where(eq(productBarcodes.productId, created.id));
      expect(barcodes.find((b) => b.kind === 'internal')!.code).toBe(created.sku);
      expect(barcodes.find((b) => b.kind === 'manufacturer')!.code).toBe('4900000000017');

      const alternates = await db.select().from(productPartNumbers).where(eq(productPartNumbers.productId, created.id));
      expect(alternates.map((a) => `${a.kind}:${a.partNumber}`).sort()).toEqual(['alternate:ALT-185', 'oem:TY-OEM-1']);
    });

    it('gives every imported new product its own unique SKU', async () => {
      const rows = Array.from({ length: 25 }, (_, i) => `,Imported ${i},IMP-${i},Brakes,,,,,1,2,,,,,`);
      const result = await commitProductImport(csv(...rows), TEST_OWNER.id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.summary.created).toBe(25);

      const skus = (await db.select({ sku: products.sku }).from(products)).map((r) => r.sku);
      expect(new Set(skus.map((s) => s.toLowerCase())).size).toBe(skus.length);
      const codes = (await db.select({ code: productBarcodes.code }).from(productBarcodes)).map((r) => r.code);
      expect(new Set(codes.map((c) => c.toLowerCase())).size).toBe(codes.length);
    });

    it('accepts a file that has no SKU column at all: every row is a new product', async () => {
      const result = await commitProductImport(
        'name,part_number,category,cost_price,selling_price\nNo Sku Column,PN-N,Brakes,10,20\n',
        TEST_OWNER.id,
      );
      expect(result.ok).toBe(true);
      expect((await productByName('No Sku Column')).sku).toMatch(/^20\d{8}$/);
    });

    it('warns when a new row has the part number of an existing product (e.g. a file imported twice)', async () => {
      const preview = await previewProductImport(csv(',Standard Brake Pads,04465-TEST1,Brakes,,,,,3000,5000,,,,,'));
      expect(preview.counts.create).toBe(1);
      expect(preview.rows[0].warnings.join(' ')).toContain('already exists (SKU TEST-PAD-01)');
    });

    it('does not write an opening movement when the imported stock is 0 or blank', async () => {
      await commitProductImport(csv(',No stock,PN-Z,Brakes,,,,,1,2,0,,,,', ',Blank stock,PN-Z2,Brakes,,,,,1,2,,,,,'), TEST_OWNER.id);
      for (const name of ['No stock', 'Blank stock']) {
        const p = await productByName(name);
        expect(p.stockQty).toBe(0);
        expect(await db.select().from(stockMovements).where(eq(stockMovements.productId, p.id))).toHaveLength(0);
      }
    });

    it('updates existing products by SKU, never changes their SKU or stock', async () => {
      const before = await productBySku('TEST-PAD-01');
      const movementsBefore = await count(stockMovements);

      const result = await commitProductImport(
        // lower-case SKU still matches; stock column says 99 and must be ignored
        csv('test-pad-01,Premium Brake Pads,04465-NEW,brakes,Bosch,New description,pair,C-9,3500,6200,99,4,no,"oem:OEM-9;ALT-9",4911111111116'),
        TEST_OWNER.id,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toMatchObject({ created: 0, updated: 1, brandsCreated: 1, categoriesCreated: 0 });

      const after = await productBySku('TEST-PAD-01');
      expect(after).toMatchObject({
        id: before.id,
        sku: 'TEST-PAD-01', // keeps its original SKU and spelling
        name: 'Premium Brake Pads',
        partNumber: '04465-NEW',
        unit: 'pair',
        binLocation: 'C-9',
        description: 'New description',
        costPrice: '3500.00',
        price: '6200.00',
        reorderLevel: 4,
        isActive: false,
        stockQty: before.stockQty, // untouched
      });
      expect(await count(stockMovements)).toBe(movementsBefore); // no stock history written
      expect(await count(categories)).toBe(1); // 'brakes' matched 'Brakes'

      const alternates = await db.select().from(productPartNumbers).where(eq(productPartNumbers.productId, before.id));
      expect(alternates.map((a) => `${a.kind}:${a.partNumber}`).sort()).toEqual(['alternate:ALT-9', 'oem:OEM-9']);
      const barcodes = await db.select().from(productBarcodes).where(eq(productBarcodes.productId, before.id));
      expect(barcodes.filter((b) => b.kind === 'manufacturer').map((b) => b.code)).toEqual(['4911111111116']);
      expect(barcodes.filter((b) => b.kind === 'internal')).toHaveLength(1); // internal code untouched
    });

    it('leaves values alone when optional cells are blank, replaces alternates, and only ever adds barcodes', async () => {
      await commitProductImport(
        csv('TEST-PAD-01,Standard Brake Pads,04465-TEST1,Brakes,Bosch,Keep me,set,A-1,3000,5000,,5,,"OEM-1;OEM-2",4911111111116'),
        TEST_OWNER.id,
      );
      const second = await commitProductImport(
        // brand/description/unit/bin/reorder/active blank; alternates replaced; barcodes cell lists a different code
        csv('TEST-PAD-01,Standard Brake Pads,04465-TEST1,Brakes,,,,,3000,5100,,,,OEM-3,4922222222223'),
        TEST_OWNER.id,
      );
      expect(second.ok).toBe(true);

      const p = await productBySku('TEST-PAD-01');
      expect(p).toMatchObject({ description: 'Keep me', unit: 'set', binLocation: 'A-1', reorderLevel: 5, isActive: true, price: '5100.00' });
      expect(p.brandId).not.toBeNull(); // brand kept
      const alternates = await db.select().from(productPartNumbers).where(eq(productPartNumbers.productId, p.id));
      expect(alternates.map((a) => a.partNumber)).toEqual(['OEM-3']);
      const manufacturer = (await db.select().from(productBarcodes).where(eq(productBarcodes.productId, p.id)))
        .filter((b) => b.kind === 'manufacturer')
        .map((b) => b.code)
        .sort();
      expect(manufacturer).toEqual(['4911111111116', '4922222222223']); // old one kept, new one added
    });

    it('imports nothing when any row has an error, unless invalid rows are skipped', async () => {
      const file = csv(',Good,PN-G,Brakes,,,,,1,2,3,,,,', ',Bad,PN-B,Brakes,,,,,oops,2,,,,,');
      const before = await count(products);

      const blocked = await commitProductImport(file, TEST_OWNER.id);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.error).toContain('1 row has errors');
        expect(blocked.preview.counts.error).toBe(1);
      }
      expect(await count(products)).toBe(before); // nothing saved

      const skipped = await commitProductImport(file, TEST_OWNER.id, { skipInvalid: true });
      expect(skipped.ok).toBe(true);
      if (skipped.ok) expect(skipped.summary).toMatchObject({ created: 1, skipped: 1 });
      expect(await productByName('Good')).toBeDefined();
      expect(await productByName('Bad')).toBeUndefined();
    });

    it('does not create categories or brands for rows that fail', async () => {
      await commitProductImport(
        csv(',Bad,PN-B,Mystery Category,Mystery Brand,,,,oops,2,,,,,'),
        TEST_OWNER.id,
        { skipInvalid: true },
      );
      expect(await count(categories)).toBe(1);
      expect(await count(brands)).toBe(0);
    });

    it('refuses a barcode that belongs to another product, or is used twice in the file', async () => {
      await commitProductImport(csv('TEST-PAD-02,Last Unit Brake Pad,04465-TEST2,Brakes,,,,,4000,7000,,,,,4933333333330'), TEST_OWNER.id);

      const preview = await previewProductImport(
        csv(
          'TEST-PAD-01,Standard Brake Pads,04465-TEST1,Brakes,,,,,3000,5000,,,,,4933333333330', // belongs to PAD-02
          ',New one,PN-1,Brakes,,,,,1,2,,,,,4944444444447',
          ',Another,PN-2,Brakes,,,,,1,2,,,,,4944444444447', // same code as the row above
        ),
      );
      const byName = Object.fromEntries(preview.rows.map((r) => [r.name, r]));
      expect(byName['Standard Brake Pads'].errors.join(' ')).toContain('already belongs to another product (TEST-PAD-02)');
      expect(byName['New one'].errors).toEqual([]);
      expect(byName['Another'].errors.join(' ')).toContain('also used on row 3');
    });

    it('rejects a file with missing columns before touching anything', async () => {
      const before = await count(products);
      const result = await commitProductImport('sku,name\nA-1,Thing\n', TEST_OWNER.id);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Missing required columns');
      expect(await count(products)).toBe(before);
    });

    it('exports every product with cost prices, alternates and barcodes, and reads back as "no change"', async () => {
      await commitProductImport(
        csv(
          ',"Pad, front ""deluxe""",PN-1,Brakes,Bosch,"Line one\nLine two",set,A-1,1500.5,2500,5,2,yes,"oem:OEM-1;ALT-1","4955555555554;4966666666661"',
          ',=Formula name,PN-2,Brakes,,,,,10,20,,,no,,',
        ),
        TEST_OWNER.id,
      );

      const exported = await exportProductsCsv();
      expect(exported.charCodeAt(0)).toBe(0xfeff); // BOM for Excel
      expect(exported).toContain('sku,name,part_number,category,brand,supplier,description,unit,bin_location,cost_price,selling_price,stock,reorder_level,active,alternate_part_numbers,manufacturer_barcodes,internal_barcode');
      expect(exported).toContain('TEST-PAD-01');
      expect(exported).toContain('1500.50');
      expect(exported).toContain('oem:OEM-1;ALT-1');
      expect(exported).toContain('4955555555554;4966666666661');
      expect(exported).toContain("'=Formula name"); // formula-looking text is neutralised for Excel

      // Importing the export again changes nothing: every row has its SKU, so it is "no change"
      const preview = await previewProductImport(exported);
      expect(preview.fileErrors).toEqual([]);
      expect(preview.counts.error).toBe(0);
      expect(preview.counts.create).toBe(0);
      expect(preview.counts.update).toBe(0);
      expect(preview.counts.unchanged).toBe(await count(products));
    });
  });

  describe('suppliers, invoices and payments', () => {
    const today = new Date().toISOString().slice(0, 10);

    async function newSupplier(name = 'Lanka Parts Traders') {
      const res = await createSupplierOp({ name, paymentTermsDays: 30, active: true }, TEST_OWNER);
      expect(res.success).toBe(true);
      return res.data!.id;
    }

    async function newInvoice(supplierId: number, amount = '10000.00', number = 'INV-1', dueDate: string | null = '2099-01-01') {
      const res = await createInvoiceOp(
        { supplierId, invoiceNumber: number, invoiceDate: '2019-01-01', dueDate, amount },
        TEST_OWNER,
      );
      expect(res.success).toBe(true);
      return res.data!.id;
    }

    const cash = (invoiceId: number, amount: string) => ({
      invoiceId,
      paymentDate: today,
      amount,
      method: 'cash' as const,
    });

    it('only owners can use supplier operations', async () => {
      const res = await createSupplierOp({ name: 'X', paymentTermsDays: 0 }, TEST_CASHIER);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden/);
    });

    it('rejects duplicate supplier names and duplicate invoice numbers per supplier', async () => {
      const a = await newSupplier('A Traders');
      const dup = await createSupplierOp({ name: 'A Traders', paymentTermsDays: 0 }, TEST_OWNER);
      expect(dup.success).toBe(false);

      const b = await newSupplier('B Traders');
      await newInvoice(a, '100.00', 'SAME');
      const again = await createInvoiceOp(
        { supplierId: a, invoiceNumber: 'SAME', invoiceDate: '2026-10-02', amount: '5.00' },
        TEST_OWNER,
      );
      expect(again.success).toBe(false);
      // the same number is fine for another supplier
      await newInvoice(b, '100.00', 'SAME');
    });

    it('tracks unpaid, partial and fully paid invoices across payment methods', async () => {
      const s = await newSupplier();
      const inv = await newInvoice(s, '10000.00');

      let [row] = await getInvoiceRows({ supplierId: s });
      expect(row.status).toBe('unpaid');
      expect(row.balance).toBe('10000.00');

      const p1 = await recordPaymentOp(cash(inv, '2500.50'), TEST_OWNER);
      expect(p1.success).toBe(true);
      expect(p1.data?.balance).toBe('7499.50');
      [row] = await getInvoiceRows({ supplierId: s });
      expect(row.status).toBe('partial');
      expect(row.paid).toBe('2500.50');

      const p2 = await recordPaymentOp(
        { ...cash(inv, '2000.00'), method: 'bank_transfer', reference: 'TXN-77' },
        TEST_OWNER,
      );
      expect(p2.success).toBe(true);

      const p3 = await recordPaymentOp(
        { ...cash(inv, '5499.50'), method: 'cheque', chequeNumber: '000123', chequeBank: 'BOC', chequeDate: today },
        TEST_OWNER,
      );
      expect(p3.success).toBe(true);
      [row] = await getInvoiceRows({ supplierId: s });
      expect(row.status).toBe('paid');
      expect(row.balance).toBe('0.00');
      expect(await getInvoiceRows({ status: 'open' })).toHaveLength(0);
    });

    it('does not allow paying more than the balance, even concurrently', async () => {
      const s = await newSupplier();
      const inv = await newInvoice(s, '1000.00');
      expect((await recordPaymentOp(cash(inv, '1000.01'), TEST_OWNER)).success).toBe(false);

      const results = await Promise.all([
        recordPaymentOp(cash(inv, '600.00'), TEST_OWNER),
        recordPaymentOp(cash(inv, '600.00'), TEST_OWNER),
      ]);
      expect(results.filter((r) => r.success)).toHaveLength(1);
      const [row] = await getInvoiceRows({ supplierId: s });
      expect(row.paid).toBe('600.00');
    });

    it('requires a cheque number for cheques', async () => {
      const s = await newSupplier();
      const inv = await newInvoice(s);
      const res = await recordPaymentOp({ ...cash(inv, '100.00'), method: 'cheque' }, TEST_OWNER);
      expect(res.success).toBe(false);
      expect(res.fieldErrors?.chequeNumber).toBeDefined();
    });

    it('a bounced cheque stops counting and can be paid again', async () => {
      const s = await newSupplier();
      const inv = await newInvoice(s, '5000.00');
      const cheque = await recordPaymentOp(
        { ...cash(inv, '5000.00'), method: 'cheque', chequeNumber: '555' },
        TEST_OWNER,
      );
      expect(cheque.success).toBe(true);
      expect((await getInvoiceRows())[0].status).toBe('paid');

      const summary = await getPayablesSummary();
      expect(summary.pendingChequesCount).toBe(1);
      expect(summary.pendingChequesAmount).toBe('5000.00');

      expect((await setChequeStatusOp(cheque.data!.id, 'bounced', TEST_OWNER)).success).toBe(true);
      const [row] = await getInvoiceRows();
      expect(row.status).toBe('unpaid');
      expect(row.balance).toBe('5000.00');

      // paid again in cash; now the old cheque cannot be counted again
      expect((await recordPaymentOp(cash(inv, '5000.00'), TEST_OWNER)).success).toBe(true);
      const back = await setChequeStatusOp(cheque.data!.id, 'cleared', TEST_OWNER);
      expect(back.success).toBe(false);
    });

    it('flags overdue invoices and totals the summary', async () => {
      const s = await newSupplier();
      await newInvoice(s, '3000.00', 'LATE', '2020-01-01');
      const paid = await newInvoice(s, '1000.00', 'DONE', '2020-01-01');
      await recordPaymentOp(cash(paid, '1000.00'), TEST_OWNER);
      await newInvoice(s, '500.00', 'FUTURE', '2099-01-01');

      const overdue = await getInvoiceRows({ status: 'overdue' });
      expect(overdue.map((r) => r.invoiceNumber)).toEqual(['LATE']);

      const summary = await getPayablesSummary();
      expect(summary.outstanding).toBe('3500.00');
      expect(summary.overdueAmount).toBe('3000.00');
      expect(summary.overdueInvoices).toBe(1);

      const [listed] = await getSupplierList();
      expect(listed.totalInvoiced).toBe('4500.00');
      expect(listed.totalPaid).toBe('1000.00');
      expect(listed.outstanding).toBe('3500.00');
    });

    it('guards invoice edits and deletes, and supplier deletes', async () => {
      const s = await newSupplier();
      const inv = await newInvoice(s, '2000.00');
      const pay = await recordPaymentOp(cash(inv, '1500.00'), TEST_OWNER);

      const tooLow = await updateInvoiceOp(
        inv,
        { supplierId: s, invoiceNumber: 'INV-1', invoiceDate: '2026-10-01', amount: '1000.00' },
        TEST_OWNER,
      );
      expect(tooLow.success).toBe(false);
      const raise = await updateInvoiceOp(
        inv,
        { supplierId: s, invoiceNumber: 'INV-1', invoiceDate: '2026-10-01', amount: '2500.00' },
        TEST_OWNER,
      );
      expect(raise.success).toBe(true);

      expect((await deleteInvoiceOp(inv, TEST_OWNER)).success).toBe(false); // has payments
      expect((await deleteSupplierOp(s, TEST_OWNER)).success).toBe(false); // has invoices

      expect((await deletePaymentOp(pay.data!.id, TEST_OWNER)).success).toBe(true);
      expect((await deleteInvoiceOp(inv, TEST_OWNER)).success).toBe(true);
      expect((await deleteSupplierOp(s, TEST_OWNER)).success).toBe(true);
    });

    it('keeps a price list per supplier and removes it with the supplier', async () => {
      const s = await newSupplier();
      const add = await savePriceItemOp(
        { supplierId: s, itemName: 'Brake Pad Set', partNumber: 'BP-1', unitPrice: '4500', priceDate: today },
        TEST_OWNER,
      );
      expect(add.success).toBe(true);
      let list = await getPriceList(s);
      expect(list).toHaveLength(1);
      expect(list[0].unitPrice).toBe('4500.00');
      expect(list[0].priceDate).toBe(today);

      const edit = await savePriceItemOp(
        { id: list[0].id, supplierId: s, itemName: 'Brake Pad Set', partNumber: 'BP-1', unitPrice: '4700.50', priceDate: today },
        TEST_OWNER,
      );
      expect(edit.success).toBe(true);
      list = await getPriceList(s);
      expect(list[0].unitPrice).toBe('4700.50');

      expect((await updateSupplierOp(s, { name: 'Renamed', paymentTermsDays: 7, active: false }, TEST_OWNER)).success).toBe(true);
      expect((await deletePriceItemOp(list[0].id, TEST_OWNER)).success).toBe(true);
      expect(await getPriceList(s)).toHaveLength(0);
    });
  });

  describe('cheque payments at checkout', () => {
    const chequeSale = (extra: Record<string, unknown> = {}) =>
      executeCompleteSale(
        {
          items: [{ productId: seed.product1Id, quantity: 1 }],
          paymentMethod: 'cheque',
          discountType: 'none',
          discountValue: '0',
          chequeNumber: '004455',
          chequeBank: 'BOC',
          chequeDate: '2026-11-01',
          ...extra,
        },
        TEST_CASHIER,
      );

    it('records a cheque sale as pending with its details, no cash tendered', async () => {
      const res = await chequeSale();
      expect(res.success).toBe(true);
      expect(res.data?.paymentMethod).toBe('cheque');
      expect(res.data?.amountTendered).toBeNull();

      const detail = await getSaleDetail(res.data!.saleId, TEST_OWNER);
      expect(detail?.paymentMethod).toBe('Cheque');
      expect(detail?.chequeNumber).toBe('004455');
      expect(detail?.chequeBank).toBe('BOC');
      expect(detail?.chequeDate).toBe('2026-11-01');
      expect(detail?.chequeStatus).toBe('pending');
    });

    it('requires a cheque number', async () => {
      const res = await chequeSale({ chequeNumber: '  ' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cheque number/i);
      const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(sales);
      expect(Number(n)).toBe(0);
    });

    it('is counted as cheque, not card, in summaries and the daily report', async () => {
      await chequeSale();
      await executeCompleteSale(
        { items: [{ productId: seed.product1Id, quantity: 1 }], paymentMethod: 'card', discountType: 'none', discountValue: '0' },
        TEST_CASHIER,
      );
      await executeCompleteSale(
        { items: [{ productId: seed.product1Id, quantity: 1 }], paymentMethod: 'cash', amountTendered: '99999', discountType: 'none', discountValue: '0' },
        TEST_CASHIER,
      );

      const totals = await getSalesSummaryTotals({}, TEST_OWNER);
      expect(totals.chequeCount).toBe(1);
      expect(totals.cardCount).toBe(1);
      expect(totals.cashCount).toBe(1);

      const daily = await getDailySalesReport();
      expect(daily).toHaveLength(1);
      expect(daily[0].cheque).toBe('5000.00');
      expect(daily[0].card).toBe('5000.00');
      expect(daily[0].cash).toBe('5000.00');
    });

    it('only the owner can mark a cheque cleared or bounced, and only for cheque sales', async () => {
      const res = await chequeSale();
      const id = res.data!.saleId;
      expect((await setSaleChequeStatusOp(id, 'cleared', TEST_CASHIER)).success).toBe(false);
      expect((await setSaleChequeStatusOp(id, 'bounced', TEST_OWNER)).success).toBe(true);
      expect((await getSaleDetail(id, TEST_OWNER))?.chequeStatus).toBe('bounced');

      const cash = await executeCompleteSale(
        { items: [{ productId: seed.product1Id, quantity: 1 }], paymentMethod: 'cash', amountTendered: '99999', discountType: 'none', discountValue: '0' },
        TEST_CASHIER,
      );
      expect((await setSaleChequeStatusOp(cash.data!.saleId, 'cleared', TEST_OWNER)).success).toBe(false);
    });
  });

  describe('supplier stock, returns and credit', () => {
    const today = new Date().toISOString().slice(0, 10);

    async function supplier(name: string) {
      const r = await createSupplierOp({ name, paymentTermsDays: 0, active: true }, TEST_OWNER);
      return r.data!.id;
    }
    async function invoiceWithItems(
      supplierId: number,
      number: string,
      items: { productId: number; quantity: number; unitCost: string }[],
      amount?: string,
    ) {
      const total = items.reduce((n, i) => n + i.quantity * Number(i.unitCost), 0).toFixed(2);
      const r = await createInvoiceOp(
        { supplierId, invoiceNumber: number, invoiceDate: '2026-10-01', amount: amount ?? total, items },
        TEST_OWNER,
      );
      expect(r.success).toBe(true);
      return r.data!.id;
    }
    const stockOf = async (id: number) => (await db.select().from(products).where(eq(products.id, id)))[0];
    const cash = (invoiceId: number, amount: string) => ({ invoiceId, paymentDate: today, amount, method: 'cash' as const });
    const retInput = (invoiceId: number, itemId: number, quantity: number) => ({
      invoiceId,
      returnDate: today,
      items: [{ invoiceItemId: itemId, quantity }],
    });

    it('receiving an invoice with products adds stock, sets the cost price and logs the movement', async () => {
      const s = await supplier('Lanka Parts');
      await invoiceWithItems(s, 'INV-A', [{ productId: seed.product1Id, quantity: 5, unitCost: '3300.50' }]);

      const p = await stockOf(seed.product1Id);
      expect(p.stockQty).toBe(15);
      expect(p.costPrice).toBe('3300.50');
      const [m] = await db.select().from(stockMovements).where(eq(stockMovements.productId, seed.product1Id));
      expect(m.reason).toBe('received');
      expect(m.changeQty).toBe(5);
      expect(m.qtyAfter).toBe(15);
      expect(m.note).toMatch(/INV-A/);
    });

    it('an amount-only invoice still works and does not touch stock', async () => {
      const s = await supplier('Plain');
      const r = await createInvoiceOp({ supplierId: s, invoiceNumber: 'P1', invoiceDate: today, amount: '1000' }, TEST_OWNER);
      expect(r.success).toBe(true);
      expect((await stockOf(seed.product1Id)).stockQty).toBe(10);
    });

    it('a failed invoice adds nothing: no invoice, no stock', async () => {
      const s = await supplier('Atomic');
      const r = await createInvoiceOp(
        { supplierId: s, invoiceNumber: 'X', invoiceDate: today, amount: '10', items: [{ productId: 999999, quantity: 1, unitCost: '5' }] },
        TEST_OWNER,
      );
      expect(r.success).toBe(false);
      expect(await getInvoiceRows()).toHaveLength(0);
    });

    it('a return takes stock out and lowers what is owed on an unpaid invoice', async () => {
      const s = await supplier('Returner');
      const inv = await invoiceWithItems(s, 'R1', [{ productId: seed.product1Id, quantity: 4, unitCost: '1000' }]);
      const [line] = await getInvoiceItems(inv);

      const r = await createReturnOp(retInput(inv, line.id, 3), TEST_OWNER);
      expect(r.success).toBe(true);
      expect(r.data?.total).toBe('3000.00');

      expect((await stockOf(seed.product1Id)).stockQty).toBe(11); // 10 + 4 - 3
      const [row] = await getInvoiceRows();
      expect(row.net).toBe('1000.00');
      expect(row.balance).toBe('1000.00');
      expect(row.credit).toBe('0.00');
      const moves = await db.select().from(stockMovements).where(eq(stockMovements.reason, 'supplier_return'));
      expect(moves).toHaveLength(1);
      expect(moves[0].changeQty).toBe(-3);

      const items = await getInvoiceItems(inv);
      expect(items[0].returnedQty).toBe(3);
      expect(items[0].returnableQty).toBe(1);
    });

    it('cannot return more than was delivered, counting earlier returns', async () => {
      const s = await supplier('Limit');
      const inv = await invoiceWithItems(s, 'L1', [{ productId: seed.product1Id, quantity: 4, unitCost: '100' }]);
      const [line] = await getInvoiceItems(inv);
      expect((await createReturnOp(retInput(inv, line.id, 5), TEST_OWNER)).success).toBe(false);
      expect((await createReturnOp(retInput(inv, line.id, 3), TEST_OWNER)).success).toBe(true);
      expect((await createReturnOp(retInput(inv, line.id, 2), TEST_OWNER)).success).toBe(false);
      expect((await createReturnOp(retInput(inv, line.id, 1), TEST_OWNER)).success).toBe(true);
    });

    it('two simultaneous returns of the same goods cannot exceed what was delivered', async () => {
      const s = await supplier('Race');
      const inv = await invoiceWithItems(s, 'RC', [{ productId: seed.product1Id, quantity: 4, unitCost: '100' }]);
      const [line] = await getInvoiceItems(inv);
      const results = await Promise.all([
        createReturnOp(retInput(inv, line.id, 3), TEST_OWNER),
        createReturnOp(retInput(inv, line.id, 3), TEST_OWNER),
      ]);
      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect((await getInvoiceItems(inv))[0].returnedQty).toBe(3);
    });

    it('cannot return goods that were already sold', async () => {
      const s = await supplier('Sold');
      // product2 has 1 in stock; the invoice delivers 2 more (3 in stock), then 3 are sold
      const inv = await invoiceWithItems(s, 'S1', [{ productId: seed.product2Id, quantity: 2, unitCost: '500' }]);
      await db.update(products).set({ stockQty: 1 }).where(eq(products.id, seed.product2Id)); // 2 were sold
      const [line] = await getInvoiceItems(inv);
      const r = await createReturnOp(retInput(inv, line.id, 2), TEST_OWNER);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/in stock/i);
      expect((await stockOf(seed.product2Id)).stockQty).toBe(1);
    });

    it('returning goods on a paid invoice creates credit that can be refunded', async () => {
      const s = await supplier('Paid');
      const inv = await invoiceWithItems(s, 'PD', [{ productId: seed.product1Id, quantity: 4, unitCost: '1000' }]);
      expect((await recordPaymentOp(cash(inv, '4000'), TEST_OWNER)).success).toBe(true);
      const [line] = await getInvoiceItems(inv);
      await createReturnOp(retInput(inv, line.id, 3), TEST_OWNER);

      let [row] = await getInvoiceRows();
      expect(row.status).toBe('paid');
      expect(row.credit).toBe('3000.00');

      expect((await recordRefundOp({ invoiceId: inv, refundDate: today, amount: '3000.01', method: 'cash' }, TEST_OWNER)).success).toBe(false);
      const refund = await recordRefundOp({ invoiceId: inv, refundDate: today, amount: '1200', method: 'bank_transfer', reference: 'R-1' }, TEST_OWNER);
      expect(refund.success).toBe(true);
      [row] = await getInvoiceRows();
      expect(row.credit).toBe('1800.00');

      // the paid money cannot be deleted while credit from it was already refunded
      const pay = await db.select().from(supplierPayments);
      expect((await deletePaymentOp(pay[0].id, TEST_OWNER)).success).toBe(false);
      // and the return cannot be undone either
      const [ret] = await db.select().from(supplierReturns);
      expect((await deleteReturnOp(ret.id, TEST_OWNER)).success).toBe(false);

      expect((await deleteRefundOp(refund.data!.id, TEST_OWNER)).success).toBe(true);
      expect((await getInvoiceRows())[0].credit).toBe('3000.00');
    });

    it('credit from one invoice can pay another invoice of the same supplier', async () => {
      const s = await supplier('Credit');
      const other = await supplier('Other');
      const a = await invoiceWithItems(s, 'CA', [{ productId: seed.product1Id, quantity: 2, unitCost: '1000' }]);
      const b = await invoiceWithItems(s, 'CB', [{ productId: seed.product3Id, quantity: 1, unitCost: '1500' }]);
      const c = await invoiceWithItems(other, 'CC', [{ productId: seed.product3Id, quantity: 1, unitCost: '900' }]);
      await recordPaymentOp(cash(a, '2000'), TEST_OWNER);
      const [line] = await getInvoiceItems(a);
      await createReturnOp(retInput(a, line.id, 2), TEST_OWNER); // 2000 credit on A

      const apply = (to: number, amount: string) =>
        applyCreditOp({ fromInvoiceId: a, toInvoiceId: to, date: today, amount }, TEST_OWNER);
      expect((await apply(c, '100')).success).toBe(false); // other supplier
      expect((await apply(b, '1600')).success).toBe(false); // more than B owes
      expect((await apply(b, '1500')).success).toBe(true);

      const rows = await getInvoiceRows();
      const A = rows.find((r) => r.id === a)!;
      const B = rows.find((r) => r.id === b)!;
      expect(B.status).toBe('paid');
      expect(A.credit).toBe('500.00');
      expect((await apply(b, '1')).success).toBe(false); // B is fully paid now
    });

    it('deleting a return puts the goods back; deleting an invoice takes its goods out', async () => {
      const s = await supplier('Undo');
      const inv = await invoiceWithItems(s, 'U1', [{ productId: seed.product1Id, quantity: 4, unitCost: '1000' }]);
      const [line] = await getInvoiceItems(inv);
      await createReturnOp(retInput(inv, line.id, 2), TEST_OWNER);
      expect((await stockOf(seed.product1Id)).stockQty).toBe(12);

      expect((await deleteInvoiceOp(inv, TEST_OWNER)).success).toBe(false); // has a return
      const [ret] = await db.select().from(supplierReturns);
      expect((await deleteReturnOp(ret.id, TEST_OWNER)).success).toBe(true);
      expect((await stockOf(seed.product1Id)).stockQty).toBe(14);

      expect((await deleteInvoiceOp(inv, TEST_OWNER)).success).toBe(true);
      expect((await stockOf(seed.product1Id)).stockQty).toBe(10);
    });

    it('refuses to delete an invoice whose goods were already sold', async () => {
      const s = await supplier('Gone');
      const inv = await invoiceWithItems(s, 'G1', [{ productId: seed.product1Id, quantity: 4, unitCost: '1000' }]);
      await db.update(products).set({ stockQty: 2 }).where(eq(products.id, seed.product1Id)); // 12 sold
      const r = await deleteInvoiceOp(inv, TEST_OWNER);
      expect(r.success).toBe(false);
      expect((await stockOf(seed.product1Id)).stockQty).toBe(2);
      expect(await getInvoiceRows()).toHaveLength(1);
    });

    it('only owners can return goods or record refunds', async () => {
      const s = await supplier('Auth');
      const inv = await invoiceWithItems(s, 'AU', [{ productId: seed.product1Id, quantity: 1, unitCost: '10' }]);
      const [line] = await getInvoiceItems(inv);
      expect((await createReturnOp(retInput(inv, line.id, 1), TEST_CASHIER)).success).toBe(false);
      expect((await recordRefundOp({ invoiceId: inv, refundDate: today, amount: '1', method: 'cash' }, TEST_CASHIER)).success).toBe(false);
    });

    it('compares the same product across suppliers, cheapest first, with hints for the invoice form', async () => {
      const a = await supplier('Dear Co');
      const b = await supplier('Cheap Co');
      await invoiceWithItems(a, 'D1', [{ productId: seed.product1Id, quantity: 10, unitCost: '3200' }]);
      await invoiceWithItems(b, 'C1', [{ productId: seed.product1Id, quantity: 20, unitCost: '2900' }]);
      await savePriceItemOp(
        { supplierId: a, itemName: 'Pads', partNumber: '04465-TEST1', unitPrice: '3100', priceDate: today },
        TEST_OWNER,
      );
      const [ai] = await getInvoiceItems((await getInvoiceRows({ supplierId: a }))[0].id);
      await createReturnOp(retInput(ai.id ? (await getInvoiceRows({ supplierId: a }))[0].id : 0, ai.id, 2), TEST_OWNER);

      const history = await getProductSupplierHistory(seed.product1Id);
      expect(history.map((h) => h.supplierName)).toEqual(['Cheap Co', 'Dear Co']);
      expect(history[0].lastUnitCost).toBe('2900.00');
      expect(history[0].qtyBought).toBe(20);
      expect(history[1].qtyReturned).toBe(2);
      expect(history[1].quotedPrice).toBe('3100.00');

      const hint = await getPurchaseHint(seed.product1Id, a);
      expect(hint.fromSupplier?.unitCost).toBe('3200.00');
      expect(hint.bestOther?.supplierName).toBe('Cheap Co');
      expect(hint.bestOther?.unitCost).toBe('2900.00');
    });
  });

  describe('preferred supplier on products', () => {
    const baseProduct = (categoryId: number, extra: Record<string, unknown> = {}) => ({
      name: 'Preferred Test Part',
      partNumber: 'PT-1',
      categoryId,
      costPrice: '100.00',
      price: '150.00',
      reorderLevel: 5,
      openingStock: 1,
      isActive: true,
      alternatePartNumbers: [],
      fitments: [],
      ...extra,
    });
    const categoryId = async () => (await db.select().from(categories))[0].id;
    const newSupplier = async (name: string) => (await createSupplierOp({ name, paymentTermsDays: 0, active: true }, TEST_OWNER)).data!.id;

    it('saves a preferred supplier on create and lists it under that supplier', async () => {
      const s = await newSupplier('Pref Co');
      const res = await executeCreateProduct(baseProduct(await categoryId(), { preferredSupplierId: s }) as never, TEST_OWNER);
      expect(res.success).toBe(true);
      const [p] = await db.select().from(products).where(eq(products.id, res.data!.id));
      expect(p.preferredSupplierId).toBe(s);

      const list = await getSupplierProducts(s);
      expect(list.map((x) => x.id)).toEqual([res.data!.id]);
    });

    it('a product without a preferred supplier is fine', async () => {
      const res = await executeCreateProduct(baseProduct(await categoryId()) as never, TEST_OWNER);
      expect(res.success).toBe(true);
      const [p] = await db.select().from(products).where(eq(products.id, res.data!.id));
      expect(p.preferredSupplierId).toBeNull();
    });

    it('rejects a supplier that does not exist', async () => {
      const res = await executeCreateProduct(baseProduct(await categoryId(), { preferredSupplierId: 999999 }) as never, TEST_OWNER);
      expect(res.success).toBe(false);
    });

    it('deleting a supplier unlinks it from its products instead of failing', async () => {
      const s = await newSupplier('Gone Co');
      await db.update(products).set({ preferredSupplierId: s }).where(eq(products.id, seed.product1Id));
      expect((await deleteSupplierOp(s, TEST_OWNER)).success).toBe(true);
      const [p] = await db.select().from(products).where(eq(products.id, seed.product1Id));
      expect(p.preferredSupplierId).toBeNull();
    });

    it('the low-stock list carries each part\'s preferred supplier', async () => {
      const s = await newSupplier('Reorder Co');
      await db.update(products).set({ preferredSupplierId: s }).where(eq(products.id, seed.product2Id)); // stock 1 <= reorder 1
      const low = await getLowStockProducts();
      const row = low.find((x) => x.id === seed.product2Id)!;
      expect(row.supplierId).toBe(s);
      expect(row.supplierName).toBe('Reorder Co');
      expect(low.find((x) => x.id === seed.product3Id)!.supplierId).toBeNull();
    });

    it('invoice product search puts the supplier\'s preferred products first', async () => {
      const s = await newSupplier('First Co');
      await db.update(products).set({ preferredSupplierId: s }).where(eq(products.id, seed.product3Id));
      const plain = await searchPurchaseProducts('Brake');
      expect(plain[0].id).not.toBe(seed.product3Id); // alphabetical: "Zero Stock Brake Pad" is last
      const ordered = await searchPurchaseProducts('Brake', s);
      expect(ordered[0].id).toBe(seed.product3Id);
    });

    it('CSV: sets the supplier by name, rejects unknown names, leaves blank cells alone and exports it', async () => {
      const s = await newSupplier('Csv Supplier');
      const header = 'name,part_number,category,supplier,cost_price,selling_price,stock\n';

      const bad = await previewProductImport(header + 'Part A,CSV-A,Brakes,No Such Supplier,10,20,1\n');
      expect(bad.rows[0].action).toBe('error');
      expect(bad.rows[0].errors.join(' ')).toMatch(/does not exist/);

      const ok = await commitProductImport(header + 'Part B,CSV-B,Brakes,csv supplier,10,20,1\n', TEST_OWNER.id);
      expect(ok.ok).toBe(true);
      const [created] = await db.select().from(products).where(eq(products.partNumber, 'CSV-B'));
      expect(created.preferredSupplierId).toBe(s);

      // update with a blank supplier cell keeps it
      const upd = await commitProductImport(
        'sku,name,part_number,category,supplier,cost_price,selling_price\n' + `${created.sku},Part B,CSV-B,Brakes,,10,25\n`,
        TEST_OWNER.id,
      );
      expect(upd.ok).toBe(true);
      const [after] = await db.select().from(products).where(eq(products.id, created.id));
      expect(after.preferredSupplierId).toBe(s);
      expect(after.price).toBe('25.00');

      const csv = await exportProductsCsv();
      expect(csv.split('\n')[0]).toContain('supplier');
      expect(csv).toContain('Csv Supplier');
    });
  });
});
