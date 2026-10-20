import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReportPdf, type ReportPdfData } from '@/src/lib/report-pdf';

const metric = (n: number) => ({
  value: String(n),
  displayValue: `Rs. ${n}.00`,
  rawNumber: n,
  lastWeekValue: '0',
  lastWeekDisplayValue: 'Rs. 0.00',
  diffAmount: String(n),
  diffPercentage: n > 0 ? 100 : null,
  isIncrease: n > 0,
  isNeutral: n === 0,
});

const base = (over: Partial<ReportPdfData> = {}): ReportPdfData => ({
  shop: { shopName: 'Jayaweera Logistic & Motors', address: 'Mahena, Ambeepussa', phone: '0778253254' },
  logo: path.join(process.cwd(), 'public', 'logo-invoice.png'),
  generatedAt: new Date('2026-10-20T05:00:00Z'),
  startDate: '2026-10-01',
  endDate: '2026-10-20',
  lowStockCount: 2,
  summary: {
    todayDateStr: '2026-10-20',
    lastWeekDateStr: '2026-10-13',
    lastWeekDayName: 'Tuesday',
    salesCount: metric(3),
    revenue: metric(15000),
    grossProfit: metric(4000),
    averageSale: metric(5000),
  },
  revenue: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    dayLabel: `${i + 1} Sep`,
    revenue: i % 3 === 0 ? 0 : 1000 * i,
    revenueDisplay: '',
    salesCount: i % 3 === 0 ? 0 : 2,
  })),
  topParts: {
    byQuantity: [{ productId: 1, sku: 'x', partNumber: 'BP-001', productName: 'Brake Pad', totalQuantity: 5, totalRevenue: '12500.00' }],
    byRevenue: [],
  },
  cashiers: [{ cashierId: 'a', cashierName: 'Nimal', cashierEmail: 'n@x.lk', salesCount: 3, totalRevenue: '15000.00', cashRevenue: '10000.00', cardRevenue: '5000.00', grossProfit: '4000.00' }],
  dailySales: [{ saleDate: '2026-10-20', salesCount: 3, revenue: '15000.00', discount: '0.00', profit: '4000.00', cash: '10000.00', card: '5000.00' }],
  stockValuation: { categories: [{ categoryId: 1, categoryName: 'Brakes', itemsCount: 4, totalUnits: 20, valuation: '50000.00' }], totalItemsCount: 4, totalUnits: 20, totalValuation: '50000.00' },
  deadStock: Array.from({ length: 120 }, (_, i) => ({
    id: i, sku: `s${i}`, partNumber: `P-${i}`, name: 'Slow part', categoryName: 'Misc', brandName: null,
    stockQty: 2, costPrice: '100.00', sellingPrice: '150.00', tiedUpCapital: '200.00', lastSoldAt: null,
  })),
  ...over,
});

describe('report pdf', () => {
  it('renders a full report', async () => {
    const buf = await renderToBuffer(<ReportPdf data={base()} />);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(5000);
  });

  it('renders an empty period without crashing', async () => {
    const buf = await renderToBuffer(
      <ReportPdf
        data={base({
          lowStockCount: 0,
          dailySales: [],
          cashiers: [],
          deadStock: [],
          topParts: { byQuantity: [], byRevenue: [] },
          stockValuation: { categories: [], totalItemsCount: 0, totalUnits: 0, totalValuation: '0.00' },
          revenue: [],
        })}
      />,
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
