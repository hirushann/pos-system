import React from 'react';
import { Document, Image, Line, Page, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import { formatAmount, formatLKR } from '@/src/lib/money';
import { formatColomboDate, formatColomboTimestamp } from '@/src/lib/dates';
import { toAscii } from '@/src/lib/escp-invoice';
import type {
  CashierPerformanceItem,
  DailyRevenueChartPoint,
  DailySalesReportItem,
  DashboardMetricsSummary,
  DeadStockItem,
  MetricWithComparison,
  StockValuationReport,
  TopPartItem,
} from '@/src/data/reports';

/*
 * The store report as a designed A4 PDF (header with logo, figure cards, revenue chart,
 * tables, page numbers). Built with @react-pdf/renderer on the server, so the download is
 * one click and does not depend on the browser's print settings.
 *
 * The built-in PDF fonts only cover basic Latin, so all text goes through toAscii().
 */

export interface ReportPdfData {
  shop: { shopName: string; address: string | null; phone: string | null };
  /** PNG/JPG of the logo (file path or bytes). Optional. */
  logo?: string | Buffer;
  generatedAt: Date;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  lowStockCount: number;
  summary: DashboardMetricsSummary;
  revenue: DailyRevenueChartPoint[];
  topParts: { byQuantity: TopPartItem[]; byRevenue: TopPartItem[] };
  cashiers: CashierPerformanceItem[];
  dailySales: DailySalesReportItem[];
  stockValuation: StockValuationReport;
  deadStock: DeadStockItem[];
}

const MAX_DEAD_STOCK_ROWS = 80;

const C = {
  navy: '#0f2a66',
  blue: '#2563eb',
  blueSoft: '#dbeafe',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  panel: '#f1f5f9',
  zebra: '#f8fafc',
  green: '#047857',
  greenSoft: '#d1fae5',
  red: '#b91c1c',
  redSoft: '#fee2e2',
  amber: '#92400e',
  amberSoft: '#fef3c7',
  white: '#ffffff',
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 50, paddingHorizontal: 36, fontFamily: 'Helvetica', fontSize: 9, color: C.ink },

  // header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.navy },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  logo: { width: 40, height: 40, marginRight: 10 },
  shopName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy },
  shopMeta: { fontSize: 8.5, color: C.muted, marginTop: 2 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.blue, letterSpacing: 1 },
  period: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  generated: { fontSize: 7.5, color: C.muted, marginTop: 2 },

  notice: { marginTop: 9, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 4, backgroundColor: C.amberSoft, color: C.amber, fontSize: 8.5 },

  // sections
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 7 },
  sectionBar: { width: 3, height: 12, backgroundColor: C.blue, borderRadius: 1, marginRight: 6 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 0.6 },
  sectionNote: { fontSize: 7.5, color: C.muted, marginLeft: 8 },

  // tiles
  tileRow: { flexDirection: 'row', marginBottom: 7 },
  tile: { flex: 1, backgroundColor: C.panel, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 3, borderLeftColor: C.blue },
  tileLabel: { fontSize: 7, color: C.muted, letterSpacing: 0.8 },
  tileValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  tileSub: { fontSize: 7.5, marginTop: 3, color: C.muted },
  pill: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },

  // tables
  table: { borderWidth: 0.5, borderColor: C.line, borderRadius: 4 },
  thead: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 5, paddingHorizontal: 6 },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6 },
  td: { fontSize: 8.5 },
  tfoot: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: C.blueSoft, borderTopWidth: 1, borderTopColor: C.blue },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  bold: { fontFamily: 'Helvetica-Bold' },
  empty: { paddingVertical: 12, textAlign: 'center', color: C.muted, fontSize: 8.5 },
  footnote: { marginTop: 4, fontSize: 7.5, color: C.muted },

  // chart
  chartCard: { borderWidth: 0.5, borderColor: C.line, borderRadius: 6, padding: 10 },
  chartTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chartTotal: { fontSize: 8.5, color: C.muted },

  // footer
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6, fontSize: 7.5, color: C.muted },
});

