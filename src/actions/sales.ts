'use server';

import * as ops from '@/src/lib/sales-ops';

// Only these functions are public server actions. The logic lives in src/lib/sales-ops.ts.

export async function searchPartsAction(...args: Parameters<typeof ops.searchPartsAction>): ReturnType<typeof ops.searchPartsAction> {
  return ops.searchPartsAction(...args);
}

export async function completeSale(...args: Parameters<typeof ops.completeSale>): ReturnType<typeof ops.completeSale> {
  return ops.completeSale(...args);
}

export async function getSaleReceiptData(...args: Parameters<typeof ops.getSaleReceiptData>): ReturnType<typeof ops.getSaleReceiptData> {
  return ops.getSaleReceiptData(...args);
}

export async function voidSale(...args: Parameters<typeof ops.voidSale>): ReturnType<typeof ops.voidSale> {
  return ops.voidSale(...args);
}

export async function deleteSale(...args: Parameters<typeof ops.deleteSale>): ReturnType<typeof ops.deleteSale> {
  return ops.deleteSale(...args);
}

export async function lookupBarcode(...args: Parameters<typeof ops.lookupBarcode>): ReturnType<typeof ops.lookupBarcode> {
  return ops.lookupBarcode(...args);
}

export async function setSaleChequeStatus(...args: Parameters<typeof ops.setSaleChequeStatus>): ReturnType<typeof ops.setSaleChequeStatus> {
  return ops.setSaleChequeStatus(...args);
}

export type { SearchPartsInput, CompleteSaleInput, ServerActionResult, CompleteSaleResultData, ReceiptData, VoidSaleInput, DeleteSaleInput, DeleteSaleResultData, BarcodeLookupResult } from '@/src/lib/sales-ops';
