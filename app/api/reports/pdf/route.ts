import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSessionContext } from '@/src/lib/auth-guards';
import { getShopProfile } from '@/src/data/shop';
import { getColomboDateString } from '@/src/lib/dates';
import {
  getDashboardSummaryMetrics,
  getLast30DaysRevenue,
  getTopParts,
  getLowStockCount,
  getSalesByCashier,
  getDailySalesReport,
  getStockValuationReport,
  getDeadStockReport,
} from '@/src/data/reports';
import { ReportPdf } from '@/src/lib/report-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!YMD.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx || ctx.user.role !== 'owner' || ctx.user.banned) {
    return new NextResponse('Unauthorized: Store owner access required', { status: 403 });
  }

  const todayStr = getColomboDateString(new Date());
  let startDate = request.nextUrl.searchParams.get('startDate');
  let endDate = request.nextUrl.searchParams.get('endDate');

  if (!startDate || !endDate) {
    // Same default as the reports page: the last 30 days
    const [y, m, d] = todayStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 29);
    startDate = dt.toISOString().slice(0, 10);
    endDate = todayStr;
  }

  if (!isRealDate(startDate) || !isRealDate(endDate) || startDate > endDate) {
    return new NextResponse('Invalid date range', { status: 400 });
  }

  const [shop, summary, revenue, topParts, lowStockCount, cashiers, dailySales, stockValuation, deadStock] =
    await Promise.all([
      getShopProfile(),
      getDashboardSummaryMetrics(),
      getLast30DaysRevenue(),
      getTopParts(startDate, endDate),
      getLowStockCount(),
      getSalesByCashier(startDate, endDate),
      getDailySalesReport(startDate, endDate),
      getStockValuationReport(),
      getDeadStockReport(),
    ]);

  const buffer = await renderToBuffer(
    ReportPdf({
      data: {
        shop,
        logo: path.join(process.cwd(), 'public', 'logo-invoice.png'),
        generatedAt: new Date(),
        startDate,
        endDate,
        lowStockCount,
        summary,
        revenue,
        topParts,
        cashiers,
        dailySales,
        stockValuation,
        deadStock,
      },
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report_${startDate}_to_${endDate}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
