import Decimal from 'decimal.js';
import { parseCsv, toCsv, unguardCell } from '@/src/lib/csv';

/*
 * Product CSV format (one product per row, first row = column names).
 *
 *   sku, name*, part_number*, category*, brand, description, unit, bin_location,
 *   cost_price*, selling_price*, stock, reorder_level, active,
 *   alternate_part_numbers, manufacturer_barcodes, internal_barcode
 *
 * (* = required.) Notes:
 *  - sku: LEAVE EMPTY to add a new product (a unique SKU, which is also its barcode, is
 *    generated for it). Fill it with an existing SKU to update that product. The column
 *    itself may be left out of the file when every row is a new product.
 *  - alternate_part_numbers: items separated by ";". Prefix "oem:" for an OEM number,
 *    anything else (or "alt:") is an alternate number. Example: oem:04465-02220;FDB1617
 *  - manufacturer_barcodes: items separated by ";".
 *  - internal_barcode is written on export for reference and ignored on import.
 *  - A blank optional cell means "leave as it is" when updating an existing product.
 */

export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'name',
  'part_number',
  'category',
  'brand',
  'description',
  'unit',
  'bin_location',
  'cost_price',
  'selling_price',
  'stock',
  'reorder_level',
  'active',
  'alternate_part_numbers',
  'manufacturer_barcodes',
  'internal_barcode',
] as const;

export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

const REQUIRED_COLUMNS: ProductCsvColumn[] = [
  'name',
  'part_number',
  'category',
  'cost_price',
  'selling_price',
];

// Other spellings people commonly use for the same column
const ALIASES: Record<string, ProductCsvColumn> = {
  sku: 'sku',
  item_code: 'sku',
  product_code: 'sku',
  name: 'name',
  product_name: 'name',
  item_name: 'name',
  product: 'name',
  part_number: 'part_number',
  partnumber: 'part_number',
  part_no: 'part_number',
  partno: 'part_number',
  part: 'part_number',
  category: 'category',
  category_name: 'category',
  brand: 'brand',
  brand_name: 'brand',
  maker: 'brand',
  brand_maker: 'brand',
  description: 'description',
  notes: 'description',
  details: 'description',
  unit: 'unit',
  uom: 'unit',
  bin_location: 'bin_location',
  bin: 'bin_location',
  location: 'bin_location',
  shelf: 'bin_location',
  cost_price: 'cost_price',
  cost: 'cost_price',
  buying_price: 'cost_price',
  selling_price: 'selling_price',
  price: 'selling_price',
  sale_price: 'selling_price',
  retail_price: 'selling_price',
  sell_price: 'selling_price',
  stock: 'stock',
  stock_qty: 'stock',
  qty: 'stock',
  quantity: 'stock',
  opening_stock: 'stock',
  stock_on_hand: 'stock',
  reorder_level: 'reorder_level',
  reorder: 'reorder_level',
  reorder_alert_level: 'reorder_level',
  min_stock: 'reorder_level',
  active: 'active',
  is_active: 'active',
  status: 'active',
  alternate_part_numbers: 'alternate_part_numbers',
  alternate_numbers: 'alternate_part_numbers',
  alternates: 'alternate_part_numbers',
  alternate: 'alternate_part_numbers',
  alt_part_numbers: 'alternate_part_numbers',
  oem_numbers: 'alternate_part_numbers',
  manufacturer_barcodes: 'manufacturer_barcodes',
  manufacturer_barcode: 'manufacturer_barcodes',
  barcodes: 'manufacturer_barcodes',
  barcode: 'manufacturer_barcodes',
  internal_barcode: 'internal_barcode',
};

export const MAX_IMPORT_ROWS = 5000;
const MAX_PRICE = new Decimal('99999999.99');
const MAX_INT = 2_000_000_000;

export interface ParsedAlternate {
  partNumber: string;
  kind: 'oem' | 'alternate';
}

export interface ParsedProductRow {
  /** Line number in the file (the header is line 1). */
  rowNumber: number;
  /** Empty = a new product (the SKU is generated); filled = update the product with this SKU. */
  sku: string;
  name: string;
  partNumber: string;
  category: string;
  brand: string | null;
  description: string | null;
  unit: string | null;
  binLocation: string | null;
  costPrice: string;
  price: string;
  /** Opening stock for NEW products. Ignored for existing products. */
  stock: number | null;
  reorderLevel: number | null;
  isActive: boolean | null;
  /** null = cell left blank (do not touch). */
  alternates: ParsedAlternate[] | null;
  /** null = cell left blank (do not touch). */
  barcodes: string[] | null;
  errors: string[];
  warnings: string[];
}

