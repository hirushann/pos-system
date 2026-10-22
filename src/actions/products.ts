'use server';

import * as ops from '@/src/lib/products-ops';

// Only these functions are public server actions. The logic lives in src/lib/products-ops.ts.

export async function createProduct(...args: Parameters<typeof ops.createProduct>): ReturnType<typeof ops.createProduct> {
  return ops.createProduct(...args);
}

export async function updateProduct(...args: Parameters<typeof ops.updateProduct>): ReturnType<typeof ops.updateProduct> {
  return ops.updateProduct(...args);
}

export async function deleteOrDeactivateProduct(...args: Parameters<typeof ops.deleteOrDeactivateProduct>): ReturnType<typeof ops.deleteOrDeactivateProduct> {
  return ops.deleteOrDeactivateProduct(...args);
}

export async function createCategory(...args: Parameters<typeof ops.createCategory>): ReturnType<typeof ops.createCategory> {
  return ops.createCategory(...args);
}

export async function createBrand(...args: Parameters<typeof ops.createBrand>): ReturnType<typeof ops.createBrand> {
  return ops.createBrand(...args);
}

export async function createVehicleMake(...args: Parameters<typeof ops.createVehicleMake>): ReturnType<typeof ops.createVehicleMake> {
  return ops.createVehicleMake(...args);
}

export async function createVehicleModel(...args: Parameters<typeof ops.createVehicleModel>): ReturnType<typeof ops.createVehicleModel> {
  return ops.createVehicleModel(...args);
}

export async function addManufacturerBarcode(...args: Parameters<typeof ops.addManufacturerBarcode>): ReturnType<typeof ops.addManufacturerBarcode> {
  return ops.addManufacturerBarcode(...args);
}

export async function removeManufacturerBarcode(...args: Parameters<typeof ops.removeManufacturerBarcode>): ReturnType<typeof ops.removeManufacturerBarcode> {
  return ops.removeManufacturerBarcode(...args);
}

export async function searchProductsForLabels(...args: Parameters<typeof ops.searchProductsForLabels>): ReturnType<typeof ops.searchProductsForLabels> {
  return ops.searchProductsForLabels(...args);
}

export async function getPreferredSupplierNames(...args: Parameters<typeof ops.getPreferredSupplierNames>): ReturnType<typeof ops.getPreferredSupplierNames> {
  return ops.getPreferredSupplierNames(...args);
}

export async function getInternalBarcode(...args: Parameters<typeof ops.getInternalBarcode>): ReturnType<typeof ops.getInternalBarcode> {
  return ops.getInternalBarcode(...args);
}

export type { CreateProductInput, UpdateProductInput } from '@/src/lib/products-ops';
