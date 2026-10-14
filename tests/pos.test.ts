import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/src/db';
import {
  products,
  sales,
  saleItems,
  stockMovements,
  receiptCounters,
  productBarcodes,
} from '@/src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { executeCompleteSale, executeVoidSale, executeLookupBarcode } from '@/src/actions/sales';
import { executeAdjustStock } from '@/src/actions/inventory';
import { executeCreateProduct, executeAddManufacturerBarcode } from '@/src/actions/products';
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
  it('creates product and automatically inserts internal barcode in the same transaction', async () => {
    const [p1] = await db.select().from(products).where(eq(products.id, seed.product1Id));

    const newProdRes = await executeCreateProduct(
      {
        sku: 'NEW-PART-01',
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

    // Verify product_barcodes has internal code '20' + zero-padded id
    const expectedBarcode = '20' + String(newId).padStart(8, '0');
    const barcodes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, newId));

    expect(barcodes).toHaveLength(1);
    expect(barcodes[0].code).toBe(expectedBarcode);
    expect(barcodes[0].kind).toBe('internal');
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
});
