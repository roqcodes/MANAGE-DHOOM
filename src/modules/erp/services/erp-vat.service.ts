import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  LastFiledVatReturnSummary,
  VatPaymentListRow,
  VatReturnDetailWithSources,
  VatReturnListRow,
  VatReturnPaymentLine,
  VatReturnPreview,
  VatReturnSourceLine,
} from "@/common/erp/finance-types";
import type { PaidThroughAccountOption } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
  withAccountStoreScope,
} from "@/modules/erp/services/store-context.service";

type VatReturnFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  search?: string;
};

type VatPaymentFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  search?: string;
};

async function loadStoreNameMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;
  const { data } = await supabase.from("stores").select("id, name").in("id", unique);
  for (const row of data ?? []) map.set(row.id, row.name);
  return map;
}

function mapVatReturnRow(
  row: Record<string, unknown>,
  storeNames: Map<string, string | null>,
): VatReturnListRow {
  const storeId = (row.store_id as string | null) ?? null;
  return {
    id: row.id as string,
    return_number: row.return_number as string,
    period_label: row.period_label as string,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    store_id: storeId,
    store_name: storeId ? storeNames.get(storeId) ?? null : null,
    filed_date: (row.filed_date as string | null) ?? null,
    status: row.status as string,
    output_tax: Number(row.output_tax ?? 0),
    input_tax: Number(row.input_tax ?? 0),
    total_tax_payable: Number(row.total_tax_payable ?? 0),
    balance_due: Number(row.balance_due ?? 0),
    notes: (row.notes as string | null) ?? null,
  };
}

