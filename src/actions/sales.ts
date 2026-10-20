'use server';

import { DEFAULT_SHOP } from '@/src/lib/shop-defaults';
import { db } from '@/src/db';
import {
  products,
  productBarcodes,
  brands,
  sales,
  saleItems,
  stockMovements,
  settings,
  receiptCounters,
  user,
} from '@/src/db/schema';
import { requireUser, assertOwner } from '@/src/lib/auth-guards';
import { getColomboDateString } from '@/src/lib/dates';
import { searchCheckoutParts, type CheckoutPartItem } from '@/src/data/checkout';
import { eq, sql, inArray, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import Decimal from 'decimal.js';
import { z } from 'zod';

import { getDbErrorKind, mapDatabaseError } from '@/src/lib/db-errors';

// ============================================================================
// Schemas
// ============================================================================

const searchPartsInputSchema = z.object({
  query: z.string().trim().optional(),
  makeId: z.number().int().positive().optional(),
  modelId: z.number().int().positive().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
});

export type SearchPartsInput = z.infer<typeof searchPartsInputSchema>;

const saleItemInputSchema = z.object({
  productId: z.number().int().positive('Invalid product selected'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

const completeSaleInputSchema = z.object({
  items: z.array(saleItemInputSchema).min(1, 'Cart cannot be empty'),
  paymentMethod: z.enum(['cash', 'card']),
  amountTendered: z.string().trim().optional().nullable(),
  discountType: z.enum(['none', 'amount', 'percent']).default('none'),
  discountValue: z.string().trim().default('0'),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  vehicleNo: z.string().trim().max(30).optional().nullable(),
});

export type CompleteSaleInput = z.infer<typeof completeSaleInputSchema>;

export interface ServerActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface CompleteSaleResultData {
  saleId: number;
  receiptNumber: string;
  total: string;
  subtotal: string;
  discount: string;
  changeGiven: string | null;
  amountTendered: string | null;
  paymentMethod: 'cash' | 'card';
}

// ============================================================================
// Live Search Server Action
// ============================================================================

export async function searchPartsAction(
  params: SearchPartsInput,
): Promise<CheckoutPartItem[]> {
  // Cashiers and owners can search parts
  await requireUser();

  const parsed = searchPartsInputSchema.safeParse(params);
  if (!parsed.success) {
    return [];
  }

  return searchCheckoutParts(parsed.data);
}

// ============================================================================
// Complete Sale Transaction Action
// ============================================================================

export async function completeSale(
  rawInput: CompleteSaleInput,
): Promise<ServerActionResult<CompleteSaleResultData>> {
  // 1. Authenticate user & extract session
  const { user } = await requireUser();
  return executeCompleteSale(rawInput, user);
}

export async function executeCompleteSale(
  rawInput: CompleteSaleInput,
  user: { id: string; role?: string | null },
): Promise<ServerActionResult<CompleteSaleResultData>> {

  // Validate input
  const parsed = completeSaleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'form';
      fieldErrors[field] = issue.message;
    }
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid sale input',
      fieldErrors,
    };
  }

  const input = parsed.data;

  try {
    const saleResult = await db.transaction(async (tx) => {
      // 2. Lock product rows with SELECT ... FOR UPDATE in ascending id order
      // Prevents deadlocks across concurrent cashier registers
      const uniqueProductIds = [...new Set(input.items.map((i) => i.productId))].sort(
        (a, b) => a - b,
      );

      const lockedProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, uniqueProductIds))
        .orderBy(asc(products.id))
        .for('update');

      const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

      // Verify each requested product exists and is active
      for (const item of input.items) {
        const prod = productMap.get(item.productId);
        if (!prod) {
          throw new Error(`Part ID #${item.productId} was not found in the catalog.`);
        }
        if (!prod.isActive) {
          throw new Error(`Part "${prod.partNumber} - ${prod.name}" has been deactivated.`);
        }
        if (prod.stockQty < item.quantity) {
          if (prod.stockQty <= 0) {
            throw new Error(`"${prod.partNumber}" (${prod.name}) is out of stock.`);
          }
          throw new Error(
            `Only ${prod.stockQty} left of ${prod.partNumber} (${prod.name}). Requested: ${item.quantity}.`,
          );
        }
      }

      // 3. Recompute every line item price and total on the server from the DB
      let subtotalDec = new Decimal(0);
      const computedLineItems = input.items.map((item) => {
        const prod = productMap.get(item.productId)!;
        const unitPriceDec = new Decimal(prod.price);
        const lineTotalDec = unitPriceDec.times(item.quantity);
        subtotalDec = subtotalDec.plus(lineTotalDec);

        return {
          productId: prod.id,
          productName: prod.name,
          partNumber: prod.partNumber,
          quantity: item.quantity,
          unitPrice: prod.price,
          unitCost: prod.costPrice,
          lineTotal: lineTotalDec.toFixed(2),
        };
      });

      // 4. Compute discount and enforce cashier limits
      const [shopSettings] = await tx
        .select({
          cashierMaxDiscountPct: settings.cashierMaxDiscountPct,
        })
        .from(settings)
        .where(eq(settings.id, 1));

      const maxCashierPct = shopSettings?.cashierMaxDiscountPct
        ? new Decimal(shopSettings.cashierMaxDiscountPct)
        : new Decimal('5.00');

      let discountDec = new Decimal(0);
      const discountInputDec = new Decimal(input.discountValue || '0');

      if (input.discountType === 'percent') {
        if (discountInputDec.isNegative() || discountInputDec.greaterThan(100)) {
          throw new Error('Discount percentage must be between 0% and 100%.');
        }
        if (user.role === 'cashier' && discountInputDec.greaterThan(maxCashierPct)) {
          throw new Error(
            `Cashiers cannot give more than ${maxCashierPct.toString()}% discount. Maximum discount is ${maxCashierPct.toString()}%.`,
          );
        }
        discountDec = subtotalDec
          .times(discountInputDec)
          .dividedBy(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (input.discountType === 'amount') {
        if (discountInputDec.isNegative()) {
          throw new Error('Discount amount cannot be negative.');
        }
        if (discountInputDec.greaterThan(subtotalDec)) {
          throw new Error('Discount amount cannot exceed the subtotal.');
        }
        if (user.role === 'cashier') {
          const maxAllowedAmount = subtotalDec
            .times(maxCashierPct)
            .dividedBy(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

          if (discountInputDec.greaterThan(maxAllowedAmount)) {
            throw new Error(
              `Cashiers cannot give more than ${maxCashierPct.toString()}% discount (maximum Rs. ${maxAllowedAmount.toFixed(2)}).`,
            );
          }
        }
        discountDec = discountInputDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }

      // Check DB constraint rule: discount <= subtotal
      if (discountDec.greaterThan(subtotalDec)) {
        throw new Error('Discount cannot exceed the subtotal.');
      }

      const totalDec = subtotalDec.minus(discountDec);

      // 5. Validate payment method and cash tendered
      let amountTenderedStr: string | null = null;
      let changeGivenStr: string | null = null;

      if (input.paymentMethod === 'cash') {
        if (!input.amountTendered || input.amountTendered.trim() === '') {
          throw new Error('Amount tendered is required for cash payment.');
        }
        const tenderedDec = new Decimal(input.amountTendered.trim());
        if (tenderedDec.lessThan(totalDec)) {
          throw new Error(
            `Amount tendered (Rs. ${tenderedDec.toFixed(2)}) must be greater than or equal to total (Rs. ${totalDec.toFixed(2)}).`,
          );
        }
        const changeDec = tenderedDec.minus(totalDec);
        amountTenderedStr = tenderedDec.toFixed(2);
        changeGivenStr = changeDec.toFixed(2);
      } else {
        // Card payment - no tendered amount
        amountTenderedStr = null;
        changeGivenStr = null;
      }

      // 6. Generate gap-free receipt number for current year in Asia/Colombo
      const colomboDateStr = getColomboDateString(new Date());
      const currentYear = parseInt(colomboDateStr.split('-')[0], 10);

      // Atomic upsert: the row lock taken here is held until commit, so the
      // read-back below always sees this transaction's number (gap-free).
      await tx
        .insert(receiptCounters)
        .values({ year: currentYear, lastNumber: 1 })
        .onDuplicateKeyUpdate({
          set: { lastNumber: sql`${receiptCounters.lastNumber} + 1` },
        });

      const [counterRow] = await tx
        .select({ lastNumber: receiptCounters.lastNumber })
        .from(receiptCounters)
        .where(eq(receiptCounters.year, currentYear));

      const lastNumber = Number(counterRow.lastNumber);
      const receiptNumber = `INV-${currentYear}-${String(lastNumber).padStart(6, '0')}`;

      // 7. Insert the sale record
      const [insertedSale] = await tx
        .insert(sales)
        .values({
          receiptNumber,
          cashierId: user.id,
          status: 'completed',
          subtotal: subtotalDec.toFixed(2),
          discount: discountDec.toFixed(2),
          total: totalDec.toFixed(2),
          amountTendered: amountTenderedStr,
          changeGiven: changeGivenStr,
          customerName: input.customerName || null,
          customerPhone: input.customerPhone || null,
          vehicleNo: input.vehicleNo || null,
        })
        .$returningId();

      // 8. Insert sale items
      for (const line of computedLineItems) {
        await tx.insert(saleItems).values({
          saleId: insertedSale.id,
          productId: line.productId,
          productName: line.productName,
          partNumber: line.partNumber,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        });
      }

      // 9. Decrement stock_qty and write stock_movements in the SAME transaction
      for (const line of computedLineItems) {
        const prod = productMap.get(line.productId)!;
        const newStock = prod.stockQty - line.quantity;

        await tx
          .update(products)
          .set({ stockQty: newStock })
          .where(eq(products.id, line.productId));

        await tx.insert(stockMovements).values({
          productId: line.productId,
          changeQty: -line.quantity,
          qtyAfter: newStock,
          reason: 'sale',
          saleId: insertedSale.id,
          createdBy: user.id,
          note: `Receipt ${receiptNumber}`,
        });
      }

      return {
        saleId: insertedSale.id,
        receiptNumber,
        total: totalDec.toFixed(2),
        subtotal: subtotalDec.toFixed(2),
        discount: discountDec.toFixed(2),
        changeGiven: changeGivenStr,
        amountTendered: amountTenderedStr,
        paymentMethod: input.paymentMethod,
      };
    });

    // Revalidate affected views
    try {
      revalidatePath('/checkout');
      revalidatePath('/inventory');
      revalidatePath('/products');
      revalidatePath('/sales');
    } catch {
      // Ignored outside Next.js request scope
    }

    return {
      success: true,
      data: saleResult,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapDatabaseError(err, 'Failed to complete sale transaction.'),
    };
  }
}

// ============================================================================
// Receipt Query
// ============================================================================

export interface ReceiptData {
  sale: {
    id: number;
    receiptNumber: string;
    createdAt: Date;
    status: string;
    subtotal: string;
    discount: string;
    total: string;
    amountTendered: string | null;
    changeGiven: string | null;
    customerName: string | null;
    customerPhone: string | null;
    vehicleNo: string | null;
  };
  cashierName: string;
  items: Array<{
    id: number;
    productName: string;
    partNumber: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  shop: {
    shopName: string;
    address: string | null;
    phone: string | null;
    receiptFooter: string | null;
  };
}

export async function getSaleReceiptData(saleId: number): Promise<ReceiptData | null> {
  await requireUser();
  return executeGetSaleReceiptData(saleId);
}

export async function executeGetSaleReceiptData(saleId: number): Promise<ReceiptData | null> {
  const [sale] = await db
    .select({
      id: sales.id,
      receiptNumber: sales.receiptNumber,
      createdAt: sales.createdAt,
      status: sales.status,
      subtotal: sales.subtotal,
      discount: sales.discount,
      total: sales.total,
      amountTendered: sales.amountTendered,
      changeGiven: sales.changeGiven,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      vehicleNo: sales.vehicleNo,
      cashierId: sales.cashierId,
    })
    .from(sales)
    .where(eq(sales.id, saleId));

  if (!sale) return null;

  // Fetch cashier info
  const [cashierRow] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, sale.cashierId));

  // Fetch items
  const items = await db
    .select({
      id: saleItems.id,
      productName: saleItems.productName,
      partNumber: saleItems.partNumber,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      lineTotal: saleItems.lineTotal,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, sale.id))
    .orderBy(asc(saleItems.id));

  // Fetch shop settings
  const [shopSettings] = await db
    .select({
      shopName: settings.shopName,
      address: settings.address,
      phone: settings.phone,
      receiptFooter: settings.receiptFooter,
    })
    .from(settings)
    .where(eq(settings.id, 1));

  return {
    sale: {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      createdAt: sale.createdAt,
      status: sale.status,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      amountTendered: sale.amountTendered,
      changeGiven: sale.changeGiven,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      vehicleNo: sale.vehicleNo,
    },
    cashierName: cashierRow?.name || 'Cashier',
    items,
    shop: shopSettings ?? {
      shopName: DEFAULT_SHOP.shopName,
      address: DEFAULT_SHOP.address,
      phone: DEFAULT_SHOP.phone,
      receiptFooter: DEFAULT_SHOP.receiptFooter,
    },
  };
}

// ============================================================================
// Void Sale Server Action (Owner Only)
// ============================================================================

const voidSaleInputSchema = z.object({
  saleId: z.number().int().positive('Please specify a valid sale ID'),
  reason: z
    .string()
    .trim()
    .min(3, 'Void reason must be at least 3 characters')
    .max(500, 'Void reason cannot exceed 500 characters'),
});

export type VoidSaleInput = z.infer<typeof voidSaleInputSchema>;

export async function voidSale(
  rawInput: VoidSaleInput,
): Promise<ServerActionResult<{ saleId: number; receiptNumber: string }>> {
  const { user: currentUser } = await requireUser();
  assertOwner(currentUser);

  return executeVoidSale(rawInput, currentUser);
}

export async function executeVoidSale(
  rawInput: VoidSaleInput,
  currentUser: { id: string; role?: string | null },
): Promise<ServerActionResult<{ saleId: number; receiptNumber: string }>> {
  if (currentUser.role !== 'owner') {
    return {
      success: false,
      error: 'Forbidden: Only owners are authorized to void sales.',
    };
  }

  const parsed = voidSaleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid void input',
    };
  }

  const input = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Lock the sale row FOR UPDATE
      const [lockedSale] = await tx
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .for('update');

      if (!lockedSale) {
        throw new Error('Sale not found.');
      }

      if (lockedSale.status === 'voided') {
        throw new Error('This sale has already been voided.');
      }

      // 2. Fetch all items for this sale
      const items = await tx
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, lockedSale.id));

      // 3. Extract unique product IDs and sort in ascending order to prevent deadlocks
      const uniqueProductIds = [...new Set(items.map((i) => i.productId))].sort(
        (a, b) => a - b,
      );

      // 4. Lock all affected product rows FOR UPDATE
      const lockedProducts = uniqueProductIds.length > 0
        ? await tx
            .select()
            .from(products)
            .where(inArray(products.id, uniqueProductIds))
            .orderBy(asc(products.id))
            .for('update')
        : [];

      const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

      // 5. Update the sale status to 'voided' with voided_at, voided_by, void_reason
      // Satisfies CHECK constraint: ((status = 'voided') = (voided_at IS NOT NULL))
      await tx
        .update(sales)
        .set({
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: currentUser.id,
          voidReason: input.reason.trim(),
        })
        .where(eq(sales.id, lockedSale.id));

      // 6. Return quantities to stock_qty and write stock_movements (reason: 'void')
      for (const item of items) {
        const prod = productMap.get(item.productId);
        if (!prod) continue;

        const newStock = prod.stockQty + item.quantity;

        // Update product stock
        await tx
          .update(products)
          .set({ stockQty: newStock })
          .where(eq(products.id, item.productId));

        // Update local map so multiple lines with same productId update accurately
        prod.stockQty = newStock;

        // Insert stock movement record
        await tx.insert(stockMovements).values({
          productId: item.productId,
          changeQty: item.quantity, // Positive quantity returned to stock
          qtyAfter: newStock,
          reason: 'void',
          saleId: lockedSale.id,
          note: `Voided receipt ${lockedSale.receiptNumber}: ${input.reason.trim()}`,
          createdBy: currentUser.id,
        });
      }

      return {
        saleId: lockedSale.id,
        receiptNumber: lockedSale.receiptNumber,
      };
    });

    // Revalidate relevant pages
    try {
      revalidatePath('/sales');
      revalidatePath(`/sales/${input.saleId}`);
      revalidatePath('/inventory');
      revalidatePath('/products');
      revalidatePath('/checkout');
    } catch {
      // Ignored outside Next.js request scope
    }

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    const error = err as { message?: string };
    let msg = error.message || 'Failed to void sale.';
    if (getDbErrorKind(err) === 'check') {
      msg = 'Database constraint error: voided_at is required when voiding.';
    }
    return {
      success: false,
      error: msg,
    };
  }
}

