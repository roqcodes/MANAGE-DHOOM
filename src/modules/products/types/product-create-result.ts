export type ProductCreateStage =
  | "product"
  | "variants"
  | "default_variant"
  | "media"
  | "cache";

export type ProductCreateResultStatus =
  | "success"
  | "partial"
  | "failed";

export type ProductCreateResult = {
  status: ProductCreateResultStatus;
  /** Set when the product row exists or idempotent replay found one. */
  productId?: string;
  /** Admin path to open the product when setup is incomplete. */
  openProductHref?: string;
  /** User-safe summary. */
  message: string;
  /** Failed or skipped optional step. */
  stage?: ProductCreateStage;
  warnings?: string[];
  /** True when this response is a replay of the same operation id. */
  replayed?: boolean;
};

export type CatalogProductVariantCreateInput = {
  name: string;
  price: number;
  mrp: number;
  stock?: number;
  imageUrls?: string[];
  barcode?: string | null;
  productCode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
  unitId?: string | null;
  markupPercent?: number | null;
};

export type CatalogProductGroupCreateInput = {
  name: string;
  sortOrder: number;
  variants: CatalogProductVariantCreateInput[];
};

export type CatalogProductCreateSetup =
  | { mode: "simple"; ensureDefaultVariant: boolean }
  | { mode: "flat"; variants: CatalogProductVariantCreateInput[] }
  | { mode: "grouped"; groups: CatalogProductGroupCreateInput[] };

export type CreateCatalogProductInput = {
  operationId: string;
  name: string;
  description: string;
  categoryId: string | null;
  brandId: string | null;
  imageUrl: string | null;
  variantLayout: "flat" | "grouped";
  imageUrls?: string[];
  videoUrls?: string[];
  itemType?: "goods" | "service";
  hsnSac?: string | null;
  price?: number | null;
  mrp?: number | null;
  barcode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
  setup: CatalogProductCreateSetup;
};
