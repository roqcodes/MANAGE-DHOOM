import "server-only";

import { cache } from "react";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
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
  ),
  erp_employees:erp_employees!audit_logs_salesman_id_fkey (
    id,
    full_name,
    mobile
  )
`;

/** When salesman FK still targets erp_salesmen (pre–employees migration). */
const AUDIT_LOG_SELECT_SALESMEN_TABLE = `
  *,
  users:users!audit_logs_user_fkey (
    id,
    name,
    email,
    role
  ),
  erp_salesmen:erp_salesmen!audit_logs_salesman_id_fkey (
    id,
    name,
    phone
  )
`;

const AUDIT_LOG_SELECT_USERS_ONLY = `
  *,
  users:users!audit_logs_user_fkey (
    id,
    name,
    email,
    role
  )
`;

const AUDIT_LOG_SELECT_VARIANTS = [
  AUDIT_LOG_SELECT,
  AUDIT_LOG_SELECT_SALESMEN_TABLE,
  AUDIT_LOG_SELECT_USERS_ONLY,
] as const;

type AuditLogUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

type AuditLogSalesmanRow = {
  id: string;
  full_name: string;
  mobile: string | null;
};

type AuditLogSalesmanLegacyRow = {
  id: string;
  name: string;
  phone: string | null;
};

type AuditLogDbRow = Omit<
  AuditLogEntry,
  "user_name" | "user_email" | "user_role" | "metadata" | "old_data" | "new_data"
> & {
  salesman_id?: string | null;
  metadata: Json;
  old_data: Json | null;
  new_data: Json | null;
  users?: AuditLogUserRow | AuditLogUserRow[] | null;
  erp_employees?: AuditLogSalesmanRow | AuditLogSalesmanRow[] | null;
  erp_salesmen?: AuditLogSalesmanLegacyRow | AuditLogSalesmanLegacyRow[] | null;
};

type AuditLogQueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

async function fetchAuditLogRows(
  runQuery: (select: string) => PromiseLike<AuditLogQueryResult>,
): Promise<AuditLogDbRow[]> {
  let lastError: string | null = null;

  for (const select of AUDIT_LOG_SELECT_VARIANTS) {
    const { data, error } = await runQuery(select);
    if (!error) {
      return (data ?? []) as AuditLogDbRow[];
    }
    lastError = error.message;
  }

  console.error("fetchAuditLogRows failed:", lastError);
  return [];
}

/** Document activity tabs use `invoice`; older rows may use `sales_invoice`. */
function auditEntityTypesForLookup(entityType: string): string[] {
  if (entityType === "invoice") {
    return ["invoice", "sales_invoice"];
  }
  return [entityType];
}

async function resolveSalesmanDisplayNames(salesmanIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(salesmanIds.filter(Boolean))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;

  const admin = createSupabaseAdminClient();
  const client = admin ?? (await createSupabaseServerClient());

  const { data: employees } = await client
    .from("erp_employees")
    .select("id, full_name")
    .in("id", unique);

  for (const row of employees ?? []) {
    const label = row.full_name?.trim();
    if (label) names.set(row.id, label);
  }

  const missing = unique.filter((id) => !names.has(id));
  if (missing.length > 0) {
    const { data: legacy } = await client
      .from("erp_salesmen")
      .select("id, name")
      .in("id", missing);
    for (const row of legacy ?? []) {
      const label = row.name?.trim();
      if (label) names.set(row.id, label);
    }
  }

  return names;
}

/** POS / durable-sync rows often have salesman_id only (user_id null); embeds can be RLS-hidden. */
async function enrichAuditLogEntries(
  entries: AuditLogEntry[],
  rawRows: AuditLogDbRow[],
): Promise<AuditLogEntry[]> {
  const salesmanIds: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i].user_name?.trim() && rawRows[i]?.salesman_id) {
      salesmanIds.push(rawRows[i].salesman_id as string);
    }
  }
  if (salesmanIds.length === 0) return entries;

  const names = await resolveSalesmanDisplayNames(salesmanIds);
  if (names.size === 0) return entries;

  return entries.map((entry, i) => {
    if (entry.user_name?.trim()) return entry;
    const sid = rawRows[i]?.salesman_id;
    const name = sid ? names.get(sid) : undefined;
    if (!name) return entry;
    return { ...entry, user_name: name };
  });
}

async function mapAndEnrichAuditLogRows(rawRows: AuditLogDbRow[]): Promise<AuditLogEntry[]> {
  const entries = rawRows.map((row) => mapAuditLogRow(row));
  return enrichAuditLogEntries(entries, rawRows);
}

function mapAuditLogRow(row: AuditLogDbRow): AuditLogEntry {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  const salesman = Array.isArray(row.erp_employees) ? row.erp_employees[0] : row.erp_employees;
  const salesmanLegacy = Array.isArray(row.erp_salesmen) ? row.erp_salesmen[0] : row.erp_salesmen;

  const user_name =
    salesman?.full_name?.trim() ||
    salesmanLegacy?.name?.trim() ||
    user?.name?.trim() ||
    null;
  const user_email = user?.email ?? null;

  return {
    id: row.id,
    user_id: row.user_id,
    user_name,
    user_email,
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

async function resolveAuditActorUserId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: LogAuditEventInput,
): Promise<string | null> {
  if (input.userId) return input.userId;
  const session = await getCurrentSessionProfile();
  if (session.user?.id) return session.user.id;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function insertAuditLogFallback(
  input: LogAuditEventInput,
  userId: string | null,
  salesmanId: string | null,
  normalized: ReturnType<typeof normalizeAuditEntityId>,
): Promise<string | null> {
  if (!userId && !salesmanId) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("audit_logs")
    .insert({
      user_id: salesmanId ? null : userId,
      salesman_id: salesmanId,
      store_id: input.storeId ?? null,
      action: String(input.action),
      entity_type: input.entityType,
      entity_id: normalized.entityId ?? null,
      description: input.description ?? null,
      metadata: normalized.metadata as Json,
      old_data: (input.oldData as Json) ?? null,
      new_data: (input.newData as Json) ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("audit_logs fallback insert failed:", error.message, {
      action: input.action,
      entityType: input.entityType,
    });
    return null;
  }
  return data?.id ?? null;
}

export async function logAuditEvent(input: LogAuditEventInput): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const salesmanId = input.salesmanId ?? null;
  const userId = salesmanId ? null : await resolveAuditActorUserId(supabase, input);

  if (!salesmanId && !userId) {
    console.error("log_audit_event skipped: no authenticated user");
    return null;
  }

  const normalized = normalizeAuditEntityId(input.entityId, input.metadata ?? {});

  // Always pass middle optional args as null so PostgREST picks the 10-arg overload
  // (9- and 10-arg signatures collide when p_old_data / p_new_data are omitted).
  const { data, error } = await supabase.rpc("log_audit_event", {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: normalized.entityId ?? undefined,
    p_description: input.description ?? undefined,
    p_metadata: (normalized.metadata as Json) ?? {},
    p_old_data: (input.oldData as Json) ?? null,
    p_new_data: (input.newData as Json) ?? null,
    p_store_id: input.storeId ?? undefined,
    p_user_id: salesmanId ? undefined : userId ?? undefined,
    p_salesman_id: salesmanId ?? undefined,
  });

  if (!error && data) {
    return data as string;
  }

  if (error) {
    console.error("log_audit_event failed:", error.message, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  return insertAuditLogFallback(input, userId, salesmanId, normalized);
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
  const rows = await fetchAuditLogRows((select) =>
    supabase
      .from("audit_logs")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  return mapAndEnrichAuditLogRows(rows);
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

  const rawRows = (data ?? []) as AuditLogDbRow[];
  return {
    data: await mapAndEnrichAuditLogRows(rawRows),
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
  erp_employees:erp_employees!audit_logs_salesman_id_fkey (
    id,
    full_name,
    mobile
  ),
  stores:stores!audit_logs_store_id_fkey (
    name
  )
`;