// ============================================================================
// Delete Sale Server Action (Owner Only)
// ============================================================================

const deleteSaleInputSchema = z.object({
  saleId: z.number().int().positive('Please specify a valid sale ID'),
  confirmReceipt: z.string().trim().min(1, 'Type the receipt number to confirm the deletion'),
});

export type DeleteSaleInput = z.infer<typeof deleteSaleInputSchema>;

export interface DeleteSaleResultData {
  saleId: number;
  receiptNumber: string;
  /** True when the sold items were put back into stock (completed sales). */
  stockRestored: boolean;
}

export async function deleteSale(
  rawInput: DeleteSaleInput,
): Promise<ServerActionResult<DeleteSaleResultData>> {
  const { user: currentUser } = await requireUser();
  assertOwner(currentUser);

  return executeDeleteSale(rawInput, currentUser);
}

/**
 * Permanently deletes a sale, its line items and its stock history lines.
 * - Completed sale: the sold quantities go back into stock first.
 * - Voided sale: stock was already returned by the void, so stock is not touched.
 * Receipt numbers are not reused, so the invoice sequence keeps a gap.
 */
export async function executeDeleteSale(
  rawInput: DeleteSaleInput,
  currentUser: { id: string; role?: string | null },
): Promise<ServerActionResult<DeleteSaleResultData>> {
  if (currentUser.role !== 'owner') {
    return {
      success: false,
      error: 'Forbidden: Only owners are authorized to delete sales.',
    };
  }

  const parsed = deleteSaleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid delete input',
    };
  }

  const input = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Lock the sale row
      const [lockedSale] = await tx
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .for('update');

      if (!lockedSale) {
        throw new Error('Sale not found.');
      }

      // 2. The owner must type the receipt number: guards against deleting the wrong sale
      if (lockedSale.receiptNumber.toLowerCase() !== input.confirmReceipt.toLowerCase()) {
        throw new Error('The receipt number you typed does not match this sale. Nothing was deleted.');
      }

      const items = await tx
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, lockedSale.id));

      // 3. A completed sale still holds stock: put it back (products locked in id order)
      const stockRestored = lockedSale.status !== 'voided';
      if (stockRestored && items.length > 0) {
        const productIds = [...new Set(items.map((i) => i.productId))].sort((a, b) => a - b);
        await tx
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, productIds))
          .orderBy(asc(products.id))
          .for('update');

        for (const item of items) {
          await tx
            .update(products)
            .set({ stockQty: sql`${products.stockQty} + ${item.quantity}` })
            .where(eq(products.id, item.productId));
        }
      }

      // 4. Remove the sale's stock history, then the sale (its items go with it)
      await tx.delete(stockMovements).where(eq(stockMovements.saleId, lockedSale.id));
      await tx.delete(sales).where(eq(sales.id, lockedSale.id));

      return {
        saleId: lockedSale.id,
        receiptNumber: lockedSale.receiptNumber,
        stockRestored,
      };
    });

    try {
      revalidatePath('/');
      revalidatePath('/sales');
      revalidatePath('/inventory');
      revalidatePath('/products');
      revalidatePath('/checkout');
      revalidatePath('/reports');
    } catch {
      // Ignored outside Next.js request scope
    }

    return { success: true, data: result };
  } catch (err: unknown) {
    if (getDbErrorKind(err) === 'foreign_key') {
      return {
        success: false,
        error: 'This sale cannot be deleted because other records still refer to it.',
      };
    }
    const error = err as { message?: string };
    return {
      success: false,
      error: error.message || 'Failed to delete sale.',
    };
  }
}

