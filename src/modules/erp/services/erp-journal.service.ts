import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  JournalEntryLineRow,
  JournalEntryListRow,
  SourceJournalGroup,
} from "@/common/erp/finance-types";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";

export async function listJournalEntries(
  page = 0,
  limit = 30,
  storeId?: string,
): Promise<{ data: JournalEntryListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(storeId);
  let query = supabase
    .from("journal_entries")
    .select(
      "id, journal_number, transaction_date, description, store_id, source_entity_type, source_entity_id, total_debit, total_credit, status, created_at, stores(name)",
      { count: "exact" },
    )
    .order("transaction_date", { ascending: false });
  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const rows: JournalEntryListRow[] = (data ?? []).map((row) => {
    const store = row.stores as { name: string } | null;
    return {
      id: row.id,
      journal_number: row.journal_number,
      transaction_date: row.transaction_date,
      description: row.description,
      store_name: store?.name ?? null,
      source_entity_type: row.source_entity_type,
      source_entity_id: row.source_entity_id,
      total_debit: Number(row.total_debit),
      total_credit: Number(row.total_credit),
      status: row.status,
      created_at: row.created_at,
    };
  });

  return { data: rows, total: count ?? 0 };
}

export async function getJournalEntryDetail(journalId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data: header, error } = await supabase
    .from("journal_entries")
    .select("*, stores(name)")
    .eq("id", journalId)
    .single();
  if (error) throw new Error(error.message);

  const { data: lines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("id, debit_amount, credit_amount, description, account_id")
    .eq("journal_entry_id", journalId)
    .order("line_order");
  if (linesError) throw new Error(linesError.message);

  const accountIds = [...new Set((lines ?? []).map((l) => l.account_id as string))];
  const accountById = new Map<string, { code: string; name: string }>();
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, code, name")
      .in("id", accountIds);
    for (const acc of accounts ?? []) {
      accountById.set(acc.id as string, {
        code: (acc.code as string) ?? "—",
        name: (acc.name as string) ?? "—",
      });
    }
  }

  const lineRows: JournalEntryLineRow[] = (lines ?? []).map((l) => {
    const acc = accountById.get(l.account_id as string);
    return {
      id: l.id,
      account_code: acc?.code ?? "—",
      account_name: acc?.name ?? "—",
      debit_amount: Number(l.debit_amount),
      credit_amount: Number(l.credit_amount),
      description: l.description,
    };
  });

  return { header, lines: lineRows };
}

export async function getJournalForSource(sourceType: string, sourceId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("id, journal_number, transaction_date, total_debit, total_credit")
    .eq("source_entity_type", sourceType)
    .eq("source_entity_id", sourceId)
    .eq("status", "posted")
    .maybeSingle();
  return data;
}

async function resolveJournalSourcePairs(
  sourceType: string,
  sourceId: string,
): Promise<Array<{ sourceType: string; sourceId: string }>> {
  const supabase = await createSupabaseServerClient();

  if (sourceType === "vendor_credit") {
    const { data: apps } = await supabase
      .from("erp_vendor_credit_applications")
      .select("id")
      .eq("vendor_credit_id", sourceId);
    return (apps ?? []).map((app) => ({
      sourceType: "vendor_credit_application",
      sourceId: app.id,
    }));
  }

  if (sourceType === "customer_payment_batch") {
    const ref = sourceId.startsWith("CBPB:") ? sourceId : `CBPB:${sourceId}`;
    const { data: payments } = await supabase
      .from("erp_customer_payments")
      .select("id")
      .eq("reference", ref)
      .eq("is_bulk", true);
    return (payments ?? []).map((payment) => ({
      sourceType: "customer_payment",
      sourceId: payment.id,
    }));
  }

  return [{ sourceType, sourceId }];
}

export async function getJournalGroupsForSource(
  sourceType: string,
  sourceId: string,
): Promise<SourceJournalGroup[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const pairs = await resolveJournalSourcePairs(sourceType, sourceId);
  if (pairs.length === 0) return [];

  const groups: SourceJournalGroup[] = [];

  for (const pair of pairs) {
    const { data: journals, error } = await supabase
      .from("journal_entries")
      .select("id, journal_number, transaction_date, description")
      .eq("source_entity_type", pair.sourceType)
      .eq("source_entity_id", pair.sourceId)
      .eq("status", "posted")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    for (const journal of journals ?? []) {
      const detail = await getJournalEntryDetail(journal.id);
      groups.push({
        journal_id: journal.id,
        journal_number: journal.journal_number,
        transaction_date: journal.transaction_date,
        description: journal.description,
        lines: detail.lines,
      });
    }
  }

  return groups;
}

export async function getJournalLinesForSource(
  sourceType: string,
  sourceId: string,
): Promise<JournalEntryLineRow[]> {
  const groups = await getJournalGroupsForSource(sourceType, sourceId);
  return groups.flatMap((group) => group.lines);
}

export async function createManualJournalEntry(input: {
  transactionDate: string;
  description: string;
  storeId?: string;
  lines: Array<{
    accountId: string;
    debit?: number;
    credit?: number;
    description?: string;
  }>;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const linesJson = input.lines.map((line) => ({
    account_id: line.accountId,
    debit: line.debit ?? 0,
    credit: line.credit ?? 0,
    description: line.description ?? "",
  }));

  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc("create_posted_journal_entry", {
    p_transaction_date: input.transactionDate,
    p_description: input.description,
    p_store_id: storeId,
    p_source_entity_type: "manual",
    p_source_entity_id: null,
    p_lines: linesJson,
  });

  if (error) throw new Error(error.message);
  return data as string;
}
