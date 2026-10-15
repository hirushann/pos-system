import { describe, it, expect } from 'vitest';
import { paginateItems, itemLines, ITEMS_PER_FORM } from '@/src/lib/invoice-pagination';

const item = (n: number, name = `Front Brake Pads ${n}`, part = `P-${n}`) => ({
  id: n,
  productName: name,
  partNumber: part,
});
const items = (count: number) => Array.from({ length: count }, (_, i) => item(i + 1));
const ids = (forms: { id: number }[][]) => forms.map((f) => f.map((i) => i.id));

describe('invoice pagination (7 items per form)', () => {
  it('holds a form at 7 items', () => {
    expect(ITEMS_PER_FORM).toBe(7);
  });

  it('keeps up to 7 items on one form, with the totals', () => {
    for (const count of [0, 1, 3, 7]) {
      expect(paginateItems(items(count))).toHaveLength(1);
    }
  });

  it('moves item 8 onto a second form', () => {
    const forms = paginateItems(items(8));
    expect(ids(forms)).toEqual([[1, 2, 3, 4, 5, 6, 7], [8]]);
  });

  it('fills 7 per form and keeps the order', () => {
    expect(ids(paginateItems(items(14)))).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
    ]);
    expect(ids(paginateItems(items(15))).map((f) => f.length)).toEqual([7, 7, 1]);
    expect(ids(paginateItems(items(22))).map((f) => f.length)).toEqual([7, 7, 7, 1]);
  });

  it('counts wrapped descriptions as extra lines', () => {
    expect(itemLines(item(1))).toBe(1);
    expect(itemLines(item(1, 'x'.repeat(50)))).toBe(1);
    expect(itemLines(item(1, 'x'.repeat(51)))).toBe(2);
    expect(itemLines(item(1, 'x'.repeat(101)))).toBe(3);
    expect(itemLines(item(1, 'short', 'ABCDEFGHIJ-1234567890'))).toBe(2); // long part number wraps
  });

  it('allows 7 items when one of them wraps onto a second line (8 lines)', () => {
    const list = [...items(6), item(7, 'x'.repeat(70))];
    expect(paginateItems(list)).toHaveLength(1);
  });

  it('starts a new form instead of letting wrapped items overflow one', () => {
    // 3 two-line items + 4 one-line items = 10 lines, more than a form can hold
    const list = [
      item(1, 'x'.repeat(70)),
      item(2, 'x'.repeat(70)),
      item(3, 'x'.repeat(70)),
      ...[4, 5, 6, 7].map((n) => item(n)),
    ];
    const forms = paginateItems(list);
    expect(forms.length).toBe(2);
    expect(forms.flat().map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const form of forms) {
      expect(form.reduce((n, i) => n + itemLines(i), 0)).toBeLessThanOrEqual(8);
    }
  });

  it('leaves room for a banner (e.g. VOID) shown on every form', () => {
    const forms = paginateItems(items(7), 2); // 6 lines left per form
    expect(ids(forms)).toEqual([[1, 2, 3, 4, 5, 6], [7]]);
  });

  it('never drops or repeats an item', () => {
    for (const count of [1, 6, 7, 8, 13, 14, 15, 30]) {
      const forms = paginateItems(items(count));
      expect(forms.flat().map((i) => i.id)).toEqual(items(count).map((i) => i.id));
      expect(forms.every((f) => f.length >= 1 && f.length <= ITEMS_PER_FORM)).toBe(true);
    }
  });
});
