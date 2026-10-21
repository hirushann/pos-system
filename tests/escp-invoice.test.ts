import { describe, it, expect } from 'vitest';
import {
  buildTextInvoice,
  lineWidth,
  toAscii,
  wrapText,
  TEXT_INVOICE_DEFAULTS,
} from '@/src/lib/escp-invoice';
import type { SaleDetail } from '@/src/data/sales';
import type { ShopProfile } from '@/src/data/shop';

const shop: ShopProfile = {
  shopName: 'Jayaweera Logistic & Motors (Pvt) Ltd',
  address: 'Mahena, Ambeepussa',
  phone: '0778253254',
  receiptFooter: 'Thank you for your business!',
};

function makeSale(itemCount: number, overrides: Partial<SaleDetail> = {}): SaleDetail {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: i + 1,
    productId: i + 1,
    productName: `Front Brake Pads Set ${i + 1} (Toyota Axio / Premio)`,
    partNumber: `04465-1261${i}`,
    quantity: 2,
    unitPrice: '8900.00',
    unitCost: null,
    lineTotal: '17800.00',
  }));
  return {
    id: 1,
    receiptNumber: 'INV-2026-000003',
    createdAt: new Date('2026-10-15T09:17:00.000Z'),
    status: 'completed',
    subtotal: String(17800 * itemCount) + '.00',
    discount: '0.00',
    total: String(17800 * itemCount) + '.00',
    amountTendered: '500000.00',
    changeGiven: '454115.00',
    paymentMethod: 'Cash',
    chequeNumber: null,
    chequeBank: null,
    chequeDate: null,
    chequeStatus: null,
    cashierId: 'u1',
    cashierName: 'Hirushan Perera',
    customerName: 'Kamal Perera',
    customerPhone: '0771234567',
    vehicleNo: 'cab-4521',
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    items,
    ...overrides,
  };
}

const ESC = 0x1b;
const FF = 0x0c;

function indexOfBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe('text invoice for the LQ-310', () => {
  it('fits every line inside the print width and keeps one invoice on one form', () => {
    const inv = buildTextInvoice(makeSale(6), shop);
    expect(inv.pages).toHaveLength(1);
    for (const line of inv.pages[0]) {
      expect(lineWidth(line)).toBeLessThanOrEqual(TEXT_INVOICE_DEFAULTS.cols);
    }
    expect(inv.pages[0].length).toBeLessThanOrEqual(TEXT_INVOICE_DEFAULTS.usableLines);
  });

  it('aligns the item columns with the heading', () => {
    const inv = buildTextInvoice(makeSale(2), shop);
    const lines = inv.preview.split('\n');
    const head = lines.find((l) => l.includes('Part No') && l.includes('Amount (Rs.)'))!;
    const row = lines.find((l) => l.includes('04465-12610'))!;
    // The right-hand columns end in the same character column
    expect(head.trimEnd().length).toBe(row.trimEnd().length);
    expect(row).toContain('17,800.00');
    expect(row).toContain('8,900.00');
    // Part number starts under the "Part No" heading
    expect(row.indexOf('04465-12610')).toBe(head.indexOf('Part No'));
  });

  it('shows company, customer, invoice details, totals and signatures', () => {
    const { preview } = buildTextInvoice(makeSale(3), shop);
    expect(preview).toContain('J a y a w e e r a'); // double-width company name
    expect(preview).toContain('Mahena, Ambeepussa | Tel: 0778253254');
    expect(preview).toContain('Customer : Kamal Perera');
    expect(preview).toContain('Vehicle  : CAB-4521');
    expect(preview).toContain('Invoice No : INV-2026-000003');
    expect(preview).toContain('Cashier    : Hirushan Perera');
    expect(preview).toContain('Cash Given : Rs. 500,000.00');
    expect(preview).toContain('Balance    : Rs. 454,115.00');
    expect(preview).toContain('Customer Signature');
    expect(preview).toContain('Authorized Signature');
    expect(preview).toContain('Thank you for your business!');
  });

  it('shows the discount line only when there is a discount', () => {
    const without = buildTextInvoice(makeSale(1), shop).preview;
    expect(without).not.toContain('Discount');
    const withDiscount = buildTextInvoice(
      makeSale(1, { discount: '890.00', total: '16910.00', subtotal: '17800.00' }),
      shop,
    ).preview;
    expect(withDiscount).toContain('Discount');
    expect(withDiscount).toContain('-890.00');
  });

  it('wraps long descriptions and part numbers onto extra lines', () => {
    const sale = makeSale(1);
    sale.items[0].productName =
      'Front Brake Pads Ferodo Premium Heavy Duty Ceramic (Toyota Axio / Corolla / Premio / Allion)';
    sale.items[0].partNumber = 'ABCDEFGHIJ-1234567890-XYZ';
    const inv = buildTextInvoice(sale, shop);
    const text = inv.preview;
    expect(text).toContain('ABCDEFGHIJ-12345 '); // first 16 characters
    expect(text).toContain('67890-XYZ');         // the rest on the next line
    // Numbers only appear on the first line of the item
    expect(text.match(/17,800\.00/g)!.length).toBe(2); // item amount + total
    for (const line of inv.pages[0]) {
      expect(lineWidth(line)).toBeLessThanOrEqual(TEXT_INVOICE_DEFAULTS.cols);
    }
  });

  it('continues a long invoice on more forms, with totals only on the last', () => {
    const inv = buildTextInvoice(makeSale(40), shop);
    expect(inv.pages.length).toBeGreaterThan(1);
    for (const page of inv.pages) {
      expect(page.length).toBeLessThanOrEqual(TEXT_INVOICE_DEFAULTS.usableLines);
    }
    const asText = inv.pages.map((p) => p.map((l) => l.map((s) => s.text).join('')).join('\n'));
    asText.forEach((t, i) => {
      expect(t).toContain(`Page ${i + 1} of ${inv.pages.length}`);
      if (i < inv.pages.length - 1) {
        expect(t).toContain('(continued on next form)');
        expect(t).not.toContain('Authorized Signature');
      } else {
        expect(t).toContain('Authorized Signature');
      }
    });
    // Every item is printed exactly once, in order
    const all = asText.join('\n');
    for (let n = 1; n <= 40; n++) expect(all).toContain(`Set ${n} (`);
    expect(all.match(/Set 1 \(/g)!.length).toBe(1);
  });

  it('marks voided invoices and reprints', () => {
    const voided = buildTextInvoice(makeSale(1, { status: 'voided' }), shop, { isReprint: true }).preview;
    expect(voided).toContain('VOID');
    expect(voided).not.toContain('REPRINT'); // a void banner replaces the reprint tag
    const reprint = buildTextInvoice(makeSale(1), shop, { isReprint: true }).preview;
    expect(reprint).toContain('** REPRINT **');
  });

  it('falls back to normal-width company name when it is too long for double width', () => {
    const longShop = { ...shop, shopName: 'Jayaweera Logistic & Motors Private Limited Colombo' };
    const inv = buildTextInvoice(makeSale(1), longShop);
    expect(inv.preview).toContain('Jayaweera Logistic & Motors Private Limited Colombo');
    for (const line of inv.pages[0]) {
      expect(lineWidth(line)).toBeLessThanOrEqual(TEXT_INVOICE_DEFAULTS.cols);
    }
  });

  it('only emits plain ASCII text bytes (no accents or symbols the printer lacks)', () => {
    expect(toAscii('Caf\u00e9 \u00b7 \u201cquote\u201d \u0DC1\u0DCA\u200d')).toBe('Cafe | "quote" ??');
    const inv = buildTextInvoice(makeSale(1, { customerName: 'Nimal \u00d1o\u00ebl' }), shop);
    expect(inv.preview).toContain('Nimal Noel');
    expect(inv.preview).not.toMatch(/[^\x20-\x7E\n]/);
  });

  it('starts with the printer setup commands and ends each form with a form feed', () => {
    const inv = buildTextInvoice(makeSale(1), shop);
    const b = inv.bytes;
    expect(Array.from(b.slice(0, 2))).toEqual([ESC, 0x40]); // ESC @ reset
    expect(indexOfBytes(b, [ESC, 0x78, 1])).toBeGreaterThan(-1); // letter quality
    expect(indexOfBytes(b, [ESC, 0x6b, TEXT_INVOICE_DEFAULTS.typeface])).toBeGreaterThan(-1); // typeface
    expect(indexOfBytes(b, [ESC, 0x4d])).toBeGreaterThan(-1); // 12 cpi
    expect(indexOfBytes(b, [ESC, 0x43, TEXT_INVOICE_DEFAULTS.formLines])).toBeGreaterThan(-1); // form length
    expect(indexOfBytes(b, [ESC, 0x45])).toBeGreaterThan(-1); // bold on
    expect(indexOfBytes(b, [ESC, 0x57, 1])).toBeGreaterThan(-1); // double width on
    expect(Array.from(b).filter((x) => x === FF)).toHaveLength(inv.pages.length);
    expect(Array.from(b.slice(-2))).toEqual([ESC, 0x40]); // reset at the end
  });

  it('honours the typeface, left margin and double-strike options', () => {
    const b = buildTextInvoice(makeSale(1), shop, { typeface: 0, leftMargin: 4, doubleStrike: true }).bytes;
    expect(indexOfBytes(b, [ESC, 0x6b, 0])).toBeGreaterThan(-1);
    expect(indexOfBytes(b, [ESC, 0x6c, 4])).toBeGreaterThan(-1);
    expect(indexOfBytes(b, [ESC, 0x47])).toBeGreaterThan(-1);
    const plainBytes = buildTextInvoice(makeSale(1), shop).bytes;
    expect(indexOfBytes(plainBytes, [ESC, 0x6c])).toBe(-1);
    expect(indexOfBytes(plainBytes, [ESC, 0x47])).toBe(-1);
  });

  it('wraps text without dropping or splitting words unnecessarily', () => {
    expect(wrapText('Front Brake Pads', 10)).toEqual(['Front', 'Brake Pads']);
    expect(wrapText('ABCDEFGHIJKL', 5)).toEqual(['ABCDE', 'FGHIJ', 'KL']);
    expect(wrapText('', 10)).toEqual(['']);
  });
});
