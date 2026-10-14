import type { Metadata } from 'next';
import { requireUser } from '@/src/lib/auth-guards';
import { getCheckoutInitialData } from '@/src/data/checkout';
import { CheckoutTerminal } from '@/components/checkout/checkout-terminal';

export const metadata: Metadata = {
  title: 'Checkout Register | AutoParts POS',
  description: 'Fast keyboard-driven point of sale billing and checkout.',
};

export default async function CheckoutPage() {
  const { user } = await requireUser();
  const initialData = await getCheckoutInitialData();

  return (
    <div className="h-full">
      <CheckoutTerminal
        initialProducts={initialData.initialProducts}
        vehicleMakes={initialData.vehicleMakes}
        isOwner={user.role === 'owner'}
        cashierMaxDiscountPct={initialData.settings.cashierMaxDiscountPct}
      />
    </div>
  );
}
