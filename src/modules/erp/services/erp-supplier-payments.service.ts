import "server-only";

import { randomUUID } from "crypto";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  BulkSupplierPaymentBatchRow,
  BulkSupplierPaymentLine,
  ErpSupplierPaymentListRow,
  PaidThroughAccountOption,
  PayablePurchaseBillRow,
  SupplierPaymentAllocationInput,
  SupplierPaymentListSummary,
  SupplierPaymentModeTotals,
} from "@/common/erp/purchasing-types";
import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
import { logAuditEventRequired } from "@/modules/erp/services/audit-log.service";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { erpDocumentDateSortKey } from "@/lib/format-date";
import {
  requireErpStoreId,
  resolveErpStoreId,
  withAccountStoreScope,
} from "@/modules/erp/services/store-context.service";
import { getVendorPayables } from "@/modules/vendors/services/vendor-erp.service";
import {
  listExpenseAccounts,
  listIncomeAccounts,
} from "@/modules/erp/services/erp-payments.service";
import type { Json } from "@/lib/integrations/supabase/types";

const BULK_REF_PREFIX = "BULK:";

export interface SupplierPaymentListOptions {
  page?: number;
  limit?: number;
  isBulk?: boolean;
  storeId?: string;
  paymentMode?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

function emptyModeTotals(): SupplierPaymentModeTotals {
  return {
    Cash: 0,
    Card: 0,
    Cheque: 0,
    "Bank Remittance": 0,
    "Bank Transfer": 0,
    total: 0,
  };
}

function aggregateModeTotals(
  rows: Array<{ payment_mode: string; total_amount: number | string | null }>,
): SupplierPaymentModeTotals {
  const totals = emptyModeTotals();
  for (const row of rows) {
    const amt = Number(row.total_amount ?? 0);
    totals.total += amt;
    const mode = row.payment_mode;
    if (mode === "Cash") totals.Cash += amt;
    else if (mode === "Card") totals.Card += amt;
    else if (mode === "Cheque") totals.Cheque += amt;
    else if (mode === "Bank Remittance") totals["Bank Remittance"] += amt;
    else if (mode === "Bank Transfer") totals["Bank Transfer"] += amt;
  }
  return totals;
}

type SupplierPaymentSummaryRow = {
  payment_mode: string;
  total_amount: number | string | null;
  settlement_discount?: number | string | null;
  unallocated_amount?: number | string | null;
  bank_charges?: number | string | null;
};

function aggregateListSummary(
  rows: SupplierPaymentSummaryRow[],
  payable: number,
): SupplierPaymentListSummary {
  const modes = aggregateModeTotals(rows);
  let settlementDiscount = 0;
  let unallocated = 0;
  let bankCharges = 0;
  for (const row of rows) {
    settlementDiscount += Number(row.settlement_discount ?? 0);
    unallocated += Number(row.unallocated_amount ?? 0);
    bankCharges += Number(row.bank_charges ?? 0);
  }
  return {
    cash: modes.Cash,
    card: modes.Card,
    cheque: modes.Cheque,
    bankRemittance: modes["Bank Remittance"],
    bankTransfer: modes["Bank Transfer"],
    total: modes.total,
    settlementDiscount,
    unallocated,
    bankCharges,
    payable,
  };
}

async function sumOutstandingPayables(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storeId?: string,
): Promise<number> {
  const activeStoreId = await resolveErpStoreId(storeId);
  let query = supabase
    .from("erp_purchase_bills")
    .select("balance_due")
    .gt("balance_due", 0)
    .in("status", ["finalized", "partial"]);
  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0);
}

