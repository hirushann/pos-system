'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  User,
  Phone,
  Car,
  Tag,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatLKR } from '@/src/lib/money';
import Decimal from 'decimal.js';
import type { DiscountState } from './discount-dialog';

export interface CartLineItem {
  productId: number;
  name: string;
  partNumber: string;
  unitPrice: string;
  stockQty: number;
  quantity: number;
  unit: string;
  binLocation?: string | null;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  vehicleNo: string;
}

interface CheckoutCartPanelProps {
  items: CartLineItem[];
  customerInfo: CustomerInfo;
  onUpdateCustomerInfo: (info: CustomerInfo) => void;
  onUpdateQuantity: (productId: number, newQty: number) => void;
  onRemoveItem: (productId: number) => void;
  onClearCart: () => void;
  subtotal: Decimal;
  discount: DiscountState;
  discountAmount: Decimal;
  total: Decimal;
  onOpenDiscount: () => void;
  onOpenPayment: () => void;
}

export function CheckoutCartPanel({
  items,
  customerInfo,
  onUpdateCustomerInfo,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  subtotal,
  discount,
  discountAmount,
  total,
  onOpenDiscount,
  onOpenPayment,
}: CheckoutCartPanelProps) {
  const [showCustomerFields, setShowCustomerFields] = React.useState(false);

  const hasCustomerData =
    customerInfo.name.trim() !== '' ||
    customerInfo.phone.trim() !== '' ||
    customerInfo.vehicleNo.trim() !== '';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      {/* Cart Top Bar */}
      <div className="border-b bg-card/60 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base leading-tight">Current Cart</h2>
              <span className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? 'line item' : 'line items'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearCart}
                className="h-8 text-xs text-destructive hover:bg-destructive/10 px-2.5"
              >
                Clear Cart
              </Button>
            )}

            <Button
              type="button"
              variant={showCustomerFields || hasCustomerData ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowCustomerFields((prev) => !prev)}
              className="h-8 text-xs gap-1 px-2.5"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Customer</span>
              {hasCustomerData && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
              )}
              {showCustomerFields ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        {/* Optional Customer Information Accordion */}
        {showCustomerFields && (
          <div className="mt-3 rounded-lg border bg-muted/40 p-3 space-y-2 animate-in fade-in-50">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Customer Details (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  aria-label="Customer Name"
                  placeholder="Customer Name"
                  value={customerInfo.name}
                  onChange={(e) =>
                    onUpdateCustomerInfo({ ...customerInfo, name: e.target.value })
                  }
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="tel"
                  aria-label="Customer Phone"
                  placeholder="Phone Number"
                  value={customerInfo.phone}
                  onChange={(e) =>
                    onUpdateCustomerInfo({ ...customerInfo, phone: e.target.value })
                  }
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>
              <div className="relative">
                <Car className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  aria-label="Vehicle Registration Number"
                  placeholder="Vehicle No (e.g. WP-CA-1234)"
                  value={customerInfo.vehicleNo}
                  onChange={(e) =>
                    onUpdateCustomerInfo({ ...customerInfo, vehicleNo: e.target.value })
                  }
                  className="pl-8 h-8 text-xs font-mono uppercase bg-background"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/60">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground min-h-[220px]">
            <ShoppingCart className="h-12 w-12 stroke-[1.2] text-muted-foreground/40 mb-3" />
            <h3 className="font-semibold text-sm text-foreground">Cart is currently empty</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Search by part number, name, or scan barcode to add parts to this bill.
            </p>
          </div>
        ) : (
          items.map((line) => {
            const lineTotal = new Decimal(line.unitPrice).times(line.quantity);
            const isAtMax = line.quantity >= line.stockQty;

            return (
              <div
                key={line.productId}
                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/20"
              >
                {/* Part Name & Meta */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {line.partNumber}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      @{formatLKR(line.unitPrice)}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground line-clamp-1">
                    {line.name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground">
                      Stock: {line.stockQty} {line.unit}
                    </span>
                    {isAtMax && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        (Max on hand)
                      </span>
                    )}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-md"
                    onClick={() => {
                      if (line.quantity > 1) {
                        onUpdateQuantity(line.productId, line.quantity - 1);
                      } else {
                        onRemoveItem(line.productId);
                      }
                    }}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    min="1"
                    max={line.stockQty}
                    aria-label={`Quantity for ${line.name}`}
                    value={line.quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        onUpdateQuantity(line.productId, Math.min(val, line.stockQty));
                      }
                    }}
                    className="h-7 w-12 text-center font-mono text-xs font-bold px-1"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={isAtMax}
                    className="h-7 w-7 rounded-md"
                    onClick={() => {
                      if (!isAtMax) {
                        onUpdateQuantity(line.productId, line.quantity + 1);
                      }
                    }}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Line Total & Remove button */}
                <div className="flex items-center gap-2 shrink-0 text-right">
                  <div className="min-w-[85px] text-right font-mono text-sm font-bold tabular-nums">
                    {formatLKR(lineTotal)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveItem(line.productId)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Totals & Payment Section */}
      <div className="border-t bg-card p-4 space-y-3 shrink-0">
        {/* Financial Breakdown */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between items-center">
            <span>Subtotal:</span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {formatLKR(subtotal)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={onOpenDiscount}
              className="flex items-center gap-1.5 text-xs font-medium hover:text-primary transition-colors cursor-pointer group"
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
              <span>Discount</span>
              <kbd className="hidden sm:inline-block rounded border bg-muted px-1 text-[10px] font-mono text-muted-foreground">
                F4
              </kbd>
            </button>

            {discount.type !== 'none' && !discountAmount.isZero() ? (
              <button
                type="button"
                onClick={onOpenDiscount}
                className="font-mono tabular-nums text-destructive font-semibold hover:underline cursor-pointer"
              >
                -{formatLKR(discountAmount)}{' '}
                {discount.type === 'percent' && `(${discount.value}%)`}
              </button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenDiscount}
                className="h-5 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
              >
                Add discount
              </Button>
            )}
          </div>

          {/* Grand Total */}
          <div className="border-t border-border pt-2 flex justify-between items-baseline">
            <span className="font-bold text-sm text-foreground">Total:</span>
            <span className="font-mono text-2xl sm:text-3xl font-black text-primary tracking-tight tabular-nums">
              {formatLKR(total)}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <Button
          type="button"
          disabled={items.length === 0}
          onClick={onOpenPayment}
          className="w-full h-12 text-base font-bold gap-2 shadow-sm"
        >
          <span>Proceed to Pay</span>
          <kbd className="hidden sm:inline-block rounded border border-primary-foreground/30 bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-mono">
            F9
          </kbd>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
