import type { AddressHierarchyFilterParams } from "@/modules/customers/lib/address-hierarchy-filter";

const USER_ID_KEYS = ["customer_id", "user_id"] as const;

function rowMatchesUserIds(row: Record<string, unknown>, allowed: Set<string>): boolean {
  for (const key of USER_ID_KEYS) {
    const raw = row[key];
    if (typeof raw === "string" && allowed.has(raw)) return true;
  }
  return false;
}

function filterRowArray(rows: unknown[], allowed: Set<string>): unknown[] {
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    return rowMatchesUserIds(row as Record<string, unknown>, allowed);
  });
}

function filterNestedRankRows(
  section: Record<string, unknown> | undefined,
  allowed: Set<string>,
): Record<string, unknown> | undefined {
  if (!section) return section;
  const next: Record<string, unknown> = { ...section };
  for (const [key, value] of Object.entries(section)) {
    if (Array.isArray(value)) {
      next[key] = filterRowArray(value, allowed);
    }
  }
  return next;
}

/** Trim customer-linked report payloads after RPC when address filters are active. */
export function filterReportPayloadByUserIds(
  data: unknown,
  allowedUserIds: string[] | null,
): unknown {
  if (!allowedUserIds) return data;
  const allowed = new Set(allowedUserIds);
  if (allowed.size === 0) {
    if (Array.isArray(data)) return [];
    if (data && typeof data === "object" && Array.isArray((data as { rows?: unknown[] }).rows)) {
      return { ...(data as object), rows: [] };
    }
    return data;
  }

  if (Array.isArray(data)) {
    return filterRowArray(data, allowed);
  }

  if (!data || typeof data !== "object") return data;

  const obj = data as Record<string, unknown>;
  const next: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.rows)) {
    next.rows = filterRowArray(obj.rows, allowed);
  }

  if (obj.customers && typeof obj.customers === "object") {
    next.customers = filterNestedRankRows(
      obj.customers as Record<string, unknown>,
      allowed,
    );
  }

  return next;
}

export type { AddressHierarchyFilterParams };
