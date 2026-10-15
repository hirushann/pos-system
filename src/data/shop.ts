import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { settings } from '@/src/db/schema';
import { DEFAULT_SHOP } from '@/src/lib/shop-defaults';

export interface ShopProfile {
  shopName: string;
  address: string | null;
  phone: string | null;
  receiptFooter: string | null;
}

/** Shop name, address, phone and footer for printed documents (any signed-in role). */
export async function getShopProfile(): Promise<ShopProfile> {
  const [row] = await db
    .select({
      shopName: settings.shopName,
      address: settings.address,
      phone: settings.phone,
      receiptFooter: settings.receiptFooter,
    })
    .from(settings)
    .where(eq(settings.id, 1));

  return (
    row ?? {
      shopName: DEFAULT_SHOP.shopName,
      address: DEFAULT_SHOP.address,
      phone: DEFAULT_SHOP.phone,
      receiptFooter: DEFAULT_SHOP.receiptFooter,
    }
  );
}
