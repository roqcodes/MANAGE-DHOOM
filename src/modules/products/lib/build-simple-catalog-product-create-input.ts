import { roundMoney as roundMoney2 } from "@/lib/decimal-precision";
import { coalesceNumber } from "@/lib/numeric-input";
import type {
  CatalogProductVariantCreateInput,
  CreateCatalogProductInput,
} from "@/modules/products/types/product-create-result";

/** ERP fields stored on product / first variant — same rules as the products page. */
export function normalizeCatalogProductErpFields(input: {
  barcode?: string | null;
  productCode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
  unitId?: string | null;
  markupPercent?: number | null;
}): Pick<
  CatalogProductVariantCreateInput,
  | "barcode"
  | "productCode"
  | "purchasePrice"
  | "taxRatePercent"
  | "unitId"
  | "markupPercent"
> {
  return {
    barcode: (input.barcode ?? "").trim() || null,
    productCode: (input.productCode ?? "").trim() || null,
    purchasePrice:
      coalesceNumber(input.purchasePrice) > 0
        ? roundMoney2(coalesceNumber(input.purchasePrice))
        : null,
    taxRatePercent:
      coalesceNumber(input.taxRatePercent) > 0
        ? roundMoney2(coalesceNumber(input.taxRatePercent))
        : null,
    unitId: input.unitId ?? null,
    markupPercent:
      coalesceNumber(input.markupPercent) > 0
        ? roundMoney2(coalesceNumber(input.markupPercent))
        : null,
  };
}

export type NewItemCreatePricingResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * New catalog item create only (products page + purchase quick-create).
 * Not used on purchase/sales invoices.
 */
export function validateNewItemCreatePricing(
  salesPrice: number,
  purchasePrice: number,
): NewItemCreatePricingResult {
  const sales = coalesceNumber(salesPrice);
  const purchase = coalesceNumber(purchasePrice);

  if (sales <= 0) {
    return {
      ok: false,
      message: "Sales price is required when creating a new item.",
    };
  }
  if (purchase <= 0) {
    return {
      ok: false,
      message: "Purchase price is required when creating a new item.",
    };
  }

  const salesRounded = roundMoney2(sales);
  const purchaseRounded = roundMoney2(purchase);
  if (salesRounded <= purchaseRounded) {
    return {
      ok: false,
      message: "Sales price must be greater than purchase price.",
    };
  }

  return { ok: true };
}

/** @deprecated Use validateNewItemCreatePricing for create flows. */
export function hasSimpleProductPricingSignal(
  defaultPrice: number,
  purchasePrice: number,
): boolean {
  return (
    coalesceNumber(defaultPrice) > 0 || coalesceNumber(purchasePrice) > 0
  );
}

export function shouldEnsureDefaultVariantForSimpleProduct(
  defaultPrice: number,
  purchasePrice: number,
): boolean {
  return validateNewItemCreatePricing(defaultPrice, purchasePrice).ok;
}

export function isNewItemSimpleCreatePricingValid(
  defaultPrice: number,
  purchasePrice: number,
): boolean {
  return validateNewItemCreatePricing(defaultPrice, purchasePrice).ok;
}

export function newItemSimpleCreatePricingMessage(
  defaultPrice: number,
  purchasePrice: number,
): string {
  const result = validateNewItemCreatePricing(defaultPrice, purchasePrice);
  return result.ok
    ? ""
    : result.message;
}

export function newItemVariantLayoutPurchaseRequiredMessage(): string {
  return "Purchase price is required on the Details tab when creating a new item.";
}

export type SimpleCatalogProductCreateFields = {
  operationId: string;
  name: string;
  description?: string;
  categoryId?: string | null;
  brandId?: string | null;
  imageUrl?: string | null;
  variantLayout?: "flat" | "grouped";
  imageUrls?: string[];
  videoUrls?: string[];
  itemType?: "goods" | "service";
  hsnSac?: string | null;
  defaultPrice?: number;
  defaultMrp?: number;
  barcode?: string | null;
  productCode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
  unitId?: string | null;
  markupPercent?: number | null;
};

/** Payload for a simple product (no variant rows) — used by products page and purchase quick-create. */
export function buildSimpleCatalogProductCreateInput(
  fields: SimpleCatalogProductCreateFields,
): CreateCatalogProductInput {
  const erp = normalizeCatalogProductErpFields(fields);
  const defaultPrice = coalesceNumber(fields.defaultPrice);
  const purchasePrice = coalesceNumber(fields.purchasePrice);
  const defaultMrp = coalesceNumber(fields.defaultMrp);

  return {
    operationId: fields.operationId.trim(),
    name: fields.name.trim(),
    description: (fields.description ?? "").trim(),
    categoryId: fields.categoryId ?? null,
    brandId: fields.brandId ?? null,
    imageUrl: fields.imageUrl ?? null,
    variantLayout: fields.variantLayout ?? "flat",
    imageUrls: fields.imageUrls,
    videoUrls: fields.videoUrls,
    itemType: fields.itemType ?? "goods",
    hsnSac: (fields.hsnSac ?? "").trim() || null,
    price: defaultPrice > 0 ? roundMoney2(defaultPrice) : null,
    mrp: defaultMrp > 0 ? roundMoney2(defaultMrp) : null,
    barcode: erp.barcode,
    purchasePrice: erp.purchasePrice,
    taxRatePercent: erp.taxRatePercent,
    setup: {
      mode: "simple",
      ensureDefaultVariant: shouldEnsureDefaultVariantForSimpleProduct(
        defaultPrice,
        purchasePrice,
      ),
    },
  };
}
