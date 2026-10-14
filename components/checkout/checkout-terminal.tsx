'use client';

import * as React from 'react';
import { CheckoutSearchPanel } from './checkout-search-panel';
import { CheckoutCartPanel, type CartLineItem, type CustomerInfo } from './checkout-cart-panel';
import { DiscountDialog, type DiscountState } from './discount-dialog';
import { PaymentDialog } from './payment-dialog';
import { SaleSuccessDialog } from './sale-success-dialog';
import type { CheckoutPartItem, VehicleMakeOption } from '@/src/data/checkout';
import { completeSale, lookupBarcode, type CompleteSaleResultData } from '@/src/actions/sales';
import { playScanSuccessBeep, playScanErrorBeep } from '@/src/lib/audio-beeper';
import { LinkBarcodeDialog } from './link-barcode-dialog';
import Decimal from 'decimal.js';
import { toast } from 'sonner';

const CART_STORAGE_KEY = 'pos_checkout_cart_v1';

interface StoredCartData {
  items: CartLineItem[];
  customerInfo: CustomerInfo;
  discount: DiscountState;
}

interface CheckoutTerminalProps {
  initialProducts: CheckoutPartItem[];
  vehicleMakes: VehicleMakeOption[];
  isOwner: boolean;
  cashierMaxDiscountPct: string;
}

