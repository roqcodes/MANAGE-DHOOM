import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Json } from "@/lib/integrations/supabase/types";
import type { AuditLogEntry, ErpContext, LogAuditEventInput } from "@/common/erp/types";
import { normalizeAuditEntityId } from "@/lib/erp/audit-entity-id";
import {
  formatAuditActionLabel,
  formatAuditEntityLabel,
} from "@/modules/erp/lib/audit-log-display";

const AUDIT_LOG_SELECT = `
  *,
  users:users!audit_logs_user_fkey (
    id,
    name,
    email,
    role
  )
`;

type AuditLogUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

type AuditLogDbRow = Omit<
  AuditLogEntry,
  "user_name" | "user_email" | "user_role" | "metadata" | "old_data" | "new_data"
> & {
  metadata: Json;
  old_data: Json | null;
  new_data: Json | null;
  users?: AuditLogUserRow | AuditLogUserRow[] | null;
};

function mapAuditLogRow(row: AuditLogDbRow): AuditLogEntry {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;

  return {
    id: row.id,
    user_id: row.user_id,
    user_name: user?.name ?? null,
    user_email: user?.email ?? null,
    user_role: user?.role ?? null,
    store_id: row.store_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    description: row.description,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    old_data: (row.old_data as Record<string, unknown> | null) ?? null,
    new_data: (row.new_data as Record<string, unknown> | null) ?? null,
    created_at: row.created_at,
  };
}

/** Request-scoped: one get_erp_context RPC per server render / API handler. */
export const getErpContext = cache(async (userId?: string): Promise<ErpContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_erp_context",
    userId ? { p_user_id: userId } : {},
  );

  if (error) {
    console.error("get_erp_context failed:", error);
    return null;
  }

  return data as unknown as ErpContext;
});

export async function logAuditEvent(input: LogAuditEventInput): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  let userId = input.userId ?? null;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) {
    console.error("log_audit_event skipped: no authenticated user");
    return null;
  }

  const normalized = normalizeAuditEntityId(input.entityId, input.metadata ?? {});

  const { data, error } = await supabase.rpc("log_audit_event", {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: normalized.entityId ?? undefined,
    p_description: input.description ?? undefined,
    p_metadata: normalized.metadata as Json,
    p_old_data: input.oldData as Json | undefined,
    p_new_data: input.newData as Json | undefined,
    p_store_id: input.storeId ?? undefined,
    p_user_id: userId,
  });

  if (error) {
    console.error("log_audit_event failed:", error.message, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    });
    return null;
  }

  return data as string;
}

/** Use after financial writes when an activity row must exist (throws if logging fails). */
export async function logAuditEventRequired(input: LogAuditEventInput): Promise<string> {
  const id = await logAuditEvent(input);
  if (!id) {
    throw new Error("Activity log could not be recorded. Try again or contact support.");
  }
  return id;
}

export async function listRecentAuditLogs(limit = 10): Promise<AuditLogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(AUDIT_LOG_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listRecentAuditLogs failed:", error);
    return [];
  }

  return (data ?? []).map((row) => mapAuditLogRow(row as AuditLogDbRow));
}

export async function listAuditLogs(filters?: {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  page?: number;
  limit?: number;
  skipCount?: boolean;
}): Promise<{ data: AuditLogEntry[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const page = filters?.page ?? 0;
  const limit = filters?.limit ?? 50;
  const from = page * limit;

  let query = filters?.skipCount
    ? supabase
        .from("audit_logs")
        .select(AUDIT_LOG_SELECT)
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1)
    : supabase
        .from("audit_logs")
        .select(AUDIT_LOG_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1);

  if (filters?.storeId) query = query.eq("store_id", filters.storeId);
  if (filters?.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters?.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => mapAuditLogRow(row as AuditLogDbRow)),
    total: count ?? 0,
  };
}

const ACTIVITY_LOG_REPORT_SELECT = `
  *,
  users:users!audit_logs_user_fkey (
    id,
    name,
    email,
    role
  ),
  stores:stores!audit_logs_store_id_fkey (
    name
  )
`;

type ActivityLogReportDbRow = AuditLogDbRow & {
  stores?: { name: string | null } | { name: string | null }[] | null;
};

function auditEntityReferenceFromRow(
  entityId: string | null,
  metadata: Record<string, unknown>,
): string {
  const keys = [
    "payment_number",
    "bulk_number",
    "batch_ref",
    "reference",
    "invoice_number",
    "purchase_bill_number",
    "estimate_number",
    "credit_note_number",
    "po_number",
    "order_number",
    "document_number",
    "expense_number",
    "journal_number",
  ];
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (entityId) return entityId.slice(0, 8);
  return "—";
}

function mapActivityLogReportRow(row: ActivityLogReportDbRow): Record<string, unknown> {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const entityType = row.entity_type ?? "";
  const action = row.action ?? "";

  return {
    id: row.id,
    created_at: row.created_at,
    action,
    entity_type: entityType,
    entity_id: row.entity_id,
    description: row.description,
    store_id: row.store_id,
    store_name: store?.name ?? null,
    user_id: user?.id ?? row.user_id,
    user_name: user?.name?.trim() || user?.email?.trim() || "Unknown user",
    user_email: user?.email ?? null,
    entity_reference: auditEntityReferenceFromRow(row.entity_id, metadata),
    entity_label: formatAuditEntityLabel(entityType),
    metadata,
    activity_label:
      action === "update" && Array.isArray(metadata.changes) && metadata.changes[0]
        ? String(metadata.changes[0])
        : formatAuditActionLabel(action),
  };
}

/** Activity log report rows (same shape as `get_erp_activity_log_report` RPC). */
export async function listActivityLogReportRows(filters: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  search?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const supabase = await createSupabaseServerClient();
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 1000);
  const search = filters.search?.trim().toLowerCase() ?? "";

  let query = supabase
    .from("audit_logs")
    .select(ACTIVITY_LOG_REPORT_SELECT)
    .gte("created_at", `${filters.dateFrom}T00:00:00`)
    .lte("created_at", `${filters.dateTo}T23:59:59.999`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.storeId) query = query.eq("store_id", filters.storeId);
  if (filters.entityType && filters.entityType !== "all") {
    query = query.eq("entity_type", filters.entityType);
  }
  if (filters.action && filters.action !== "all") {
    query = query.eq("action", filters.action);
  }
  if (filters.userId && filters.userId !== "all") {
    query = query.eq("user_id", filters.userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map((row) =>
    mapActivityLogReportRow(row as ActivityLogReportDbRow),
  );

  if (search) {
    rows = rows.filter((row) => {
      const haystack = [
        row.description,
        row.user_name,
        row.user_email,
        row.store_name,
        row.entity_reference,
        row.entity_label,
        row.activity_label,
      ]
        .filter((part) => typeof part === "string" && part.length > 0)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  return rows;
}

export async function listAuditLogsForEntity(
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<AuditLogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const trimmed = entityId.trim();
  const { entityId: lookupId } = normalizeAuditEntityId(trimmed);

  let query = supabase
    .from("audit_logs")
    .select(AUDIT_LOG_SELECT)
    .eq("entity_type", entityType);

  if (lookupId) {
    query = query.eq("entity_id", lookupId);
  } else {
    query = query.or(
      `metadata->>batch_ref.eq.${trimmed},metadata->>reference.eq.${trimmed}`,
    );
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listAuditLogsForEntity failed:", error);
    return [];
  }

  return (data ?? []).map((row) => mapAuditLogRow(row as AuditLogDbRow));
}
