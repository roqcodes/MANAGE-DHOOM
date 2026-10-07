import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpCreditNoteListRow, ErpLineInput } from "@/common/erp/sales-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

function linesToJson(lines: ErpLineInput[]): Json {
  return lines.map((l) => ({
    variant_id: null,
    product_id: l.productId ?? null,
    product_name: l.productName,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    tax_rate_percent: l.taxRatePercent,
  })) as Json;
}

export async function listCreditNotes(
  page = 0,
  limit = 20,
  filters?: { search?: string; status?: string; storeId?: string },
): Promise<{
  data: ErpCreditNoteListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(filters?.storeId);

  let query = supabase
    .from("erp_credit_notes")
    .select(
      "id, credit_note_number, user_id, store_id, status, total_amount, balance_remaining, credit_note_date, users:users!erp_credit_notes_user_id_fkey(name), stores(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters?.search?.trim()) {
    query = query.ilike("credit_note_number", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const user = row.users as { name: string | null } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        credit_note_number: row.credit_note_number,
        user_id: row.user_id,
        store_id: row.store_id,
        status: row.status,
        total_amount: Number(row.total_amount ?? 0),
        balance_remaining: Number(row.balance_remaining ?? 0),
        credit_note_date: row.credit_note_date,
        customer_name: user?.name ?? null,
        store_name: store?.name ?? null,
      };
    }),
    total: count ?? 0,
  };
}

export async function createCreditNote(input: {
  userId: string;
  storeId?: string;
  creditNoteDate: string;
  lines: ErpLineInput[];
  reference?: string;
  notes?: string;
  finalize?: boolean;
  restoreStock?: boolean;
  sourceInvoiceId?: string | null;
  attachmentUrl?: string | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const finalize = input.finalize ?? true;
  const restoreStock = input.restoreStock ?? false;

  const { data, error } = await supabase.rpc("create_erp_credit_note", {
    p_user_id: input.userId,
    p_store_id: storeId,
    p_credit_note_date: input.creditNoteDate,
    p_lines: linesToJson(input.lines),
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_finalize: false,
    p_restore_stock: false,
    p_source_invoice_id: input.sourceInvoiceId ?? undefined,
    p_attachment_url: input.attachmentUrl ?? undefined,
  });

  if (error) throw new Error(error.message);

  const creditNoteId = data as string;

  if (finalize) {
    await finalizeCreditNote(creditNoteId, { restoreStock });
  }

  await logAuditEvent({
    action: finalize ? "finalize_credit_note" : "create",
    entityType: "credit_note",
    entityId: creditNoteId,
    description: finalize ? "Credit note created and finalized" : "Credit note created",
    storeId,
  });

  return creditNoteId;
}

export async function applyCreditNoteToInvoice(
  creditNoteId: string,
  invoiceId: string,
  amount: number,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("apply_erp_credit_note", {
    p_credit_note_id: creditNoteId,
    p_invoice_id: invoiceId,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "credit_note",
    entityId: creditNoteId,
    description: `Applied ${amount} to invoice ${invoiceId}`,
  });
}

export async function getCreditNoteDetail(creditNoteId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_credit_notes")
    .select(
      "*, users:users!erp_credit_notes_user_id_fkey(name), stores(name), erp_credit_note_lines(*), source_invoice:invoices!erp_credit_notes_source_invoice_id_fkey(id, invoice_number)",
    )
    .eq("id", creditNoteId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function calcCreditNoteTotals(lines: ErpLineInput[]) {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    const taxable = roundMoney(line.quantity * line.unitPrice);
    const lineTax = roundMoney(taxable * (line.taxRatePercent / 100));
    subtotal += taxable;
    tax += lineTax;
  }
  return {
    subtotal: roundMoney(subtotal),
    tax: roundMoney(tax),
    total: roundMoney(subtotal + tax),
  };
}

export async function updateDraftCreditNote(
  creditNoteId: string,
  input: {
    userId: string;
    storeId: string;
    creditNoteDate: string;
    lines: ErpLineInput[];
    reference?: string;
    notes?: string;
    sourceInvoiceId?: string | null;
    attachmentUrl?: string | null;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: note, error: fetchError } = await supabase
    .from("erp_credit_notes")
    .select("status, inventory_committed")
    .eq("id", creditNoteId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (note.status !== "draft" || note.inventory_committed) {
    throw new Error("Only draft credit notes can be edited");
  }
  if (!input.lines.length) throw new Error("At least one line item is required");

  const totals = calcCreditNoteTotals(input.lines);

  const { error: updateError } = await supabase
    .from("erp_credit_notes")
    .update({
      user_id: input.userId,
      store_id: input.storeId,
      credit_note_date: input.creditNoteDate,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      source_invoice_id: input.sourceInvoiceId ?? null,
      attachment_url: input.attachmentUrl ?? null,
      subtotal: totals.subtotal,
      tax_amount: totals.tax,
      total_amount: totals.total,
      balance_remaining: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", creditNoteId)
    .eq("status", "draft");

  if (updateError) throw new Error(updateError.message);

  await supabase.from("erp_credit_note_lines").delete().eq("credit_note_id", creditNoteId);

  const lineRows = input.lines.map((line) => {
    const taxable = roundMoney(line.quantity * line.unitPrice);
    const lineTax = roundMoney(taxable * (line.taxRatePercent / 100));
    return {
      credit_note_id: creditNoteId,
      product_id: line.productId ?? null,
      variant_id: null,
      product_name: line.productName,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      tax_rate_percent: line.taxRatePercent,
      tax_amount: lineTax,
      line_total: roundMoney(taxable + lineTax),
    };
  });

  const { error: linesError } = await supabase.from("erp_credit_note_lines").insert(lineRows);
  if (linesError) throw new Error(linesError.message);

  await logAuditEvent({
    action: "update",
    entityType: "credit_note",
    entityId: creditNoteId,
    description: "Draft credit note updated",
    storeId: input.storeId,
  });
}

export async function finalizeCreditNote(
  creditNoteId: string,
  options?: { restoreStock?: boolean },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("finalize_erp_credit_note", {
    p_credit_note_id: creditNoteId,
    p_restore_stock: options?.restoreStock ?? false,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "credit_note",
    entityId: creditNoteId,
    description: "Credit note finalized",
  });
}

export async function deleteDraftCreditNote(creditNoteId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("delete_erp_credit_note", {
    p_credit_note_id: creditNoteId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete",
    entityType: "credit_note",
    entityId: creditNoteId,
    description: "Draft credit note deleted",
  });
}
