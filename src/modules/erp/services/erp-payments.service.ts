import "server-only";

import { randomUUID } from "crypto";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  BulkCustomerPaymentAllocationRow,
  BulkCustomerPaymentBatchRow,
  BulkCustomerPaymentLine,
  ErpPaymentListRow,
  ErpPaymentSummary,
  PaidThroughAccountOption,
  PaymentAllocationInput,
} from "@/common/erp/sales-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
  withAccountStoreScope,
} from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";

const CUSTOMER_BULK_REF_PREFIX = "CBPB:";

type PaymentListFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

type AllocationRow = {
  invoices: { invoice_number: string } | null;
};

function emptyPaymentSummary(): ErpPaymentSummary {
  return {
    cash: 0,
    card: 0,
    cheque: 0,
    bankRemittance: 0,
    bankTransfer: 0,
    total: 0,
  };
}

function addToSummary(summary: ErpPaymentSummary, mode: string, amount: number) {
  summary.total += amount;
  switch (mode) {
    case "Cash":
      summary.cash += amount;
      break;
    case "CreditCard":
      summary.card += amount;
      break;
    case "Cheque":
      summary.cheque += amount;
      break;
    case "BankRemittance":
      summary.bankRemittance += amount;
      break;
    case "BankTransfer":
    case "UPI":
      summary.bankTransfer += amount;
      break;
    default:
      break;
  }
}

function applyPaymentListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: PaymentListFilters,
) {
  let next = query;
  if (filters.storeId) next = next.eq("store_id", filters.storeId);
  if (filters.dateFrom) next = next.gte("payment_date", filters.dateFrom);
  if (filters.dateTo) next = next.lte("payment_date", filters.dateTo);
  return next;
}

function invoiceNumbersFromAllocations(
  allocations: AllocationRow[] | null | undefined,
): string | null {
  const numbers = (allocations ?? [])
    .map((row) => row.invoices?.invoice_number)
    .filter((n): n is string => Boolean(n));
  if (numbers.length === 0) return null;
  return numbers.join(", ");
}

