import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/src/lib/auth-guards';
import { exportProductsCsv } from '@/src/data/product-import';
import { productCsvTemplate } from '@/src/lib/product-csv';
import { getColomboDateString } from '@/src/lib/dates';

/** Owner only: the file contains cost prices. `?template=1` returns an empty template instead. */
export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx || ctx.user.role !== 'owner' || ctx.user.banned) {
    return new NextResponse('Unauthorized: Store owner access required', { status: 403 });
  }

  const wantsTemplate = request.nextUrl.searchParams.get('template') === '1';
  const csv = wantsTemplate ? productCsvTemplate() : await exportProductsCsv();
  const filename = wantsTemplate
    ? 'product-import-template.csv'
    : `products_${getColomboDateString(new Date())}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
