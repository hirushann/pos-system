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
  type OpResult,
} from '@/src/lib/supplier-ops';

// Thin owner-only wrappers. The logic (and its tests) live in src/lib/supplier-ops.ts.

function refresh<T>(res: OpResult<T>): OpResult<T> {
  if (res.success) revalidatePath('/suppliers', 'layout');
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
