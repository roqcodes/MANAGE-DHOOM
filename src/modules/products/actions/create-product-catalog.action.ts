"use server";

import { createCatalogProduct } from "@/modules/products/services/create-product-catalog.service";
import type {
  CreateCatalogProductInput,
  ProductCreateResult,
} from "@/modules/products/types/product-create-result";

export async function createCatalogProductAction(
  input: CreateCatalogProductInput,
): Promise<ProductCreateResult> {
  return createCatalogProduct(input);
}