const lookupBarcodeInputSchema = z.object({
  code: z.string().trim().min(1, 'Barcode code cannot be empty'),
});

export interface BarcodeLookupResult {
  barcodeId: number;
  code: string;
  kind: string;
  product: {
    id: number;
    sku: string;
    name: string;
    partNumber: string;
    brandName: string | null;
    binLocation: string | null;
    unit: string;
    price: string;
    stockQty: number;
    isActive: boolean;
  };
}

export async function lookupBarcode(
  code: string,
): Promise<{
  success: boolean;
  data?: BarcodeLookupResult;
  error?: 'not_found' | 'inactive' | 'out_of_stock' | string;
  code?: string;
  productName?: string;
}> {
  await requireUser();
  return executeLookupBarcode(code);
}

export async function executeLookupBarcode(
  code: string,
): Promise<{
  success: boolean;
  data?: BarcodeLookupResult;
  error?: 'not_found' | 'inactive' | 'out_of_stock' | string;
  code?: string;
  productName?: string;
}> {
  const parsed = lookupBarcodeInputSchema.safeParse({ code });
  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid barcode format',
      code,
    };
  }

  const cleanCode = parsed.data.code;

  const [row] = await db
    .select({
      barcodeId: productBarcodes.id,
      code: productBarcodes.code,
      kind: productBarcodes.kind,
      productId: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      brandName: brands.name,
      binLocation: products.binLocation,
      unit: products.unit,
      price: products.price,
      stockQty: products.stockQty,
      isActive: products.isActive,
    })
    .from(productBarcodes)
    .innerJoin(products, eq(productBarcodes.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(eq(productBarcodes.code, cleanCode))
    .limit(1);

  if (!row) {
    return {
      success: false,
      error: 'not_found',
      code: cleanCode,
    };
  }

  if (!row.isActive) {
    return {
      success: false,
      error: 'inactive',
      code: cleanCode,
      productName: row.name,
    };
  }

  if (row.stockQty <= 0) {
    return {
      success: false,
      error: 'out_of_stock',
      code: cleanCode,
      productName: row.name,
    };
  }

  return {
    success: true,
    data: {
      barcodeId: row.barcodeId,
      code: row.code,
      kind: row.kind,
      product: {
        id: row.productId,
        sku: row.sku,
        name: row.name,
        partNumber: row.partNumber,
        brandName: row.brandName,
        binLocation: row.binLocation,
        unit: row.unit,
        price: row.price,
        stockQty: row.stockQty,
        isActive: row.isActive,
      },
    },
  };
}

