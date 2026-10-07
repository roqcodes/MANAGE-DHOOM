import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpPurchaseBillListRow,
  VendorErpProfile,
  VendorErpSummary,
  VendorStatementLine,
} from "@/common/erp/purchasing-types";
import { derivePurchaseBillDisplayStatus } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";

export interface VendorErpProfileUpdate {
  name?: string | null;
  contact?: string | null;
  vendorType?: string | null;
  trn?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  address?: string | null;
  poBox?: string | null;
  notes?: string | null;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  isActive?: boolean;
}

/** Authoritative vendor outstanding payable for a store context. */
export async function getVendorPayables(
  vendorId: string,
  storeId?: string,
): Promise<number> {
  const summary = await getVendorErpSummary(vendorId, storeId);
  return summary.balanceDue;
}

export async function getVendorErpProfile(vendorId: string): Promise<VendorErpProfile | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("vendors")
    .select(
      "id, name, contact, vendor_type, trn, phone, fax, email, address, po_box, notes, opening_balance, opening_balance_date, is_active, created_at",
    )
    .eq("id", vendorId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    contact: data.contact,
    vendor_type: data.vendor_type,
    trn: data.trn,
    phone: data.phone,
    fax: data.fax,
    email: data.email,
    address: data.address,
    po_box: data.po_box,
    notes: data.notes,
    opening_balance: Number(data.opening_balance ?? 0),
    opening_balance_date: data.opening_balance_date,
    is_active: data.is_active,
    created_at: data.created_at,
  };
}

export async function updateVendorErpProfile(
  vendorId: string,
  input: VendorErpProfileUpdate,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  if (
    input.openingBalance !== undefined &&
    input.openingBalance !== 0 &&
    !input.openingBalanceDate
  ) {
    throw new Error("Opening balance date is required when opening balance is set");
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contact !== undefined ? { contact: input.contact } : {}),
      ...(input.vendorType !== undefined ? { vendor_type: input.vendorType } : {}),
      ...(input.trn !== undefined ? { trn: input.trn } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.fax !== undefined ? { fax: input.fax } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.poBox !== undefined ? { po_box: input.poBox } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.openingBalance !== undefined
        ? { opening_balance: input.openingBalance }
        : {}),
      ...(input.openingBalanceDate !== undefined
        ? { opening_balance_date: input.openingBalanceDate }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendorId);

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "vendor",
    entityId: vendorId,
    description: "Vendor ERP profile updated",
  });
}

export async function getVendorErpSummary(
  vendorId: string,
  storeId?: string,
): Promise<VendorErpSummary> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("opening_balance, opening_balance_date")
    .eq("id", vendorId)
    .single();
  if (vendorErr) throw new Error(vendorErr.message);

  let billsQuery = supabase
    .from("erp_purchase_bills")
    .select("total_amount, balance_due, amount_paid")
    .eq("vendor_id", vendorId)
    .in("status", ["finalized", "partial", "paid"]);
  if (storeId) billsQuery = billsQuery.eq("store_id", storeId);

  const { data: bills } = await billsQuery;

  const billTotal = (bills ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
  const payables = (bills ?? []).reduce((s, b) => s + Number(b.balance_due ?? 0), 0);
  const paymentMade = (bills ?? []).reduce((s, b) => s + Number(b.amount_paid ?? 0), 0);

  let creditsQuery = supabase
    .from("erp_vendor_credits")
    .select("total_amount, balance_remaining")
    .eq("vendor_id", vendorId)
    .in("status", ["issued", "applied"]);
  if (storeId) creditsQuery = creditsQuery.eq("store_id", storeId);

  const { data: credits } = await creditsQuery;

  const creditTotal = (credits ?? []).reduce((s, c) => s + Number(c.total_amount ?? 0), 0);
  const creditBalance = (credits ?? []).reduce(
    (s, c) => s + Number(c.balance_remaining ?? 0),
    0,
  );

  const openingBalance = Number(vendor.opening_balance ?? 0);
  const balanceDue = openingBalance + payables - creditBalance;

  return {
    openingBalance,
    openingBalanceDate: vendor.opening_balance_date,
    billTotal,
    paymentMade,
    creditTotal,
    creditBalance,
    refundTotal: 0,
    balanceDue,
    payables,
  };
}

