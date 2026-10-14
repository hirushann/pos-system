import { db } from '@/src/db';
import {
  categories,
  products,
  productBarcodes,
  settings,
  user,
} from '@/src/db/schema';
import { sql } from 'drizzle-orm';

export const TEST_OWNER = {
  id: 'test-owner-id-123',
  name: 'Test Store Owner',
  email: 'owner@test.lk',
  role: 'owner',
};

export const TEST_CASHIER = {
  id: 'test-cashier-id-456',
  name: 'Test Store Cashier',
  email: 'cashier@test.lk',
  role: 'cashier',
};

export interface TestSeedData {
  product1Id: number;
  product2Id: number;
  product3Id: number;
}

export async function resetTestDatabase(): Promise<TestSeedData> {
  // Triple-check that we are never touching pos_dev
  const dbNameRes = await db.execute<{ current_database: string }>(
    sql`SELECT current_database();`,
  );
  const currentDb = dbNameRes.rows[0]?.current_database;
  if (currentDb !== 'pos_test') {
    throw new Error(
      `ABORTING: Expected current database to be 'pos_test', but found '${currentDb}'! Never touch pos_dev.`,
    );
  }

  // Truncate tables and restart identity sequences
  await db.execute(sql`
    TRUNCATE TABLE
      sales,
      sale_items,
      stock_movements,
      receipt_counters,
      product_barcodes,
      product_fitments,
      product_part_numbers,
      products,
      vehicle_models,
      vehicle_makes,
      brands,
      categories,
      "session",
      "account",
      "user"
    RESTART IDENTITY CASCADE;
  `);

  // Insert test users
  await db.insert(user).values([
    {
      id: TEST_OWNER.id,
      name: TEST_OWNER.name,
      email: TEST_OWNER.email,
      role: TEST_OWNER.role,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: TEST_CASHIER.id,
      name: TEST_CASHIER.name,
      email: TEST_CASHIER.email,
      role: TEST_CASHIER.role,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  // Insert settings
  await db
    .insert(settings)
    .values({
      id: 1,
      shopName: 'Test Auto Spares',
      address: '123 Main Street, Colombo',
      phone: '+94 11 111 2222',
      receiptFooter: 'Thank you!',
      cashierMaxDiscountPct: '5.00',
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        shopName: 'Test Auto Spares',
        cashierMaxDiscountPct: '5.00',
      },
    });

  // Insert test category
  const [cat] = await db
    .insert(categories)
    .values({
      name: 'Brakes',
    })
    .returning();

  const categoryId = cat.id;

  // Insert test products:
  // 1. Regular product with stock 10
  // 2. Limited product with stock 1 (for concurrency test)
  // 3. Out of stock product with stock 0
  const inserted = await db
    .insert(products)
    .values([
      {
        sku: 'TEST-PAD-01',
        partNumber: '04465-TEST1',
        name: 'Standard Brake Pads',
        categoryId,
        stockQty: 10,
        costPrice: '3000.00',
        price: '5000.00',
        reorderLevel: 2,
        unit: 'set',
        isActive: true,
      },
      {
        sku: 'TEST-PAD-02',
        partNumber: '04465-TEST2',
        name: 'Last Unit Brake Pad',
        categoryId,
        stockQty: 1,
        costPrice: '4000.00',
        price: '7000.00',
        reorderLevel: 1,
        unit: 'set',
        isActive: true,
      },
      {
        sku: 'TEST-PAD-03',
        partNumber: '04465-TEST3',
        name: 'Zero Stock Brake Pad',
        categoryId,
        stockQty: 0,
        costPrice: '2000.00',
        price: '4000.00',
        reorderLevel: 1,
        unit: 'set',
        isActive: true,
      },
    ])
    .returning();

  // Insert internal barcodes for test products
  await db.insert(productBarcodes).values(
    inserted.map((p) => ({
      productId: p.id,
      code: '20' + String(p.id).padStart(8, '0'),
      kind: 'internal',
    })),
  );

  return {
    product1Id: inserted[0].id,
    product2Id: inserted[1].id,
    product3Id: inserted[2].id,
  };
}
