/** Product-first ERP: match PO lines to bill lines by product_id, with variant_id fallback. */

export type PoLineMatchInput = {
  variant_id?: string | null;
  product_id?: string | null;
  product_variants?: { product_id?: string | null } | null;
};

export type BillLineMatchInput = {
  variant_id?: string | null;
  product_id?: string | null;
};

export function resolvePoLineProductId(line: PoLineMatchInput): string | null {
  return line.product_id ?? line.product_variants?.product_id ?? null;
}

/** Prefer product_id (canonical for ERP docs); fall back to variant_id for legacy rows. */
export function matchPoLineToBillLine(
  poLine: PoLineMatchInput,
  billLine: BillLineMatchInput,
): boolean {
  const poProductId = resolvePoLineProductId(poLine);
  if (poProductId && billLine.product_id === poProductId) return true;
  if (poLine.variant_id && billLine.variant_id === poLine.variant_id) return true;
  return false;
}
