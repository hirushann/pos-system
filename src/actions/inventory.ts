'use server';

import * as ops from '@/src/lib/inventory-ops';

// Only these functions are public server actions. The logic lives in src/lib/inventory-ops.ts.

export async function adjustStock(...args: Parameters<typeof ops.adjustStock>): ReturnType<typeof ops.adjustStock> {
  return ops.adjustStock(...args);
}

export type { AdjustStockInput } from '@/src/lib/inventory-ops';