export interface ParsedProductCsv {
  rows: ParsedProductRow[];
  /** Problems with the file as a whole (nothing can be imported). */
  fileErrors: string[];
  /** Things that were ignored, e.g. unknown columns. */
  fileWarnings: string[];
}

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Case-insensitive key for matching names / SKUs (the database compares the same way). */
export const matchKey = (value: string) => value.trim().toLowerCase();

function parseMoney(raw: string): string | null {
  const cleaned = raw.trim().replace(/^rs\.?\s*/i, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = new Decimal(cleaned);
  if (value.greaterThan(MAX_PRICE)) return null;
  return value.toFixed(2);
}

function parseWholeNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!/^\d+(\.0+)?$/.test(cleaned)) return null;
  const value = parseInt(cleaned, 10);
  return value <= MAX_INT ? value : null;
}

function parseActive(raw: string): boolean | null | 'invalid' {
  const v = raw.trim().toLowerCase();
  if (v === '') return null;
  if (['yes', 'y', 'true', '1', 'active'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'inactive'].includes(v)) return false;
  return 'invalid';
}

function splitList(raw: string): string[] {
  return raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAlternates(raw: string, ownPartNumber: string, row: ParsedProductRow): ParsedAlternate[] | null {
  const items = splitList(raw);
  if (items.length === 0) return null;
  const seen = new Set<string>([matchKey(ownPartNumber)]);
  const result: ParsedAlternate[] = [];
  for (const item of items) {
    const m = /^(oem|alt|alternate)\s*:\s*(.+)$/i.exec(item);
    const kind: ParsedAlternate['kind'] = m && m[1].toLowerCase() === 'oem' ? 'oem' : 'alternate';
    const partNumber = (m ? m[2] : item).trim();
    if (!partNumber) continue;
    if (partNumber.length > 255) {
      row.errors.push(`Alternate part number is longer than 255 characters: "${partNumber.slice(0, 30)}..."`);
      continue;
    }
    const key = matchKey(partNumber);
    if (seen.has(key)) continue; // repeats, or the same as the main part number
    seen.add(key);
    result.push({ partNumber, kind });
  }
  return result;
}

function parseBarcodes(raw: string, row: ParsedProductRow): string[] | null {
  const items = splitList(raw);
  if (items.length === 0) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of items) {
    if (code.length > 100) {
      row.errors.push(`Barcode is longer than 100 characters: "${code.slice(0, 30)}..."`);
      continue;
    }
    const key = matchKey(code);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(code);
  }
  return result;
}

