/** Predefined product spec keys — admin multiselect + value per product. */
export const PRODUCT_SPEC_CATALOG = [
  { key: "warranty", label: "Warranty", placeholder: "e.g. 12 Months Brand" },
  { key: "condition", label: "Condition", placeholder: "e.g. Brand New" },
  { key: "product_type", label: "Type", placeholder: "e.g. Electronic" },
  { key: "authenticity", label: "Authenticity", placeholder: "e.g. 100% Genuine" },
  { key: "material", label: "Material", placeholder: "e.g. Stainless Steel" },
  { key: "origin", label: "Country of Origin", placeholder: "e.g. India" },
  { key: "weight", label: "Weight", placeholder: "e.g. 250 g" },
  { key: "dimensions", label: "Dimensions", placeholder: "e.g. 10 × 5 × 2 cm" },
  { key: "color", label: "Color", placeholder: "e.g. Black" },
  { key: "power", label: "Power / Voltage", placeholder: "e.g. 220V, 60W" },
] as const;

export type ProductSpecKey = (typeof PRODUCT_SPEC_CATALOG)[number]["key"];

export type ProductSpecs = Partial<Record<ProductSpecKey, string>>;

export function normalizeProductSpecs(raw: unknown): ProductSpecs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = new Set(PRODUCT_SPEC_CATALOG.map((s) => s.key));
  const out: ProductSpecs = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key as ProductSpecKey)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) out[key as ProductSpecKey] = trimmed;
  }
  return out;
}

export function specsCatalogEntry(key: string) {
  return PRODUCT_SPEC_CATALOG.find((s) => s.key === key);
}

/** Ordered list of filled specs for display. */
export function listFilledSpecs(specs: ProductSpecs) {
  return PRODUCT_SPEC_CATALOG.filter((s) => specs[s.key]?.trim()).map((s) => ({
    key: s.key,
    label: s.label,
    value: specs[s.key]!.trim(),
  }));
}
