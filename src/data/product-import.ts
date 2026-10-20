import Decimal from 'decimal.js';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  brands,
  categories,
  productBarcodes,
  productPartNumbers,
  products,
  stockMovements,
} from '@/src/db/schema';
import { guardCell, toCsv } from '@/src/lib/csv';
import { generateUniqueProductCode } from '@/src/lib/internal-barcode';
import {
  PRODUCT_CSV_COLUMNS,
  matchKey,
  parseProductCsv,
  type ParsedAlternate,
  type ParsedProductRow,
} from '@/src/lib/product-csv';

/** The database itself or a transaction. */
type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export type PlannedAction = 'create' | 'update' | 'unchanged' | 'error';

export interface PreviewRow {
  rowNumber: number;
  sku: string;
  name: string;
  action: PlannedAction;
  /** For updates: what would change, e.g. `price: 4,850.00 -> 5,200.00`. */
  changes: string[];
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  fileErrors: string[];
  fileWarnings: string[];
  counts: { create: number; update: number; unchanged: number; error: number };
  newCategories: string[];
  newBrands: string[];
  rows: PreviewRow[];
}

interface ExistingProduct {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  categoryId: number;
  brandId: number | null;
  description: string | null;
  unit: string;
  binLocation: string | null;
  costPrice: string;
  price: string;
  stockQty: number;
  reorderLevel: number;
  isActive: boolean;
}

interface PlannedRow extends PreviewRow {
  parsed: ParsedProductRow;
  existingId: number | null;
}

/** Everything read from the database that planning and applying both need. */
interface Lookups {
  productBySku: Map<string, ExistingProduct>;
  productById: Map<number, ExistingProduct>;
  categoryByKey: Map<string, { id: number; name: string }>;
  categoryNameById: Map<number, string>;
  brandByKey: Map<string, { id: number; name: string }>;
  brandNameById: Map<number, string>;
  barcodeOwner: Map<string, number>;
  alternatesByProduct: Map<number, ParsedAlternate[]>;
  /** Part number (lower case) -> SKU of the first product that has it. */
  skuByPartNumber: Map<string, string>;
}

interface Plan {
  fileErrors: string[];
  fileWarnings: string[];
  rows: PlannedRow[];
  newCategories: string[];
  newBrands: string[];
  counts: ImportPreview['counts'];
  lookups: Lookups;
}

const money = (value: string) => new Decimal(value).toFixed(2);
const sameMoney = (a: string, b: string) => new Decimal(a).equals(new Decimal(b));

async function loadLookups(executor: Executor): Promise<Lookups> {
  const [productRows, categoryRows, brandRows, barcodeRows, alternateRows] = await Promise.all([
    executor
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        partNumber: products.partNumber,
        categoryId: products.categoryId,
        brandId: products.brandId,
        description: products.description,
        unit: products.unit,
        binLocation: products.binLocation,
        costPrice: products.costPrice,
        price: products.price,
        stockQty: products.stockQty,
        reorderLevel: products.reorderLevel,
        isActive: products.isActive,
      })
      .from(products),
    executor.select({ id: categories.id, name: categories.name }).from(categories),
    executor.select({ id: brands.id, name: brands.name }).from(brands),
    executor.select({ code: productBarcodes.code, productId: productBarcodes.productId }).from(productBarcodes),
    executor
      .select({
        productId: productPartNumbers.productId,
        partNumber: productPartNumbers.partNumber,
        kind: productPartNumbers.kind,
      })
      .from(productPartNumbers),
  ]);

  const alternatesByProduct = new Map<number, ParsedAlternate[]>();
  for (const a of alternateRows) {
    const list = alternatesByProduct.get(a.productId) ?? [];
    list.push({ partNumber: a.partNumber, kind: a.kind === 'oem' ? 'oem' : 'alternate' });
    alternatesByProduct.set(a.productId, list);
  }

  const skuByPartNumber = new Map<string, string>();
  for (const p of productRows) {
    const key = matchKey(p.partNumber);
    if (!skuByPartNumber.has(key)) skuByPartNumber.set(key, p.sku);
  }

  return {
    skuByPartNumber,
    productBySku: new Map(productRows.map((p) => [matchKey(p.sku), p])),
    productById: new Map(productRows.map((p) => [p.id, p])),
    categoryByKey: new Map(categoryRows.map((c) => [matchKey(c.name), c])),
    categoryNameById: new Map(categoryRows.map((c) => [c.id, c.name])),
    brandByKey: new Map(brandRows.map((b) => [matchKey(b.name), b])),
    brandNameById: new Map(brandRows.map((b) => [b.id, b.name])),
    barcodeOwner: new Map(barcodeRows.map((b) => [matchKey(b.code), b.productId])),
    alternatesByProduct,
  };
}

