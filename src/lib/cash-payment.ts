import Decimal from 'decimal.js';

/*
 * What to show the cashier while they type the cash a customer handed over.
 *  - empty:   nothing typed yet (the box starts empty on purpose, so the amount is always entered)
 *  - invalid: not a money amount
 *  - short:   less than the total
 *  - ok:      enough; `changeDue` is the balance to give back
 */
export type CashPaymentStatus = 'empty' | 'invalid' | 'short' | 'ok';

export interface CashPaymentState {
  status: CashPaymentStatus;
  /** True only when the sale can be completed with this amount. */
  isValid: boolean;
  tendered: Decimal;
  /** Balance to give back to the customer (0 unless status is "ok"). */
  changeDue: Decimal;
  /** How much more is needed (0 unless status is "short" or "empty"). */
  shortAmount: Decimal;
}

// Digits with at most 2 decimals; thousands commas are tolerated
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function computeCashPayment(input: string, total: Decimal): CashPaymentState {
  const zero = new Decimal(0);
  const raw = input.trim().replace(/,/g, '');

  if (raw === '') {
    return { status: 'empty', isValid: false, tendered: zero, changeDue: zero, shortAmount: total };
  }
  if (!AMOUNT_PATTERN.test(raw)) {
    return { status: 'invalid', isValid: false, tendered: zero, changeDue: zero, shortAmount: total };
  }

  const tendered = new Decimal(raw);
  if (tendered.lessThan(total)) {
    return { status: 'short', isValid: false, tendered, changeDue: zero, shortAmount: total.minus(tendered) };
  }
  return { status: 'ok', isValid: true, tendered, changeDue: tendered.minus(total), shortAmount: zero };
}
