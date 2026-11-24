type JsonRecord = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ID_FIELD_KEY_RE = /^(id|entity_id|line_id|.+_id)$/i;

export const DATE_LABEL_KEYS = [
  "report_date",
  "date",
  "day",
  "period_from",
  "month_label",
] as const;

export const CATEGORICAL_LABEL_KEYS = [
  "sales_person_name",
  "salesman_name",
  "vendor_name",
  "customer_name",
  "product_name",
  "store_name",
  "actor_name",
  "name",
  "invoice_number",
  "purchase_bill_number",
  "bill_number",
] as const;

export function looksLikeOpaqueId(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  return UUID_RE.test(s);
}

export function isIdentifierFieldKey(key: string): boolean {
  const k = key.trim();
  if (!k) return true;
  if (ID_FIELD_KEY_RE.test(k)) return true;
  return false;
}

export function columnHeaderLooksLikeId(label: string): boolean {
  const norm = label.trim().toLowerCase().replace(/\s+/g, "_");
  return isIdentifierFieldKey(norm) || /\b(id|uuid)\b/.test(label.toLowerCase());
}

function companionNameKeysFor(idKey: string): string[] {
  const k = idKey.toLowerCase();
  const out: string[] = [];
  if (k === "user_id") {
    out.push("customer_name", "actor_name", "user_name", "name");
  } else if (k === "sales_person_id" || k === "salesman_id") {
    out.push("sales_person_name", "salesman_name");
  } else if (k.endsWith("_id")) {
    out.push(idKey.replace(/_id$/i, "_name"));
  }
  return out;
}

export function resolveDisplayValue(
  row: JsonRecord,
  key: string,
): unknown {
  if (!isIdentifierFieldKey(key)) {
    const raw = row[key];
    if (looksLikeOpaqueId(raw)) return null;
    return raw;
  }
  for (const alt of companionNameKeysFor(key)) {
    const v = row[alt];
    if (v != null && String(v).trim() && !looksLikeOpaqueId(v)) return v;
  }
  return null;
}

export function humanColumnLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function columnScore(key: string, sample: JsonRecord): number {
  const lower = key.toLowerCase();
  if (lower.includes("name") || lower.includes("number")) return 0;
  if (lower.includes("date") || lower.endsWith("_at")) return 1;
  if (typeof sample[key] === "number") return 2;
  return 3;
}

/** Column keys safe for assistant tables (no raw identifiers). */
export function keysForDisplayTable(sample: JsonRecord, max = 5): string[] {
  const keys = Object.keys(sample).filter(
    (k) => !k.startsWith("_") && !isIdentifierFieldKey(k),
  );
  return [...keys]
    .sort((a, b) => columnScore(a, sample) - columnScore(b, sample))
    .slice(0, max);
}

export function pickCategoricalLabelKey(sample: JsonRecord): string | undefined {
  for (const k of CATEGORICAL_LABEL_KEYS) {
    const v = sample[k];
    if (v != null && String(v).trim() && !looksLikeOpaqueId(v)) return k;
  }
  for (const key of Object.keys(sample)) {
    if (isIdentifierFieldKey(key)) continue;
    if ((DATE_LABEL_KEYS as readonly string[]).includes(key)) continue;
    const v = sample[key];
    if (typeof v === "string" && v.trim() && !looksLikeOpaqueId(v)) return key;
  }
  return undefined;
}

export function coerceChartLabelKey(
  rows: JsonRecord[],
  preferred: string,
): string {
  const sample = rows[0] ?? {};
  if (
    !isIdentifierFieldKey(preferred) &&
    !looksLikeOpaqueId(sample[preferred])
  ) {
    return preferred;
  }
  return pickCategoricalLabelKey(sample) ?? preferred;
}

export function chartLabelFromRow(row: JsonRecord, labelKey: string): string {
  const resolved = resolveDisplayValue(row, labelKey);
  const v = resolved ?? row[labelKey];
  const s = String(v ?? "").trim();
  if (!s || looksLikeOpaqueId(s)) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}