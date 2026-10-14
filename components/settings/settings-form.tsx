'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Store, Receipt, Percent, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateSettings, type SettingsData } from '@/src/actions/settings';

interface SettingsFormProps {
  initialData: SettingsData;
}

export function SettingsForm({ initialData }: SettingsFormProps) {
  const router = useRouter();
  const [shopName, setShopName] = React.useState(initialData.shopName);
  const [address, setAddress] = React.useState(initialData.address || '');
  const [phone, setPhone] = React.useState(initialData.phone || '');
  const [receiptFooter, setReceiptFooter] = React.useState(initialData.receiptFooter || '');
  const [cashierMaxDiscountPct, setCashierMaxDiscountPct] = React.useState(
    initialData.cashierMaxDiscountPct,
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFieldErrors({});

    try {
      const res = await updateSettings({
        shopName,
        address: address || null,
        phone: phone || null,
        receiptFooter: receiptFooter || null,
        cashierMaxDiscountPct,
      });

      if (!res.success) {
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
        toast.error(res.error || 'Failed to update settings');
        return;
      }

      toast.success(res.message || 'Store settings updated successfully');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Store Identity */}
      <Card className="shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Shop Identity & Contact
          </CardTitle>
          <CardDescription className="text-xs">
            These details appear on printed invoices, receipt headers, and customer records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="shopName"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Shop Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="shopName"
              name="shopName"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Colombo Auto Spares & Parts"
              className="h-10 focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isSaving}
            />
            {fieldErrors.shopName && (
              <p className="text-xs text-destructive">{fieldErrors.shopName}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="phone"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Phone Number
              </label>
              <Input
                id="phone"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+94 11 234 5678"
                className="h-10 focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isSaving}
              />
              {fieldErrors.phone && (
                <p className="text-xs text-destructive">{fieldErrors.phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="address"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Physical Address
              </label>
              <Input
                id="address"
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="No. 142, Panchikawatta Road, Colombo 10"
                className="h-10 focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isSaving}
              />
              {fieldErrors.address && (
                <p className="text-xs text-destructive">{fieldErrors.address}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* POS & Discounts Policy */}
      <Card className="shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            Checkout & Discount Policies
          </CardTitle>
          <CardDescription className="text-xs">
            Control the maximum discount percentages cashiers are authorized to grant during checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 max-w-sm">
            <label
              htmlFor="cashierMaxDiscountPct"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Cashier Maximum Discount (%) <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                id="cashierMaxDiscountPct"
                name="cashierMaxDiscountPct"
                required
                type="text"
                value={cashierMaxDiscountPct}
                onChange={(e) => setCashierMaxDiscountPct(e.target.value)}
                placeholder="5.00"
                className="h-10 pr-8 font-mono focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isSaving}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                %
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cashiers cannot grant discounts exceeding this rate. Store owners have no discount cap.
            </p>
            {fieldErrors.cashierMaxDiscountPct && (
              <p className="text-xs text-destructive">{fieldErrors.cashierMaxDiscountPct}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Thermal Receipt Configuration */}
      <Card className="shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Receipt Layout & Policy Footer
          </CardTitle>
          <CardDescription className="text-xs">
            Customize the message printed at the bottom of 80mm thermal receipts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="receiptFooter"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Receipt Footer Note
            </label>
            <Textarea
              id="receiptFooter"
              name="receiptFooter"
              rows={3}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="Thank you for your purchase! Electrical parts are non-refundable. Other parts can be exchanged within 7 days with this bill."
              className="focus-visible:ring-2 focus-visible:ring-ring text-xs"
              disabled={isSaving}
            />
            {fieldErrors.receiptFooter && (
              <p className="text-xs text-destructive">{fieldErrors.receiptFooter}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSaving}
          className="h-10 px-6 font-semibold gap-2 shadow-sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Changes...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Settings</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
