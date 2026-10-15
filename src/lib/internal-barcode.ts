import { eq, and } from 'drizzle-orm';
import { db } from '@/src/db';
import { productBarcodes } from '@/src/db/schema';
import { generateInternalBarcode } from '@/src/lib/barcode';
import { getDbErrorKind } from '@/src/lib/db-errors';

/** Anything that can run an insert: the db itself or a transaction. */
type Inserter = Pick<typeof db, 'insert'>;

const MAX_ATTEMPTS = 10;

interface DriverError {
  sqlMessage?: string;
  message?: string;
  cause?: DriverError;
}

/** True when the insert failed because another barcode already has this code. */
function isCodeCollision(err: unknown): boolean {
  if (getDbErrorKind(err) !== 'unique') return false;
  const e = err as DriverError;
  const text = `${e.sqlMessage ?? ''} ${e.cause?.sqlMessage ?? ''} ${e.message ?? ''}`;
  return text.includes('code_unique');
}

/**
 * Gives a product its internal barcode: a random '20' + 8 digit code. If the code is
 * already taken (rare), picks another. Any other failure (e.g. the product already
 * has an internal barcode) is thrown as-is.
 */
export async function insertInternalBarcode(
  executor: Inserter,
  productId: number,
  generate: () => string = generateInternalBarcode,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const code = generate();
    try {
      await executor.insert(productBarcodes).values({ productId, code, kind: 'internal' });
      return code;
    } catch (err) {
      if (!isCodeCollision(err) || attempt >= MAX_ATTEMPTS) throw err;
    }
  }
}

/** Returns the product's internal barcode, creating one first if it has none yet. */
export async function getOrCreateInternalBarcode(productId: number): Promise<string> {
  const [existing] = await db
    .select({ code: productBarcodes.code })
    .from(productBarcodes)
    .where(and(eq(productBarcodes.productId, productId), eq(productBarcodes.kind, 'internal')))
    .limit(1);
  if (existing) return existing.code;

  try {
    return await insertInternalBarcode(db, productId);
  } catch (err) {
    // Lost a race with another request that just created it: use theirs.
    const [created] = await db
      .select({ code: productBarcodes.code })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.productId, productId), eq(productBarcodes.kind, 'internal')))
      .limit(1);
    if (created) return created.code;
    throw err;
  }
}