type ActivityLogReportDbRow = AuditLogDbRow & {
  stores?: { name: string | null } | { name: string | null }[] | null;
  erp_employees?:
    | { id: string; full_name: string; mobile: string | null }
    | { id: string; full_name: string; mobile: string | null }[]
    | null;
  salesman_id?: string | null;
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
  const salesman = Array.isArray(row.erp_employees) ? row.erp_employees[0] : row.erp_employees;
  const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const entityType = row.entity_type ?? "";
  const action = row.action ?? "";

  const displayName =
    salesman?.full_name?.trim() ||
    user?.name?.trim() ||
    user?.email?.trim() ||
    "Unknown user";

  return {
    id: row.id,
    created_at: row.created_at,
    action,
    entity_type: entityType,
    entity_id: row.entity_id,
    description: row.description,
    store_id: row.store_id,
    store_name: store?.name ?? null,
    user_id: salesman?.id ?? user?.id ?? row.user_id,
    user_name: displayName,
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
  salesmanId?: string;
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
    .order("created_at", { ascending: false });

  if (filters.storeId) query = query.eq("store_id", filters.storeId);
  if (filters.entityType && filters.entityType !== "all") {
    query = query.eq("entity_type", filters.entityType);
  }
  if (filters.action && filters.action !== "all") {
    query = query.eq("action", filters.action);
  }
  if (filters.userId && filters.userId !== "all") {
    query = query.or(`user_id.eq.${filters.userId},salesman_id.eq.${filters.userId}`);
  }
  if (filters.salesmanId) {
    query = query.eq("salesman_id", filters.salesmanId);
  }
  if (search) {
    const term = search.replace(/[%_,()]/g, " ").trim().slice(0, 80);
    if (term) {
      query = query.or(
        `description.ilike.%${term}%,entity_type.ilike.%${term}%,action.ilike.%${term}%`,
      );
    }
  }

  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) =>
    mapActivityLogReportRow(row as ActivityLogReportDbRow),
  );
}

