import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpEstimateListRow, ErpLineInput } from "@/common/erp/sales-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

function linesToJson(lines: ErpLineInput[]): Json {
  return lines.map((l) => ({
    variant_id: null,
    product_id: l.productId ?? null,
    product_name: l.productName,
    description: l.description ?? null,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    tax_rate_percent: l.taxRatePercent,
    unit_id: l.unitId ?? null,
  })) as Json;
}

export async function listEstimates(
  page = 0,
  limit = 20,
  storeId?: string,
): Promise<{
  data: ErpEstimateListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(storeId);

  let query = supabase
    .from("erp_estimates")
    .select(
      "id, estimate_number, user_id, store_id, status, total_amount, estimate_date, valid_until, users:users!erp_estimates_user_id_fkey(name), stores(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const user = row.users as { name: string | null } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        estimate_number: row.estimate_number,
        user_id: row.user_id,
        store_id: row.store_id,
        status: row.status,
        total_amount: Number(row.total_amount ?? 0),
        estimate_date: row.estimate_date,
        valid_until: row.valid_until,
        customer_name: user?.name ?? null,
        store_name: store?.name ?? null,
      };
    }),
    total: count ?? 0,
  };
}

export async function createEstimate(input: {
  userId: string;
  storeId?: string;
  estimateDate: string;
  validUntil?: string;
  lines: ErpLineInput[];
  discount?: number;
  taxInclusive?: boolean;
  reference?: string;
  notes?: string;
  salesPersonId?: string;
  finalize?: boolean;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("create_erp_estimate", {
    p_user_id: input.userId,
    p_store_id: storeId,
    p_estimate_date: input.estimateDate,
    p_valid_until: input.validUntil ?? input.estimateDate,
    p_lines: linesToJson(input.lines),
    p_discount: input.discount ?? 0,
    p_tax_inclusive: input.taxInclusive ?? false,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_sales_person_id: input.salesPersonId ?? undefined,
  });

  if (error) throw new Error(error.message);

  const estimateId = data as string;

  if (input.finalize !== false) {
    const { error: statusError } = await supabase
      .from("erp_estimates")
      .update({ status: "sent" })
      .eq("id", estimateId);
    if (statusError) throw new Error(statusError.message);
  }

  await logAuditEvent({
    action: "create",
    entityType: "estimate",
    entityId: estimateId,
    description: input.finalize === false ? "Estimate saved as draft" : "Estimate created",
    storeId,
  });

  return estimateId;
}

export async function updateEstimate(
  estimateId: string,
  input: {
    estimateDate: string;
    validUntil?: string;
    lines: ErpLineInput[];
    discount?: number;
    taxInclusive?: boolean;
    reference?: string;
    notes?: string;
    status?: "draft" | "sent";
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc("update_erp_estimate", {
    p_estimate_id: estimateId,
    p_estimate_date: input.estimateDate,
    p_valid_until: input.validUntil ?? input.estimateDate,
    p_lines: linesToJson(input.lines),
    p_discount: input.discount ?? 0,
    p_tax_inclusive: input.taxInclusive ?? false,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_status: input.status ?? undefined,
  });

  if (error) throw new Error(error.message);

  const { data: estimate } = await supabase
    .from("erp_estimates")
    .select("store_id")
    .eq("id", estimateId)
    .maybeSingle();

  await logAuditEvent({
    action: "update",
    entityType: "estimate",
    entityId: estimateId,
    description: "Estimate updated",
    storeId: estimate?.store_id ?? undefined,
  });
}

export async function cancelEstimate(estimateId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc("cancel_erp_estimate", {
    p_estimate_id: estimateId,
  });

  if (error) throw new Error(error.message);

  const { data: estimate } = await supabase
    .from("erp_estimates")
    .select("store_id")
    .eq("id", estimateId)
    .maybeSingle();

  await logAuditEvent({
    action: "cancel",
    entityType: "estimate",
    entityId: estimateId,
    description: "Estimate cancelled",
    storeId: estimate?.store_id ?? undefined,
  });
}

export async function convertEstimateToInvoice(estimateId: string): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: estimate, error } = await supabase
    .from("erp_estimates")
    .select("*, erp_estimate_lines(*)")
    .eq("id", estimateId)
    .single();

  if (error) throw new Error(error.message);
  if (estimate.status === "converted") {
    if (estimate.converted_invoice_id) return estimate.converted_invoice_id as string;
    throw new Error("Estimate already converted");
  }
  if (estimate.status === "cancelled") {
    throw new Error("Cannot convert a cancelled estimate");
  }

  const lines = (estimate.erp_estimate_lines ?? []).map((line) => ({
    productId: (line as { product_id?: string | null }).product_id ?? null,
    variantId: line.variant_id,
    productName: line.product_name,
    description: line.description,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unit_price),
    taxRatePercent: Number(line.tax_rate_percent),
    unitId: line.unit_id,
  }));

  if (lines.length === 0) throw new Error("Estimate has no line items");

  const { createErpInvoice } = await import("@/modules/erp/services/erp-invoices.service");

  const invoiceId = await createErpInvoice({
    userId: estimate.user_id,
    storeId: estimate.store_id,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: estimate.valid_until ?? estimate.estimate_date,
    lines,
    discount: Number(estimate.discount ?? 0),
    taxInclusive: estimate.tax_inclusive,
    reference: estimate.reference ?? undefined,
    notes: estimate.notes ?? undefined,
    salesPersonId: estimate.sales_person_id ?? undefined,
    estimateId,
    finalize: true,
  });

  await logAuditEvent({
    action: "convert",
    entityType: "estimate",
    entityId: estimateId,
    description: `Converted to invoice ${invoiceId}`,
    storeId: estimate.store_id,
  });

  return invoiceId;
}

export function isEstimateEditable(status: string): boolean {
  return status === "draft" || status === "sent";
}

export async function getEstimateDetail(estimateId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_estimates")
    .select("*, users:users!erp_estimates_user_id_fkey(name, email, phone, company_name, trn), stores(name), erp_estimate_lines(*)")
    .eq("id", estimateId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}
