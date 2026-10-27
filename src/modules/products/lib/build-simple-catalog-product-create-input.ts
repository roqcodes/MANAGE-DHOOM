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

/** At least one of list or cost price — enough to value inventory / default a SKU. */
export function hasSimpleProductPricingSignal(
  defaultPrice: number,
  purchasePrice: number,
): boolean {
  return (
    coalesceNumber(defaultPrice) > 0 || coalesceNumber(purchasePrice) > 0
  );
}

/** Simple (no SKU rows) products: create default variant when any list or cost price is set. */
export function shouldEnsureDefaultVariantForSimpleProduct(
  defaultPrice: number,
  purchasePrice: number,
): boolean {
  return hasSimpleProductPricingSignal(defaultPrice, purchasePrice);
}

/** Products page: simple item needs cost or list price; SKU layouts only need a name. */
export function isCatalogSimpleProductPricingValid(
  defaultPrice: number,
  purchasePrice: number,
): boolean {
  return hasSimpleProductPricingSignal(defaultPrice, purchasePrice);
}

/** Purchase quick-create: cost is required (document context). */
export function isPurchaseQuickCreatePricingValid(purchasePrice: number): boolean {
  return coalesceNumber(purchasePrice) > 0;
}

export function catalogSimpleProductValidationMessage(isCreate: boolean): string {
  if (!isCreate) return "Product name is required.";
  return "Enter the product name and at least a sales price or purchase price—or add SKUs on the Variants tab. You can set sales price later before selling.";
}

export function purchaseQuickCreatePricingMessage(): string {
  return "Purchase price is required when creating a product from a purchase document.";
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
