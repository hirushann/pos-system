/*
 * How many invoice items go on each 9.5in x 5.5in form.
 *
 * A form holds at most 7 items. The totals + signature block is printed only on the last
 * form, so with 8 or more items the extra items (and the totals) move to the next form.
 * A long description that wraps onto extra lines counts as more than one line, so a form
 * never gets more text than fits (the form is a fixed-size box and clips anything beyond it).
 */
export const ITEMS_PER_FORM = 7;
export const LINES_PER_FORM = 8;

// Rough characters per line in the Description / Part No columns (bold 11pt)
export const DESC_CHARS = 50;
export const PART_CHARS = 13;

interface PrintableItem {
  productName: string;
  partNumber: string;
}

/** Printed lines one item takes: wrapped descriptions and part numbers take more than one. */
export function itemLines(item: PrintableItem): number {
  return Math.max(
    1,
    Math.ceil(item.productName.length / DESC_CHARS),
    Math.ceil(item.partNumber.length / PART_CHARS),
  );
}

/**
 * Splits the items over forms of up to 7 items each, in order.
 * `reservedLines` is space already used on every form (e.g. the VOID banner).
 */
export function paginateItems<T extends PrintableItem>(items: T[], reservedLines = 0): T[][] {
  const maxLines = LINES_PER_FORM - reservedLines;
  const forms: T[][] = [[]];
  let used = 0;
  for (const item of items) {
    const lines = itemLines(item);
    const current = forms[forms.length - 1];
    if (current.length > 0 && (current.length >= ITEMS_PER_FORM || used + lines > maxLines)) {
      forms.push([]);
      used = 0;
    }
    forms[forms.length - 1].push(item);
    used += lines;
  }
  return forms;
}
