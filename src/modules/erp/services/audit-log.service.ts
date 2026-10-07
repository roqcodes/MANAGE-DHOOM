import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Json } from "@/lib/integrations/supabase/types";
import type { AuditLogEntry, ErpContext, LogAuditEventInput } from "@/common/erp/types";

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

  const { data, error } = await supabase.rpc("log_audit_event", {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? undefined,
    p_description: input.description ?? undefined,
    p_metadata: (input.metadata ?? {}) as Json,
    p_old_data: input.oldData as Json | undefined,
    p_new_data: input.newData as Json | undefined,
    p_store_id: input.storeId ?? undefined,
    p_user_id: userId,
  });

  if (error) {
    console.error("log_audit_event failed:", error);
    return null;
  }

  return data as string;
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

export async function listAuditLogsForEntity(
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<AuditLogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(AUDIT_LOG_SELECT)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listAuditLogsForEntity failed:", error);
    return [];
  }

  return (data ?? []).map((row) => mapAuditLogRow(row as AuditLogDbRow));
}
