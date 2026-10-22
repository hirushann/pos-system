'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/src/lib/auth-guards';
import {
  createSupplierOp,
  updateSupplierOp,
  deleteSupplierOp,
  createInvoiceOp,
  updateInvoiceOp,
  deleteInvoiceOp,
  recordPaymentOp,
  setChequeStatusOp,
  deletePaymentOp,
  savePriceItemOp,
  deletePriceItemOp,
  createReturnOp,
  deleteReturnOp,
  recordRefundOp,
  deleteRefundOp,
  applyCreditOp,
  type OpResult,
} from '@/src/lib/supplier-ops';
import { getPurchaseHint, searchPurchaseProducts } from '@/src/data/suppliers';

// Thin owner-only wrappers. The logic (and its tests) live in src/lib/supplier-ops.ts.

function refresh<T>(res: OpResult<T>): OpResult<T> {
  if (res.success) {
    revalidatePath('/suppliers', 'layout');
    // invoices and returns move stock, so the pages that show stock must refresh too
    revalidatePath('/products');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');
  }
  return res;
}

export async function createSupplier(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await createSupplierOp(input, user));
}

export async function updateSupplier(id: number, input: unknown) {
  const { user } = await requireOwner();
  return refresh(await updateSupplierOp(id, input, user));
}

export async function deleteSupplier(id: number) {
  const { user } = await requireOwner();
  return refresh(await deleteSupplierOp(id, user));
}

export async function createSupplierInvoice(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await createInvoiceOp(input, user));
}

export async function updateSupplierInvoice(id: number, input: unknown) {
  const { user } = await requireOwner();
  return refresh(await updateInvoiceOp(id, input, user));
}

export async function deleteSupplierInvoice(id: number) {
  const { user } = await requireOwner();
  return refresh(await deleteInvoiceOp(id, user));
}

export async function recordSupplierPayment(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await recordPaymentOp(input, user));
}

export async function setSupplierChequeStatus(paymentId: number, status: 'pending' | 'cleared' | 'bounced') {
  const { user } = await requireOwner();
  return refresh(await setChequeStatusOp(paymentId, status, user));
}

export async function deleteSupplierPayment(paymentId: number) {
  const { user } = await requireOwner();
  return refresh(await deletePaymentOp(paymentId, user));
}

export async function saveSupplierPriceItem(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await savePriceItemOp(input, user));
}

export async function deleteSupplierPriceItem(id: number) {
  const { user } = await requireOwner();
  return refresh(await deletePriceItemOp(id, user));
}

export async function createSupplierReturn(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await createReturnOp(input, user));
}

export async function deleteSupplierReturn(returnId: number) {
  const { user } = await requireOwner();
  return refresh(await deleteReturnOp(returnId, user));
}

export async function recordSupplierRefund(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await recordRefundOp(input, user));
}

export async function deleteSupplierRefund(refundId: number) {
  const { user } = await requireOwner();
  return refresh(await deleteRefundOp(refundId, user));
}

export async function applySupplierCredit(input: unknown) {
  const { user } = await requireOwner();
  return refresh(await applyCreditOp(input, user));
}

// Read-only helpers for the invoice form (owner only)
export async function searchPurchaseProductsAction(query: string) {
  await requireOwner();
  return searchPurchaseProducts(String(query ?? '').slice(0, 100));
}

export async function getPurchaseHintAction(productId: number, supplierId: number) {
  await requireOwner();
  return getPurchaseHint(Number(productId), Number(supplierId));
}
