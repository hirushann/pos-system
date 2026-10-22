import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import {
  getInvoiceRows,
  getPayments,
  getPriceList,
  getReturns,
  getSupplier,
  getSupplierProducts,
} from '@/src/data/suppliers';
import { formatLKR } from '@/src/lib/money';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SupplierActions } from '@/components/suppliers/supplier-actions';
import { InvoicesTable } from '@/components/suppliers/invoices-table';
import { PaymentsTable } from '@/components/suppliers/payments-table';
import { PriceList } from '@/components/suppliers/price-list';
import { ReturnsList } from '@/components/suppliers/returns-list';
import { SupplierProductsTable } from '@/components/suppliers/supplier-products-table';
import Decimal from 'decimal.js';

export const metadata: Metadata = { title: 'Supplier | Jayaweera Logistic & Motors' };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const [invoices, payments, prices, returns, supplierProducts] = await Promise.all([
    getInvoiceRows({ supplierId: id }),
    getPayments({ supplierId: id }),
    getPriceList(id),
    getReturns({ supplierId: id }),
    getSupplierProducts(id),
  ]);

  const sum = (pick: (i: (typeof invoices)[number]) => string, only: (i: (typeof invoices)[number]) => boolean = () => true) =>
    invoices.filter(only).reduce((acc, i) => acc.plus(pick(i)), new Decimal(0)).toFixed(2);
  const stats = [
    { label: 'Total invoiced', value: formatLKR(sum((i) => i.amount)) },
    { label: 'Total paid', value: formatLKR(sum((i) => i.paid)) },
    { label: 'Still owed', value: formatLKR(sum((i) => i.balance)), strong: true },
    { label: 'Overdue', value: formatLKR(sum((i) => i.balance, (i) => i.overdue)), danger: invoices.some((i) => i.overdue) },
    ...(Number(sum((i) => i.credit)) > 0
      ? [{ label: 'Supplier owes you', value: formatLKR(sum((i) => i.credit)), credit: true }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Link href="/suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All suppliers
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{supplier.name}</h1>
            {!supplier.active && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {supplier.contactPerson && (
              <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{supplier.contactPerson}</span>
            )}
            {supplier.phone && (
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{supplier.phone}</span>
            )}
            {supplier.email && (
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{supplier.email}</span>
            )}
            {supplier.address && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{supplier.address}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Credit period: {supplier.paymentTermsDays > 0 ? `${supplier.paymentTermsDays} days` : 'pay on delivery'}
          </p>
          {supplier.notes && <p className="max-w-2xl text-sm">{supplier.notes}</p>}
        </div>
        <SupplierActions supplier={supplier} invoices={invoices} />
      </div>

      <div className={`grid gap-3 sm:grid-cols-2 ${stats.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {stats.map((s) => (
          <Card key={s.label} className="shadow-xs">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold ${s.danger ? 'text-red-600' : ''} ${s.strong ? 'text-primary' : ''} ${'credit' in s && s.credit ? 'text-emerald-600' : ''}`}>
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="products">Products ({supplierProducts.length})</TabsTrigger>
          <TabsTrigger value="returns">Returns ({returns.length})</TabsTrigger>
          <TabsTrigger value="prices">Price list ({prices.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTable invoices={invoices} showSupplier={false} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTable payments={payments} showSupplier={false} />
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <SupplierProductsTable products={supplierProducts} />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <ReturnsList returns={returns} />
        </TabsContent>
        <TabsContent value="prices" className="mt-4">
          <PriceList supplierId={id} items={prices} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