async function applyPaymentFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  options: SupplierPaymentListOptions,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const storeId = await resolveErpStoreId(options.storeId);

  if (options.isBulk === true) {
    query = query.eq("is_bulk", true).like("reference", `${BULK_REF_PREFIX}%`);
  } else if (options.isBulk === false) {
    query = query.eq("is_bulk", false);
  }

  if (storeId) query = query.eq("store_id", storeId);
  if (options.paymentMode && options.paymentMode !== "all") {
    query = query.eq("payment_mode", options.paymentMode);
  }
  if (options.dateFrom) query = query.gte("payment_date", options.dateFrom);
  if (options.dateTo) query = query.lte("payment_date", options.dateTo);

  if (options.search?.trim()) {
    const s = options.search.trim();
    const { data: vendorMatches } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", `%${s}%`)
      .limit(50);
    const vendorIds = (vendorMatches ?? []).map((v) => v.id);

    const { data: billMatches } = await supabase
      .from("erp_purchase_bills")
      .select("id")
      .ilike("purchase_bill_number", `%${s}%`)
      .limit(50);
    const billIds = (billMatches ?? []).map((b) => b.id);

    let paymentIdsFromBills: string[] = [];
    if (billIds.length > 0) {
      const { data: allocRows } = await supabase
        .from("erp_supplier_payment_allocations")
        .select("payment_id")
        .in("purchase_bill_id", billIds);
      paymentIdsFromBills = (allocRows ?? []).map((r) => r.payment_id);
    }

    const orParts = [`payment_number.ilike.%${s}%`, `reference.ilike.%${s}%`];
    if (vendorIds.length > 0) {
      orParts.push(`vendor_id.in.(${vendorIds.join(",")})`);
    }
    if (paymentIdsFromBills.length > 0) {
      orParts.push(`id.in.(${paymentIdsFromBills.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  return query;
}

const SUPPLIER_PAYMENT_ACCOUNT_SELECT =
  "accounts!erp_supplier_payments_account_id_fkey(name)";

const PAYMENT_LIST_SELECT =
  `id, payment_number, vendor_id, store_id, payment_date, payment_mode, total_amount, is_bulk, unallocated_amount, reference, created_at, vendors(name), stores(name), ${SUPPLIER_PAYMENT_ACCOUNT_SELECT}, erp_supplier_payment_allocations(amount, erp_purchase_bills(id, purchase_bill_number))`;

function mapPaymentListRow(row: Record<string, unknown>): ErpSupplierPaymentListRow {
  const vendor = row.vendors as { name: string | null } | null;
  const store = row.stores as { name: string } | null;
  const account = row.accounts as { name: string } | null;
  const allocations = (row.erp_supplier_payment_allocations ?? []) as Array<{
    amount: number;
    erp_purchase_bills: { id: string; purchase_bill_number: string } | null;
  }>;
  const billNumbers = allocations
    .map((a) => {
      const bill = a.erp_purchase_bills;
      return bill ? formatErpDocRef("PB", bill.id) : null;
    })
    .filter(Boolean)
    .join(", ");
  const paymentMadeFor =
    billNumbers || vendor?.name || "Supplier payment";

  return {
    id: row.id as string,
    payment_number: row.payment_number as string,
    vendor_id: row.vendor_id as string,
    store_id: row.store_id as string,
    payment_date: row.payment_date as string,
    payment_mode: row.payment_mode as string,
    total_amount: Number(row.total_amount ?? 0),
    is_bulk: row.is_bulk as boolean,
    unallocated_amount: Number(row.unallocated_amount ?? 0),
    vendor_name: vendor?.name ?? null,
    store_name: store?.name ?? null,
    reference: (row.reference as string | null) ?? null,
    account_name: account?.name ?? null,
    bill_numbers: billNumbers || null,
    payment_made_for: paymentMadeFor,
    created_at: (row.created_at as string | null) ?? null,
  };
}

export async function listSupplierPayments(
  options: SupplierPaymentListOptions = {},
): Promise<{
  data: ErpSupplierPaymentListRow[];
  total: number;
  modeTotals: SupplierPaymentModeTotals;
  summary: SupplierPaymentListSummary;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = options.page ?? 0;
  const limit = options.limit ?? 20;
  const from = page * limit;

  let listQuery = supabase
    .from("erp_supplier_payments")
    .select(PAYMENT_LIST_SELECT, { count: "exact" })
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  listQuery = await applyPaymentFilters(listQuery, options, supabase);

  const { data, error, count } = await listQuery;
  if (error) throw new Error(error.message);

  let summaryQuery = supabase
    .from("erp_supplier_payments")
    .select(
      "payment_mode, total_amount, settlement_discount, unallocated_amount, bank_charges",
    );
  summaryQuery = await applyPaymentFilters(summaryQuery, options, supabase);
  const { data: summaryRows, error: summaryErr } = await summaryQuery;
  if (summaryErr) throw new Error(summaryErr.message);

  const payable = await sumOutstandingPayables(supabase, options.storeId);
  const summary = aggregateListSummary(
    (summaryRows ?? []) as SupplierPaymentSummaryRow[],
    payable,
  );

  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapPaymentListRow(row)),
    total: count ?? 0,
    modeTotals: aggregateModeTotals(summaryRows ?? []),
    summary,
  };
}

export async function listSupplierExpenseAccounts(storeId?: string) {
  return listExpenseAccounts(storeId);
}

export async function listSupplierSettlementDiscountAccounts(storeId?: string) {
  return listIncomeAccounts(storeId);
}

export async function buildFifoAllocationsForBills(
  storeId: string,
  amount: number,
  excludeBillIds: string[] = [],
  vendorId?: string,
): Promise<SupplierPaymentAllocationInput[]> {
  if (amount <= 0) return [];

  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("erp_purchase_bills")
    .select("id, balance_due, due_date, purchase_date")
    .eq("store_id", storeId)
    .gt("balance_due", 0)
    .in("status", ["finalized", "partial"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("purchase_date", { ascending: true });

  if (vendorId) {
    query = query.eq("vendor_id", vendorId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const excluded = new Set(excludeBillIds);
  let remaining = amount;
  const allocations: SupplierPaymentAllocationInput[] = [];

  for (const bill of data ?? []) {
    if (remaining <= 0) break;
    if (excluded.has(bill.id)) continue;
    const balance = Number(bill.balance_due ?? 0);
    if (balance <= 0) continue;
    const alloc = Math.min(remaining, balance);
    allocations.push({ purchaseBillId: bill.id, amount: alloc });
    remaining -= alloc;
  }

  return allocations;
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

export async function listPayableBillsForVendor(
  vendorId: string,
  storeId?: string,
): Promise<PayablePurchaseBillRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);

  let query = supabase
    .from("erp_purchase_bills")
    .select(
      "id, purchase_bill_number, purchase_date, total_amount, amount_paid, balance_due",
    )
    .eq("vendor_id", vendorId)
    .gt("balance_due", 0)
    .in("status", ["finalized", "partial"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("purchase_date", { ascending: true });

  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    purchase_bill_number: row.purchase_bill_number,
    purchase_date: row.purchase_date,
    total_amount: Number(row.total_amount ?? 0),
    amount_paid: Number(row.amount_paid ?? 0),
    balance_due: Number(row.balance_due ?? 0),
  }));
}

async function buildAutoAllocations(
  vendorId: string,
  amount: number,
  storeId?: string,
): Promise<SupplierPaymentAllocationInput[]> {
  const bills = await listPayableBillsForVendor(vendorId, storeId);
  let remaining = amount;
  const allocations: SupplierPaymentAllocationInput[] = [];
  for (const bill of bills) {
    if (remaining <= 0) break;
    const alloc = Math.min(remaining, bill.balance_due);
    if (alloc <= 0) continue;
    allocations.push({ purchaseBillId: bill.id, amount: alloc });
    remaining -= alloc;
  }
  return allocations;
}

export async function recordSupplierPayment(input: {
  vendorId: string;
  storeId?: string;
  paymentDate: string;
  paymentMode: string;
  accountId?: string | null;
  totalAmount: number;
  reference?: string;
  notes?: string;
  isBulk?: boolean;
  allocations: SupplierPaymentAllocationInput[];
  autoAllocate?: boolean;
  bankCharges?: number;
  bankChargesAccountId?: string | null;
  settlementDiscount?: number;
  settlementDiscountAccountId?: string | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  if (!ERP_SUPPLIER_PAYMENT_MODES.includes(input.paymentMode as never)) {
    throw new Error("Invalid payment mode");
  }

  let allocations = input.allocations;
  if (allocations.length === 0 && input.autoAllocate) {
    allocations = await buildAutoAllocations(
      input.vendorId,
      input.totalAmount,
      storeId,
    );
    if (allocations.length === 0) {
      throw new Error("No open bills available for FIFO allocation.");
    }
  }

  if (allocations.length === 1) {
    const bill = await listPayableBillsForVendor(input.vendorId, storeId);
    const target = bill.find((b) => b.id === allocations[0].purchaseBillId);
    if (target && allocations[0].amount > target.balance_due) {
      throw new Error("Payment amount exceeds bill balance due");
    }
  }

  const settlementDiscount = input.settlementDiscount ?? 0;
  if (settlementDiscount > 0 && !input.settlementDiscountAccountId) {
    throw new Error("Discount account is required when settlement discount is recorded");
  }

  const allocTotal = allocations.reduce((s, a) => s + a.amount, 0);
  if (settlementDiscount > 0) {
    if (Math.abs(allocTotal - (input.totalAmount + settlementDiscount)) > 0.02) {
      throw new Error("Allocation total must equal payment amount plus settlement discount");
    }
  } else if (allocTotal > input.totalAmount) {
    throw new Error("Allocation total exceeds payment amount");
  }

  if (allocations.length > 0) {
    const billIds = allocations.map((a) => a.purchaseBillId);
    const { data: billRows, error: billLookupError } = await supabase
      .from("erp_purchase_bills")
      .select("id, vendor_id, store_id, purchase_bill_number, balance_due")
      .in("id", billIds);
    if (billLookupError) throw new Error(billLookupError.message);

    const billById = new Map((billRows ?? []).map((row) => [row.id, row]));
    for (const alloc of allocations) {
      const bill = billById.get(alloc.purchaseBillId);
      if (!bill) throw new Error("Purchase bill not found");
      if (bill.vendor_id !== input.vendorId) {
        throw new Error(`Bill ${bill.purchase_bill_number} does not belong to this vendor`);
      }
      if (bill.store_id !== storeId) {
        throw new Error(`Bill ${bill.purchase_bill_number} belongs to a different store`);
      }
      if (alloc.amount > Number(bill.balance_due ?? 0)) {
        throw new Error(`Amount exceeds balance for bill ${bill.purchase_bill_number}`);
      }
    }
  }

  const allocJson: Json = allocations.map((a) => ({
    purchase_bill_id: a.purchaseBillId,
    amount: a.amount,
  })) as Json;

  // Omit settlement RPC args when zero so PostgREST matches DBs that have not applied
  // 20261012210000_erp_settlement_discount.sql yet.
  const rpcArgs: Record<string, unknown> = {
    p_vendor_id: input.vendorId,
    p_store_id: storeId,
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_account_id: input.accountId ?? undefined,
    p_total_amount: input.totalAmount,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_is_bulk: input.isBulk ?? false,
    p_allocations: allocJson,
    p_bank_charges: input.bankCharges ?? 0,
    p_bank_charges_account_id: input.bankChargesAccountId ?? undefined,
  };
  if (settlementDiscount > 0) {
    rpcArgs.p_settlement_discount = settlementDiscount;
    rpcArgs.p_settlement_discount_account_id = input.settlementDiscountAccountId ?? undefined;
  }

  const { data, error } = await supabase.rpc("record_erp_supplier_payment", rpcArgs as never);

  if (error) throw new Error(error.message);

  const paymentId = data as string;
  const { data: paymentRow } = await supabase
    .from("erp_supplier_payments")
    .select("payment_number, reference, settlement_discount")
    .eq("id", paymentId)
    .maybeSingle();

  const paymentNumber = paymentRow?.payment_number ?? null;

  await logAuditEventRequired({
    action: input.isBulk ? "create_bulk_supplier_payment" : "supplier_payment",
    entityType: "supplier_payment",
    entityId: paymentId,
    description: paymentNumber
      ? `${input.isBulk ? "Bulk payment line" : "Payment made"} ${paymentNumber}: ${input.totalAmount}${
          settlementDiscount > 0 ? ` (settlement discount ${settlementDiscount})` : ""
        }`
      : `Supplier payment: ${input.totalAmount}`,
    metadata: {
      payment_number: paymentNumber,
      reference: paymentRow?.reference ?? input.reference ?? null,
      total_amount: input.totalAmount,
      settlement_discount: settlementDiscount > 0 ? settlementDiscount : undefined,
      is_bulk: input.isBulk ?? false,
    },
    storeId,
  });

  return paymentId;
}

export async function recordBulkSupplierPaymentBatch(input: {
  storeId?: string;
  paymentDate: string;
  paymentMode: string;
  accountId?: string | null;
  bankCharges?: number;
  bankChargesAccountId?: string | null;
  notes?: string;
  billLines: Array<{ purchaseBillId: string; amount: number }>;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const storeId = await requireErpStoreId(input.storeId);
  if (!input.accountId) throw new Error("Paid through account is required");
  if (input.billLines.length === 0) throw new Error("Add at least one bill payment");

  const billIds = input.billLines.map((l) => l.purchaseBillId);
  if (new Set(billIds).size !== billIds.length) {
    throw new Error("Duplicate bill in bulk payment");
  }

  const supabase = await createSupabaseServerClient();
  const { data: bills, error: billError } = await supabase
    .from("erp_purchase_bills")
    .select("id, vendor_id, store_id, balance_due, purchase_bill_number")
    .in("id", billIds);

  if (billError) throw new Error(billError.message);

  const billById = new Map((bills ?? []).map((row) => [row.id, row]));
  const byVendor = new Map<string, Array<{ purchaseBillId: string; amount: number }>>();

  for (const line of input.billLines) {
    if (line.amount <= 0) throw new Error("Payment amount must be positive");
    const bill = billById.get(line.purchaseBillId);
    if (!bill) throw new Error("Purchase bill not found");
    if (bill.store_id !== storeId) throw new Error("Bill belongs to a different store");
    if (line.amount > Number(bill.balance_due ?? 0)) {
      throw new Error(`Amount exceeds balance for bill ${bill.purchase_bill_number}`);
    }

    const existing = byVendor.get(bill.vendor_id) ?? [];
    existing.push(line);
    byVendor.set(bill.vendor_id, existing);
  }

  const batchId = `${BULK_REF_PREFIX}${randomUUID()}`;

  const bulkLines: Json = [];
  for (const [vendorId, vendorLines] of byVendor) {
    const totalAmount = vendorLines.reduce((sum, line) => sum + line.amount, 0);
    (bulkLines as unknown[]).push({
      vendor_id: vendorId,
      amount: totalAmount,
      allocations: vendorLines.map((line) => ({
        purchase_bill_id: line.purchaseBillId,
        amount: line.amount,
      })),
    });
  }

  const { error: bulkError } = await supabase.rpc("record_erp_supplier_bulk_payment", {
    p_store_id: storeId,
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_account_id: input.accountId ?? undefined,
    p_reference: batchId,
    p_notes: input.notes ?? undefined,
    p_lines: bulkLines,
    p_bank_charges: input.bankCharges ?? 0,
    p_bank_charges_account_id: input.bankChargesAccountId ?? undefined,
  });

  if (bulkError) throw new Error(bulkError.message);

  const batchTotal = input.billLines.reduce((s, l) => s + l.amount, 0);
  await logAuditEventRequired({
    action: "create_bulk_supplier_payment",
    entityType: "supplier_payment_batch",
    entityId: batchId,
    description: `Bulk supplier payment ${batchTotal} — ${input.billLines.length} bill(s), ${byVendor.size} vendor(s)`,
    metadata: {
      reference: batchId,
      batch_ref: batchId,
      total_amount: batchTotal,
      bill_count: input.billLines.length,
      vendor_count: byVendor.size,
    },
    storeId,
  });

  return batchId;
}

async function summarizeBulkSupplierPayments(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  options: {
    storeId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  },
): Promise<SupplierPaymentListSummary> {
  const storeId = await resolveErpStoreId(options.storeId);

  let summaryQuery = supabase
    .from("erp_supplier_payments")
    .select(
      "payment_mode, total_amount, settlement_discount, unallocated_amount, bank_charges",
    )
    .eq("is_bulk", true)
    .like("reference", `${BULK_REF_PREFIX}%`);

  if (storeId) summaryQuery = summaryQuery.eq("store_id", storeId);
  if (options.dateFrom) summaryQuery = summaryQuery.gte("payment_date", options.dateFrom);
  if (options.dateTo) summaryQuery = summaryQuery.lte("payment_date", options.dateTo);
  if (options.search?.trim()) {
    const s = options.search.trim();
    summaryQuery = summaryQuery.or(`reference.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  const { data: summaryRows, error: summaryErr } = await summaryQuery;
  if (summaryErr) throw new Error(summaryErr.message);

  const payable = await sumOutstandingPayables(supabase, options.storeId);
  return aggregateListSummary(
    (summaryRows ?? []) as SupplierPaymentSummaryRow[],
    payable,
  );
}

export async function listBulkPaymentBatches(
  options: {
    page?: number;
    limit?: number;
    storeId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  } = {},
): Promise<{
  data: BulkSupplierPaymentBatchRow[];
  total: number;
  summary: SupplierPaymentListSummary;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await resolveErpStoreId(options.storeId);

  let query = supabase
    .from("erp_supplier_payments")
    .select(
      `reference, payment_date, store_id, payment_mode, total_amount, notes, created_by, created_at, stores(name), ${SUPPLIER_PAYMENT_ACCOUNT_SELECT}`,
    )
    .eq("is_bulk", true)
    .like("reference", `${BULK_REF_PREFIX}%`);

  if (storeId) query = query.eq("store_id", storeId);
  if (options.dateFrom) query = query.gte("payment_date", options.dateFrom);
  if (options.dateTo) query = query.lte("payment_date", options.dateTo);
  if (options.search?.trim()) {
    const s = options.search.trim();
    query = query.or(`reference.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const batchMap = new Map<string, BulkSupplierPaymentBatchRow>();
  for (const row of data ?? []) {
    const ref = row.reference as string;
    if (!ref?.startsWith(BULK_REF_PREFIX)) continue;
    const store = row.stores as { name: string } | null;
    const account = row.accounts as { name: string } | null;
    const existing = batchMap.get(ref);
    const amt = Number(row.total_amount ?? 0);
    const createdAt = (row.created_at as string | null) ?? null;
    if (existing) {
      existing.total_amount += amt;
      existing.supplier_count += 1;
      if (
        createdAt &&
        (!existing.created_at || createdAt.localeCompare(existing.created_at) > 0)
      ) {
        existing.created_at = createdAt;
      }
    } else {
      batchMap.set(ref, {
        batch_id: ref,
        payment_date: row.payment_date as string,
        store_id: row.store_id as string,
        store_name: store?.name ?? null,
        total_amount: amt,
        payment_mode: row.payment_mode as string,
        account_name: account?.name ?? null,
        notes: (row.notes as string | null) ?? null,
        created_by_name: row.created_by ? String(row.created_by).slice(0, 8) : null,
        supplier_count: 1,
        created_at: createdAt,
      });
    }
  }

  const batches = Array.from(batchMap.values()).sort((a, b) =>
    erpDocumentDateSortKey(b.payment_date, b).localeCompare(
      erpDocumentDateSortKey(a.payment_date, a),
    ),
  );

  const page = options.page ?? 0;
  const limit = options.limit ?? 20;
  const from = page * limit;
  const sliced = batches.slice(from, from + limit);

  const summary = await summarizeBulkSupplierPayments(supabase, options);

  return { data: sliced, total: batches.length, summary };
}

export async function getBulkPaymentBatchDetail(
  batchId: string,
): Promise<{
  batch: BulkSupplierPaymentBatchRow;
  lines: BulkSupplierPaymentLine[];
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const ref = batchId.startsWith(BULK_REF_PREFIX) ? batchId : `${BULK_REF_PREFIX}${batchId}`;

  const { data, error } = await supabase
    .from("erp_supplier_payments")
    .select(
      `id, payment_number, vendor_id, payment_date, store_id, payment_mode, total_amount, notes, reference, created_by, vendors(name), stores(name), ${SUPPLIER_PAYMENT_ACCOUNT_SELECT}`,
    )
    .eq("reference", ref)
    .eq("is_bulk", true);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Bulk payment not found");

  const first = data[0];
  const store = first.stores as { name: string } | null;
  const account = first.accounts as { name: string } | null;

  const lines: BulkSupplierPaymentLine[] = [];
  let total = 0;
  for (const row of data) {
    const vendor = row.vendors as { name: string | null } | null;
    const amt = Number(row.total_amount ?? 0);
    total += amt;
    const balance = await getVendorPayables(row.vendor_id, row.store_id);
    lines.push({
      payment_id: row.id,
      payment_number: row.payment_number,
      vendor_id: row.vendor_id,
      vendor_name: vendor?.name ?? null,
      amount: amt,
      current_balance: balance,
    });
  }

  return {
    batch: {
      batch_id: ref,
      payment_date: first.payment_date,
      store_id: first.store_id,
      store_name: store?.name ?? null,
      total_amount: total,
      payment_mode: first.payment_mode,
      account_name: account?.name ?? null,
      notes: first.notes,
      created_by_name: first.created_by ? String(first.created_by).slice(0, 8) : null,
      supplier_count: data.length,
    },
    lines,
  };
}

export async function getSupplierPaymentDetail(paymentId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_supplier_payments")
    .select(
      `*, vendors(name), stores(name), ${SUPPLIER_PAYMENT_ACCOUNT_SELECT}, bank_charges_account:accounts!erp_supplier_payments_bank_charges_account_id_fkey(name), settlement_discount_account:accounts!erp_supplier_payments_settlement_discount_account_id_fkey(name), erp_supplier_payment_allocations(*, erp_purchase_bills(id, purchase_bill_number, total_amount, balance_due))`,
    )
    .eq("id", paymentId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