export async function getVendorStatement(
  vendorId: string,
  storeId?: string,
): Promise<VendorStatementLine[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("opening_balance, opening_balance_date")
    .eq("id", vendorId)
    .single();

  type StmtEvent = {
    date: string;
    storeName: string | null;
    transactionType: string;
    details: string;
    amount: number;
    payments: number;
  };

  const events: StmtEvent[] = [];

  if (vendor?.opening_balance_date) {
    events.push({
      date: vendor.opening_balance_date,
      storeName: null,
      transactionType: "Opening Balance",
      details: "Opening balance",
      amount: Number(vendor.opening_balance ?? 0),
      payments: 0,
    });
  }

  let billsQuery = supabase
    .from("erp_purchase_bills")
    .select("purchase_date, purchase_bill_number, total_amount, stores(name)")
    .eq("vendor_id", vendorId)
    .in("status", ["finalized", "partial", "paid"]);
  if (storeId) billsQuery = billsQuery.eq("store_id", storeId);

  const { data: bills } = await billsQuery;

  for (const bill of bills ?? []) {
    const store = bill.stores as { name: string } | null;
    events.push({
      date: bill.purchase_date,
      storeName: store?.name ?? null,
      transactionType: "Purchase",
      details: bill.purchase_bill_number,
      amount: Number(bill.total_amount ?? 0),
      payments: 0,
    });
  }

  let paymentsQuery = supabase
    .from("erp_supplier_payments")
    .select("payment_date, payment_number, total_amount, stores(name)")
    .eq("vendor_id", vendorId);
  if (storeId) paymentsQuery = paymentsQuery.eq("store_id", storeId);

  const { data: payments } = await paymentsQuery;

  for (const pay of payments ?? []) {
    const store = pay.stores as { name: string } | null;
    events.push({
      date: pay.payment_date,
      storeName: store?.name ?? null,
      transactionType: "Payment",
      details: pay.payment_number,
      amount: 0,
      payments: Number(pay.total_amount ?? 0),
    });
  }

  let creditsQuery = supabase
    .from("erp_vendor_credits")
    .select("credit_date, credit_number, total_amount, stores(name)")
    .eq("vendor_id", vendorId)
    .in("status", ["issued", "applied"]);
  if (storeId) creditsQuery = creditsQuery.eq("store_id", storeId);

  const { data: creditRows } = await creditsQuery;

  for (const credit of creditRows ?? []) {
    const store = credit.stores as { name: string } | null;
    events.push({
      date: credit.credit_date,
      storeName: store?.name ?? null,
      transactionType: "Credit",
      details: credit.credit_number,
      amount: 0,
      payments: Number(credit.total_amount ?? 0),
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const lines: VendorStatementLine[] = [];
  for (const ev of events) {
    running += ev.amount - ev.payments;
    lines.push({
      date: ev.date,
      storeName: ev.storeName,
      transactionType: ev.transactionType,
      details: ev.details,
      amount: ev.amount,
      payments: ev.payments,
      balance: running,
    });
  }

  return lines;
}

export async function getVendorPurchaseBills(
  vendorId: string,
  storeId?: string,
  page = 0,
  limit = 20,
): Promise<{ data: ErpPurchaseBillListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;

  let query = supabase
    .from("erp_purchase_bills")
    .select(
      "id, purchase_bill_number, vendor_bill_number, vendor_id, store_id, po_id, status, total_amount, amount_paid, credits_applied, balance_due, purchase_date, due_date, vendors(name), stores(name), purchase_orders(po_number)",
      { count: "exact" },
    )
    .eq("vendor_id", vendorId)
    .order("purchase_date", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const vendor = row.vendors as { name: string | null } | null;
      const store = row.stores as { name: string } | null;
      const po = row.purchase_orders as { po_number: string | null } | null;
      const balanceDue = Number(row.balance_due ?? 0);
      return {
        id: row.id,
        purchase_bill_number: row.purchase_bill_number,
        vendor_bill_number: row.vendor_bill_number,
        vendor_id: row.vendor_id,
        store_id: row.store_id,
        po_id: row.po_id,
        status: row.status,
        display_status: derivePurchaseBillDisplayStatus(
          row.status,
          balanceDue,
          row.due_date,
        ),
        total_amount: Number(row.total_amount ?? 0),
        amount_paid: Number(row.amount_paid ?? 0),
        credits_applied: Number(row.credits_applied ?? 0),
        balance_due: balanceDue,
        purchase_date: row.purchase_date,
        due_date: row.due_date,
        vendor_name: vendor?.name ?? null,
        store_name: store?.name ?? null,
        po_number: po?.po_number ?? null,
      };
    }),
    total: count ?? 0,
  };
}
