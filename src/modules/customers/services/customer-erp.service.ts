import "server-only";

import { randomUUID } from "crypto";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  CustomerErpProfile,
  CustomerErpSummary,
  CustomerInvoiceRow,
  CustomerStatementLine,
} from "@/common/erp/sales-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { nullIfEmptyDate } from "@/lib/format-date";
import {
  assertUniqueCustomerCompanyName,
  rethrowUniqueNameViolation,
} from "@/lib/erp/master-name-uniqueness";
import { staffCustomerCreditLimitsClient } from "@/lib/erp/customer-credit-limits-db";
import { assertCreditLimitAtLeastExposure } from "@/modules/credit/services/credit-limits.service";

async function upsertCustomerCreditLimit(userId: string, creditLimit: number) {
  await assertCreditLimitAtLeastExposure(userId, creditLimit);
  const supabase = await staffCustomerCreditLimitsClient();
  const { error } = await supabase.from("customer_credit_limits").upsert(
    {
      user_id: userId,
      credit_limit: creditLimit,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export interface CustomerProfileInput {
  firstName?: string;
  lastName?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  landline?: string | null;
  companyName?: string | null;
  trn?: string | null;
  contactDisplayName?: string | null;
  location?: string | null;
  poBox?: string | null;
  customerNotes?: string | null;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  creditLimit?: number | null;
  address?: string | null;
  avatarUrl?: string | null;
}

export type CustomerProfileUpdate = CustomerProfileInput;

async function nextCustomerNumber(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string> {
  const { data } = await supabase
    .from("users")
    .select("customer_number")
    .not("customer_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  let max = 0;
  for (const row of data ?? []) {
    const n = parseInt(row.customer_number ?? "", 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

function buildCustomerName(input: CustomerProfileInput): string {
  if (input.name?.trim()) return input.name.trim();
  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean);
  return parts.join(" ").trim();
}

export async function createCustomer(input: CustomerProfileInput): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const companyName = input.companyName?.trim();
  if (!companyName) throw new Error("Company name is required");
  await assertUniqueCustomerCompanyName(supabase, companyName);

  const name = buildCustomerName(input) || companyName;
  const openingBalance = input.openingBalance ?? 0;
  if (openingBalance !== 0 && !input.openingBalanceDate) {
    throw new Error("Opening balance date is required when opening balance is set");
  }

  const customerNumber = await nextCustomerNumber(supabase);
  const id = randomUUID();

  const { error } = await supabase.from("users").insert({
    id,
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || input.landline?.trim() || null,
    role: null,
    is_verified: true,
    customer_number: customerNumber,
    company_name: companyName,
    trn: input.trn?.trim() || null,
    contact_display_name: input.contactDisplayName?.trim() || name,
    location: input.location?.trim() || null,
    po_box: input.poBox?.trim() || null,
    customer_notes: input.customerNotes?.trim() || null,
    opening_balance: openingBalance,
    opening_balance_date: nullIfEmptyDate(input.openingBalanceDate),
    avatar_url: input.avatarUrl?.trim() || null,
  });
  if (error) {
    rethrowUniqueNameViolation(error, "customer");
    throw new Error(error.message);
  }

  if (input.address?.trim()) {
    const { error: addressError } = await supabase.from("addresses").insert({
      user_id: id,
      label: "Primary",
      line1: input.address.trim(),
      city: input.location?.trim() || "—",
      state: "—",
      pincode: "—",
      phone: input.phone?.trim() || input.landline?.trim() || "—",
      is_default: true,
    });
    if (addressError) {
      throw new Error(
        `Customer was created, but the address could not be saved. Open the customer record to add the address. (${addressError.message})`,
      );
    }
  }

  if (input.creditLimit != null && input.creditLimit > 0) {
    await upsertCustomerCreditLimit(id, input.creditLimit);
  }

  await logAuditEvent({
    action: "create",
    entityType: "customer",
    entityId: id,
    description: `Customer created: ${name}`,
  });

  return id;
}

export async function getCustomerProfile(userId: string): Promise<CustomerErpProfile> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, name, email, phone, avatar_url, customer_number, company_name, trn, contact_display_name, location, po_box, customer_notes, opening_balance, opening_balance_date, is_verified, created_at",
    )
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);

  const [{ data: creditRow }, { data: addressRow }, exposure] = await Promise.all([
    supabase
      .from("customer_credit_limits")
      .select("credit_limit")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("addresses")
      .select("line1, line2, city, state, pincode")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle(),
    supabase.rpc("get_customer_ar_exposure", {
      p_user_id: userId,
      p_exclude_invoice_id: null,
    }),
  ]);
  if (exposure.error) throw new Error(exposure.error.message);

  const addressParts = addressRow
    ? [addressRow.line1, addressRow.line2, addressRow.city, addressRow.state, addressRow.pincode]
        .filter(Boolean)
        .join(", ")
    : null;

  return {
    id: user.id,
    customerNumber: user.customer_number,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url?.trim() || null,
    companyName: user.company_name,
    trn: user.trn,
    contactDisplayName: user.contact_display_name,
    location: user.location,
    poBox: user.po_box,
    customerNotes: user.customer_notes,
    openingBalance: Number(user.opening_balance ?? 0),
    openingBalanceDate: user.opening_balance_date,
    creditLimit: creditRow?.credit_limit != null ? Number(creditRow.credit_limit) : null,
    outstandingBalance: Number(exposure.data ?? 0),
    address: addressParts || null,
    isVerified: user.is_verified !== false,
    createdAt: user.created_at,
  };
}

export async function updateCustomerProfile(
  userId: string,
  input: CustomerProfileUpdate,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const name = buildCustomerName(input);
  const openingBalance = input.openingBalance;

  if (
    openingBalance !== undefined &&
    openingBalance !== 0 &&
    !input.openingBalanceDate
  ) {
    throw new Error("Opening balance date is required when opening balance is set");
  }

  if (input.companyName !== undefined) {
    const companyName = input.companyName?.trim();
    if (!companyName) throw new Error("Company name is required");
    await assertUniqueCustomerCompanyName(supabase, companyName, userId);
  }

  const { error } = await supabase
    .from("users")
    .update({
      ...(name ? { name } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.companyName !== undefined
        ? { company_name: input.companyName?.trim() || null }
        : {}),
      ...(input.trn !== undefined ? { trn: input.trn?.trim() || null } : {}),
      ...(input.contactDisplayName !== undefined
        ? { contact_display_name: input.contactDisplayName?.trim() || null }
        : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
      ...(input.poBox !== undefined ? { po_box: input.poBox?.trim() || null } : {}),
      ...(input.customerNotes !== undefined
        ? { customer_notes: input.customerNotes?.trim() || null }
        : {}),
      ...(openingBalance !== undefined ? { opening_balance: openingBalance } : {}),
      ...(input.openingBalanceDate !== undefined
        ? { opening_balance_date: nullIfEmptyDate(input.openingBalanceDate) }
        : {}),
      ...(input.avatarUrl !== undefined
        ? { avatar_url: input.avatarUrl?.trim() || null }
        : {}),
    })
    .eq("id", userId);
  if (error) {
    rethrowUniqueNameViolation(error, "customer");
    throw new Error(error.message);
  }

  if (input.address !== undefined) {
    const { data: existing } = await supabase
      .from("addresses")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (input.address?.trim()) {
      if (existing?.id) {
        const { error: addressUpdateError } = await supabase
          .from("addresses")
          .update({ line1: input.address.trim(), label: "Primary" })
          .eq("id", existing.id);
        if (addressUpdateError) throw new Error(addressUpdateError.message);
      } else {
        const { error: addressInsertError } = await supabase.from("addresses").insert({
          user_id: userId,
          label: "Primary",
          line1: input.address.trim(),
          city: input.location?.trim() || "—",
          state: "—",
          pincode: "—",
          phone: input.phone?.trim() || input.landline?.trim() || "—",
          is_default: true,
        });
        if (addressInsertError) throw new Error(addressInsertError.message);
      }
    }
  }

  if (input.creditLimit !== undefined) {
    const creditClient = await staffCustomerCreditLimitsClient();
    if (input.creditLimit == null || input.creditLimit <= 0) {
      const { error: creditDeleteError } = await creditClient
        .from("customer_credit_limits")
        .delete()
        .eq("user_id", userId);
      if (creditDeleteError) throw new Error(creditDeleteError.message);
    } else {
      await upsertCustomerCreditLimit(userId, input.creditLimit);
    }
  }

  await logAuditEvent({
    action: "update",
    entityType: "customer",
    entityId: userId,
    description: "Customer profile updated",
  });
}

export async function deleteCustomerIfUnused(userId: string): Promise<void> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await invokeRpc(supabase, "delete_erp_customer_if_unused", {
    p_user_id: userId,
    p_actor: profile.id,
  });
  if (error) {
    throw new Error(error.message.replace(/^(P0001:\s*)/i, ""));
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (
    authError &&
    !/not found|unable to find|user does not exist/i.test(authError.message)
  ) {
    throw new Error(
      `Customer removed but sign-in may remain: ${authError.message}`,
    );
  }
}

export async function getCustomerErpSummary(
  userId: string,
  storeId?: string,
): Promise<CustomerErpSummary> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("opening_balance")
    .eq("id", userId)
    .single();
  if (userErr) throw new Error(userErr.message);

  let invoicesQuery = supabase
    .from("invoices")
    .select("total_amount, balance_due, amount_paid")
    .eq("user_id", userId)
    .neq("status", "cancelled");
  if (storeId) invoicesQuery = invoicesQuery.eq("store_id", storeId);

  let creditNotesQuery = supabase
    .from("erp_credit_notes")
    .select("total_amount, balance_remaining")
    .eq("user_id", userId)
    .in("status", ["issued", "applied"]);
  if (storeId) creditNotesQuery = creditNotesQuery.eq("store_id", storeId);

  const [{ data: invoices }, { data: creditNotes }, { data: creditRow }, { data: payments }] =
    await Promise.all([
      invoicesQuery,
      creditNotesQuery,
      supabase
        .from("customer_credit_limits")
        .select("credit_limit")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("erp_customer_payments")
        .select("unallocated_amount")
        .eq("user_id", userId)
        .gt("unallocated_amount", 0),
    ]);

  const invoiceTotal = (invoices ?? []).reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  const receivables = (invoices ?? []).reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
  const paymentReceived = (invoices ?? []).reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);

  const creditNoteTotal = (creditNotes ?? []).reduce(
    (s, c) => s + Number(c.total_amount ?? 0),
    0,
  );
  const creditBalance = (creditNotes ?? []).reduce(
    (s, c) => s + Number(c.balance_remaining ?? 0),
    0,
  );

  const openingBalance = Number(user.opening_balance ?? 0);
  const balanceDue = openingBalance + receivables - creditBalance;
  const unallocatedPayments = (payments ?? []).reduce(
    (s, p) => s + Number(p.unallocated_amount ?? 0),
    0,
  );

  return {
    openingBalance,
    invoiceTotal,
    invoiceCount: invoices?.length ?? 0,
    creditNoteTotal,
    creditNoteCount: creditNotes?.length ?? 0,
    creditBalance,
    paymentReceived,
    balanceDue,
    receivables: balanceDue,
    creditLimit: creditRow?.credit_limit != null ? Number(creditRow.credit_limit) : null,
    unallocatedPayments,
  };
}

type StoreNameEmbed = { name: string } | null;

function storeNameFromEmbed(value: unknown): string | null {
  const store = value as StoreNameEmbed;
  return store?.name ?? null;
}

export async function getCustomerErpBundle(userId: string): Promise<{
  summary: CustomerErpSummary;
  statement: CustomerStatementLine[];
  invoices: CustomerInvoiceRow[];
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("opening_balance, opening_balance_date")
    .eq("id", userId)
    .single();
  if (userErr) throw new Error(userErr.message);

  const [invoicesRes, creditNotesRes, paymentsRes, creditLimitRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, created_at, issued_at, due_date, total_amount, amount_paid, balance_due, status, stores(name)",
      )
      .eq("user_id", userId)
      .in("status", ["issued", "partial", "paid", "overdue"]),
    supabase
      .from("erp_credit_notes")
      .select(
        "credit_note_number, total_amount, balance_remaining, credit_note_date, created_at, stores(name)",
      )
      .eq("user_id", userId)
      .in("status", ["issued", "applied"]),
    supabase
      .from("erp_customer_payments")
      .select(
        "payment_number, total_amount, payment_date, unallocated_amount, settlement_discount, created_at, stores(name)",
      )
      .eq("user_id", userId),
    supabase
      .from("customer_credit_limits")
      .select("credit_limit")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (creditNotesRes.error) throw new Error(creditNotesRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (creditLimitRes.error) throw new Error(creditLimitRes.error.message);

  const invoices = invoicesRes.data ?? [];
  const creditNotes = creditNotesRes.data ?? [];
  const payments = paymentsRes.data ?? [];

  const invoiceTotal = invoices.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  const receivables = invoices.reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
  const paymentReceived = invoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
  const creditNoteTotal = creditNotes.reduce((s, c) => s + Number(c.total_amount ?? 0), 0);
  const creditBalance = creditNotes.reduce((s, c) => s + Number(c.balance_remaining ?? 0), 0);
  const openingBalance = Number(user.opening_balance ?? 0);
  const balanceDue = openingBalance + receivables - creditBalance;
  const unallocatedPayments = payments.reduce(
    (s, p) => s + Number(p.unallocated_amount ?? 0),
    0,
  );

  const summary: CustomerErpSummary = {
    openingBalance,
    invoiceTotal,
    invoiceCount: invoices.length,
    creditNoteTotal,
    creditNoteCount: creditNotes.length,
    creditBalance,
    paymentReceived,
    balanceDue,
    receivables: balanceDue,
    creditLimit:
      creditLimitRes.data?.credit_limit != null
        ? Number(creditLimitRes.data.credit_limit)
        : null,
    unallocatedPayments,
  };

  type StatementEvent = {
    sortTs: string;
    sortKey: number;
    date: string;
    storeName: string | null;
    transactionType: string;
    details: string;
    debit: number;
    credit: number;
  };

  const events: StatementEvent[] = [];
  for (const inv of invoices) {
    const issuedAt = inv.issued_at ?? inv.created_at ?? "";
    events.push({
      sortTs: issuedAt,
      sortKey: 1,
      date: issuedAt.slice(0, 10) || "",
      storeName: storeNameFromEmbed(inv.stores),
      transactionType: "invoice",
      details: inv.invoice_number,
      debit: Number(inv.total_amount ?? 0),
      credit: 0,
    });
  }
  for (const p of payments) {
    const createdAt = p.created_at ?? "";
    events.push({
      sortTs: createdAt || `${p.payment_date}T12:00:00`,
      sortKey: 2,
      date: p.payment_date,
      storeName: storeNameFromEmbed(p.stores),
      transactionType: "payment",
      details: p.payment_number,
      debit: 0,
      credit:
        Number(p.total_amount ?? 0) + Number(p.settlement_discount ?? 0),
    });
  }
  for (const cn of creditNotes) {
    const createdAt = cn.created_at ?? "";
    events.push({
      sortTs: createdAt || `${cn.credit_note_date}T12:00:00`,
      sortKey: 3,
      date: cn.credit_note_date,
      storeName: storeNameFromEmbed(cn.stores),
      transactionType: "credit_note",
      details: cn.credit_note_number,
      debit: 0,
      credit: Number(cn.total_amount ?? 0),
    });
  }
  events.sort(
    (a, b) =>
      a.sortTs.localeCompare(b.sortTs) ||
      a.sortKey - b.sortKey ||
      a.details.localeCompare(b.details),
  );

  const statement: CustomerStatementLine[] = [];
  let running = openingBalance;
  if (user.opening_balance_date) {
    statement.push({
      date: user.opening_balance_date,
      storeName: null,
      transactionType: "opening_balance",
      details: "Opening Balance",
      amount: running,
      payments: 0,
      balance: running,
    });
  }
  for (const event of events) {
    running += event.debit - event.credit;
    statement.push({
      date: event.date,
      storeName: event.storeName,
      transactionType: event.transactionType,
      details: event.details,
      amount: event.debit,
      payments: event.credit,
      balance: running,
    });
  }

  const invoiceRows: CustomerInvoiceRow[] = [...invoices]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 50)
    .map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      createdAt: row.created_at ?? "",
      dueDate: row.due_date,
      totalAmount: Number(row.total_amount ?? 0),
      amountPaid: Number(row.amount_paid ?? 0),
      balanceDue: Number(row.balance_due ?? 0),
      status: row.status,
      storeName: storeNameFromEmbed(row.stores),
    }));

  return { summary, statement, invoices: invoiceRows };
}