const altKey = (a: ParsedAlternate) => `${a.kind}:${matchKey(a.partNumber)}`;

/** Compares the file with the database and decides what every row would do. No writes. */
async function buildPlan(executor: Executor, csvText: string): Promise<Plan> {
  const parsed = parseProductCsv(csvText);
  const lookups = await loadLookups(executor);
  const emptyCounts = { create: 0, update: 0, unchanged: 0, error: 0 };

  if (parsed.fileErrors.length > 0) {
    return {
      fileErrors: parsed.fileErrors,
      fileWarnings: parsed.fileWarnings,
      rows: [],
      newCategories: [],
      newBrands: [],
      counts: emptyCounts,
      lookups,
    };
  }

  const barcodeFirstRow = new Map<string, number>(); // barcode used twice in one file
  const rows: PlannedRow[] = [];

  for (const row of parsed.rows) {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    const changes: string[] = [];
    const existing = row.sku ? lookups.productBySku.get(matchKey(row.sku)) ?? null : null;

    // A SKU is only ever generated by the system: it can be used to find a product, not to invent one
    if (row.sku && !existing) {
      errors.push('No product has this SKU. Leave the SKU cell empty to add a new product.');
    }

    // Barcodes must not belong to another product, or to another row of this file
    for (const code of row.barcodes ?? []) {
      const key = matchKey(code);
      const owner = lookups.barcodeOwner.get(key);
      if (owner !== undefined && owner !== existing?.id) {
        const ownerSku = lookups.productById.get(owner)?.sku;
        errors.push(`Barcode ${code} already belongs to another product${ownerSku ? ` (${ownerSku})` : ''}.`);
      }
      const firstRow = barcodeFirstRow.get(key);
      if (firstRow !== undefined) errors.push(`Barcode ${code} is also used on row ${firstRow}.`);
      else barcodeFirstRow.set(key, row.rowNumber);
    }

    let action: PlannedAction = 'create';

    if (errors.length > 0) {
      action = 'error';
    } else if (!row.sku) {
      // New product. Warn when it looks like one that already exists (importing a file twice)
      const sameNumberSku = lookups.skuByPartNumber.get(matchKey(row.partNumber));
      if (sameNumberSku) {
        warnings.push(
          `A product with this part number already exists (SKU ${sameNumberSku}). A NEW product will be added. ` +
            'To update the existing one, put its SKU in the SKU cell.',
        );
      }
    } else if (existing) {
      // Work out what an update would change (blank optional cells leave things alone)
      const note = (label: string, from: string, to: string) => changes.push(`${label}: ${from || '(empty)'} -> ${to}`);

      if (row.name !== existing.name) note('name', existing.name, row.name);
      if (row.partNumber !== existing.partNumber) note('part number', existing.partNumber, row.partNumber);

      const existingCategory = lookups.categoryNameById.get(existing.categoryId) ?? '';
      if (matchKey(row.category) !== matchKey(existingCategory)) note('category', existingCategory, row.category);

      if (row.brand !== null) {
        const existingBrand = existing.brandId ? lookups.brandNameById.get(existing.brandId) ?? '' : '';
        if (matchKey(row.brand) !== matchKey(existingBrand)) note('brand', existingBrand, row.brand);
      }
      if (row.description !== null && row.description !== (existing.description ?? '')) changes.push('description changed');
      if (row.unit !== null && row.unit !== existing.unit) note('unit', existing.unit, row.unit);
      if (row.binLocation !== null && row.binLocation !== (existing.binLocation ?? '')) {
        note('bin location', existing.binLocation ?? '', row.binLocation);
      }
      if (!sameMoney(row.costPrice, existing.costPrice)) note('cost price', money(existing.costPrice), row.costPrice);
      if (!sameMoney(row.price, existing.price)) note('selling price', money(existing.price), row.price);
      if (row.reorderLevel !== null && row.reorderLevel !== existing.reorderLevel) {
        note('reorder level', String(existing.reorderLevel), String(row.reorderLevel));
      }
      if (row.isActive !== null && row.isActive !== existing.isActive) {
        note('active', existing.isActive ? 'yes' : 'no', row.isActive ? 'yes' : 'no');
      }
      if (row.alternates !== null) {
        const current = new Set((lookups.alternatesByProduct.get(existing.id) ?? []).map(altKey));
        const wanted = new Set(row.alternates.map(altKey));
        const same = current.size === wanted.size && [...wanted].every((k) => current.has(k));
        if (!same) changes.push('alternate part numbers replaced');
      }
      if (row.barcodes !== null) {
        const added = row.barcodes.filter((c) => lookups.barcodeOwner.get(matchKey(c)) !== existing.id);
        if (added.length > 0) changes.push(`barcodes added: ${added.join(', ')}`);
      }
      if (row.stock !== null && row.stock !== existing.stockQty) {
        warnings.push(
          `Stock in the file (${row.stock}) differs from the current stock (${existing.stockQty}). ` +
            'An import never changes stock of existing products: use Inventory > Adjust stock.',
        );
      }
      action = changes.length > 0 ? 'update' : 'unchanged';
    }

    rows.push({
      rowNumber: row.rowNumber,
      sku: row.sku,
      name: row.name,
      action,
      changes,
      errors,
      warnings,
      parsed: row,
      existingId: existing?.id ?? null,
    });
  }

  // Categories and brands that would be created (only from rows that will be imported)
  const newCategoryNames = new Map<string, string>();
  const newBrandNames = new Map<string, string>();
  for (const r of rows) {
    if (r.action === 'error' || r.action === 'unchanged') continue;
    const catKey = matchKey(r.parsed.category);
    if (!lookups.categoryByKey.has(catKey) && !newCategoryNames.has(catKey)) newCategoryNames.set(catKey, r.parsed.category);
    if (r.parsed.brand) {
      const brandKey = matchKey(r.parsed.brand);
      if (!lookups.brandByKey.has(brandKey) && !newBrandNames.has(brandKey)) newBrandNames.set(brandKey, r.parsed.brand);
    }
  }

  const counts = { ...emptyCounts };
  for (const r of rows) counts[r.action] += 1;

  return {
    fileErrors: [],
    fileWarnings: parsed.fileWarnings,
    rows,
    newCategories: [...newCategoryNames.values()],
    newBrands: [...newBrandNames.values()],
    counts,
    lookups,
  };
}

