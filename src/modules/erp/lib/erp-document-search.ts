import "server-only";

import { parseErpDocRefSearch } from "@/lib/erp-document-ref";

/** Build a PostgREST `.or()` clause matching legacy columns and UUID short codes. */
export function buildErpDocumentSearchOr(
  search: string | undefined,
  legacyColumns: string[],
): string | undefined {
  const term = search?.trim();
  if (!term) return undefined;

  const parts = legacyColumns.map((col) => `${col}.ilike.%${term}%`);
  const parsed = parseErpDocRefSearch(term);
  if (parsed.code) {
    parts.push(`id.ilike.${parsed.code.toLowerCase()}%`);
  }

  return parts.join(",");
}