async function listAuditLogsByPartyRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rpcName: "list_audit_log_ids_for_vendor_party" | "list_audit_log_ids_for_customer_party",
  partyId: string,
  limit: number,
  rpcArgKey: "p_vendor_id" | "p_user_id",
): Promise<AuditLogEntry[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const { data: idRows, error: rpcError } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(rpcName, {
    [rpcArgKey]: partyId.trim().toLowerCase(),
    p_limit: capped,
  });

  if (rpcError) {
    console.error(`${rpcName} failed:`, rpcError.message);
    return [];
  }

  const ids = ((idRows ?? []) as Array<{ id?: string }>)
    .map((row) => row.id)
    .filter((logId): logId is string => Boolean(logId));

  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("audit_logs")
    .select(AUDIT_LOG_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listAuditLogsByPartyRpc hydrate failed:", error.message);
    return [];
  }

  const rawRows = (data ?? []) as AuditLogDbRow[];
  const byId = new Map(rawRows.map((row) => [row.id, row]));
  const ordered = ids
    .map((logId) => byId.get(logId))
    .filter((row): row is AuditLogDbRow => Boolean(row));
  return mapAndEnrichAuditLogRows(ordered);
}

/** Bills, credits, payments, etc. are logged on their document type — not `vendor`. */
export async function listAuditLogsForVendorParty(
  vendorId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const supabase = await createSupabaseServerClient();
  return listAuditLogsByPartyRpc(
    supabase,
    "list_audit_log_ids_for_vendor_party",
    vendorId,
    limit,
    "p_vendor_id",
  );
}

/** Invoices, credit notes, and payments log on document types — not `customer` / `user`. */
export async function listAuditLogsForCustomerParty(
  userId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const supabase = await createSupabaseServerClient();
  return listAuditLogsByPartyRpc(
    supabase,
    "list_audit_log_ids_for_customer_party",
    userId,
    limit,
    "p_user_id",
  );
}

export async function listAuditLogsForEntity(
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<AuditLogEntry[]> {
  if (entityType === "vendor") {
    return listAuditLogsForVendorParty(entityId, Math.max(limit, 50));
  }
  if (entityType === "customer") {
    return listAuditLogsForCustomerParty(entityId, Math.max(limit, 50));
  }

  const supabase = await createSupabaseServerClient();
  const trimmed = entityId.trim();
  const { entityId: lookupId } = normalizeAuditEntityId(trimmed);
  const entityTypes = auditEntityTypesForLookup(entityType);

  const rows = await fetchAuditLogRows((select) => {
    let query = supabase.from("audit_logs").select(select).in("entity_type", entityTypes);

    if (lookupId) {
      query = query.eq("entity_id", lookupId);
    } else {
      query = query.or(
        `metadata->>batch_ref.eq.${trimmed},metadata->>reference.eq.${trimmed}`,
      );
    }

    return query.order("created_at", { ascending: false }).limit(limit);
  });

  return mapAndEnrichAuditLogRows(rows);
}