function toPreview(plan: Plan): ImportPreview {
  return {
    fileErrors: plan.fileErrors,
    fileWarnings: plan.fileWarnings,
    counts: plan.counts,
    newCategories: plan.newCategories,
    newBrands: plan.newBrands,
    rows: plan.rows.map(({ rowNumber, sku, name, action, changes, errors, warnings }) => ({
      rowNumber,
      sku,
      name,
      action,
      changes,
      errors,
      warnings,
    })),
  };
}

/** Shows what an import would do. Writes nothing. */
export async function previewProductImport(csvText: string): Promise<ImportPreview> {
  return toPreview(await buildPlan(db, csvText));
}

export interface ImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  categoriesCreated: number;
  brandsCreated: number;
}

export type ImportOutcome =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string; preview: ImportPreview };

/**
 * Imports the file in ONE transaction: either everything is saved or nothing is.
 * The file is checked again here, so a stale preview can never write bad data.
 * Rows with errors stop the import unless `skipInvalid` is set (then they are left out).
 */
export async function commitProductImport(
  csvText: string,
  ownerId: string,
  options: { skipInvalid?: boolean } = {},
): Promise<ImportOutcome> {
  return db.transaction(async (tx): Promise<ImportOutcome> => {
    const plan = await buildPlan(tx, csvText);

    if (plan.fileErrors.length > 0) {
      return { ok: false, error: plan.fileErrors[0], preview: toPreview(plan) };
    }
    if (plan.counts.error > 0 && !options.skipInvalid) {
      return {
        ok: false,
        error: `${plan.counts.error} row${plan.counts.error === 1 ? ' has' : 's have'} errors. Fix them, or choose to skip the invalid rows.`,
        preview: toPreview(plan),
      };
    }

    const { lookups } = plan;
    let categoriesCreated = 0;
    let brandsCreated = 0;

    const ensureCategory = async (name: string): Promise<number> => {
      const key = matchKey(name);
      const found = lookups.categoryByKey.get(key);
      if (found) return found.id;
      const [{ id }] = await tx.insert(categories).values({ name: name.trim() }).$returningId();
      lookups.categoryByKey.set(key, { id, name: name.trim() });
      categoriesCreated += 1;
      return id;
    };
    const ensureBrand = async (name: string): Promise<number> => {
      const key = matchKey(name);
      const found = lookups.brandByKey.get(key);
      if (found) return found.id;
      const [{ id }] = await tx.insert(brands).values({ name: name.trim() }).$returningId();
      lookups.brandByKey.set(key, { id, name: name.trim() });
      brandsCreated += 1;
      return id;
    };

    let created = 0;
    let updated = 0;

    // Barcodes listed in the file: a generated SKU must never equal one of them
    const reservedCodes = new Set<string>();
    for (const planned of plan.rows) for (const code of planned.parsed.barcodes ?? []) reservedCodes.add(matchKey(code));

    for (const planned of plan.rows) {
      if (planned.action !== 'create' && planned.action !== 'update') continue;
      const row = planned.parsed;
      const categoryId = await ensureCategory(row.category);
      const brandId = row.brand ? await ensureBrand(row.brand) : null;

      if (planned.action === 'create') {
        const stock = row.stock ?? 0;
        const sku = await generateUniqueProductCode(tx, { avoid: reservedCodes });
        const [{ id }] = await tx
          .insert(products)
          .values({
            sku,
            name: row.name,
            partNumber: row.partNumber,
            categoryId,
            brandId,
            description: row.description,
            unit: row.unit ?? 'pcs',
            binLocation: row.binLocation,
            costPrice: row.costPrice,
            price: row.price,
            stockQty: stock,
            reorderLevel: row.reorderLevel ?? 0,
            isActive: row.isActive ?? true,
          })
          .$returningId();

        // The generated SKU is also the product's internal barcode
        await tx.insert(productBarcodes).values({ productId: id, code: sku, kind: 'internal' });

        if (row.alternates && row.alternates.length > 0) {
          await tx
            .insert(productPartNumbers)
            .values(row.alternates.map((a) => ({ productId: id, partNumber: a.partNumber, kind: a.kind })));
        }
        for (const code of row.barcodes ?? []) {
          await tx.insert(productBarcodes).values({ productId: id, code, kind: 'manufacturer' });
        }
        if (stock > 0) {
          await tx.insert(stockMovements).values({
            productId: id,
            changeQty: stock,
            qtyAfter: stock,
            reason: 'opening',
            note: 'Imported from CSV',
            createdBy: ownerId,
          });
        }
        created += 1;
      } else {
        const productId = planned.existingId!;
        await tx
          .update(products)
          .set({
            name: row.name,
            partNumber: row.partNumber,
            categoryId,
            costPrice: row.costPrice,
            price: row.price,
            // Blank optional cells leave the current value alone. Stock is never touched.
            ...(row.brand !== null ? { brandId } : {}),
            ...(row.description !== null ? { description: row.description } : {}),
            ...(row.unit !== null ? { unit: row.unit } : {}),
            ...(row.binLocation !== null ? { binLocation: row.binLocation } : {}),
            ...(row.reorderLevel !== null ? { reorderLevel: row.reorderLevel } : {}),
            ...(row.isActive !== null ? { isActive: row.isActive } : {}),
          })
          .where(eq(products.id, productId));

        if (row.alternates !== null) {
          await tx.delete(productPartNumbers).where(eq(productPartNumbers.productId, productId));
          if (row.alternates.length > 0) {
            await tx
              .insert(productPartNumbers)
              .values(row.alternates.map((a) => ({ productId, partNumber: a.partNumber, kind: a.kind })));
          }
        }
        // Barcodes are only ever added by an import, never removed
        for (const code of row.barcodes ?? []) {
          if (lookups.barcodeOwner.get(matchKey(code)) === productId) continue;
          await tx.insert(productBarcodes).values({ productId, code, kind: 'manufacturer' });
        }
        updated += 1;
      }
    }

    return {
      ok: true,
      summary: {
        created,
        updated,
        unchanged: plan.counts.unchanged,
        skipped: plan.counts.error,
        categoriesCreated,
        brandsCreated,
      },
    };
  });
}

