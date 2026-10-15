import Decimal from 'decimal.js';

export type MoneyInput = string | number | Decimal;

function toDecimal(val: MoneyInput): Decimal {
  if (val instanceof Decimal) return val;
  if (typeof val === 'number') return new Decimal(val);
  if (typeof val === 'string' && val.trim() !== '') return new Decimal(val.trim());
  return new Decimal(0);
}

/**
 * Formats a monetary value to Sri Lankan Rupees display format: "Rs. 1,250.00"
 */
export function formatLKR(value: MoneyInput): string {
  const d = toDecimal(value);
  const isNegative = d.isNegative();
  const absStr = d.abs().toFixed(2);
  const [integerPart, decimalPart] = absStr.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedAmount = `${formattedInteger}.${decimalPart}`;
  return isNegative ? `-Rs. ${formattedAmount}` : `Rs. ${formattedAmount}`;
}

/**
 * Formats a monetary value without a currency prefix: "1,250.00" (for table columns).
 */
export function formatAmount(value: MoneyInput): string {
  const d = toDecimal(value);
  const [integerPart, decimalPart] = d.abs().toFixed(2).split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${d.isNegative() ? '-' : ''}${formattedInteger}.${decimalPart}`;
}

/**
 * Adds two monetary values and returns a string with 2 decimal places.
 */
export function add(a: MoneyInput, b: MoneyInput): string {
  return toDecimal(a).plus(toDecimal(b)).toFixed(2);
}

/**
 * Subtracts b from a and returns a string with 2 decimal places.
 */
export function subtract(a: MoneyInput, b: MoneyInput): string {
  return toDecimal(a).minus(toDecimal(b)).toFixed(2);
}

/**
 * Multiplies a by b and returns a string with 2 decimal places.
 */
export function multiply(a: MoneyInput, b: MoneyInput): string {
  return toDecimal(a).times(toDecimal(b)).toFixed(2);
}

/**
 * Calculates (value * percent / 100) and returns a string with 2 decimal places.
 */
export function percentOf(value: MoneyInput, percent: MoneyInput): string {
  return toDecimal(value).times(toDecimal(percent)).dividedBy(100).toFixed(2);
}

export { Decimal };
