import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpVendorCreditListRow,
  ErpVendorCreditLineInput,
} from "@/common/erp/purchasing-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

export async function listVendorCredits(
  page = 0,
  limit = 20,
  storeId?: string,
): Promise<{
  data: ErpVendorCreditListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(storeId);

  let query = supabase
    .from("erp_vendor_credits")
    .select(
      "id, credit_number, vendor_id, store_id, status, total_amount, balance_remaining, credit_date, vendors(name), stores(name)",
      { count: "exact" },
    )
    .order("credit_date", { ascending: false })
    .range(from, from + limit - 1);
  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const vendor = row.vendors as { name: string | null } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        credit_number: row.credit_number,
        vendor_id: row.vendor_id,
        store_id: row.store_id,
        status: row.status,
        total_amount: Number(row.total_amount ?? 0),
        balance_remaining: Number(row.balance_remaining ?? 0),
        credit_date: row.credit_date,
        vendor_name: vendor?.name ?? null,
        store_name: store?.name ?? null,
      };
    }),
    total: count ?? 0,
  };
}

export async function createVendorCredit(input: {
  vendorId: string;
  storeId?: string;
  creditDate: string;
  lines: ErpVendorCreditLineInput[];
  reference?: string;
  notes?: string;
  finalize?: boolean;
  reduceStock?: boolean;
  sourceBillId?: string | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const linesJson: Json = input.lines.map((l) => ({
    product_id: l.productId ?? null,
    variant_id: null,
    product_name: l.productName,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    tax_rate_percent: l.taxRatePercent,
  })) as Json;

  const finalize = input.finalize ?? true;
  const reduceStock = input.reduceStock ?? false;

  const { data, error } = await supabase.rpc("create_erp_vendor_credit", {
    p_vendor_id: input.vendorId,
    p_store_id: storeId,
    p_credit_date: input.creditDate,
    p_lines: linesJson,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_finalize: false,
    p_reduce_stock: false,
    p_source_bill_id: input.sourceBillId ?? undefined,
  } as never);

  if (error) throw new Error(error.message);

  const creditId = data as string;

  if (finalize) {
    await finalizeVendorCredit(creditId, { reduceStock });
  }

  await logAuditEvent({
    action: finalize ? "finalize_vendor_credit" : "vendor_credit",
    entityType: "vendor_credit",
    entityId: creditId,
    description: finalize ? "Vendor credit created and finalized" : "Vendor credit created",
    storeId,
  });

  return creditId;
}

export async function applyVendorCredit(input: {
  creditId: string;
  billId: string;
  amount: number;
}): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("apply_erp_vendor_credit", {
    p_credit_id: input.creditId,
    p_bill_id: input.billId,
    p_amount: input.amount,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "vendor_credit",
    entityType: "vendor_credit",
    entityId: input.creditId,
    description: `Applied ${input.amount} to bill ${input.billId}`,
  });
}

export async function getVendorCreditDetail(creditId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_vendor_credits")
    .select(
      "*, vendors(name), stores(name), source_bill:erp_purchase_bills!source_bill_id(id, purchase_bill_number), erp_vendor_credit_lines(*), erp_vendor_credit_applications(*, erp_purchase_bills(purchase_bill_number, balance_due))",
    )
    .eq("id", creditId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function calcVendorCreditTotals(lines: ErpVendorCreditLineInput[]) {
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

export async function updateDraftVendorCredit(
  creditId: string,
  input: {
    vendorId: string;
    storeId: string;
    creditDate: string;
    lines: ErpVendorCreditLineInput[];
    reference?: string;
    notes?: string;
    sourceBillId?: string | null;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: credit, error: fetchError } = await supabase
    .from("erp_vendor_credits")
    .select("status, inventory_committed")
    .eq("id", creditId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (credit.status !== "draft" || credit.inventory_committed) {
    throw new Error("Only draft vendor credits can be edited");
  }
  if (!input.lines.length) throw new Error("At least one line item is required");

  const totals = calcVendorCreditTotals(input.lines);

  const { error: updateError } = await supabase
    .from("erp_vendor_credits")
    .update({
      vendor_id: input.vendorId,
      store_id: input.storeId,
      credit_date: input.creditDate,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      source_bill_id: input.sourceBillId ?? null,
      subtotal: totals.subtotal,
      tax_amount: totals.tax,
      total_amount: totals.total,
      balance_remaining: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", creditId)
    .eq("status", "draft");

  if (updateError) throw new Error(updateError.message);

  await supabase.from("erp_vendor_credit_lines").delete().eq("vendor_credit_id", creditId);

  const lineRows = input.lines.map((line) => {
    const taxable = roundMoney(line.quantity * line.unitPrice);
    const lineTax = roundMoney(taxable * (line.taxRatePercent / 100));
    return {
      vendor_credit_id: creditId,
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

  const { error: linesError } = await supabase.from("erp_vendor_credit_lines").insert(lineRows);
  if (linesError) throw new Error(linesError.message);

  await logAuditEvent({
    action: "vendor_credit",
    entityType: "vendor_credit",
    entityId: creditId,
    description: "Draft vendor credit updated",
    storeId: input.storeId,
  });
}

export async function finalizeVendorCredit(
  creditId: string,
  options?: { reduceStock?: boolean },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("finalize_erp_vendor_credit", {
    p_credit_id: creditId,
    p_reduce_stock: options?.reduceStock ?? false,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "vendor_credit",
    entityType: "vendor_credit",
    entityId: creditId,
    description: "Vendor credit finalized",
  });
}

export async function deleteDraftVendorCredit(creditId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("delete_erp_vendor_credit", {
    p_credit_id: creditId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "vendor_credit",
    entityType: "vendor_credit",
    entityId: creditId,
    description: "Draft vendor credit deleted",
  });
}
