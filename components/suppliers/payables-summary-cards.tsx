import { AlertTriangle, CalendarClock, CheckCircle2, FileClock, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatLKR } from '@/src/lib/money';
import { cn } from '@/lib/utils';
import type { PayablesSummary } from '@/src/data/suppliers';

export function PayablesSummaryCards({ summary }: { summary: PayablesSummary }) {
  const cards = [
    {
      label: 'Total to pay',
      value: formatLKR(summary.outstanding),
      sub: `${summary.openInvoices} open invoice${summary.openInvoices === 1 ? '' : 's'}`,
      icon: FileClock,
      tone: 'text-blue-600 bg-blue-500/10',
    },
    {
      label: 'Overdue',
      value: formatLKR(summary.overdueAmount),
      sub: `${summary.overdueInvoices} invoice${summary.overdueInvoices === 1 ? '' : 's'} past due`,
      icon: AlertTriangle,
      tone: summary.overdueInvoices > 0 ? 'text-red-600 bg-red-500/10' : 'text-muted-foreground bg-muted',
    },
    {
      label: 'Due in 7 days',
      value: formatLKR(summary.dueSoonAmount),
      sub: `${summary.dueSoonInvoices} invoice${summary.dueSoonInvoices === 1 ? '' : 's'}`,
      icon: CalendarClock,
      tone: 'text-amber-600 bg-amber-500/10',
    },
    {
      label: 'Paid this month',
      value: formatLKR(summary.paidThisMonth),
      sub: 'Bounced cheques excluded',
      icon: CheckCircle2,
      tone: 'text-emerald-600 bg-emerald-500/10',
    },
    {
      label: 'Cheques pending',
      value: formatLKR(summary.pendingChequesAmount),
      sub: `${summary.pendingChequesCount} not yet cleared`,
      icon: Receipt,
      tone: 'text-violet-600 bg-violet-500/10',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="shadow-xs">
            <CardContent className="flex items-start gap-3 p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', c.tone)}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="truncate text-lg font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.sub}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
