import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpLineInput, ErpInvoiceListRow } from "@/common/erp/sales-types";
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
    purchase_price: l.purchasePrice ?? null,
    unit_id: l.unitId ?? null,
    vendor_id: l.vendorId ?? null,
  })) as Json;
}

async function loadCustomerNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const nameById = new Map<string, string | null>();
  if (uniqueIds.length === 0) return nameById;

  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .in("id", uniqueIds);
  if (error) throw new Error(error.message);

  for (const user of data ?? []) {
    nameById.set(user.id, user.name);
  }
  return nameById;
}

export async function listErpInvoices(filters?: {
  storeId?: string;
  userId?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  openOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ data: ErpInvoiceListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters?.page ?? 0;
  const limit = filters?.limit ?? 20;
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(filters?.storeId);

  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, user_id, store_id, status, total_amount, amount_paid, credits_applied, balance_due, created_at, due_date, source, stores(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters?.userId) query = query.eq("user_id", filters.userId);
  if (filters?.status && filters.status !== "all") {
    if (filters.status === "draft") {
      query = query.in("status", ["pending", "draft"]);
    } else {
      query = query.eq("status", filters.status);
    }
  }
  if (filters?.openOnly) query = query.gt("balance_due", 0);
  if (filters?.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters?.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
  if (filters?.search?.trim()) {
    const s = filters.search.trim();
    const { data: customerMatches } = await supabase
      .from("users")
      .select("id")
      .or(
        `name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,customer_number.ilike.%${s}%,company_name.ilike.%${s}%`,
      )
      .limit(50);

    const customerIds = (customerMatches ?? []).map((row) => row.id);
    if (customerIds.length > 0) {
      query = query.or(`invoice_number.ilike.%${s}%,user_id.in.(${customerIds.join(",")})`);
    } else {
      query = query.ilike("invoice_number", `%${s}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const customerNames = await loadCustomerNames(
    supabase,
    (data ?? []).map((row) => row.user_id),
  );

  const rows: ErpInvoiceListRow[] = (data ?? []).map((row) => {
    const store = row.stores as { name: string } | null;
    return {
      id: row.id,
      invoice_number: row.invoice_number,
      user_id: row.user_id,
      store_id: row.store_id,
      status: row.status,
      total_amount: Number(row.total_amount ?? 0),
      amount_paid: Number(row.amount_paid ?? 0),
      credits_applied: Number(row.credits_applied ?? 0),
      balance_due: Number(row.balance_due ?? 0),
      created_at: row.created_at,
      due_date: row.due_date,
      source: row.source,
      customer_name: customerNames.get(row.user_id) ?? null,
      store_name: store?.name ?? null,
    };
  });

  return { data: rows, total: count ?? 0 };
}

export async function createErpInvoice(input: {
  userId: string;
  storeId?: string;
  invoiceDate: string;
  dueDate: string;
  lines: ErpLineInput[];
  discount?: number;
  taxInclusive?: boolean;
  reference?: string;
  notes?: string;
  salesPersonId?: string;
  estimateId?: string;
  finalize?: boolean;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("create_erp_invoice", {
    p_user_id: input.userId,
    p_store_id: storeId,
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate,
    p_lines: linesToJson(input.lines),
    p_discount: input.discount ?? 0,
    p_tax_inclusive: input.taxInclusive ?? false,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_sales_person_id: input.salesPersonId ?? undefined,
    p_estimate_id: input.estimateId ?? undefined,
    p_finalize: input.finalize ?? true,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create_invoice",
    entityType: "invoice",
    entityId: data as string,
    description: "ERP invoice created",
    storeId,
  });

  return data as string;
}

export async function cancelErpInvoice(invoiceId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  // RPC added in 20260829190000_sales_production_hardening.sql
  const { error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc("cancel_erp_invoice", {
    p_invoice_id: invoiceId,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await supabase
    .from("invoices")
    .select("store_id")
    .eq("id", invoiceId)
    .maybeSingle();

  await logAuditEvent({
    action: "cancel",
    entityType: "invoice",
    entityId: invoiceId,
    description: "ERP invoice cancelled",
    storeId: invoice?.store_id ?? undefined,
  });
}

export async function updateErpInvoice(
  invoiceId: string,
  input: {
    invoiceDate: string;
    dueDate: string;
    lines: ErpLineInput[];
    discount?: number;
    taxInclusive?: boolean;
    reference?: string;
    notes?: string;
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
  ).rpc("update_erp_invoice", {
    p_invoice_id: invoiceId,
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate,
    p_lines: linesToJson(input.lines),
    p_discount: input.discount ?? 0,
    p_tax_inclusive: input.taxInclusive ?? false,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await supabase
    .from("invoices")
    .select("store_id")
    .eq("id", invoiceId)
    .maybeSingle();

  await logAuditEvent({
    action: "update",
    entityType: "invoice",
    entityId: invoiceId,
    description: "ERP invoice updated",
    storeId: invoice?.store_id ?? undefined,
  });
}

export function computeErpInvoiceEditable(invoice: {
  status: string;
  amount_paid?: number | null;
  credits_applied?: number | null;
}): boolean {
  if (invoice.status === "cancelled") return false;
  return (
    Number(invoice.amount_paid ?? 0) === 0 && Number(invoice.credits_applied ?? 0) === 0
  );
}

/** @deprecated Prefer `computeErpInvoiceEditable` on a loaded invoice row. */
export async function getErpInvoiceEditable(invoiceId: string): Promise<boolean> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("status, amount_paid, credits_applied")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invoice not found");
  return computeErpInvoiceEditable(data);
}

const ERP_INVOICE_DETAIL_SELECT = `
  id,
  invoice_number,
  status,
  subtotal,
  total_amount,
  amount_paid,
  credits_applied,
  balance_due,
  discount,
  gst_amount,
  due_date,
  created_at,
  notes,
  tax_inclusive,
  source,
  order_id,
  user_id,
  store_id,
  gst_number,
  reference,
  stores(name, logo_url, address_line1, city, country, phone, trn),
  users!invoices_user_id_fkey(name, email, phone, company_name, trn),
  invoice_items(
    id,
    product_name,
    quantity,
    unit_price,
    gst_rate,
    gst_amount,
    total_amount,
    description
  ),
  erp_payment_allocations(
    amount,
    erp_customer_payments(id, payment_number, payment_date, payment_mode, total_amount)
  ),
  erp_credit_note_applications(
    amount,
    erp_credit_notes(id, credit_note_number, credit_note_date)
  )
`;

/** Single round-trip invoice load (customer embedded). Caller must enforce admin auth. */
export async function fetchErpInvoiceDetail(invoiceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(ERP_INVOICE_DETAIL_SELECT)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invoice not found");

  const usersRaw = data.users as
    | { name: string | null; email: string | null; phone: string | null; company_name: string | null; trn: string | null }
    | { name: string | null; email: string | null; phone: string | null; company_name: string | null; trn: string | null }[]
    | null;
  const users = Array.isArray(usersRaw) ? usersRaw[0] ?? null : usersRaw;

  const { users: _usersEmbed, ...invoice } = data;
  return {
    ...invoice,
    users,
    editable: computeErpInvoiceEditable(invoice),
  };
}

export async function getErpInvoiceDetail(invoiceId: string) {
  await requireAdminOrManagerProfile();
  return fetchErpInvoiceDetail(invoiceId);
}
