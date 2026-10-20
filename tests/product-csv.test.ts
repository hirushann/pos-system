import { describe, it, expect } from 'vitest';
import { parseProductCsv, productCsvTemplate, MAX_IMPORT_ROWS } from '@/src/lib/product-csv';

const HEADER = 'sku,name,part_number,category,brand,description,unit,bin_location,cost_price,selling_price,stock,reorder_level,active,alternate_part_numbers,manufacturer_barcodes';

function parse(...lines: string[]) {
  return parseProductCsv([HEADER, ...lines].join('\n'));
}

describe('product CSV reader', () => {
  it('reads a complete row', () => {
    const { rows, fileErrors } = parse(
      'BRK-001,Front Brake Pad,04465-12610,Brakes,Toyota Genuine,Fits Axio,set,A-04,6500,8900.5,10,3,yes,oem:04465-02220;FDB1617,4901234567894;4901234567900',
    );
    expect(fileErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      sku: 'BRK-001',
      name: 'Front Brake Pad',
      partNumber: '04465-12610',
      category: 'Brakes',
      brand: 'Toyota Genuine',
      description: 'Fits Axio',
      unit: 'set',
      binLocation: 'A-04',
      costPrice: '6500.00',
      price: '8900.50',
      stock: 10,
      reorderLevel: 3,
      isActive: true,
      errors: [],
    });
    expect(rows[0].alternates).toEqual([
      { partNumber: '04465-02220', kind: 'oem' },
      { partNumber: 'FDB1617', kind: 'alternate' },
    ]);
    expect(rows[0].barcodes).toEqual(['4901234567894', '4901234567900']);
  });

  it('treats blank optional cells as "leave alone" (null)', () => {
    const { rows } = parse('A-1,Name,PN,Cat,,,,,100,200,,,,,');
    expect(rows[0].errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      brand: null,
      description: null,
      unit: null,
      binLocation: null,
      stock: null,
      reorderLevel: null,
      isActive: null,
      alternates: null,
      barcodes: null,
    });
  });

  it('accepts friendly column names in any order', () => {
    const csv = 'Price,Cost,Part No,Product Name,Item Code,Category,Qty\n"1,250.50",900,PN-1,Brake Pad,A-1,Brakes,4\n';
    const { rows, fileErrors } = parseProductCsv(csv);
    expect(fileErrors).toEqual([]);
    expect(rows[0]).toMatchObject({ sku: 'A-1', name: 'Brake Pad', partNumber: 'PN-1', category: 'Brakes', price: '1250.50', costPrice: '900.00', stock: 4, errors: [] });
  });

  it('accepts prices with Rs. and thousands separators', () => {
    const { rows } = parse('A-1,N,PN,C,,,,,"Rs. 1,000","Rs 2,500.5",,,,,');
    expect(rows[0].costPrice).toBe('1000.00');
    expect(rows[0].price).toBe('2500.50');
  });

  it('treats an empty SKU as a new product (the SKU is generated later), and the SKU column as optional', () => {
    const blank = parse(',New part,PN,Cat,,,,,10,20,,,,,');
    expect(blank.rows[0].errors).toEqual([]);
    expect(blank.rows[0].sku).toBe('');

    const noSkuColumn = parseProductCsv('name,part_number,category,cost_price,selling_price\nNew part,PN-1,Brakes,10,20\n');
    expect(noSkuColumn.fileErrors).toEqual([]);
    expect(noSkuColumn.rows[0]).toMatchObject({ sku: '', name: 'New part', errors: [] });
  });

  it('reports a missing required column for the whole file', () => {
    const { rows, fileErrors } = parseProductCsv('sku,name\nA,B\n');
    expect(rows).toEqual([]);
    expect(fileErrors[0]).toContain('Missing required columns');
    expect(fileErrors[0]).not.toContain('sku,'); // the SKU column is optional
    expect(fileErrors[0]).toContain('part_number');
    expect(fileErrors[0]).toContain('category');
  });

  it('reports an empty file and a header-only file', () => {
    expect(parseProductCsv('').fileErrors[0]).toContain('empty');
    expect(parseProductCsv(HEADER + '\n').fileErrors.join(' ')).toContain('no product rows');
  });

  it('warns about columns it does not know and ignores them', () => {
    const { rows, fileWarnings } = parseProductCsv(HEADER + ',colour\nA-1,N,PN,C,,,,,1,2,,,,,,red\n');
    expect(fileWarnings.join(' ')).toContain('colour');
    expect(rows[0].errors).toEqual([]);
  });

  it('rejects two columns that mean the same thing', () => {
    const { fileErrors } = parseProductCsv('sku,item_code,name,part_number,category,cost_price,selling_price\n');
    expect(fileErrors.join(' ')).toContain('Two columns both mean "sku"');
  });

  it('flags bad values on the row, with a row number', () => {
    const { rows } = parse(
      ',,,,,,,,abc,-5,ten,1.5,maybe,,',
      'A-2,Name,PN,Cat,,,,,10,20,-1,2,yes,,',
    );
    expect(rows[0].rowNumber).toBe(2);
    const messages = rows[0].errors.join(' | ');
    expect(messages).toContain('Name is required');
    expect(messages).toContain('Part number is required');
    expect(messages).toContain('Category is required');
    expect(messages).toContain('Cost price');
    expect(messages).toContain('Selling price');
    expect(messages).toContain('Stock must be a whole number');
    expect(messages).toContain('Reorder level must be a whole number');
    expect(messages).toContain('Active must be yes or no');
    expect(rows[1].rowNumber).toBe(3);
    expect(rows[1].errors.join(' ')).toContain('Stock must be a whole number'); // -1
  });

  it('rejects prices that are too large for the database', () => {
    const { rows } = parse('A-1,N,PN,C,,,,,1,100000000,,,,,');
    expect(rows[0].errors.join(' ')).toContain('Selling price');
  });

  it('understands the different ways of saying yes and no', () => {
    const { rows } = parse(
      'A-1,N,PN,C,,,,,1,2,,,YES,,', 'A-2,N,PN,C,,,,,1,2,,,true,,', 'A-3,N,PN,C,,,,,1,2,,,1,,',
      'A-4,N,PN,C,,,,,1,2,,,no,,', 'A-5,N,PN,C,,,,,1,2,,,False,,', 'A-6,N,PN,C,,,,,1,2,,,inactive,,',
    );
    expect(rows.map((r) => r.isActive)).toEqual([true, true, true, false, false, false]);
  });

  it('marks a SKU that appears twice in the file (case-insensitive)', () => {
    const { rows } = parse('A-1,N,PN,C,,,,,1,2,,,,,', 'a-1,N2,PN,C,,,,,1,2,,,,,');
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors.join(' ')).toContain('Duplicate SKU in this file (first used on row 2)');
  });

  it('cleans up lists: repeats, blanks, and an alternate equal to the main part number', () => {
    const { rows } = parse('A-1,N,PN-1,C,,,,,1,2,,,,"PN-1;X-1;x-1; ;oem:Y-2;alt:Z-3","111;111; 222 "');
    expect(rows[0].alternates).toEqual([
      { partNumber: 'X-1', kind: 'alternate' },
      { partNumber: 'Y-2', kind: 'oem' },
      { partNumber: 'Z-3', kind: 'alternate' },
    ]);
    expect(rows[0].barcodes).toEqual(['111', '222']);
  });

  it('refuses over-long barcodes', () => {
    const { rows } = parse(`A-1,N,PN,C,,,,,1,2,,,,,${'9'.repeat(101)}`);
    expect(rows[0].errors.join(' ')).toContain('Barcode is longer than 100');
  });

  it('removes the apostrophe that the exporter adds in front of formula-like text', () => {
    const { rows } = parse("A-1,'=Special,PN,C,,,,,1,2,,,,,");
    expect(rows[0].name).toBe('=Special');
  });

  it('handles quoted cells with commas and line breaks', () => {
    const { rows } = parse('A-1,"Pad, front","PN-1",C,,"line one\nline two",,,1,2,,,,,');
    expect(rows[0].name).toBe('Pad, front');
    expect(rows[0].description).toBe('line one\nline two');
  });

  it('refuses files with too many rows', () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `S-${i},N,PN,C,,,,,1,2,,,,,`);
    expect(parse(...lines).fileErrors.join(' ')).toContain('limit');
  });

  it('provides a template that reads back cleanly', () => {
    const { rows, fileErrors } = parseProductCsv(productCsvTemplate());
    expect(fileErrors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[0].alternates?.[0]).toEqual({ partNumber: '04465-02220', kind: 'oem' });
    expect(rows.map((r) => r.sku)).toEqual(['', '']); // the template adds new products
  });
});
