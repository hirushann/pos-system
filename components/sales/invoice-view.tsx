'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Type } from 'lucide-react';
import { formatAmount } from '@/src/lib/money';
import { formatColomboDate, formatColomboTime } from '@/src/lib/dates';
import type { SaleDetail } from '@/src/data/sales';
import type { ShopProfile } from '@/src/data/shop';
import { paginateItems } from '@/src/lib/invoice-pagination';

interface InvoiceViewProps {
  sale: SaleDetail;
  shop: ShopProfile;
  isReprint?: boolean;
}

/*
 * Invoice for an Epson LQ-310 (24-pin dot matrix) on 2-ply carbonless FAN-FOLD paper.
 *
 * Every form is EXACTLY 241.3mm x 139.7mm (9.5in x 5.5in): the print page is that size
 * with zero page margin (so the browser adds no header/footer text and no scaling), and
 * each form is a fixed-size box with its own inner padding that keeps clear of the
 * tractor-hole strips. A form holds up to 7 items; with 8 or more items the invoice
 * continues on the next form (headings repeated) and the totals + signatures are
 * printed on the last form, which keeps a roomy blank space for signing.
 *
 * Dot-matrix rules this layout follows:
 *   - pure black only: no grey text, shading or hairlines (they print faint or dotted)
 *   - bold text and heavy rules so the carbon copy underneath stays readable
 *   - print ONCE: the impact of the pins writes the second ply
 */
