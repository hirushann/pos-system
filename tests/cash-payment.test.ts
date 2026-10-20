import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeCashPayment } from '@/src/lib/cash-payment';

const total = new Decimal('3461.00');
const calc = (input: string) => computeCashPayment(input, total);

describe('cash payment balance', () => {
  it('starts empty: nothing entered yet, the sale cannot be completed', () => {
    for (const blank of ['', '   ']) {
      const s = calc(blank);
      expect(s.status).toBe('empty');
      expect(s.isValid).toBe(false);
      expect(s.changeDue.toFixed(2)).toBe('0.00');
      expect(s.shortAmount.toFixed(2)).toBe('3461.00');
    }
  });

  it('calculates the balance to give back', () => {
    const s = calc('5000');
    expect(s.status).toBe('ok');
    expect(s.isValid).toBe(true);
    expect(s.tendered.toFixed(2)).toBe('5000.00');
    expect(s.changeDue.toFixed(2)).toBe('1539.00');
    expect(s.shortAmount.toFixed(2)).toBe('0.00');
  });

  it('exact cash gives a balance of zero and is valid', () => {
    const s = calc('3461');
    expect(s.isValid).toBe(true);
    expect(s.changeDue.toFixed(2)).toBe('0.00');
    expect(calc('3461.00').changeDue.toFixed(2)).toBe('0.00');
  });

  it('reports how much is still missing when the cash is not enough', () => {
    const s = calc('3000.50');
    expect(s.status).toBe('short');
    expect(s.isValid).toBe(false);
    expect(s.shortAmount.toFixed(2)).toBe('460.50');
    expect(s.changeDue.toFixed(2)).toBe('0.00');
    expect(calc('0').shortAmount.toFixed(2)).toBe('3461.00');
  });

  it('is exact with cents (no floating point drift)', () => {
    const s = computeCashPayment('0.30', new Decimal('0.10'));
    expect(s.changeDue.toFixed(2)).toBe('0.20');
    expect(computeCashPayment('1000.10', new Decimal('999.90')).changeDue.toFixed(2)).toBe('0.20');
  });

  it('accepts thousands commas and one or two decimals', () => {
    expect(calc('5,000').changeDue.toFixed(2)).toBe('1539.00');
    expect(calc('3461.5').changeDue.toFixed(2)).toBe('0.50');
  });

  it('rejects things that are not a money amount', () => {
    for (const bad of ['abc', '-100', '1e4', '5000.555', '5000.', '.5', '12 34', 'Rs 5000']) {
      const s = calc(bad);
      expect(s.status).toBe('invalid');
      expect(s.isValid).toBe(false);
    }
  });
});
