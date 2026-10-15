import { formatAmount } from '@/src/lib/money';
import { formatColomboDate, formatColomboTime } from '@/src/lib/dates';
import type { SaleDetail } from '@/src/data/sales';
import type { ShopProfile } from '@/src/data/shop';

/*
 * Plain-text invoice for the Epson LQ-310 (24-pin dot matrix, ESC/P2).
 *
 * A browser prints a web page as a PICTURE, and small text breaks up at the LQ-310's
 * dot resolution. This module instead builds the invoice as text plus ESC/P commands,
 * so the printer draws every character with its own built-in font (Roman / Sans Serif /
 * Courier ...), which comes out sharp and fast.
 *
 * Paper: 9.5in x 5.5in fan-fold = 33 lines at 6 lines per inch. Maximum print width of
 * the LQ-310 is 8.0in = 96 columns at 12 cpi; we use 92 so nothing is clipped.
 */

export interface TextInvoiceOptions {
  /** Characters per line. 12 cpi x 8.0in = 96 max. */
  cols?: number;
  /** Lines per form: 5.5in x 6 lpi. */
  formLines?: number;
  /** Lines of content per form (the rest is top/bottom safety margin). */
  usableLines?: number;
  /** ESC k typeface: 0 Roman, 1 Sans Serif, 2 Courier, 3 Prestige. */
  typeface?: number;
  /** Columns to indent everything (ESC l). Use to nudge the print area sideways. */
  leftMargin?: number;
  /** Print every line twice for a darker carbon copy (slower). */
  doubleStrike?: boolean;
}

export const TEXT_INVOICE_DEFAULTS = {
  cols: 92,
  formLines: 33,
  usableLines: 31,
  typeface: 1,
  leftMargin: 0,
  doubleStrike: false,
} as const;

interface Seg {
  text: string;
  bold?: boolean;
  wide?: boolean;
}
type Line = Seg[];

export interface TextInvoice {
  /** One entry per form (page), each a list of lines. */
  pages: Line[][];
  /** What the printed forms will look like, for showing on screen. */
  preview: string;
  /** ESC/P bytes ready to send to the printer. */
  bytes: Uint8Array;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** The printer only has single-byte characters: strip accents, turn the rest into '?'. */
export function toAscii(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u200B-\u200D\u2060\uFEFF]/g, '') // accents and zero-width characters
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // odd spaces (e.g. before "PM")
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00B7/g, '|')
    .replace(/[^\x20-\x7E]/g, '?');
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const padEnd = (s: string, n: number) => clip(s, n).padEnd(n, ' ');
const padStart = (s: string, n: number) => clip(s, n).padStart(n, ' ');