/** Every product as CSV text (UTF-8 with BOM so Excel opens it correctly). Owner use only: it has cost prices. */
export async function exportProductsCsv(): Promise<string> {
  const [productRows, alternateRows, barcodeRows] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        partNumber: products.partNumber,
        categoryName: categories.name,
        brandName: brands.name,
        description: products.description,
        unit: products.unit,
        binLocation: products.binLocation,
        costPrice: products.costPrice,
        price: products.price,
        stockQty: products.stockQty,
        reorderLevel: products.reorderLevel,
        isActive: products.isActive,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .orderBy(asc(products.sku)),
    db
      .select({
        productId: productPartNumbers.productId,
        partNumber: productPartNumbers.partNumber,
        kind: productPartNumbers.kind,
      })
      .from(productPartNumbers)
      .orderBy(asc(productPartNumbers.id)),
    db
      .select({ productId: productBarcodes.productId, code: productBarcodes.code, kind: productBarcodes.kind })
      .from(productBarcodes)
      .orderBy(asc(productBarcodes.id)),
  ]);

  const alternates = new Map<number, string[]>();
  for (const a of alternateRows) {
    const list = alternates.get(a.productId) ?? [];
    list.push(a.kind === 'oem' ? `oem:${a.partNumber}` : a.partNumber);
    alternates.set(a.productId, list);
  }
  const manufacturerBarcodes = new Map<number, string[]>();
  const internalBarcodes = new Map<number, string>();
  for (const b of barcodeRows) {
    if (b.kind === 'internal') internalBarcodes.set(b.productId, b.code);
    else manufacturerBarcodes.set(b.productId, [...(manufacturerBarcodes.get(b.productId) ?? []), b.code]);
  }

  const lines = productRows.map((p) => [
    guardCell(p.sku),
    guardCell(p.name),
    guardCell(p.partNumber),
    guardCell(p.categoryName),
    guardCell(p.brandName ?? ''),
    guardCell(p.description ?? ''),
    guardCell(p.unit),
    guardCell(p.binLocation ?? ''),
    money(p.costPrice),
    money(p.price),
    p.stockQty,
    p.reorderLevel,
    p.isActive ? 'yes' : 'no',
    guardCell((alternates.get(p.id) ?? []).join(';')),
    guardCell((manufacturerBarcodes.get(p.id) ?? []).join(';')),
    internalBarcodes.get(p.id) ?? '',
  ]);

  return toCsv([[...PRODUCT_CSV_COLUMNS], ...lines]);
}
