'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { formatAmount } from '@/src/lib/money';
import { formatColomboDate, formatColomboTime } from '@/src/lib/dates';
import type { SaleDetail } from '@/src/data/sales';
import type { ShopProfile } from '@/src/data/shop';

interface InvoiceViewProps {
  sale: SaleDetail;
  shop: ShopProfile;
  isReprint?: boolean;
}

/*
 * Invoice for an Epson LQ-310 (24-pin dot matrix) on 2-ply carbonless FAN-FOLD paper,
 * 9.5in x 5.5in per form (241.3 x 139.7 mm). One invoice = one form for up to ~8 items;
 * longer invoices continue on the next form with the column headings repeated.
 * The left/right margins keep clear of the tractor-hole strips.
 *
 * Dot-matrix rules this layout follows:
 *   - pure black only: no grey text, shading or hairlines (they print faint or dotted)
 *   - heavy rules and 10pt+ text so the carbon copy underneath stays readable
 *   - print ONCE: the impact of the pins writes the second ply
 */
const invoiceCss = `
  .inv-screen {
    min-height: 100vh;
    background: #e5e5e5;
    padding: 16px 12px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .inv-toolbar {
    width: 241.3mm;
    max-width: 100%;
    margin-bottom: 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .inv-hint {
    width: 241.3mm;
    max-width: 100%;
    margin-bottom: 12px;
    font-size: 12px;
    color: #404040;
  }

  /* One 9.5in x 5.5in form as seen on screen; the padding mirrors the print margins */
  .inv-sheet {
    box-sizing: border-box;
    width: 241.3mm;
    min-height: 139.7mm;
    padding: 6mm 14mm;
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .inv-page {
    box-sizing: border-box;
    width: 100%;
    min-height: 124mm;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.25;
    display: flex;
    flex-direction: column;
  }
  .inv-page * {
    box-sizing: border-box;
    color: #000;
  }

  .inv-void {
    border: 2px solid #000;
    text-align: center;
    font-weight: 700;
    font-size: 11pt;
    letter-spacing: 0.12em;
    padding: 0.8mm;
    margin-bottom: 2mm;
  }

  /* Header: company on the left, INVOICE on the right */
  .inv-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 6mm;
    padding-bottom: 2mm;
    border-bottom: 2px solid #000;
  }
  .inv-co h1 {
    margin: 0;
    font-size: 15pt;
    font-weight: 700;
    line-height: 1.15;
  }
  .inv-co p {
    margin: 0.5mm 0 0;
    font-size: 10pt;
  }
  .inv-title {
    text-align: right;
    white-space: nowrap;
  }
  .inv-title-text {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1.05;
  }
  .inv-reprint {
    display: inline-block;
    margin-top: 0.8mm;
    border: 1.5px solid #000;
    padding: 0 2mm;
    font-weight: 700;
    letter-spacing: 0.08em;
    font-size: 9pt;
  }

  /* One box: customer on the left, invoice details on the right */
  .inv-meta {
    display: flex;
    margin-top: 2.5mm;
    border: 1.5px solid #000;
  }
  .inv-meta-col {
    flex: 1;
    padding: 1.2mm 2.5mm;
  }
  .inv-meta-col + .inv-meta-col {
    border-left: 1.5px solid #000;
  }
  .inv-row {
    display: flex;
    gap: 2mm;
    min-height: 4.6mm;
  }
  .inv-row-label {
    flex: 0 0 22mm;
    font-weight: 700;
  }
  .inv-row-value {
    flex: 1;
    word-break: break-word;
  }

  /* Items */
  .inv-items-wrap {
    flex: 1;
    margin-top: 2.5mm;
    border-bottom: 2px solid #000;
  }
  .inv-items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .inv-items thead {
    display: table-header-group;
  }
  .inv-items th {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    padding: 1mm 1.5mm;
    font-size: 9.5pt;
    font-weight: 700;
    text-align: left;
  }
  .inv-items td {
    padding: 0.6mm 1.5mm;
    vertical-align: top;
    word-break: break-word;
  }
  .inv-items tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .inv-items tbody tr:last-child td {
    padding-bottom: 1.5mm;
  }
  .inv-num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .inv-center {
    text-align: center;
  }

  /* Payment (left) and totals (right) */
  .inv-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6mm;
    margin-top: 2mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .inv-pay {
    flex: 1;
    padding-top: 0.5mm;
  }
  .inv-pay p {
    margin: 0 0 0.8mm;
  }
  .inv-footer {
    margin-top: 1mm;
    font-size: 9.5pt;
  }
  .inv-totals {
    width: 78mm;
    border: 1.5px solid #000;
  }
  .inv-totals-row {
    display: flex;
    justify-content: space-between;
    padding: 0.9mm 2.5mm;
  }
  .inv-totals-row.inv-grand {
    border-top: 2px solid #000;
    font-weight: 700;
    font-size: 11.5pt;
    padding: 1.3mm 2.5mm;
  }
  .inv-totals-row span:last-child {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .inv-sign {
    display: flex;
    justify-content: space-between;
    gap: 18mm;
    margin-top: 4mm;
    padding-bottom: 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .inv-sign div {
    flex: 1;
    border-top: 1.5px solid #000;
    padding-top: 1mm;
    text-align: center;
    font-size: 9.5pt;
  }

  @media print {
    @page {
      size: 9.5in 5.5in;
      margin: 6mm 14mm;
    }
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    .inv-screen {
      background: #fff;
      padding: 0;
      min-height: 0;
      display: block;
    }
    .inv-toolbar,
    .inv-hint {
      display: none !important;
    }
    .inv-sheet {
      width: auto;
      min-height: 0;
      padding: 0;
      box-shadow: none;
    }
  }
`;

