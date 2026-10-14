'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LowStockTable } from './low-stock-table';
import { StockHistoryView } from './stock-history-view';
import { StockAdjustDialog } from './stock-adjust-dialog';
import {
  LowStockProductItem,
  StockMovementItem,
} from '@/src/data/inventory';
import { ArrowUpDown, AlertTriangle, History } from 'lucide-react';

interface ProductPickerItem {
  id: number;
  sku: string;
  name: string;
  partNumber: string;
  stockQty: number;
  binLocation: string | null;
  isActive: boolean;
}

interface InventoryViewProps {
  isOwner: boolean;
  lowStockItems: LowStockProductItem[];
  productsForPicker: ProductPickerItem[];
  selectedProductId?: number;
  movements: StockMovementItem[];
}

export function InventoryView({
  isOwner,
  lowStockItems,
  productsForPicker,
  selectedProductId,
  movements,
}: InventoryViewProps) {
  const router = useRouter();

  // If a productId is present in URL, default to history tab; otherwise low-stock
  const [activeTab, setActiveTab] = React.useState<string>(
    selectedProductId ? 'history' : 'low-stock',
  );

  // Stock Adjust Dialog state
  const [adjustDialogOpen, setAdjustDialogOpen] = React.useState(false);
  const [adjustTargetProductId, setAdjustTargetProductId] = React.useState<number | undefined>(
    selectedProductId,
  );

  const handleOpenAdjust = (prodId?: number) => {
    setAdjustTargetProductId(prodId || selectedProductId || productsForPicker[0]?.id);
    setAdjustDialogOpen(true);
  };

  const handleAdjustSuccess = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory &amp; Stock Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Monitor low stock reorder alerts, adjust stock quantities, and audit movement logs.
          </p>
        </div>

        {/* Owner Adjust Stock Button */}
        {isOwner && (
          <Button onClick={() => handleOpenAdjust()} className="gap-1.5 self-start sm:self-auto">
            <ArrowUpDown className="h-4 w-4" />
            <span>Adjust Stock</span>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="print:hidden">
          <TabsTrigger value="low-stock" className="gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Low Stock Alerts</span>
            {lowStockItems.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-3xs font-bold text-amber-600 dark:text-amber-400">
                {lowStockItems.length}
              </span>
            )}
          </TabsTrigger>

          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span>Stock History Ledger</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Low stock */}
        <TabsContent value="low-stock" className="space-y-4">
          <LowStockTable
            items={lowStockItems}
            onAdjustProduct={isOwner ? handleOpenAdjust : undefined}
            isOwner={isOwner}
          />
        </TabsContent>

        {/* Tab 2: Stock History */}
        <TabsContent value="history" className="space-y-4">
          <StockHistoryView
            products={productsForPicker}
            selectedProductId={selectedProductId}
            movements={movements}
          />
        </TabsContent>
      </Tabs>

      {/* Owner-only Stock Adjust Dialog */}
      {isOwner && (
        <StockAdjustDialog
          open={adjustDialogOpen}
          onOpenChange={setAdjustDialogOpen}
          products={productsForPicker}
          defaultProductId={adjustTargetProductId}
          onSuccess={handleAdjustSuccess}
        />
      )}
    </div>
  );
}
