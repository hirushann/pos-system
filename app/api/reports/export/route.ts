import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/src/lib/auth-guards';
import {
  getDailySalesReport,
  getStockValuationReport,
  getDeadStockReport,
} from '@/src/data/reports';
import { getColomboDateString } from '@/src/lib/dates';
import Decimal from 'decimal.js';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export async function GET(request: NextRequest) {
  // 1. Enforce Owner role
  const ctx = await getSessionContext();
  if (!ctx || ctx.user.role !== 'owner' || ctx.user.banned) {
    return new NextResponse('Unauthorized: Store owner access required', { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const reportType = searchParams.get('type') || 'daily-sales';
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const todayStr = getColomboDateString(new Date());

  let csvContent = '\uFEFF'; // UTF-8 BOM for Microsoft Excel compatibility
  let filename = `report_${todayStr}.csv`;

  if (reportType === 'daily-sales') {
    filename = `daily_sales_${startDate || todayStr}_to_${endDate || todayStr}.csv`;
    const rows = await getDailySalesReport(startDate, endDate);

    // Header
    const headers = [
      'Date (Asia/Colombo)',
      'Sales Count',
      'Revenue (LKR)',
      'Discount (LKR)',
      'Gross Profit (LKR)',
      'Cash Tendered (LKR)',
      'Card Payments (LKR)',
    ];
    const lines = [formatRow(headers)];

    let totalCount = 0;
    let totalRevenue = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let totalProfit = new Decimal(0);
    let totalCash = new Decimal(0);
    let totalCard = new Decimal(0);

    for (const r of rows) {
      lines.push(
        formatRow([
          r.saleDate,
          r.salesCount,
          r.revenue,
          r.discount,
          r.profit,
          r.cash,
          r.card,
        ]),
      );

      totalCount += r.salesCount;
      totalRevenue = totalRevenue.plus(new Decimal(r.revenue || 0));
      totalDiscount = totalDiscount.plus(new Decimal(r.discount || 0));
      totalProfit = totalProfit.plus(new Decimal(r.profit || 0));
      totalCash = totalCash.plus(new Decimal(r.cash || 0));
      totalCard = totalCard.plus(new Decimal(r.card || 0));
    }

    // Add total row
    lines.push(
      formatRow([
        'Total',
        totalCount,
        totalRevenue.toFixed(2),
        totalDiscount.toFixed(2),
        totalProfit.toFixed(2),
        totalCash.toFixed(2),
        totalCard.toFixed(2),
      ]),
    );

    csvContent += lines.join('\r\n');
  } else if (reportType === 'stock-valuation') {
    filename = `stock_valuation_${todayStr}.csv`;
    const report = await getStockValuationReport();

    const headers = [
      'Category',
      'Active Parts Count',
      'Total Stock Units',
      'Stock Valuation (LKR)',
    ];
    const lines = [formatRow(headers)];

    for (const cat of report.categories) {
      lines.push(
        formatRow([
          cat.categoryName,
          cat.itemsCount,
          cat.totalUnits,
          cat.valuation,
        ]),
      );
    }

    // Summary row
    lines.push(
      formatRow([
        'Total Store Valuation',
        report.totalItemsCount,
        report.totalUnits,
        report.totalValuation,
      ]),
    );

    csvContent += lines.join('\r\n');
  } else if (reportType === 'dead-stock') {
    filename = `dead_stock_90_days_${todayStr}.csv`;
    const items = await getDeadStockReport();

    const headers = [
      'Part Number',
      'SKU',
      'Product Name',
      'Category',
      'Brand',
      'Stock Quantity',
      'Unit Cost Price (LKR)',
      'Selling Price (LKR)',
      'Tied-up Capital (LKR)',
      'Last Sold Date (Asia/Colombo)',
    ];
    const lines = [formatRow(headers)];

    let totalTiedUp = new Decimal(0);
    let totalUnits = 0;

    for (const item of items) {
      lines.push(
        formatRow([
          item.partNumber,
          item.sku,
          item.name,
          item.categoryName,
          item.brandName || 'N/A',
          item.stockQty,
          item.costPrice,
          item.sellingPrice,
          item.tiedUpCapital,
          item.lastSoldAt || 'No non-voided sales recorded',
        ]),
      );

      totalUnits += item.stockQty;
      totalTiedUp = totalTiedUp.plus(new Decimal(item.tiedUpCapital || 0));
    }

    // Summary row
    lines.push(
      formatRow([
        'Total Dead Stock',
        '',
        `${items.length} Products`,
        '',
        '',
        totalUnits,
        '',
        '',
        totalTiedUp.toFixed(2),
        '',
      ]),
    );

    csvContent += lines.join('\r\n');
  } else {
    return new NextResponse('Invalid report type', { status: 400 });
  }

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