const t = (value: string | null | undefined) => toAscii(value ?? '');
const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}.` : value);
const dayText = (ymd: string) => formatColomboDate(new Date(`${ymd}T12:00:00+05:30`));
const sum = (values: string[]) => values.reduce((acc, v) => acc.plus(new Decimal(v || '0')), new Decimal(0));

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <View style={s.sectionHead} minPresenceAhead={70}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
      {note ? <Text style={s.sectionNote}>{t(note)}</Text> : null}
    </View>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label.toUpperCase()}</Text>
      <Text style={s.tileValue}>{value}</Text>
      {sub ? <Text style={s.tileSub}>{sub}</Text> : null}
    </View>
  );
}

/** A card for "today vs the same weekday last week" with a coloured change badge. */
function ComparisonTile({ label, metric, lastWeekDay }: { label: string; metric: MetricWithComparison; lastWeekDay: string }) {
  const tone = metric.isNeutral
    ? { bg: C.panel, fg: C.muted }
    : metric.isIncrease
      ? { bg: C.greenSoft, fg: C.green }
      : { bg: C.redSoft, fg: C.red };
  const pct = metric.diffPercentage === null ? '0' : `${metric.diffPercentage >= 0 ? '+' : ''}${metric.diffPercentage}`;
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label.toUpperCase()}</Text>
      <Text style={s.tileValue}>{t(metric.displayValue)}</Text>
      <Text style={[s.pill, { backgroundColor: tone.bg, color: tone.fg }]}>{`${pct}% vs ${t(lastWeekDay)}`}</Text>
      <Text style={s.tileSub}>{`was ${t(metric.lastWeekDisplayValue)}`}</Text>
    </View>
  );
}

interface Column<Row> {
  header: string;
  width: string;
  align?: 'left' | 'right' | 'center';
  value: (row: Row, index: number) => string;
  bold?: boolean;
}

function DataTable<Row>({
  columns,
  rows,
  footer,
  emptyText,
}: {
  columns: Column<Row>[];
  rows: Row[];
  footer?: string[];
  emptyText: string;
}) {
  const alignStyle = (a?: 'left' | 'right' | 'center') => (a === 'right' ? s.right : a === 'center' ? s.center : undefined);
  return (
    <View style={s.table}>
      <View style={s.thead} wrap={false}>
        {columns.map((c) => (
          <Text key={c.header} style={[s.th, { width: c.width }, alignStyle(c.align) ?? {}]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={s.empty}>{emptyText}</Text>
      ) : (
        rows.map((row, i) => (
          <View key={i} style={[s.tr, i % 2 === 1 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
            {columns.map((c) => (
              <Text key={c.header} style={[s.td, { width: c.width }, alignStyle(c.align) ?? {}, c.bold ? s.bold : {}]}>
                {c.value(row, i)}
              </Text>
            ))}
          </View>
        ))
      )}
      {footer && rows.length > 0 ? (
        <View style={s.tfoot} wrap={false}>
          {columns.map((c, i) => (
            <Text key={c.header} style={[s.td, s.bold, { width: c.width }, alignStyle(c.align) ?? {}]}>
              {footer[i] ?? ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Rounds a chart maximum up to a tidy number so the grid lines read well. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function RevenueBars({ data }: { data: DailyRevenueChartPoint[] }) {
  const width = 503;
  const height = 130;
  const left = 46;
  const bottom = 18;
  const top = 6;
  const plotW = width - left - 4;
  const plotH = height - bottom - top;
  const max = niceMax(Math.max(0, ...data.map((d) => d.revenue)));
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, slot * 0.62);
  const ticks = [0, 0.5, 1];

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {ticks.map((tick) => {
        const y = top + plotH - plotH * tick;
        return (
          <React.Fragment key={tick}>
            <Line x1={left} y1={y} x2={width - 4} y2={y} stroke={C.line} strokeWidth={0.6} />
            <Text x={left - 5} y={y + 2.5} style={{ fontSize: 6.5, fill: C.muted, textAnchor: 'end' } as never}>
              {formatAmount(max * tick).replace(/\.00$/, '')}
            </Text>
          </React.Fragment>
        );
      })}
      {data.map((d, i) => {
        const h = d.revenue > 0 ? Math.max(1, (d.revenue / max) * plotH) : 0;
        const x = left + i * slot + (slot - barW) / 2;
        return (
          <React.Fragment key={d.date}>
            {h > 0 ? <Rect x={x} y={top + plotH - h} width={barW} height={h} fill={C.blue} rx={1} /> : null}
            {i % 5 === 0 || i === data.length - 1 ? (
              <Text x={x + barW / 2} y={height - 5} style={{ fontSize: 6, fill: C.muted, textAnchor: 'middle' } as never}>
                {t(d.dayLabel)}
              </Text>
            ) : null}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export function ReportPdf({ data }: { data: ReportPdfData }) {
  const { shop, summary, dailySales, stockValuation, deadStock } = data;
  const period = data.startDate === data.endDate ? dayText(data.startDate) : `${dayText(data.startDate)}  -  ${dayText(data.endDate)}`;

  // Totals for the chosen period
  const orders = dailySales.reduce((n, r) => n + r.salesCount, 0);
  const revenue = sum(dailySales.map((r) => r.revenue));
  const discount = sum(dailySales.map((r) => r.discount));
  const profit = sum(dailySales.map((r) => r.profit));
  const cash = sum(dailySales.map((r) => r.cash));
  const card = sum(dailySales.map((r) => r.card));
  const cheque = sum(dailySales.map((r) => r.cheque));
  const average = orders > 0 ? revenue.dividedBy(orders) : new Decimal(0);

  const trendTotal = data.revenue.reduce((n, d) => n + d.revenue, 0);
  const trendDays = data.revenue.filter((d) => d.salesCount > 0).length;

  const deadShown = deadStock.slice(0, MAX_DEAD_STOCK_ROWS);
  const deadCapital = sum(deadStock.map((r) => r.tiedUpCapital));

  const topColumns = (right: 'qty' | 'rev'): Column<TopPartItem>[] => [
    { header: '#', width: '6%', value: (_r, i) => String(i + 1) },
    { header: 'Part No', width: '22%', bold: true, value: (r) => truncate(t(r.partNumber), 16) },
    { header: 'Description', width: '44%', value: (r) => truncate(t(r.productName), 38) },
    { header: right === 'qty' ? 'Qty sold' : 'Qty', width: '10%', align: 'right', value: (r) => String(r.totalQuantity) },
    { header: 'Revenue (Rs.)', width: '18%', align: 'right', bold: right === 'rev', value: (r) => formatAmount(r.totalRevenue) },
  ];

  return (
    <Document title={`Store report ${data.startDate} to ${data.endDate}`} author={t(shop.shopName)} creator="POS">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            {data.logo ? <Image src={data.logo} style={s.logo} /> : null}
            <View>
              <Text style={s.shopName}>{t(shop.shopName)}</Text>
              <Text style={s.shopMeta}>
                {[t(shop.address), shop.phone ? `Tel: ${t(shop.phone)}` : ''].filter(Boolean).join('   |   ')}
              </Text>
            </View>
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>STORE REPORT</Text>
            <Text style={s.period}>{period}</Text>
            <Text style={s.generated}>{`Generated ${formatColomboTimestamp(data.generatedAt)} (Asia/Colombo)`}</Text>
          </View>
        </View>

        {data.lowStockCount > 0 ? (
          <Text style={s.notice}>
            {`${data.lowStockCount} ${data.lowStockCount === 1 ? 'part needs' : 'parts need'} reordering (stock at or below the reorder level).`}
          </Text>
        ) : null}

        {/* Selected period */}
        <SectionTitle title="Selected period" note="Non-voided sales only" />
        <View style={s.tileRow}>
          <Tile label="Orders" value={String(orders)} />
          <View style={{ width: 7 }} />
          <Tile label="Revenue" value={formatLKR(revenue)} />
          <View style={{ width: 7 }} />
          <Tile label="Gross profit" value={formatLKR(profit)} />
        </View>
        <View style={s.tileRow}>
          <Tile label="Average sale" value={formatLKR(average)} />
          <View style={{ width: 7 }} />
          <Tile label="Cash payments" value={formatLKR(cash)} sub={`Discounts given: ${formatLKR(discount)}`} />
          <View style={{ width: 7 }} />
          <Tile label="Card payments" value={formatLKR(card)} />
          <View style={{ width: 7 }} />
          <Tile label="Cheque payments" value={formatLKR(cheque)} />
        </View>

        {/* Today at a glance */}
        <SectionTitle title="Today at a glance" note={`${dayText(summary.todayDateStr)}, compared with ${t(summary.lastWeekDayName)} ${dayText(summary.lastWeekDateStr)}`} />
        <View style={s.tileRow}>
          <ComparisonTile label="Sales" metric={summary.salesCount} lastWeekDay={summary.lastWeekDayName} />
          <View style={{ width: 7 }} />
          <ComparisonTile label="Revenue" metric={summary.revenue} lastWeekDay={summary.lastWeekDayName} />
          <View style={{ width: 7 }} />
          <ComparisonTile label="Gross profit" metric={summary.grossProfit} lastWeekDay={summary.lastWeekDayName} />
          <View style={{ width: 7 }} />
          <ComparisonTile label="Average sale" metric={summary.averageSale} lastWeekDay={summary.lastWeekDayName} />
        </View>

        {/* 30-day revenue */}
        <SectionTitle title="Revenue, last 30 days" note="Daily non-voided sales" />
        <View style={s.chartCard} wrap={false}>
          <View style={s.chartTop}>
            <Text style={s.chartTotal}>{`30-day total: ${formatLKR(trendTotal)}`}</Text>
            <Text style={s.chartTotal}>
              {`Average per sales day: ${formatLKR(trendDays > 0 ? trendTotal / trendDays : 0)}`}
            </Text>
          </View>
          <RevenueBars data={data.revenue} />
        </View>

        {/* Top parts */}
        <SectionTitle title="Top parts by quantity" note={period} />
        <DataTable columns={topColumns('qty')} rows={data.topParts.byQuantity} emptyText="No sales in this period." />

        <SectionTitle title="Top parts by revenue" note={period} />
        <DataTable columns={topColumns('rev')} rows={data.topParts.byRevenue} emptyText="No sales in this period." />

        {/* Cashiers */}
        <SectionTitle title="Sales by cashier" note={period} />
        <DataTable
          emptyText="No sales in this period."
          rows={data.cashiers}
          columns={[
            { header: 'Cashier', width: '22%', bold: true, value: (r) => truncate(t(r.cashierName || r.cashierEmail), 22) },
            { header: 'Sales', width: '8%', align: 'right', value: (r) => String(r.salesCount) },
            { header: 'Revenue (Rs.)', width: '16%', align: 'right', value: (r) => formatAmount(r.totalRevenue) },
            { header: 'Cash (Rs.)', width: '14%', align: 'right', value: (r) => formatAmount(r.cashRevenue) },
            { header: 'Card (Rs.)', width: '14%', align: 'right', value: (r) => formatAmount(r.cardRevenue) },
            { header: 'Cheque (Rs.)', width: '14%', align: 'right', value: (r) => formatAmount(r.chequeRevenue) },
            { header: 'Profit (Rs.)', width: '12%', align: 'right', value: (r) => formatAmount(r.grossProfit) },
          ]}
        />

        {/* Daily sales */}
        <SectionTitle title="Daily sales" note={period} />
        <DataTable
          emptyText="No sales in this period."
          rows={dailySales}
          footer={['Total', String(orders), formatAmount(revenue), formatAmount(discount), formatAmount(profit), formatAmount(cash), formatAmount(card), formatAmount(cheque)]}
          columns={[
            { header: 'Date', width: '14%', bold: true, value: (r) => r.saleDate },
            { header: 'Sales', width: '7%', align: 'right', value: (r) => String(r.salesCount) },
            { header: 'Revenue (Rs.)', width: '15%', align: 'right', value: (r) => formatAmount(r.revenue) },
            { header: 'Disc. (Rs.)', width: '12%', align: 'right', value: (r) => formatAmount(r.discount) },
            { header: 'Profit (Rs.)', width: '13%', align: 'right', value: (r) => formatAmount(r.profit) },
            { header: 'Cash (Rs.)', width: '13%', align: 'right', value: (r) => formatAmount(r.cash) },
            { header: 'Card (Rs.)', width: '13%', align: 'right', value: (r) => formatAmount(r.card) },
            { header: 'Cheque (Rs.)', width: '13%', align: 'right', value: (r) => formatAmount(r.cheque) },
          ]}
        />

        {/* Stock valuation */}
        <SectionTitle title="Stock valuation" note="Active parts at cost price, as of now" />
        <DataTable
          emptyText="No stock to value."
          rows={stockValuation.categories}
          footer={['Total', String(stockValuation.totalItemsCount), String(stockValuation.totalUnits), formatAmount(stockValuation.totalValuation)]}
          columns={[
            { header: 'Category', width: '46%', bold: true, value: (r) => truncate(t(r.categoryName), 40) },
            { header: 'Items', width: '14%', align: 'right', value: (r) => String(r.itemsCount) },
            { header: 'Units', width: '14%', align: 'right', value: (r) => String(r.totalUnits) },
            { header: 'Valuation (Rs.)', width: '26%', align: 'right', value: (r) => formatAmount(r.valuation) },
          ]}
        />

        {/* Dead stock */}
        <SectionTitle title="Dead stock" note="In stock, not sold in the last 90 days" />
        <DataTable
          emptyText="No dead stock. Everything in stock has sold recently."
          rows={deadShown}
          footer={['Total', '', '', String(deadStock.reduce((n, r) => n + r.stockQty, 0)), '', formatAmount(deadCapital), '']}
          columns={[
            { header: 'Part No', width: '15%', bold: true, value: (r) => truncate(t(r.partNumber), 14) },
            { header: 'Description', width: '29%', value: (r) => truncate(t(r.name), 30) },
            { header: 'Category', width: '14%', value: (r) => truncate(t(r.categoryName), 13) },
            { header: 'Qty', width: '7%', align: 'right', value: (r) => String(r.stockQty) },
            { header: 'Cost (Rs.)', width: '12%', align: 'right', value: (r) => formatAmount(r.costPrice) },
            { header: 'Tied up (Rs.)', width: '13%', align: 'right', value: (r) => formatAmount(r.tiedUpCapital) },
            { header: 'Last sold', width: '10%', value: (r) => (r.lastSoldAt ? r.lastSoldAt.slice(0, 10) : 'Never') },
          ]}
        />
        {deadStock.length > MAX_DEAD_STOCK_ROWS ? (
          <Text style={s.footnote}>
            {`Showing the ${MAX_DEAD_STOCK_ROWS} items with the most money tied up, of ${deadStock.length}. The total above covers all ${deadStock.length}.`}
          </Text>
        ) : null}

        {/* Page footer */}
        <View style={s.footer} fixed>
          <Text>{`${t(shop.shopName)}  |  Store report ${data.startDate} to ${data.endDate}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