export function InvoiceView({ sale, shop, isReprint }: InvoiceViewProps) {
  const isVoided = sale.status === 'voided';
  const hasDiscount = Number(sale.discount) > 0;

  // Name the PDF / print job after the invoice number
  React.useEffect(() => {
    const previousTitle = document.title;
    document.title = `Invoice ${sale.receiptNumber}`;

    // Open the print dialog straight away, like the receipt page does
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch {
        // User may have cancelled or the browser blocked it
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      document.title = previousTitle;
    };
  }, [sale.receiptNumber]);

  return (
    <div className="inv-screen">
      <style>{invoiceCss}</style>

      <div className="inv-toolbar">
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
          <span>Print Invoice</span>
        </Button>
      </div>
      <p className="inv-hint">
        Printer: Epson LQ-310 &middot; Paper: 9.5 &times; 5.5 in fan-fold (custom size) &middot;
        Scale: 100% &middot; Turn off &ldquo;Headers and footers&rdquo;. Print once &mdash; the 2-ply
        paper makes the copy.
      </p>

      <div className="inv-sheet">
        <div className="inv-page">
          {isVoided && (
            <div className="inv-void">*** VOID &mdash; THIS INVOICE HAS BEEN CANCELLED ***</div>
          )}

          {/* Company header */}
          <header className="inv-head">
            <div className="inv-co">
              <h1>{shop.shopName}</h1>
              {(shop.address || shop.phone) && (
                <p>
                  {shop.address}
                  {shop.address && shop.phone ? ' · ' : ''}
                  {shop.phone ? `Tel: ${shop.phone}` : ''}
                </p>
              )}
            </div>
            <div className="inv-title">
              <div className="inv-title-text">INVOICE</div>
              {!isVoided && isReprint && <div className="inv-reprint">REPRINT</div>}
            </div>
          </header>

          {/* Customer + invoice details */}
          <section className="inv-meta">
            <div className="inv-meta-col">
              <div className="inv-row">
                <span className="inv-row-label">Customer</span>
                <span className="inv-row-value">{sale.customerName || 'Walk-in Customer'}</span>
              </div>
              <div className="inv-row">
                <span className="inv-row-label">Phone</span>
                <span className="inv-row-value">{sale.customerPhone || ''}</span>
              </div>
              <div className="inv-row">
                <span className="inv-row-label">Vehicle No</span>
                <span className="inv-row-value" style={{ fontWeight: 700 }}>
                  {sale.vehicleNo ? sale.vehicleNo.toUpperCase() : ''}
                </span>
              </div>
            </div>

            <div className="inv-meta-col">
              <div className="inv-row">
                <span className="inv-row-label">Invoice No</span>
                <span className="inv-row-value" style={{ fontWeight: 700 }}>
                  {sale.receiptNumber}
                </span>
              </div>
              <div className="inv-row">
                <span className="inv-row-label">Date / Time</span>
                <span className="inv-row-value">
                  {formatColomboDate(sale.createdAt)}, {formatColomboTime(sale.createdAt)}
                </span>
              </div>
              <div className="inv-row">
                <span className="inv-row-label">Cashier</span>
                <span className="inv-row-value">{sale.cashierName}</span>
              </div>
            </div>
          </section>

          {/* Line items */}
          <div className="inv-items-wrap">
            <table className="inv-items">
              <colgroup>
                <col style={{ width: '4.5%' }} />
                <col style={{ width: '16.5%' }} />
                <col style={{ width: '44%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '14.5%' }} />
                <col style={{ width: '14.5%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Part No</th>
                  <th>Description</th>
                  <th className="inv-center">Qty</th>
                  <th className="inv-num">Price (Rs.)</th>
                  <th className="inv-num">Amount (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{item.partNumber}</td>
                    <td>{item.productName}</td>
                    <td className="inv-center">{item.quantity}</td>
                    <td className="inv-num">{formatAmount(item.unitPrice)}</td>
                    <td className="inv-num">{formatAmount(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payment + totals */}
          <section className="inv-bottom">
            <div className="inv-pay">
              <p>
                <strong>Payment:</strong> {sale.paymentMethod.toUpperCase()}
              </p>
              {sale.amountTendered !== null && (
                <p>
                  <strong>Cash Given:</strong> Rs. {formatAmount(sale.amountTendered)}
                  {sale.changeGiven !== null && (
                    <>
                      {'   '}
                      <strong>Balance:</strong> Rs. {formatAmount(sale.changeGiven)}
                    </>
                  )}
                </p>
              )}
              {shop.receiptFooter && <p className="inv-footer">{shop.receiptFooter}</p>}
            </div>

            <div className="inv-totals">
              <div className="inv-totals-row">
                <span>Sub Total</span>
                <span>{formatAmount(sale.subtotal)}</span>
              </div>
              {hasDiscount && (
                <div className="inv-totals-row">
                  <span>Discount</span>
                  <span>-{formatAmount(sale.discount)}</span>
                </div>
              )}
              <div className="inv-totals-row inv-grand">
                <span>TOTAL (Rs.)</span>
                <span>{formatAmount(sale.total)}</span>
              </div>
            </div>
          </section>

          {/* Signatures */}
          <section className="inv-sign">
            <div>Customer Signature</div>
            <div>Authorized Signature</div>
          </section>
        </div>
      </div>
    </div>
  );
}
