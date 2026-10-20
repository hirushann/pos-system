import { describe, expect, it } from 'vitest';
import { normalizeUnit } from '@/src/lib/unit';

describe('normalizeUnit', () => {
  it('keeps normal units', () => {
    expect(normalizeUnit('pcs')).toBe('pcs');
    expect(normalizeUnit(' set ')).toBe('set');
  });
  it('strips a quantity typed into the unit', () => {
    expect(normalizeUnit('8pcs')).toBe('pcs');
    expect(normalizeUnit('17 pcs')).toBe('pcs');
    expect(normalizeUnit('2.5 litre')).toBe('litre');
  });
  it('falls back to pcs when nothing is left', () => {
    expect(normalizeUnit('')).toBe('pcs');
    expect(normalizeUnit('12')).toBe('pcs');
    expect(normalizeUnit(null)).toBe('pcs');
  });
});
