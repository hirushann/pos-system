import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CHEQUE_STATUS_LABELS,
  type ChequeStatus,
  type InvoiceStatus,
} from '@/src/lib/supplier-payables';

const TONES = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-700 dark:text-red-400',
  slate: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
};

export function InvoiceStatusBadge({
  status,
  overdue,
  daysOverdue = 0,
}: {
  status: InvoiceStatus;
  overdue: boolean;
  daysOverdue?: number;
}) {
  if (overdue) {
    return (
      <Badge className={cn('border-0', TONES.red)}>
        Overdue{daysOverdue > 0 ? ` ${daysOverdue}d` : ''}
      </Badge>
    );
  }
  if (status === 'paid') return <Badge className={cn('border-0', TONES.green)}>Paid</Badge>;
  if (status === 'partial') return <Badge className={cn('border-0', TONES.amber)}>Partially paid</Badge>;
  return <Badge className={cn('border-0', TONES.slate)}>Unpaid</Badge>;
}

export function ChequeStatusBadge({ status }: { status: ChequeStatus }) {
  const tone = status === 'cleared' ? TONES.green : status === 'bounced' ? TONES.red : TONES.blue;
  return <Badge className={cn('border-0', tone)}>{CHEQUE_STATUS_LABELS[status]}</Badge>;
}