const FORM_WIDTH_MM = 241.3;
const FORM_HEIGHT_MM = 139.7;

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
    width: ${FORM_WIDTH_MM}mm;
    max-width: 100%;
    margin-bottom: 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .inv-hint {
    width: ${FORM_WIDTH_MM}mm;
    max-width: 100%;
    margin-bottom: 12px;
    font-size: 12px;
    color: #404040;
  }
  .inv-forms {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* One form = one sheet of 9.5in x 5.5in paper */
  .inv-form {
    box-sizing: border-box;
    position: relative;
    width: ${FORM_WIDTH_MM}mm;
    height: ${FORM_HEIGHT_MM}mm;
    padding: 5mm 14mm 6mm;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .inv-page {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    font-weight: 700;
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
    padding-bottom: 1.5mm;
    border-bottom: 2px solid #000;
  }
  .inv-brand {
    display: flex;
    align-items: center;
    gap: 3mm;
  }
  /* Black-and-white emblem: colour and tints do not print on a dot-matrix head */
  .inv-logo {
    display: block;
    height: 11mm;
    width: auto;
    flex-shrink: 0;
  }
  .inv-co h1 {
    margin: 0;
    font-size: 15pt;
    font-weight: 700;
    line-height: 1.15;
  }
  .inv-co p {
    margin: 0.5mm 0 0;
    font-size: 10.5pt;
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
  .inv-tag {
    display: inline-block;
    margin: 0.8mm 0 0 1.5mm;
    border: 2px solid #000;
    padding: 0 2mm;
    font-weight: 700;
    letter-spacing: 0.08em;
    font-size: 10pt;
  }

  /* One box: customer on the left, invoice details on the right */
  .inv-meta {
    display: flex;
    margin-top: 2mm;
    border: 2px solid #000;
  }
  .inv-meta-col {
    flex: 1;
    padding: 1.2mm 2.5mm;
  }
  .inv-meta-col + .inv-meta-col {
    border-left: 2px solid #000;
  }
  .inv-row {
    display: flex;
    gap: 2mm;
    min-height: 4.4mm;
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
    min-height: 0;
    margin-top: 2mm;
    border-bottom: 2px solid #000;
  }
  .inv-items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .inv-items th {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    padding: 1mm 1.5mm;
    font-size: 10.5pt;
    font-weight: 700;
    text-align: left;
  }
  .inv-items td {
    font-size: 11pt;
    padding: 0.6mm 1.5mm;
    vertical-align: top;
    word-break: break-word;
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
  .inv-continued {
    margin-top: 2mm;
    text-align: right;
    font-size: 10.5pt;
  }

  /* Payment (left) and totals (right) */
  .inv-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6mm;
    margin-top: 1.5mm;
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
    font-size: 10.5pt;
  }
  .inv-totals {
    width: 78mm;
    border: 2px solid #000;
  }
  .inv-totals-row {
    display: flex;
    justify-content: space-between;
    padding: 0.9mm 2.5mm;
  }
  .inv-totals-row.inv-grand {
    border-top: 2px solid #000;
    font-weight: 700;
    font-size: 12pt;
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
    margin-top: 9mm; /* blank space above the lines for the signatures */
  }
  .inv-sign div {
    flex: 1;
    border-top: 2px solid #000;
    padding-top: 1mm;
    text-align: center;
    font-size: 10.5pt;
  }

  @media print {
    /* The page IS the form: 241.3mm x 139.7mm, no margin, so no browser header/footer */
    @page {
      size: ${FORM_WIDTH_MM}mm ${FORM_HEIGHT_MM}mm;
      margin: 0;
    }
    html,
    body {
      width: ${FORM_WIDTH_MM}mm;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    .inv-screen {
      display: block;
      min-height: 0;
      padding: 0;
      background: #fff;
    }
    .inv-toolbar,
    .inv-hint {
      display: none !important;
    }
    .inv-forms {
      display: block;
    }
    .inv-form {
      box-shadow: none;
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .inv-form:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  }
`;

export function InvoiceView({ sale, shop, isReprint }: InvoiceViewProps) {
  const isVoided = sale.status === 'voided';
  const hasDiscount = Number(sale.discount) > 0;

  // The void banner takes about two item lines of space on every form
  const forms = React.useMemo(() => paginateItems(sale.items, isVoided ? 2 : 0), [sale.items, isVoided]);
  const formCount = forms.length;

  // Name the PDF / print job after the invoice number
  React.useEffect(() => {
    const previousTitle = document.title;
    document.title = `Invoice ${sale.receiptNumber}`;

    // Open the print dialog straight away, like the receipt page does
    const timer = setTimeout(async () => {
      try {
        // Wait for the logo to be decoded so it is in the printout
        await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
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

  // Item numbering carries on across forms
  const firstItemNumber = forms.map((_, index) =>
    forms.slice(0, index).reduce((count, form) => count + form.length, 1),
  );

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
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Link href={`/sales/${sale.id}/text-invoice`} target="_blank">
              <Type className="h-3.5 w-3.5" />
              <span>Plain-text invoice</span>
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
      </div>
      <p className="inv-hint">
        Paper: 9.5 &times; 5.5 in ({FORM_WIDTH_MM} &times; {FORM_HEIGHT_MM} mm) fan-fold &middot; In
        the print dialog choose that paper size (on a Mac: Paper Size &rarr; Manage Custom Sizes if it
        is missing), Scale 100%, printer quality highest (not Draft). No headers or footers will
        print. Print once &mdash; the 2-ply paper makes the copy.
      </p>

      <div className="inv-forms">
        {forms.map((formItems, formIndex) => {
          const isLast = formIndex === formCount - 1;
          return (
            <div className="inv-form" key={formIndex}>
              <div className="inv-page">
                {isVoided && (
                  <div className="inv-void">*** VOID &mdash; THIS INVOICE HAS BEEN CANCELLED ***</div>
                )}

                {/* Company header */}
                <header className="inv-head">
                  <div className="inv-brand">
                    {/* Plain <img> on purpose: it must be loaded before the page prints */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="inv-logo" src="/logo-invoice.png" alt="" />
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
                  </div>
                  <div className="inv-title">
                    <div className="inv-title-text">INVOICE</div>
                    {formCount > 1 && (
                      <span className="inv-tag">
                        PAGE {formIndex + 1} / {formCount}
                      </span>
                    )}
                    {!isVoided && isReprint && <span className="inv-tag">REPRINT</span>}
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
                      <span className="inv-row-value">
                        {sale.vehicleNo ? sale.vehicleNo.toUpperCase() : ''}
                      </span>
                    </div>
                  </div>

                  <div className="inv-meta-col">
                    <div className="inv-row">
                      <span className="inv-row-label">Invoice No</span>
                      <span className="inv-row-value">{sale.receiptNumber}</span>
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
                      <col style={{ width: '4%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '50%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '13%' }} />
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
                      {formItems.map((item, itemIndex) => (
                        <tr key={item.id}>
                          <td>{firstItemNumber[formIndex] + itemIndex}</td>
                          <td>{item.partNumber}</td>
                          <td>{item.productName}</td>
                          <td className="inv-center">{item.quantity}</td>
                          <td className="inv-num">{formatAmount(item.unitPrice)}</td>
                          <td className="inv-num">{formatAmount(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isLast ? (
                  <>
                    {/* Payment + totals */}
                    <section className="inv-bottom">
                      <div className="inv-pay">
                        <p>
                          Payment: {sale.paymentMethod.toUpperCase()}
                          {sale.paymentMethod === 'Cheque' && sale.chequeNumber && ` No. ${sale.chequeNumber}`}
                          {sale.paymentMethod === 'Cheque' && sale.chequeBank && ` (${sale.chequeBank})`}
                        </p>
                        {sale.amountTendered !== null && (
                          <p>
                            Cash Given: Rs. {formatAmount(sale.amountTendered)}
                            {sale.changeGiven !== null && (
                              <>
                                {'   '}
                                Balance: Rs. {formatAmount(sale.changeGiven)}
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
                  </>
                ) : (
                  <div className="inv-continued">(continued on next form)</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
