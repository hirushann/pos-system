'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { formatLKR } from '@/src/lib/money';
import { formatColomboTimestamp } from '@/src/lib/dates';
import type { ReceiptData } from '@/src/actions/sales';

interface ReceiptViewProps {
  data: ReceiptData;
  isReprint?: boolean;
}

export function ReceiptView({ data, isReprint }: ReceiptViewProps) {
  const { sale, items, shop, cashierName } = data;

  const paymentMethodName = sale.paymentMethod.toUpperCase();
  const isVoided = sale.status === 'voided';

  // Automatically trigger print on mount
  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch {
        // User may have cancelled or browser blocked
      }
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-muted/40 py-6 px-3 flex flex-col items-center">
      {/* Screen action toolbar - hidden during printing */}
      <div className="mb-6 flex items-center justify-between gap-3 w-full max-w-[80mm] print:hidden">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <Link href="/checkout">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to POS</span>
          </Link>
        </Button>

        <Button
          onClick={() => window.print()}
          size="sm"
          className="gap-1.5 text-xs font-semibold shadow-xs"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Print Receipt</span>
        </Button>
      </div>

      {/* 80mm Thermal Receipt Container */}
      <div
        className="w-full max-w-[80mm] bg-white text-black p-4 text-xs font-mono shadow-md border rounded-sm print:m-0 print:p-0 print:border-none print:shadow-none print:w-[80mm] print:max-w-[80mm]"
        style={{
          fontFeatureSettings: '"tnum"',
        }}
      >
        {/* VOIDED or REPRINT Header Banners */}
        {isVoided && (
          <div className="border-2 border-black p-1 text-center font-black text-sm uppercase tracking-widest mb-2 bg-neutral-100">
            *** VOIDED ***
          </div>
        )}

        {!isVoided && isReprint && (
          <div className="border border-dashed border-black p-1 text-center font-bold text-xs uppercase tracking-wider mb-2">
            ** REPRINT **
          </div>
        )}

        {/* Shop Header */}
        <div className="text-center space-y-0.5 pb-2">
          <h1 className="text-sm font-black uppercase tracking-tight leading-snug">
            {shop.shopName}
          </h1>
          {shop.address && (
            <p className="text-[11px] leading-tight text-neutral-800">
              {shop.address}
            </p>
          )}
          {shop.phone && (
            <p className="text-[11px] leading-tight text-neutral-800">
              Tel: {shop.phone}
            </p>
          )}
        </div>

        <div className="border-b border-dashed border-neutral-400 my-2" />

        {/* Receipt Meta */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-neutral-600">Receipt No:</span>
            <span className="font-bold">{sale.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">Date/Time:</span>
            <span>{formatColomboTimestamp(sale.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">Cashier:</span>
            <span className="font-semibold">{cashierName}</span>
          </div>
          {sale.customerName && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Customer:</span>
              <span>{sale.customerName}</span>
            </div>
          )}
          {sale.vehicleNo && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Vehicle No:</span>
              <span className="font-bold uppercase">{sale.vehicleNo}</span>
            </div>
          )}
        </div>

        <div className="border-b border-dashed border-neutral-400 my-2" />

        {/* Column Headers */}
        <div className="flex justify-between text-[10px] font-bold text-neutral-700 pb-1">
          <span className="w-1/2">ITEM / PART NO</span>
          <span className="w-1/4 text-center">QTY x PRICE</span>
          <span className="w-1/4 text-right">TOTAL</span>
        </div>

        <div className="border-b border-neutral-300 my-1" />

        {/* Item Lines */}
        <div className="space-y-2 py-1">
          {items.map((item) => (
            <div key={item.id} className="text-[11px] leading-tight">
              <div className="font-semibold text-neutral-900">
                {item.productName}
              </div>
              <div className="flex justify-between text-neutral-700 text-[10px] pt-0.5">
                <span className="w-1/2 truncate font-bold text-neutral-800">
                  {item.partNumber}
                </span>
                <span className="w-1/4 text-center tabular-nums">
                  {item.quantity} x {formatLKR(item.unitPrice).replace('Rs. ', '')}
                </span>
                <span className="w-1/4 text-right font-bold text-neutral-900 tabular-nums">
                  {formatLKR(item.lineTotal).replace('Rs. ', '')}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-b border-dashed border-neutral-400 my-2" />

        {/* Financial Totals */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between text-neutral-700">
            <span>Subtotal:</span>
            <span className="font-semibold tabular-nums">{formatLKR(sale.subtotal)}</span>
          </div>

          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-neutral-700">
              <span>Discount:</span>
              <span className="font-semibold tabular-nums">-{formatLKR(sale.discount)}</span>
            </div>
          )}

          <div className="border-t border-neutral-800 pt-1 flex justify-between text-sm font-black text-black">
            <span>TOTAL:</span>
            <span className="tabular-nums">{formatLKR(sale.total)}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-neutral-400 my-2" />

        {/* Payment Details */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-neutral-600">Payment Method:</span>
            <span className="font-bold">{paymentMethodName}</span>
          </div>

          {sale.paymentMethod === 'cheque' && sale.chequeNumber && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Cheque No:</span>
              <span className="tabular-nums font-semibold">{sale.chequeNumber}</span>
            </div>
          )}

          {sale.amountTendered && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Cash Tendered:</span>
              <span className="tabular-nums font-semibold">{formatLKR(sale.amountTendered)}</span>
            </div>
          )}

          {sale.changeGiven && (
            <div className="flex justify-between font-bold text-neutral-900">
              <span>Change Due:</span>
              <span className="tabular-nums">{formatLKR(sale.changeGiven)}</span>
            </div>
          )}
        </div>

        <div className="border-b border-dashed border-neutral-400 my-3" />

        {/* Footer Notice */}
        <div className="text-center space-y-1 text-[10px] text-neutral-600">
          {shop.receiptFooter && (
            <p className="leading-snug">{shop.receiptFooter}</p>
          )}
          <p className="text-[9px] uppercase tracking-widest text-neutral-500 pt-1">
            * {sale.receiptNumber} *
          </p>
        </div>
      </div>
    </div>
  );
}