/** Reads and checks a product CSV. Pure: does not touch the database. */
export function parseProductCsv(text: string): ParsedProductCsv {
  const fileErrors: string[] = [];
  const fileWarnings: string[] = [];
  const table = parseCsv(text);

  if (table.length === 0) {
    return { rows: [], fileErrors: ['The file is empty.'], fileWarnings };
  }

  // Header row -> column positions
  const columnIndex = new Map<ProductCsvColumn, number>();
  table[0].forEach((rawHeader, index) => {
    const header = normalizeHeader(unguardCell(rawHeader));
    if (!header) return;
    const column = ALIASES[header];
    if (!column) {
      fileWarnings.push(`Column "${rawHeader.trim()}" is not recognised and was ignored.`);
      return;
    }
    if (columnIndex.has(column)) {
      fileErrors.push(`Two columns both mean "${column}" ("${rawHeader.trim()}"). Keep only one.`);
      return;
    }
    columnIndex.set(column, index);
  });

  const missing = REQUIRED_COLUMNS.filter((c) => !columnIndex.has(c));
  if (missing.length > 0) {
    fileErrors.push(
      `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
        'Download the template to see the expected columns.',
    );
  }

  const dataLines = table.slice(1);
  if (dataLines.length === 0) fileErrors.push('The file has a header but no product rows.');
  if (dataLines.length > MAX_IMPORT_ROWS) {
    fileErrors.push(`The file has ${dataLines.length} rows. The limit is ${MAX_IMPORT_ROWS} per import: split it into smaller files.`);
  }
  if (fileErrors.length > 0) return { rows: [], fileErrors, fileWarnings };

  const cell = (line: string[], column: ProductCsvColumn): string => {
    const index = columnIndex.get(column);
    return index === undefined ? '' : unguardCell((line[index] ?? '').trim());
  };

  const firstRowOfSku = new Map<string, number>();
  const rows: ParsedProductRow[] = dataLines.map((line, i) => {
    const row: ParsedProductRow = {
      rowNumber: i + 2,
      sku: cell(line, 'sku'),
      name: cell(line, 'name'),
      partNumber: cell(line, 'part_number'),
      category: cell(line, 'category'),
      brand: cell(line, 'brand') || null,
      description: cell(line, 'description') || null,
      unit: cell(line, 'unit') || null,
      binLocation: cell(line, 'bin_location') || null,
      costPrice: '',
      price: '',
      stock: null,
      reorderLevel: null,
      isActive: null,
      alternates: null,
      barcodes: null,
      errors: [],
      warnings: [],
    };

    // Required text
    if (row.sku.length > 255) row.errors.push('SKU is longer than 255 characters.');
    if (!row.name) row.errors.push('Name is required.');
    else if (row.name.length > 255) row.errors.push('Name is longer than 255 characters.');
    if (!row.partNumber) row.errors.push('Part number is required.');
    else if (row.partNumber.length > 255) row.errors.push('Part number is longer than 255 characters.');
    if (!row.category) row.errors.push('Category is required.');
    else if (row.category.length > 255) row.errors.push('Category is longer than 255 characters.');

    // Optional text limits
    if (row.brand && row.brand.length > 255) row.errors.push('Brand is longer than 255 characters.');
    if (row.unit && row.unit.length > 255) row.errors.push('Unit is longer than 255 characters.');
    if (row.binLocation && row.binLocation.length > 255) row.errors.push('Bin location is longer than 255 characters.');
    if (row.description && row.description.length > 5000) row.errors.push('Description is longer than 5000 characters.');

    // Money
    const cost = parseMoney(cell(line, 'cost_price'));
    if (cost === null) row.errors.push('Cost price must be a number like 1250 or 1250.50.');
    else row.costPrice = cost;
    const price = parseMoney(cell(line, 'selling_price'));
    if (price === null) row.errors.push('Selling price must be a number like 1250 or 1250.50.');
    else row.price = price;

    // Whole numbers
    const stockRaw = cell(line, 'stock');
    if (stockRaw !== '') {
      const stock = parseWholeNumber(stockRaw);
      if (stock === null) row.errors.push('Stock must be a whole number (0 or more).');
      else row.stock = stock;
    }
    const reorderRaw = cell(line, 'reorder_level');
    if (reorderRaw !== '') {
      const reorder = parseWholeNumber(reorderRaw);
      if (reorder === null) row.errors.push('Reorder level must be a whole number (0 or more).');
      else row.reorderLevel = reorder;
    }

    // Active flag
    const active = parseActive(cell(line, 'active'));
    if (active === 'invalid') row.errors.push('Active must be yes or no (also true/false, 1/0, active/inactive).');
    else row.isActive = active;

    // Lists
    row.alternates = parseAlternates(cell(line, 'alternate_part_numbers'), row.partNumber, row);
    row.barcodes = parseBarcodes(cell(line, 'manufacturer_barcodes'), row);

    // The same SKU twice in one file
    if (row.sku) {
      const key = matchKey(row.sku);
      const first = firstRowOfSku.get(key);
      if (first !== undefined) row.errors.push(`Duplicate SKU in this file (first used on row ${first}).`);
      else firstRowOfSku.set(key, row.rowNumber);
    }

    return row;
  });

  return { rows, fileErrors, fileWarnings };
}

/** Header + two example rows, for people starting a new file. */
export function productCsvTemplate(): string {
  return toCsv([
    [...PRODUCT_CSV_COLUMNS],
    [
      '', 'Front Brake Pad Set', '04465-12610', 'Brakes', 'Toyota Genuine', 'Fits Axio and Premio', 'set', 'A-04',
      '6500', '8900', '10', '3', 'yes', 'oem:04465-02220;FDB1617', '4901234567894;4901234567900', '',
    ],
    ['', 'Engine Oil 4L', 'MOB-5W30-4L', 'Oils & Fluids', 'Mobil', '', 'pcs', '', '8200', '9800', '24', '6', 'yes', '', '', ''],
  ]);
}