/** Word-wraps to `width`, splitting words that are longer than a whole line. */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let word of words) {
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

const segWidth = (s: Seg) => s.text.length * (s.wide ? 2 : 1);
export const lineWidth = (line: Line) => line.reduce((n, s) => n + segWidth(s), 0);

const plain = (text: string, bold = false): Line => [{ text, bold }];

/** left ... right, filling the gap with spaces so the line is exactly `cols` wide. */
function spread(left: Line, right: Line, cols: number): Line {
  const gap = Math.max(1, cols - lineWidth(left) - lineWidth(right));
  return [...left, { text: ' '.repeat(gap) }, ...right];
}

function center(text: string, cols: number, bold = false): Line {
  const left = Math.max(0, Math.floor((cols - text.length) / 2));
  return plain(' '.repeat(left) + text, bold);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function buildHeader(
  sale: SaleDetail,
  shop: ShopProfile,
  cols: number,
  page: number,
  pageCount: number,
  isReprint: boolean,
): Line[] {
  const company = toAscii(shop.shopName);
  const isVoided = sale.status === 'voided';
  const lines: Line[] = [];

  // Company (double width when it fits next to "INVOICE") and INVOICE on the right
  const invoiceWord = 'INVOICE';
  const wideFits = company.length * 2 + invoiceWord.length * 2 + 2 <= cols;
  lines.push(
    spread(
      [{ text: company, bold: true, wide: wideFits }],
      [{ text: invoiceWord, bold: true, wide: true }],
      cols,
    ),
  );

  const contact = [shop.address, shop.phone ? `Tel: ${shop.phone}` : null]
    .filter(Boolean)
    .map((s) => toAscii(String(s)))
    .join(' | ');
  const tags = [
    pageCount > 1 ? `Page ${page} of ${pageCount}` : null,
    !isVoided && isReprint ? '** REPRINT **' : null,
  ]
    .filter(Boolean)
    .join('  ');
  lines.push(spread(plain(clip(contact, cols - tags.length - 1)), plain(tags, true), cols));

  if (isVoided) {
    lines.push(center('*** VOID - THIS INVOICE HAS BEEN CANCELLED ***', cols, true));
  }

  lines.push(plain('='.repeat(cols)));

  // Customer (left) and invoice details (right)
  const leftW = 46;
  const row = (l: [string, string], r: [string, string], boldRight = false): Line => {
    const left = `${l[0].padEnd(8)} : ${toAscii(l[1])}`;
    const right = `${r[0].padEnd(10)} : ${toAscii(r[1])}`;
    return spread(plain(padEnd(left, leftW)), plain(clip(right, cols - leftW - 2), boldRight), cols);
  };
  lines.push(
    row(['Customer', sale.customerName || 'Walk-in Customer'], ['Invoice No', sale.receiptNumber], true),
  );
  lines.push(
    row(
      ['Phone', sale.customerPhone || ''],
      ['Date/Time', `${formatColomboDate(sale.createdAt)}, ${formatColomboTime(sale.createdAt)}`],
    ),
  );
  lines.push(
    row(['Vehicle', (sale.vehicleNo || '').toUpperCase()], ['Cashier', sale.cashierName]),
  );

  lines.push(plain('-'.repeat(cols)));
  return lines;
}

interface Columns {
  no: number;
  part: number;
  desc: number;
  qty: number;
  price: number;
  amount: number;
}

function columnsFor(cols: number): Columns {
  const fixed = { no: 3, part: 16, qty: 4, price: 12, amount: 12 };
  const gaps = 5;
  return { ...fixed, desc: cols - (fixed.no + fixed.part + fixed.qty + fixed.price + fixed.amount + gaps) };
}

function buildTableHeader(c: Columns, cols: number): Line[] {
  const head =
    `${padStart('No', c.no)} ${padEnd('Part No', c.part)} ${padEnd('Description', c.desc)} ` +
    `${padStart('Qty', c.qty)} ${padStart('Price (Rs.)', c.price)} ${padStart('Amount (Rs.)', c.amount)}`;
  return [plain(head, true), plain('-'.repeat(cols))];
}

/** One item = one or more lines (the part no. and description wrap if they are long). */
function buildItemBlock(no: number, item: SaleDetail['items'][number], c: Columns): Line[] {
  const part = wrapText(toAscii(item.partNumber), c.part);
  const desc = wrapText(toAscii(item.productName), c.desc);
  const count = Math.max(part.length, desc.length);
  const block: Line[] = [];
  for (let i = 0; i < count; i++) {
    const first = i === 0;
    block.push([
      { text: `${padStart(first ? String(no) : '', c.no)} ` },
      { text: padEnd(part[i] ?? '', c.part), bold: true },
      {
        text:
          ` ${padEnd(desc[i] ?? '', c.desc)} ` +
          `${padStart(first ? String(item.quantity) : '', c.qty)} ` +
          `${padStart(first ? formatAmount(item.unitPrice) : '', c.price)} ` +
          `${padStart(first ? formatAmount(item.lineTotal) : '', c.amount)}`,
      },
    ]);
  }
  return block;
}

function buildTrailer(sale: SaleDetail, shop: ShopProfile, cols: number): Line[] {
  const lines: Line[] = [plain('-'.repeat(cols))];

  const rightW = 48;
  const hasDiscount = Number(sale.discount) > 0;
  const money = (label: string, amount: string): Line =>
    plain(`${padEnd(label, rightW - 14)}${padStart(amount, 14)}`);

  const left: string[] = [`Payment : ${sale.paymentMethod.toUpperCase()}`];
  if (sale.amountTendered !== null) left.push(`Cash Given : Rs. ${formatAmount(sale.amountTendered)}`);
  if (sale.changeGiven !== null) left.push(`Balance    : Rs. ${formatAmount(sale.changeGiven)}`);
  while (left.length < 3) left.push('');

  const total = formatAmount(sale.total);
  const totalGap = Math.max(1, rightW - 'TOTAL (Rs.)'.length * 2 - total.length * 2);
  const right: Line[] = [
    money('Sub Total', formatAmount(sale.subtotal)),
    hasDiscount ? money('Discount', `-${formatAmount(sale.discount)}`) : plain(''),
    [
      { text: 'TOTAL (Rs.)', bold: true, wide: true },
      { text: ' '.repeat(totalGap) },
      { text: total, bold: true, wide: true },
    ],
  ];
  for (let i = 0; i < 3; i++) lines.push(spread(plain(left[i]), right[i], cols));

  if (shop.receiptFooter) {
    for (const f of wrapText(toAscii(shop.receiptFooter), cols).slice(0, 2)) lines.push(plain(f));
  }

  lines.push(plain(''));
  const sigW = 30;
  const gap = cols - sigW * 2;
  lines.push(plain('_'.repeat(sigW) + ' '.repeat(gap) + '_'.repeat(sigW)));
  const sigLabel = (t: string) => ' '.repeat(Math.floor((sigW - t.length) / 2)) + t;
  lines.push(
    plain(
      padEnd(sigLabel('Customer Signature'), sigW + gap) + padEnd(sigLabel('Authorized Signature'), sigW),
      true,
    ),
  );
  return lines;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const FF = 0x0c;
const CR = 0x0d;
const LF = 0x0a;

function encode(pages: Line[][], o: Required<TextInvoiceOptions>): Uint8Array {
  const out: number[] = [];
  const cmd = (...b: number[]) => out.push(...b);
  const text = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0x7f);
  };

  cmd(ESC, 0x40); //                 ESC @    reset
  cmd(ESC, 0x52, 0); //              ESC R 0  USA character set
  cmd(ESC, 0x74, 1); //              ESC t 1  PC437 character table
  cmd(ESC, 0x78, 1); //              ESC x 1  letter quality (not draft)
  cmd(ESC, 0x6b, o.typeface); //     ESC k n  built-in typeface
  cmd(ESC, 0x4d); //                 ESC M    12 cpi
  cmd(ESC, 0x70, 0); //              ESC p 0  fixed pitch (not proportional)
  cmd(ESC, 0x32); //                 ESC 2    6 lines per inch
  cmd(ESC, 0x43, o.formLines); //    ESC C n  form length in lines
  if (o.leftMargin > 0) cmd(ESC, 0x6c, o.leftMargin); // ESC l n  left margin
  if (o.doubleStrike) cmd(ESC, 0x47); //                  ESC G    double-strike

  for (const page of pages) {
    cmd(CR, LF); // one blank line below the top of the form
    for (const line of page) {
      for (const seg of line) {
        if (seg.bold) cmd(ESC, 0x45); //     ESC E    bold on
        if (seg.wide) cmd(ESC, 0x57, 1); //  ESC W 1  double width on
        text(seg.text);
        if (seg.wide) cmd(ESC, 0x57, 0);
        if (seg.bold) cmd(ESC, 0x46); //     ESC F    bold off
      }
      cmd(CR, LF);
    }
    cmd(FF); // advance to the top of the next form
  }

  cmd(ESC, 0x40);
  return Uint8Array.from(out);
}

function renderPreview(pages: Line[][]): string {
  const render = (line: Line) =>
    line.map((s) => (s.wide ? [...s.text].map((ch) => ch + ' ').join('') : s.text)).join('').replace(/\s+$/, '');
  return pages.map((page) => page.map(render).join('\n')).join('\n\n~~~~~~~~~~ next form ~~~~~~~~~~\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildTextInvoice(
  sale: SaleDetail,
  shop: ShopProfile,
  options: TextInvoiceOptions & { isReprint?: boolean } = {},
): TextInvoice {
  const { isReprint = false, ...rest } = options;
  const o: Required<TextInvoiceOptions> = { ...TEXT_INVOICE_DEFAULTS, ...rest };
  const cols = o.cols;
  const c = columnsFor(cols);

  const blocks = sale.items.map((item, i) => buildItemBlock(i + 1, item, c));
  const tableHead = buildTableHeader(c, cols);
  const trailer = buildTrailer(sale, shop, cols);
  const headerSize = buildHeader(sale, shop, cols, 1, 1, isReprint).length + tableHead.length;

  // Lines available for items on a form, with and without the totals block
  const capacityMiddle = o.usableLines - headerSize - 1; // 1 line for "continued"
  const capacityLast = o.usableLines - headerSize - trailer.length;

  // Fill forms greedily, keeping each item's lines together
  const groups: Line[][][] = [[]];
  let used = 0;
  for (const block of blocks) {
    if (used + block.length > capacityMiddle && groups[groups.length - 1].length > 0) {
      groups.push([]);
      used = 0;
    }
    groups[groups.length - 1].push(block);
    used += block.length;
  }
  // The last form must also fit the totals: push items to a new form until it does
  const size = (g: Line[][]) => g.reduce((n, b) => n + b.length, 0);
  while (size(groups[groups.length - 1]) > capacityLast && groups[groups.length - 1].length > 1) {
    const last = groups[groups.length - 1];
    const moved = last.pop()!;
    groups.push([moved]);
  }

  const pageCount = groups.length;
  const pages: Line[][] = groups.map((group, index) => {
    const lines: Line[] = [
      ...buildHeader(sale, shop, cols, index + 1, pageCount, isReprint),
      ...tableHead,
      ...group.flat(),
    ];
    if (index === pageCount - 1) lines.push(...trailer);
    else lines.push(spread(plain(''), plain('(continued on next form)', true), cols));
    return lines;
  });

  return { pages, preview: renderPreview(pages), bytes: encode(pages, o) };
}
