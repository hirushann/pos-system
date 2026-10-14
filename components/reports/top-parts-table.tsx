'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatLKR } from '@/src/lib/money';
import type { TopPartItem } from '@/src/data/reports';
import { Package, Hash, DollarSign } from 'lucide-react';

interface TopPartsTableProps {
  byQuantity: TopPartItem[];
  byRevenue: TopPartItem[];
}

export function TopPartsTable({ byQuantity, byRevenue }: TopPartsTableProps) {
  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Top Performing Spare Parts</CardTitle>
            <CardDescription className="text-xs">
              Top 10 parts ranked by units sold and by total revenue for the selected range.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="quantity" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="quantity" className="flex items-center gap-1.5 text-xs">
              <Hash className="h-3.5 w-3.5" />
              <span>By Quantity</span>
            </TabsTrigger>
            <TabsTrigger value="revenue" className="flex items-center gap-1.5 text-xs">
              <DollarSign className="h-3.5 w-3.5" />
              <span>By Revenue</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quantity" className="m-0">
            {byQuantity.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                <Package className="h-8 w-8 text-muted-foreground/50 mb-2" />
                No sales recorded for this date range.
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Part Number / SKU</TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead className="text-right">Units Sold</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {byQuantity.map((part, index) => (
                      <TableRow key={part.productId}>
                        <TableCell className="text-center font-medium text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono font-medium">{part.partNumber}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{part.sku}</div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[260px] truncate" title={part.productName}>
                          {part.productName}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          <Badge variant="secondary" className="font-mono tabular-nums">
                            {part.totalQuantity} units
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatLKR(part.totalRevenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="revenue" className="m-0">
            {byRevenue.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                <Package className="h-8 w-8 text-muted-foreground/50 mb-2" />
                No sales recorded for this date range.
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Part Number / SKU</TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead className="text-right">Units Sold</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {byRevenue.map((part, index) => (
                      <TableRow key={part.productId}>
                        <TableCell className="text-center font-medium text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono font-medium">{part.partNumber}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{part.sku}</div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[260px] truncate" title={part.productName}>
                          {part.productName}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-muted-foreground">
                          {part.totalQuantity} units
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-bold text-foreground">
                          {formatLKR(part.totalRevenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
