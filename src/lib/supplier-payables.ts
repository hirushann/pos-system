import Decimal from 'decimal.js';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'credit';
export type ChequeStatus = 'pending' | 'cleared' | 'bounced';
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  credit: 'Supplier credit',
};

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  pending: 'Pending',
  cleared: 'Cleared',
  bounced: 'Bounced',
};

export interface PaymentLike {
  amount: string;
  method: string;
  chequeStatus: string | null;
}

/**
 * Whether a payment reduces what is owed. An issued cheque counts as paid even
 * while it is still pending; only a bounced cheque stops counting.
 */
export function paymentCounts(p: Pick<PaymentLike, 'method' | 'chequeStatus'>): boolean {
  return !(p.method === 'cheque' && p.chequeStatus === 'bounced');
}

export function sumCountedPayments(payments: PaymentLike[]): Decimal {
  return payments
    .filter(paymentCounts)
    .reduce((acc, p) => acc.plus(new Decimal(p.amount || '0')), new Decimal(0));
}

export interface InvoiceBalance {
  paid: string;
  /** Invoice amount less returned goods. */
  net: string;
  returned: string;
  balance: string;
  /** Money the supplier owes back: paid more than the net amount, minus refunds and credit already used. */
  credit: string;
  status: InvoiceStatus;
  overdue: boolean;
  /** Days past the due date (0 when not overdue). */
  daysOverdue: number;
}

function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Status of a supplier invoice from its amount and counted payments.
 * Overdue = still owing and the due date is before today (Colombo date, YYYY-MM-DD).
 */
export function computeInvoiceBalance(input: {
  amount: string;
  paid: string;
  dueDate: string | null;
  today: string;
  /** Total of goods returned to the supplier on this invoice. */
  returned?: string;
  /** Refunds received back from the supplier. */
  refunded?: string;
  /** Credit from this invoice already used to pay other invoices. */
  creditUsed?: string;
}): InvoiceBalance {
  const amount = new Decimal(input.amount || '0');
  const paid = new Decimal(input.paid || '0');
  const returned = new Decimal(input.returned || '0');
  const net = Decimal.max(amount.minus(returned), 0);
  const balance = Decimal.max(net.minus(paid), 0);
  const credit = Decimal.max(
    Decimal.max(paid.minus(net), 0).minus(input.refunded || '0').minus(input.creditUsed || '0'),
    0,
  );

  const status: InvoiceStatus = balance.isZero() ? 'paid' : paid.greaterThan(0) ? 'partial' : 'unpaid';
  const daysOverdue =
    status !== 'paid' && input.dueDate && input.dueDate < input.today
      ? dayDiff(input.dueDate, input.today)
      : 0;

  return {
    paid: paid.toFixed(2),
    net: net.toFixed(2),
    returned: returned.toFixed(2),
    credit: credit.toFixed(2),
    balance: balance.toFixed(2),
    status,
    overdue: daysOverdue > 0,
    daysOverdue,
  };
}

/** Adds `days` to a YYYY-MM-DD date and returns YYYY-MM-DD. */
export function addDays(ymd: string, days: number): string {
  const dt = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Refundable credit an invoice would have, unclamped. A negative number means the figures
 * would no longer add up (for example deleting a payment after its credit was refunded),
 * so the operation must be refused.
 */
export function rawCredit(input: {
  amount: string;
  paid: string;
  returned: string;
  refunded: string;
  creditUsed: string;
}): Decimal {
  const net = new Decimal(input.amount).minus(input.returned);
  return Decimal.max(new Decimal(input.paid).minus(net), 0)
    .minus(input.refunded)
    .minus(input.creditUsed);
}
