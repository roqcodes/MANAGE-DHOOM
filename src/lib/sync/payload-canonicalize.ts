/**
 * Deterministic JSON serialization for payload hashing (key order stable).
 */
export function canonicalizePayload(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** Stable object for hashing + IndexedDB (drops undefined, consistent key order via JSON round-trip). */
export function normalizeOutboxPayload(value: unknown): unknown {
  return JSON.parse(canonicalizePayload(value)) as unknown;
}

/**
 * Matches PostgreSQL `erp_canonical_jsonb(payload)::text` (spaces after `:` and `, `).
 * Used for SHA-256 payload hashes shared with `public.erp_payload_hash`.
 */
export function canonicalizePayloadForErpHash(value: unknown): string {
  return jsonbTextLikeStringify(sortValue(value));
}

function jsonbTextLikeStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite number in ERP payload");
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[${value.map((item) => jsonbTextLikeStringify(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length === 0) {
      return "{}";
    }
    return `{${keys
      .map((key) => `${JSON.stringify(key)}: ${jsonbTextLikeStringify(record[key])}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value);
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = sortValue(record[key]);
  }
  return out;
}