export function CheckoutTerminal({
  initialProducts,
  vehicleMakes,
  isOwner,
  cashierMaxDiscountPct,
}: CheckoutTerminalProps) {
  const [cartItems, setCartItems] = React.useState<CartLineItem[]>([]);
  const [customerInfo, setCustomerInfo] = React.useState<CustomerInfo>({
    name: '',
    phone: '',
    vehicleNo: '',
  });
  const [discount, setDiscount] = React.useState<DiscountState>({
    type: 'none',
    value: '0',
  });

  // Dialog visibility states
  const [isDiscountOpen, setIsDiscountOpen] = React.useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = React.useState(false);
  const [completedSale, setCompletedSale] = React.useState<CompleteSaleResultData | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Unlinked barcode state (for owner linking)
  const [unlinkedBarcode, setUnlinkedBarcode] = React.useState<string | null>(null);
  const [unlinkedQty, setUnlinkedQty] = React.useState<number>(1);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);

  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  // 1. Load cart from localStorage on mount (async to prevent cascading renders)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
          const parsed: StoredCartData = JSON.parse(stored);
          if (Array.isArray(parsed.items)) {
            setCartItems(parsed.items);
          }
          if (parsed.customerInfo) {
            setCustomerInfo(parsed.customerInfo);
          }
          if (parsed.discount) {
            setDiscount(parsed.discount);
          }
        }
      } catch (e) {
        console.error('Failed to restore saved cart:', e);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // 2. Persist cart to localStorage whenever it changes
  React.useEffect(() => {
    try {
      const stateToStore: StoredCartData = {
        items: cartItems,
        customerInfo,
        discount,
      };
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stateToStore));
    } catch (e) {
      console.error('Failed to save cart to localStorage:', e);
    }
  }, [cartItems, customerInfo, discount]);

  // 3. Decimal calculations for financial totals
  const { subtotal, discountAmount, total } = React.useMemo(() => {
    let sub = new Decimal(0);
    for (const item of cartItems) {
      const line = new Decimal(item.unitPrice).times(item.quantity);
      sub = sub.plus(line);
    }

    let disc = new Decimal(0);
    const discVal = new Decimal(discount.value || '0');

    if (discount.type === 'percent' && !discVal.isZero()) {
      disc = sub.times(discVal).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else if (discount.type === 'amount' && !discVal.isZero()) {
      disc = discVal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    // Ensure discount does not exceed subtotal
    if (disc.greaterThan(sub)) {
      disc = sub;
    }

    const net = sub.minus(disc);

    return {
      subtotal: sub,
      discountAmount: disc,
      total: net,
    };
  }, [cartItems, discount]);

  // 4. Cart actions
  const handleAddToCart = React.useCallback(
    (product: CheckoutPartItem, qtyToAdd: number = 1) => {
      setCartItems((prev) => {
        const existing = prev.find((i) => i.productId === product.id);
        if (existing) {
          // If already in cart, increment quantity up to available stock
          const newQty = Math.min(existing.quantity + qtyToAdd, product.stockQty);
          return prev.map((i) =>
            i.productId === product.id
              ? { ...i, quantity: newQty, stockQty: product.stockQty }
              : i,
          );
        }
        // Add new line
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            partNumber: product.partNumber,
            unitPrice: product.price,
            stockQty: product.stockQty,
            quantity: Math.min(qtyToAdd, product.stockQty),
            unit: product.unit,
            binLocation: product.binLocation,
          },
        ];
      });
    },
    [],
  );

  const handleUpdateQuantity = React.useCallback((productId: number, newQty: number) => {
    setCartItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: newQty } : i)),
    );
  }, []);

  const handleRemoveItem = React.useCallback((productId: number) => {
    setCartItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const handleClearCart = React.useCallback(() => {
    setCartItems([]);
    setDiscount({ type: 'none', value: '0' });
    setCustomerInfo({ name: '', phone: '', vehicleNo: '' });
    localStorage.removeItem(CART_STORAGE_KEY);
    toast.info('Cart cleared');
  }, []);

  // 5. Unified Barcode Scan Processor
  const handleProcessBarcodeScan = React.useCallback(
    async (rawCode: string): Promise<boolean> => {
      let qty = 1;
      let code = rawCode.trim();

      // Check quantity prefix: e.g. 4*2000000004
      const prefixMatch = code.match(/^(\d+)\*(.+)$/);
      if (prefixMatch) {
        qty = Math.max(1, parseInt(prefixMatch[1], 10));
        code = prefixMatch[2].trim();
      }

      if (!code) return false;

      const res = await lookupBarcode(code);

      if (res.success && res.data) {
        const p = res.data.product;
        // Check stock against current cart
        const existing = cartItems.find((i) => i.productId === p.id);
        const inCart = existing ? existing.quantity : 0;
        if (inCart + qty > p.stockQty) {
          playScanErrorBeep();
          toast.error(
            `Insufficient stock for "${p.partNumber}". Available: ${p.stockQty}, already ${inCart} in cart.`,
          );
          return true; // recognized product
        }

        const checkoutItem: CheckoutPartItem = {
          id: p.id,
          sku: p.sku,
          name: p.name,
          partNumber: p.partNumber,
          brandName: p.brandName,
          binLocation: p.binLocation,
          unit: p.unit,
          price: p.price,
          stockQty: p.stockQty,
          alternateNumbers: [],
        };

        handleAddToCart(checkoutItem, qty);
        playScanSuccessBeep();
        toast.success(
          `Added ${qty > 1 ? `${qty}x ` : ''}${p.partNumber} to cart`,
          { duration: 2000 },
        );
        return true;
      }

      // Handle scan errors
      playScanErrorBeep();

      if (res.error === 'inactive') {
        toast.error(
          `Part "${res.productName || code}" is inactive and cannot be sold`,
        );
        return true;
      }

      if (res.error === 'out_of_stock') {
        toast.error(`Part "${res.productName || code}" is out of stock`);
        return true;
      }

      // res.error === 'not_found'
      if (isOwner) {
        toast.error(`Barcode ${code} not found`, {
          description: 'Link this barcode to a catalog part.',
          action: {
            label: 'Link to a product',
            onClick: () => {
              setUnlinkedBarcode(code);
              setUnlinkedQty(qty);
              setIsLinkDialogOpen(true);
            },
          },
          duration: 9000,
        });
      } else {
        toast.error(`Barcode ${code} not found`);
      }

      return false;
    },
    [cartItems, handleAddToCart, isOwner],
  );

  // 6. Global Keyboard Shortcuts & USB Scanner Burst Detector
  const burstBufferRef = React.useRef<string>('');
  const lastKeyTimeRef = React.useRef<number>(0);
  const prefixRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Handle function shortcuts regardless of focus
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cartItems.length > 0) {
          setIsDiscountOpen(true);
        } else {
          toast.info('Add parts to cart before applying discount');
        }
        return;
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (cartItems.length > 0) {
          setIsPaymentOpen(true);
        } else {
          toast.info('Cart is empty. Add parts to proceed to payment');
        }
        return;
      } else if (e.key === 'Escape') {
        setIsDiscountOpen(false);
        setIsPaymentOpen(false);
        setIsSuccessOpen(false);
        setIsLinkDialogOpen(false);
        return;
      }

      // NEVER take keystrokes from a field the cashier is typing in!
      if (isInput) {
        return;
      }

      // Check human-typed quantity prefix outside inputs: e.g. "4*"
      if (e.key === '*' && /^\d+$/.test(burstBufferRef.current)) {
        prefixRef.current = parseInt(burstBufferRef.current, 10);
        burstBufferRef.current = '';
        return;
      }

      const now = performance.now();
      const delta = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const buffer = burstBufferRef.current;
        burstBufferRef.current = '';

        // Scanner burst: keys under 50ms apart, at least 6 characters
        if (buffer.length >= 6) {
          e.preventDefault();
          let finalCode = buffer;
          if (prefixRef.current && !finalCode.includes('*')) {
            finalCode = `${prefixRef.current}*${buffer}`;
            prefixRef.current = null;
          }
          handleProcessBarcodeScan(finalCode);
        }
        return;
      }

      if (e.key.length === 1) {
        // Keys under 50ms apart are from scanner burst
        if (delta < 50) {
          burstBufferRef.current += e.key;
        } else {
          burstBufferRef.current = e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cartItems.length, handleProcessBarcodeScan]);

  // 6. Complete Sale Execution
  const handleConfirmSale = async (payment: {
    method: 'cash' | 'card';
    amountTendered?: string;
  }) => {
    if (cartItems.length === 0) {
      toast.error('Cart cannot be empty');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await completeSale({
        items: cartItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        paymentMethod: payment.method,
        amountTendered: payment.amountTendered,
        discountType: discount.type,
        discountValue: discount.value,
        customerName: customerInfo.name.trim() || undefined,
        customerPhone: customerInfo.phone.trim() || undefined,
        vehicleNo: customerInfo.vehicleNo.trim() || undefined,
      });

      if (!res.success || !res.data) {
        toast.error(res.error || 'Failed to complete sale', { duration: 4000 });
        setIsSubmitting(false);
        return;
      }

      // Success: Clear cart & storage
      setCartItems([]);
      setDiscount({ type: 'none', value: '0' });
      setCustomerInfo({ name: '', phone: '', vehicleNo: '' });
      localStorage.removeItem(CART_STORAGE_KEY);

      // Close payment dialog and open success dialog
      setIsPaymentOpen(false);
      setCompletedSale(res.data);
      setIsSuccessOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout encountered an error';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewSale = () => {
    setIsSuccessOpen(false);
    setCompletedSale(null);
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 50);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] min-h-[600px] gap-3">
      {/* Keyboard Shortcut Hints Bar */}
      <div className="flex items-center justify-between rounded-lg border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow-2xs shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>POS Register</span>
          </span>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              F2
            </kbd>
            <span>Search</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              ↑ / ↓
            </kbd>
            <span>Select</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              Enter
            </kbd>
            <span>Add to Cart</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              F4
            </kbd>
            <span>Discount</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              F9
            </kbd>
            <span>Pay & Complete</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              Esc
            </kbd>
            <span>Close</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px]">
          <span>Role:</span>
          <span className="font-semibold uppercase text-foreground">{isOwner ? 'Owner' : 'Cashier'}</span>
          {!isOwner && <span>(Max discount: {cashierMaxDiscountPct}%)</span>}
        </div>
      </div>

      {/* Main Split Grid (Search Left, Cart Right) */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* Left Column: Search & Results (7 columns on large desktop, 6 on medium) */}
        <div className="h-full min-h-[350px] lg:col-span-7 xl:col-span-7 overflow-hidden">
          <CheckoutSearchPanel
            initialProducts={initialProducts}
            vehicleMakes={vehicleMakes}
            onAddToCart={handleAddToCart}
            onProcessBarcodeScan={handleProcessBarcodeScan}
            searchInputRef={searchInputRef}
          />
        </div>

        {/* Right Column: Cart, Customer, Totals & Pay (5 columns) */}
        <div className="h-full min-h-[350px] lg:col-span-5 xl:col-span-5 overflow-hidden">
          <CheckoutCartPanel
            items={cartItems}
            customerInfo={customerInfo}
            onUpdateCustomerInfo={setCustomerInfo}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            subtotal={subtotal}
            discount={discount}
            discountAmount={discountAmount}
            total={total}
            onOpenDiscount={() => setIsDiscountOpen(true)}
            onOpenPayment={() => setIsPaymentOpen(true)}
          />
        </div>
      </div>

      {/* F4 Discount Modal */}
      <DiscountDialog
        open={isDiscountOpen}
        onOpenChange={setIsDiscountOpen}
        subtotal={subtotal}
        currentDiscount={discount}
        onApplyDiscount={setDiscount}
        isOwner={isOwner}
        cashierMaxDiscountPct={cashierMaxDiscountPct}
      />

      {/* F9 Payment Modal */}
      <PaymentDialog
        open={isPaymentOpen}
        onOpenChange={setIsPaymentOpen}
        total={total}
        subtotal={subtotal}
        discountAmount={discountAmount}
        itemCount={cartItems.reduce((acc, curr) => acc + curr.quantity, 0)}
        onConfirmSale={handleConfirmSale}
        isSubmitting={isSubmitting}
      />

      {/* Sale Success Modal */}
      <SaleSuccessDialog
        open={isSuccessOpen}
        onOpenChange={setIsSuccessOpen}
        saleData={completedSale}
        onNewSale={handleNewSale}
      />

      {/* Owner Link Barcode Modal */}
      <LinkBarcodeDialog
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        barcode={unlinkedBarcode || ''}
        qty={unlinkedQty}
        onLinkedAndAdded={(product, q) => handleAddToCart(product, q)}
      />
    </div>
  );
}