export async function listErpPayments(filters: PaymentListFilters = {}): Promise<{
  data: ErpPaymentListRow[];
  total: number;
  summary: ErpPaymentSummary;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const search = filters.search?.trim().toLowerCase();
  const activeStoreId = await resolveErpStoreId(filters.storeId);
  const scopedFilters = { ...filters, storeId: activeStoreId ?? undefined };

  let query = applyPaymentListFilters(
    supabase
      .from("erp_customer_payments")
      .select(
        "id, payment_number, store_id, user_id, payment_date, payment_mode, total_amount, is_bulk, unallocated_amount, bank_charges, users:users!erp_customer_payments_user_id_fkey(name), stores(name), erp_payment_allocations(invoices(invoice_number))",
        { count: "exact" },
      )
      .order("payment_date", { ascending: false })
      .range(from, from + limit - 1),
    scopedFilters,
  );

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let rows: ErpPaymentListRow[] = (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as { name: string | null } | null;
    const store = row.stores as { name: string } | null;
    const allocations = row.erp_payment_allocations as unknown as AllocationRow[] | null;
    return {
      id: row.id as string,
      payment_number: row.payment_number as string,
      store_id: row.store_id as string | null,
      user_id: row.user_id as string,
      payment_date: row.payment_date as string,
      payment_mode: row.payment_mode as string,
      total_amount: Number(row.total_amount ?? 0),
      is_bulk: row.is_bulk as boolean,
      unallocated_amount: Number(row.unallocated_amount ?? 0),
      customer_name: user?.name ?? null,
      store_name: store?.name ?? null,
      invoice_number: invoiceNumbersFromAllocations(allocations),
      bank_charges: Number(row.bank_charges ?? 0),
    };
  });

  if (search) {
    rows = rows.filter((row) => {
      const haystack = [
        row.payment_number,
        row.customer_name,
        row.invoice_number,
        row.store_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  const summary = emptyPaymentSummary();
  const { data: summaryRows, error: summaryError } = await invokeRpc(
    supabase,
    "summarize_erp_customer_payments",
    {
      p_store_id: activeStoreId ?? undefined,
      p_date_from: filters.dateFrom ?? undefined,
      p_date_to: filters.dateTo ?? undefined,
    },
  );
  if (summaryError) {
    let summaryQuery = applyPaymentListFilters(
      supabase.from("erp_customer_payments").select("payment_mode, total_amount"),
      scopedFilters,
    );
    const { data: fallbackRows, error: fallbackErr } = await summaryQuery;
    if (fallbackErr) throw new Error(fallbackErr.message);
    for (const row of fallbackRows ?? []) {
      addToSummary(summary, row.payment_mode, Number(row.total_amount ?? 0));
    }
  } else {
    for (const row of (summaryRows ?? []) as {
      payment_mode: string;
      total_amount: number;
    }[]) {
      addToSummary(summary, row.payment_mode, Number(row.total_amount ?? 0));
    }
  }

  return {
    data: rows,
    total: search ? rows.length : (count ?? 0),
    summary,
  };
}

export async function recordCustomerPayment(input: {
  userId: string;
  storeId?: string;
  paymentDate: string;
  paymentMode: string;
  accountId: string;
  totalAmount: number;
  bankCharges?: number;
  bankChargesAccountId?: string | null;
  reference?: string;
  notes?: string;
  isBulk?: boolean;
  allocations: PaymentAllocationInput[];
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);
  if (!input.accountId) throw new Error("Deposit account is required");

  const bankCharges = input.bankCharges ?? 0;
  if (bankCharges > 0 && !input.bankChargesAccountId) {
    throw new Error("Expense account is required when bank charges are recorded");
  }

  const allocJson: Json = input.allocations.map((a) => ({
    invoice_id: a.invoiceId,
    amount: a.amount,
  })) as Json;

  const { data, error } = await supabase.rpc("record_erp_customer_payment", {
    p_user_id: input.userId,
    p_store_id: storeId,
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_account_id: input.accountId,
    p_total_amount: input.totalAmount,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_is_bulk: input.isBulk ?? false,
    p_allocations: allocJson,
    p_bank_charges: bankCharges,
    p_bank_charges_account_id: input.bankChargesAccountId ?? undefined,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: input.isBulk ? "create_bulk_customer_payment" : "payment_received",
    entityType: "erp_payment",
    entityId: data as string,
    description: `Payment recorded: ${input.totalAmount}`,
    storeId,
  });

  return data as string;
}

export async function getPaymentDetail(paymentId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_customer_payments")
    .select(
      "*, users:users!erp_customer_payments_user_id_fkey(name, email), stores(name), accounts!erp_customer_payments_account_id_fkey(name), bank_charges_account:accounts!erp_customer_payments_bank_charges_account_id_fkey(name), erp_payment_allocations(*, invoices(id, invoice_number, total_amount, balance_due))",
    )
    .eq("id", paymentId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function loadUserNames(
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

export async function peekPaymentDocumentNumber(isBulk = false): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const docType = isBulk ? "payment_bulk" : "payment_received";
  const { data, error } = await supabase.rpc("peek_erp_document_number", {
    p_document_type: docType,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listPaidThroughAccounts(
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

  const cashBankTypeNames = new Set([
    "Cash",
    "Bank",
    "Petty Cash",
    "Cash account",
    "Bank account",
  ]);

  return (data ?? [])
    .filter((row) => {
      const type = row.account_types as { name: string } | null;
      const typeName = type?.name ?? "";
      return cashBankTypeNames.has(typeName) || /cash|bank|petty/i.test(typeName);
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

export async function listExpenseAccounts(
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
      return /expense/i.test(typeName);
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

export async function buildFifoAllocationsForAmount(
  storeId: string,
  amount: number,
  excludeInvoiceIds: string[] = [],
): Promise<PaymentAllocationInput[]> {
  if (amount <= 0) return [];

  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("id, balance_due, due_date")
    .eq("store_id", storeId)
    .gt("balance_due", 0)
    .neq("status", "cancelled")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const excluded = new Set(excludeInvoiceIds);
  let remaining = amount;
  const allocations: PaymentAllocationInput[] = [];

  for (const invoice of data ?? []) {
    if (remaining <= 0) break;
    if (excluded.has(invoice.id)) continue;
    const balance = Number(invoice.balance_due ?? 0);
    if (balance <= 0) continue;
    const alloc = Math.min(remaining, balance);
    allocations.push({ invoiceId: invoice.id, amount: alloc });
    remaining -= alloc;
  }

  return allocations;
}

function resolveBulkBatchRef(batchId: string) {
  return batchId.startsWith(CUSTOMER_BULK_REF_PREFIX)
    ? batchId
    : `${CUSTOMER_BULK_REF_PREFIX}${batchId}`;
}

function periodToDateRange(period?: string): { dateFrom?: string; dateTo?: string } {
  if (!period || period === "all") return {};
  const now = new Date();
  if (period === "this_month") {
    const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { dateFrom, dateTo };
  }
  if (period === "today") {
    const today = now.toISOString().slice(0, 10);
    return { dateFrom: today, dateTo: today };
  }
  return {};
}

export async function listBulkCustomerPaymentBatches(
  options: {
    page?: number;
    limit?: number;
    storeId?: string;
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  } = {},
): Promise<{ data: BulkCustomerPaymentBatchRow[]; total: number; totalAmount: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const periodRange = periodToDateRange(options.period);

  let query = supabase
    .from("erp_customer_payments")
    .select(
      "id, payment_number, payment_date, store_id, payment_mode, total_amount, reference, notes, created_by, customer_count, invoices_count",
    )
    .eq("is_bulk", true)
    .like("reference", `${CUSTOMER_BULK_REF_PREFIX}%`);

  if (options.storeId) query = query.eq("store_id", options.storeId);
  const dateFrom = options.dateFrom ?? periodRange.dateFrom;
  const dateTo = options.dateTo ?? periodRange.dateTo;
  if (dateFrom) query = query.gte("payment_date", dateFrom);
  if (dateTo) query = query.lte("payment_date", dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const creatorNames = await loadUserNames(
    supabase,
    (data ?? []).map((row) => row.created_by as string | null).filter(Boolean) as string[],
  );

  const storeIds = [
    ...new Set((data ?? []).map((r) => r.store_id).filter(Boolean)),
  ] as string[];
  const storeNameById = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const s of stores ?? []) storeNameById.set(s.id, s.name);
  }

  const batchMap = new Map<string, BulkCustomerPaymentBatchRow>();
  for (const row of data ?? []) {
    const ref = row.reference as string;
    if (!ref?.startsWith(CUSTOMER_BULK_REF_PREFIX)) continue;

    const storeName = row.store_id
      ? (storeNameById.get(row.store_id as string) ?? null)
      : null;
    const amt = Number(row.total_amount ?? 0);
    const invoicesCount = Number(row.invoices_count ?? 0);
    const receipt = (row.notes as string | null)?.trim() || row.payment_number;

    const existing = batchMap.get(ref);
    if (existing) {
      existing.total_amount += amt;
      existing.customer_count += 1;
      existing.invoices_count += invoicesCount;
      if (receipt) {
        existing.receipts = existing.receipts
          ? `${existing.receipts}, ${receipt}`
          : receipt;
      }
    } else {
      batchMap.set(ref, {
        batch_id: ref,
        payment_date: row.payment_date as string,
        store_id: row.store_id as string,
        store_name: storeName,
        total_amount: amt,
        payment_mode: row.payment_mode as string,
        account_name: null,
        receipts: receipt || null,
        customer_count: 1,
        invoices_count: invoicesCount,
        created_by_name: row.created_by
          ? creatorNames.get(row.created_by as string) ?? null
          : null,
        notes: (row.notes as string | null) ?? null,
      });
    }
  }

  let batches = Array.from(batchMap.values()).sort((a, b) =>
    b.payment_date.localeCompare(a.payment_date),
  );

  const search = options.search?.trim().toLowerCase();
  if (search) {
    batches = batches.filter((batch) => {
      const haystack = [
        batch.store_name,
        batch.account_name,
        batch.payment_mode,
        batch.receipts,
        batch.created_by_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  const totalAmount = batches.reduce((sum, batch) => sum + batch.total_amount, 0);
  const page = options.page ?? 0;
  const limit = options.limit ?? 20;
  const from = page * limit;

  return {
    data: batches.slice(from, from + limit),
    total: batches.length,
    totalAmount,
  };
}

export async function getBulkCustomerPaymentBatchDetail(batchId: string): Promise<{
  batch: BulkCustomerPaymentBatchRow;
  lines: BulkCustomerPaymentLine[];
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const ref = resolveBulkBatchRef(batchId);

  const { data, error } = await supabase
    .from("erp_customer_payments")
    .select(
      "id, payment_number, user_id, payment_date, store_id, payment_mode, total_amount, notes, reference, created_by, erp_payment_allocations(amount, invoices(id, invoice_number, due_date, total_amount, amount_paid, balance_due, status))",
    )
    .eq("reference", ref)
    .eq("is_bulk", true);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Bulk payment not found");

  const customerNames = await loadUserNames(
    supabase,
    data.map((row) => row.user_id as string),
  );
  const creatorNames = await loadUserNames(
    supabase,
    data.map((row) => row.created_by as string | null).filter(Boolean) as string[],
  );

  const first = data[0];
  let storeName: string | null = null;
  if (first.store_id) {
    const { data: storeRow } = await supabase
      .from("stores")
      .select("name")
      .eq("id", first.store_id)
      .maybeSingle();
    storeName = storeRow?.name ?? null;
  }

  const lines: BulkCustomerPaymentLine[] = [];
  let total = 0;
  let invoicesCount = 0;
  const receipts: string[] = [];

  for (const row of data) {
    const amt = Number(row.total_amount ?? 0);
    total += amt;
    const receipt = (row.notes as string | null)?.trim();
    if (receipt) receipts.push(receipt);

    const rawAllocations = row.erp_payment_allocations as unknown as Array<{
      amount: number;
      invoices: {
        id: string;
        invoice_number: string;
        due_date: string | null;
        total_amount: number;
        amount_paid: number;
        balance_due: number;
        status: string;
      } | null;
    }> | null;

    const allocations: BulkCustomerPaymentAllocationRow[] = (rawAllocations ?? [])
      .filter((a) => a.invoices)
      .map((a) => {
        const inv = a.invoices!;
        return {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          due_date: inv.due_date,
          invoice_amount: Number(inv.total_amount ?? 0),
          paid_amount: Number(a.amount ?? 0),
          total_paid_to_invoice: Number(inv.amount_paid ?? 0),
          current_balance: Number(inv.balance_due ?? 0),
          status: inv.status,
        };
      });

    invoicesCount += allocations.length;

    lines.push({
      payment_id: row.id,
      payment_number: row.payment_number,
      user_id: row.user_id,
      customer_name: customerNames.get(row.user_id) ?? null,
      amount: amt,
      receipt_ref: receipt || null,
      store_name: storeName,
      allocations,
    });
  }

  return {
    batch: {
      batch_id: ref,
      payment_date: first.payment_date as string,
      store_id: first.store_id as string,
      store_name: storeName,
      total_amount: total,
      payment_mode: first.payment_mode as string,
      account_name: null,
      receipts: receipts.length ? receipts.join(", ") : null,
      customer_count: lines.length,
      invoices_count: invoicesCount,
      created_by_name: first.created_by
        ? creatorNames.get(first.created_by as string) ?? null
        : null,
      notes: (first.notes as string | null) ?? null,
    },
    lines,
  };
}

export async function recordBulkCustomerPaymentBatch(input: {
  storeId?: string;
  paymentDate: string;
  paymentMode: string;
  accountId: string;
  bankCharges?: number;
  bankChargesAccountId?: string | null;
  notes?: string;
  lines: Array<{ invoiceId: string; amount: number; receiptRef?: string }>;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);
  if (!input.accountId) throw new Error("Deposit account is required");
  if (input.lines.length === 0) throw new Error("Add at least one invoice payment");

  const invoiceIds = input.lines.map((l) => l.invoiceId);
  if (new Set(invoiceIds).size !== invoiceIds.length) {
    throw new Error("Duplicate invoice in bulk payment");
  }

  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, user_id, store_id, balance_due, invoice_number")
    .in("id", invoiceIds);

  if (invoiceError) throw new Error(invoiceError.message);

  const invoiceById = new Map((invoices ?? []).map((row) => [row.id, row]));
  const byCustomer = new Map<
    string,
    Array<{ invoiceId: string; amount: number; receiptRef?: string }>
  >();

  for (const line of input.lines) {
    if (line.amount <= 0) throw new Error("Payment amount must be positive");
    const invoice = invoiceById.get(line.invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.store_id !== storeId) throw new Error("Invoice belongs to a different store");
    if (line.amount > Number(invoice.balance_due ?? 0)) {
      throw new Error(`Amount exceeds balance for invoice ${invoice.invoice_number}`);
    }

    const existing = byCustomer.get(invoice.user_id) ?? [];
    existing.push(line);
    byCustomer.set(invoice.user_id, existing);
  }

  const batchId = `${CUSTOMER_BULK_REF_PREFIX}${randomUUID()}`;
  let customerIndex = 0;

  for (const [userId, customerLines] of byCustomer) {
    const totalAmount = customerLines.reduce((sum, line) => sum + line.amount, 0);
    const allocations = customerLines.map((line) => ({
      invoiceId: line.invoiceId,
      amount: line.amount,
    }));
    const receiptRefs = customerLines
      .map((line) => line.receiptRef?.trim())
      .filter((ref): ref is string => Boolean(ref));

    await recordCustomerPayment({
      userId,
      storeId,
      paymentDate: input.paymentDate,
      paymentMode: input.paymentMode,
      accountId: input.accountId,
      bankCharges: customerIndex === 0 ? (input.bankCharges ?? 0) : 0,
      bankChargesAccountId: customerIndex === 0 ? input.bankChargesAccountId : undefined,
      totalAmount,
      reference: batchId,
      notes:
        receiptRefs.join(", ") ||
        (customerIndex === 0 ? input.notes?.trim() : undefined),
      isBulk: true,
      allocations,
    });
    customerIndex += 1;
  }

  await logAuditEvent({
    action: "create_bulk_customer_payment",
    entityType: "customer_payment_batch",
    entityId: batchId,
    description: `Bulk customer payment batch: ${input.lines.reduce((s, l) => s + l.amount, 0)}`,
    storeId,
  });

  return batchId;
}

export async function deleteBulkCustomerPaymentBatch(batchId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const ref = resolveBulkBatchRef(batchId);

  const { data: payments, error: listError } = await supabase
    .from("erp_customer_payments")
    .select("id, erp_payment_allocations(invoice_id)")
    .eq("reference", ref)
    .eq("is_bulk", true);

  if (listError) throw new Error(listError.message);
  if (!payments?.length) throw new Error("Bulk payment not found");

  const invoiceIds = new Set<string>();
  for (const payment of payments) {
    const allocations = payment.erp_payment_allocations as unknown as Array<{ invoice_id: string }> | null;
    for (const alloc of allocations ?? []) {
      invoiceIds.add(alloc.invoice_id);
    }
  }

  const paymentIds = payments.map((p) => p.id);
  const { error: deleteError } = await supabase
    .from("erp_customer_payments")
    .delete()
    .in("id", paymentIds);

  if (deleteError) throw new Error(deleteError.message);

  for (const invoiceId of invoiceIds) {
    await supabase.rpc("recalculate_invoice_balance", { p_invoice_id: invoiceId });
  }

  await logAuditEvent({
    action: "delete",
    entityType: "customer_payment_batch",
    entityId: ref,
    description: "Bulk customer payment batch deleted",
  });
}