export async function listVatReturns(
  filters: VatReturnFilters = {},
): Promise<{ data: VatReturnListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 30;
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(filters.storeId);

  let query = supabase
    .from("erp_vat_returns")
    .select(
      "id, return_number, period_label, period_start, period_end, filed_date, status, output_tax, input_tax, total_tax_payable, balance_due, store_id, notes",
      { count: "exact" },
    )
    .order("period_end", { ascending: false });

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  const term = filters.search?.trim();
  if (term) {
    query = query.or(
      `return_number.ilike.%${term}%,period_label.ilike.%${term}%,notes.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const storeNames = await loadStoreNameMap(
    supabase,
    (data ?? []).map((r) => r.store_id as string | null).filter(Boolean) as string[],
  );

  return {
    data: (data ?? []).map((row) => mapVatReturnRow(row as Record<string, unknown>, storeNames)),
    total: count ?? 0,
  };
}

export async function getLastFiledVatReturn(storeId?: string): Promise<LastFiledVatReturnSummary> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await requireErpStoreId(storeId);

  const { data, error } = await supabase
    .from("erp_vat_returns")
    .select("id, return_number, period_start, period_end, filed_date")
    .eq("store_id", activeStoreId)
    .eq("status", "filed")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    return_number: data.return_number,
    period_start: data.period_start,
    period_end: data.period_end,
    filed_date: data.filed_date,
  };
}

export async function previewVatReturn(input: {
  storeId?: string;
  periodStart: string;
  periodEnd: string;
}): Promise<VatReturnPreview> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("preview_erp_vat_return", {
    p_store_id: storeId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
  });
  if (error) throw new Error(error.message);

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    output_tax: Number(row.output_tax ?? 0),
    input_tax: Number(row.input_tax ?? 0),
    total_tax_payable: Number(row.total_tax_payable ?? 0),
    recoverable_tax: Number(row.recoverable_tax ?? 0),
  };
}

export async function refreshVatReturn(returnId: string): Promise<VatReturnDetailWithSources> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("refresh_erp_vat_return", {
    p_return_id: returnId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "refresh_vat_return",
    entityType: "vat_return",
    entityId: returnId,
    description: "VAT return recalculated",
  });

  return getVatReturnDetail(returnId);
}

export async function createVatReturn(input: {
  storeId?: string;
  periodStart: string;
  periodEnd: string;
  notes?: string;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("create_erp_vat_return", {
    p_store_id: storeId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create_vat_return",
    entityType: "vat_return",
    entityId: data as string,
    description: "VAT return created",
    storeId,
  });

  return data as string;
}

export async function getVatReturnDetail(returnId: string): Promise<VatReturnDetailWithSources> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_vat_returns")
    .select("*")
    .eq("id", returnId)
    .single();
  if (error) throw new Error(error.message);

  const storeNames = await loadStoreNameMap(
    supabase,
    data.store_id ? [data.store_id] : [],
  );
  const base = mapVatReturnRow(data as Record<string, unknown>, storeNames);
  const sources = await loadVatReturnSources(
    supabase,
    base.store_id,
    base.period_start,
    base.period_end,
    returnId,
  );

  return {
    ...base,
    recoverable_tax: Math.max(0, base.input_tax - base.output_tax),
    sources,
  };
}

async function loadCustomerNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const nameById = new Map<string, string | null>();
  if (uniqueIds.length === 0) return nameById;

  const { data, error } = await supabase.from("users").select("id, name").in("id", uniqueIds);
  if (error) throw new Error(error.message);

  for (const user of data ?? []) {
    nameById.set(user.id, user.name);
  }
  return nameById;
}

async function loadVatReturnSources(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storeId: string | null,
  periodStart: string,
  periodEnd: string,
  returnId: string,
): Promise<VatReturnDetailWithSources["sources"]> {
  const storeFilter = storeId ? { store_id: storeId } : {};

  const [invoicesRes, creditNotesRes, billsRes, vendorCreditsRes, paymentsRes] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, issued_at, created_at, gst_amount, total_amount, status, store_id, user_id",
        )
        .in("status", ["issued", "partial", "paid", "overdue"])
        .match(storeFilter),
      supabase
        .from("erp_credit_notes")
        .select(
          "id, credit_note_number, credit_note_date, tax_amount, total_amount, status, store_id, user_id",
        )
        .in("status", ["issued", "applied"])
        .gte("credit_note_date", periodStart)
        .lte("credit_note_date", periodEnd)
        .match(storeFilter),
      supabase
        .from("erp_purchase_bills")
        .select(
          "id, purchase_bill_number, purchase_date, tax_amount, total_amount, status, store_id, vendors(name)",
        )
        .in("status", ["finalized", "partial", "paid"])
        .gte("purchase_date", periodStart)
        .lte("purchase_date", periodEnd)
        .match(storeFilter),
      supabase
        .from("erp_vendor_credits")
        .select(
          "id, credit_number, credit_date, tax_amount, total_amount, status, store_id, vendors(name)",
        )
        .in("status", ["issued", "applied"])
        .gte("credit_date", periodStart)
        .lte("credit_date", periodEnd)
        .match(storeFilter),
      supabase
        .from("erp_vat_payments")
        .select("id, payment_number, payment_date, amount, payment_type, reference")
        .eq("vat_return_id", returnId)
        .order("payment_date", { ascending: false }),
    ]);

  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (creditNotesRes.error) throw new Error(creditNotesRes.error.message);
  if (billsRes.error) throw new Error(billsRes.error.message);
  if (vendorCreditsRes.error) throw new Error(vendorCreditsRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const filteredInvoices = (invoicesRes.data ?? []).filter((row) => {
    const effectiveDate =
      (row.issued_at as string | null)?.slice(0, 10) ??
      (row.created_at as string | null)?.slice(0, 10);
    return effectiveDate && effectiveDate >= periodStart && effectiveDate <= periodEnd;
  });

  const customerNames = await loadCustomerNames(supabase, [
    ...filteredInvoices.map((row) => row.user_id as string),
    ...(creditNotesRes.data ?? []).map((row) => row.user_id as string),
  ]);

  const salesInvoices: VatReturnSourceLine[] = filteredInvoices.map((row) => ({
    id: row.id,
    document_number: row.invoice_number,
    document_date:
      (row.issued_at as string | null)?.slice(0, 10) ??
      (row.created_at as string | null)?.slice(0, 10) ??
      "",
    party_name: customerNames.get(row.user_id as string) ?? null,
    tax_amount: Number(row.gst_amount ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    href: `/admin/erp/invoices/${row.id}`,
  }));

  const creditNotes: VatReturnSourceLine[] = (creditNotesRes.data ?? []).map((row) => ({
    id: row.id,
    document_number: row.credit_note_number,
    document_date: row.credit_note_date,
    party_name: customerNames.get(row.user_id as string) ?? null,
    tax_amount: Number(row.tax_amount ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    href: `/admin/erp/credit-notes/${row.id}`,
  }));

  const purchaseBills: VatReturnSourceLine[] = (billsRes.data ?? []).map((row) => {
    const vendor = row.vendors as { name: string } | null;
    return {
      id: row.id,
      document_number: row.purchase_bill_number,
      document_date: row.purchase_date,
      party_name: vendor?.name ?? null,
      tax_amount: Number(row.tax_amount ?? 0),
      total_amount: Number(row.total_amount ?? 0),
      href: `/admin/erp/purchase-bills/${row.id}`,
    };
  });

  const vendorCredits: VatReturnSourceLine[] = (vendorCreditsRes.data ?? []).map((row) => {
    const vendor = row.vendors as { name: string } | null;
    return {
      id: row.id,
      document_number: row.credit_number,
      document_date: row.credit_date,
      party_name: vendor?.name ?? null,
      tax_amount: Number(row.tax_amount ?? 0),
      total_amount: Number(row.total_amount ?? 0),
      href: `/admin/erp/vendor-credits/${row.id}`,
    };
  });

  const payments: VatReturnPaymentLine[] = (paymentsRes.data ?? []).map((row) => ({
    id: row.id,
    payment_number: row.payment_number,
    payment_date: row.payment_date,
    amount: Number(row.amount ?? 0),
    payment_type: row.payment_type,
    reference: row.reference,
    href: `/admin/erp/vat-payments`,
  }));

  return {
    sales_invoices: salesInvoices,
    credit_notes: creditNotes,
    purchase_bills: purchaseBills,
    vendor_credits: vendorCredits,
    payments,
  };
}

export async function fileVatReturn(returnId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("file_erp_vat_return", { p_return_id: returnId });
  if (error) throw new Error(error.message);
  await logAuditEvent({
    action: "file_vat_return",
    entityType: "vat_return",
    entityId: returnId,
    description: "VAT return filed",
  });
}

export async function deleteVatReturn(returnId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_erp_vat_return", { p_return_id: returnId });
  if (error) throw new Error(error.message);
  await logAuditEvent({
    action: "delete_vat_return",
    entityType: "vat_return",
    entityId: returnId,
    description: "VAT return deleted",
  });
}

export async function listVatPaidThroughAccounts(
  storeId?: string,
): Promise<PaidThroughAccountOption[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);

  const { data, error } = await withAccountStoreScope(
    supabase
      .from("accounts")
      .select("id, code, name, store_id, account_types(name), stores(name)")
      .eq("is_active", true)
      .order("name"),
    activeStoreId,
  );
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const type = row.account_types as { name: string } | null;
      const typeName = type?.name ?? "";
      return /cash|bank|petty/i.test(typeName);
    })
    .map((row) => {
      const type = row.account_types as { name: string } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        account_type_name: type?.name ?? "—",
        store_name: store?.name ?? null,
      };
    });
}

export async function listVatPayments(
  filters: VatPaymentFilters = {},
): Promise<{ data: VatPaymentListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 30;
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(filters.storeId);

  let query = supabase
    .from("erp_vat_payments")
    .select(
      "id, payment_number, vat_return_id, store_id, payment_date, reference, payment_type, paid_from_account_id, amount, notes, erp_vat_returns(return_number, period_label)",
      { count: "exact" },
    )
    .order("payment_date", { ascending: false });

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  const term = filters.search?.trim();
  if (term) {
    query = query.or(
      `payment_number.ilike.%${term}%,reference.ilike.%${term}%,notes.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const storeNames = await loadStoreNameMap(
    supabase,
    (data ?? []).map((r) => r.store_id as string | null).filter(Boolean) as string[],
  );

  const accountIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.paid_from_account_id as string | null)
        .filter(Boolean),
    ),
  ] as string[];
  const accountNameById = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name")
      .in("id", accountIds);
    for (const a of accounts ?? []) accountNameById.set(a.id, a.name);
  }

  const rows: VatPaymentListRow[] = (data ?? []).map((row) => {
    const vatReturn = row.erp_vat_returns as unknown as {
      return_number: string;
      period_label: string;
    } | null;
    const storeId = (row.store_id as string | null) ?? null;
    const paidFromId = row.paid_from_account_id as string | null;
    return {
      id: row.id,
      payment_number: row.payment_number,
      vat_return_id: row.vat_return_id,
      payment_date: row.payment_date,
      reference: row.reference,
      store_id: storeId,
      store_name: storeId ? storeNames.get(storeId) ?? null : null,
      paid_from_account_id: row.paid_from_account_id,
      paid_from_account_name: paidFromId
        ? (accountNameById.get(paidFromId) ?? null)
        : null,
      payment_type: row.payment_type,
      notes: row.notes,
      amount: Number(row.amount ?? 0),
      return_number: vatReturn?.return_number ?? null,
      period_label: vatReturn?.period_label ?? null,
    };
  });

  return { data: rows, total: count ?? 0 };
}

export async function createVatPayment(input: {
  vatReturnId: string;
  paymentDate: string;
  paymentType: string;
  paidFromAccountId: string;
  amount: number;
  reference?: string;
  notes?: string;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_erp_vat_payment", {
    p_vat_return_id: input.vatReturnId,
    p_payment_date: input.paymentDate,
    p_payment_type: input.paymentType,
    p_paid_from_account_id: input.paidFromAccountId,
    p_amount: input.amount,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create_vat_payment",
    entityType: "vat_payment",
    entityId: data as string,
    description: `VAT payment ${input.amount}`,
  });

  return data as string;
}

export async function deleteVatPayment(paymentId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_erp_vat_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw new Error(error.message);
  await logAuditEvent({
    action: "delete_vat_payment",
    entityType: "vat_payment",
    entityId: paymentId,
    description: "VAT payment deleted",
  });
}
