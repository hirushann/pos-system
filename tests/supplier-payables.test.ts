import { describe, expect, it } from 'vitest';
import { addDays, computeInvoiceBalance, paymentCounts, sumCountedPayments } from '@/src/lib/supplier-payables';

describe('supplier payables logic', () => {
  const base = { amount: '10000.00', dueDate: '2026-10-10', today: '2026-10-20' };

  it('unpaid, partial and paid', () => {
    expect(computeInvoiceBalance({ ...base, paid: '0' }).status).toBe('unpaid');
    const partial = computeInvoiceBalance({ ...base, paid: '2500.50' });
    expect(partial.status).toBe('partial');
    expect(partial.balance).toBe('7499.50');
    const paid = computeInvoiceBalance({ ...base, paid: '10000.00' });
    expect(paid.status).toBe('paid');
    expect(paid.balance).toBe('0.00');
  });

  it('overdue only while something is owed and the due date has passed', () => {
    const late = computeInvoiceBalance({ ...base, paid: '0' });
    expect(late.overdue).toBe(true);
    expect(late.daysOverdue).toBe(10);
    expect(computeInvoiceBalance({ ...base, paid: '10000' }).overdue).toBe(false);
    expect(computeInvoiceBalance({ ...base, paid: '0', dueDate: '2026-10-20' }).overdue).toBe(false);
    expect(computeInvoiceBalance({ ...base, paid: '0', dueDate: null }).overdue).toBe(false);
  });

  it('a bounced cheque stops counting, a pending one still counts', () => {
    expect(paymentCounts({ method: 'cheque', chequeStatus: 'pending' })).toBe(true);
    expect(paymentCounts({ method: 'cheque', chequeStatus: 'cleared' })).toBe(true);
    expect(paymentCounts({ method: 'cheque', chequeStatus: 'bounced' })).toBe(false);
    expect(paymentCounts({ method: 'cash', chequeStatus: null })).toBe(true);
    const total = sumCountedPayments([
      { amount: '100.10', method: 'cash', chequeStatus: null },
      { amount: '200.20', method: 'cheque', chequeStatus: 'pending' },
      { amount: '999.00', method: 'cheque', chequeStatus: 'bounced' },
    ]);
    expect(total.toFixed(2)).toBe('300.30');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-20', 30)).toBe('2026-11-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
