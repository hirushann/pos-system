/**
 * Unit of measure, e.g. "pcs", "set", "litre". It is a label only: the quantity in stock
 * is stored separately. A leading number ("8pcs") is stripped so a quantity typed into the
 * unit box can never be shown next to the real stock figure.
 */
export function normalizeUnit(value: string | null | undefined): string {
  const cleaned = (value ?? '').replace(/^[\d\s.,]+/, '').trim();
  return cleaned || 'pcs';
}
