/** Consistent short document refs derived from UUID primary keys. */

export type ErpDocKind =
  | "INV"
  | "EST"
  | "SO"
  | "CN"
  | "PB"
  | "PO"
  | "VC"
  | "EXP"
  | "PR"
  | "PM"
  | "CPM"
  | "SPM"
  | "SA"
  | "TR"
  | "ST"
  | "TP"
  | "JE"
  | "FA"
  | "VR"
  | "VP"
  | "PW";

const DEFAULT_CODE_LENGTH = 5;

/** Uppercase alphanumeric code from a UUID (default 5 chars). */
export function erpShortCode(id: string, length = DEFAULT_CODE_LENGTH): string {
  if (!id) return "—".padEnd(length, "—").slice(0, length);
  const clean = id.replace(/-/g, "").toUpperCase();
  return clean.slice(0, length);
}

/** Prefixed ref e.g. PO-9CCA1, PB-A3F2B. */
export function formatErpDocRef(kind: ErpDocKind, id: string, length = DEFAULT_CODE_LENGTH): string {
  return `${kind}-${erpShortCode(id, length)}`;
}

const ERP_DOC_REF_PATTERN = /^[A-Z]{2,3}-[A-F0-9]{5}$/i;

/** Prefer DB-stored number when already standardized; else derive from id. */
export function displayErpDocumentNumber(
  stored: string | null | undefined,
  kind: ErpDocKind,
  id: string,
): string {
  const normalized = stored?.trim().toUpperCase();
  if (normalized && ERP_DOC_REF_PATTERN.test(normalized)) return normalized;
  return formatErpDocRef(kind, id);
}

/** Compact hash ref e.g. #9CCA1 (used in dense tables). */
export function formatErpHashRef(id: string, length = DEFAULT_CODE_LENGTH): string {
  return `#${erpShortCode(id, length)}`;
}

/** Display ref for list cells; optional title shows legacy sequential number. */
export function erpDocRefLabel(
  kind: ErpDocKind,
  id: string,
  legacyNumber?: string | null,
): { label: string; title?: string } {
  const label = formatErpDocRef(kind, id);
  if (legacyNumber && legacyNumber !== label) {
    return { label, title: legacyNumber };
  }
  return { label };
}

/** Match PO panel helper — now 5 chars for consistency. */
export function shortPoRef(id: string): string {
  return erpShortCode(id);
}

export type ParsedErpDocRefSearch = {
  raw: string;
  code: string | null;
  kind: string | null;
};

/** Parse PB-9CCA1, PO9CCA1, #9CCA1, or bare 9CCA1 from a search box. */
export function parseErpDocRefSearch(term: string): ParsedErpDocRefSearch {
  const raw = term.trim();
  if (!raw) return { raw, code: null, kind: null };

  const upper = raw.toUpperCase();

  const dashed = upper.match(/^([A-Z]{2,3})-([A-F0-9]{3,8})$/);
  if (dashed) {
    return { raw, kind: dashed[1], code: dashed[2].slice(0, DEFAULT_CODE_LENGTH) };
  }

  const glued = upper.match(/^([A-Z]{2,3})([A-F0-9]{3,8})$/);
  if (glued) {
    return { raw, kind: glued[1], code: glued[2].slice(0, DEFAULT_CODE_LENGTH) };
  }

  const hash = upper.match(/^#?([A-F0-9]{3,8})$/);
  if (hash) {
    return { raw, code: hash[1].slice(0, DEFAULT_CODE_LENGTH), kind: null };
  }

  return { raw, code: null, kind: null };
}

/** Client/server: does this row id match an ERP ref search term? */
export function erpDocRefMatchesSearch(
  id: string,
  term: string,
  kind?: ErpDocKind | null,
): boolean {
  const q = term.trim();
  if (!q) return true;

  const parsed = parseErpDocRefSearch(q);
  const code = erpShortCode(id).toLowerCase();

  if (parsed.code) {
    if (parsed.kind && kind && parsed.kind !== kind) return false;
    return code.startsWith(parsed.code.toLowerCase());
  }

  const lower = q.toLowerCase();
  if (kind && formatErpDocRef(kind, id).toLowerCase().includes(lower)) return true;
  return code.includes(lower.replace(/^#/, ""));
}

/** Match legacy number, formatted ref, or extra text fields. */
export function erpLegacyOrRefMatches(
  id: string,
  kind: ErpDocKind,
  legacyNumber: string | null | undefined,
  term: string,
  extraHaystack: Array<string | null | undefined> = [],
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (erpDocRefMatchesSearch(id, term, kind)) return true;
  if (legacyNumber?.toLowerCase().includes(q)) return true;
  return extraHaystack.some((s) => s?.toLowerCase().includes(q));
}
