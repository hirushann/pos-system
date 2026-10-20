import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  FileClock,
  PackagePlus,
  Receipt,
  Receipt as ReceiptIcon,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';
import { requireOwner } from '@/src/lib/auth-guards';
import { getColomboDateString, formatColomboDate, formatColomboTime } from '@/src/lib/dates';
import {
  getDashboardSummaryMetrics,
  getLast30DaysRevenue,
  getStockValuationReport,
  getTopParts,
} from '@/src/data/reports';
import { getLowStockProducts } from '@/src/data/inventory';
import { getPaginatedSales } from '@/src/data/sales';
import { getPayablesSummary } from '@/src/data/suppliers';
import { formatAmount, formatLKR } from '@/src/lib/money';
import { addDays } from '@/src/lib/supplier-payables';
import { OverviewCards } from '@/components/reports/overview-cards';
import { RevenueChart } from '@/components/reports/revenue-chart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard | Jayaweera Logistic & Motors' };

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Colombo' }).format(new Date()),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function SectionCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">{text}</p>
);

export default async function DashboardPage() {
  const { user } = await requireOwner();

  const today = getColomboDateString(new Date());
  const from30 = addDays(today, -29);

  const [metrics, revenue, topParts, lowStock, recentSales, payables, stock] = await Promise.all([
    getDashboardSummaryMetrics(),
    getLast30DaysRevenue(),
    getTopParts(from30, today),
    getLowStockProducts(),
    getPaginatedSales({ pageSize: 6 }, user),
    getPayablesSummary(),
    getStockValuationReport(),
  ]);

  const firstName = (user.name || '').split(' ')[0] || 'there';
  const payableRows = [
    { label: 'Total to pay', value: payables.outstanding, sub: `${payables.openInvoices} open invoices`, icon: FileClock, tone: 'text-blue-600 bg-blue-500/10' },
    { label: 'Overdue', value: payables.overdueAmount, sub: `${payables.overdueInvoices} past due`, icon: AlertTriangle, tone: payables.overdueInvoices > 0 ? 'text-red-600 bg-red-500/10' : 'text-muted-foreground bg-muted' },
    { label: 'Due in 7 days', value: payables.dueSoonAmount, sub: `${payables.dueSoonInvoices} invoices`, icon: CalendarClock, tone: 'text-amber-600 bg-amber-500/10' },
    { label: 'Cheques pending', value: payables.pendingChequesAmount, sub: `${payables.pendingChequesCount} not cleared`, icon: Receipt, tone: 'text-violet-600 bg-violet-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting + quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatColomboDate(new Date())} · Here is how the shop is doing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="gap-1.5">
            <Link href="/checkout"><ShoppingCart className="h-4 w-4" /> New sale</Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/products"><PackagePlus className="h-4 w-4" /> Products</Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/suppliers/invoices"><Truck className="h-4 w-4" /> Supplier invoices</Link>
          </Button>
        </div>
      </div>

      {/* Today vs same weekday last week */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Today at a glance</h2>
        <OverviewCards metrics={metrics} />
      </section>

      {/* Revenue trend + money owed */}
      <section className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart data={revenue} />
        </div>
        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Owed to suppliers</CardTitle>
            <Link href="/suppliers" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {payableRows.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.label} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', r.tone)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="text-xs text-muted-foreground/80">{r.sub}</p>
                  </div>
                  <p className="font-mono text-sm font-bold">{formatLKR(r.value)}</p>
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Paid this month
              </span>
              <span className="font-mono font-semibold">{formatLKR(payables.paidThisMonth)}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Stock value strip */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Stock value (at cost)', value: formatLKR(stock.totalValuation), icon: Boxes },
          { label: 'Parts in stock', value: `${stock.totalItemsCount} items · ${stock.totalUnits} units`, icon: Boxes },
          { label: 'Need reordering', value: `${lowStock.length} part${lowStock.length === 1 ? '' : 's'}`, icon: AlertTriangle },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="shadow-xs">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Lists */}
      <section className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Low stock" href="/inventory" linkLabel="Inventory">
          {lowStock.length === 0 ? (
            <Empty text="Everything is above its reorder level." />
          ) : (
            <ul className="divide-y">
              {lowStock.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{p.partNumber}</p>
                  </div>
                  <Badge
                    className={cn(
                      'border-0',
                      p.stockQty === 0
                        ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {p.stockQty === 0 ? 'Out of stock' : `${p.stockQty} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Top parts, last 30 days" href="/reports" linkLabel="Reports">
          {topParts.byRevenue.length === 0 ? (
            <Empty text="No sales in the last 30 days." />
          ) : (
            <ol className="divide-y">
              {topParts.byRevenue.slice(0, 6).map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.productName}</p>
                    <p className="text-xs text-muted-foreground">{p.totalQuantity} sold</p>
                  </div>
                  <span className="font-mono text-xs font-semibold">Rs. {formatAmount(p.totalRevenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard title="Recent sales" href="/sales" linkLabel="All sales">
          {recentSales.items.length === 0 ? (
            <Empty text="No sales yet." />
          ) : (
            <ul className="divide-y">
              {recentSales.items.map((s) => (
                <li key={s.id}>
                  <Link href={`/sales/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                        <ReceiptIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.receiptNumber}
                        {s.status === 'voided' && (
                          <Badge variant="destructive" className="ml-1">Void</Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatColomboDate(s.createdAt)} {formatColomboTime(s.createdAt)} · {s.cashierName}
                      </p>
                    </div>
                    <span className={cn('font-mono text-xs font-semibold', s.status === 'voided' && 'line-through text-muted-foreground')}>
                      Rs. {formatAmount(s.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </div>
  );
}
