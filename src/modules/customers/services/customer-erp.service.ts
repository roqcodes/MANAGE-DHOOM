import "server-only";

import { randomUUID } from "crypto";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  CustomerErpProfile,
  CustomerErpSummary,
  CustomerInvoiceRow,
  CustomerStatementLine,
} from "@/common/erp/sales-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";

async function upsertCustomerCreditLimit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  creditLimit: number,
) {
  const { error } = await supabase.from("customer_credit_limits").upsert({
    user_id: userId,
    credit_limit: creditLimit,
  });
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
    opening_balance_date: input.openingBalanceDate ?? null,
  });
  if (error) throw new Error(error.message);

  if (input.address?.trim()) {
    await supabase.from("addresses").insert({
      user_id: id,
      label: "Primary",
      line1: input.address.trim(),
      city: input.location?.trim() || "—",
      state: "—",
      pincode: "—",
      phone: input.phone?.trim() || input.landline?.trim() || "—",
      is_default: true,
    });
  }

  if (input.creditLimit != null && input.creditLimit > 0) {
    await upsertCustomerCreditLimit(supabase, id, input.creditLimit);
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
      "id, name, email, phone, customer_number, company_name, trn, contact_display_name, location, po_box, customer_notes, opening_balance, opening_balance_date, is_verified, created_at",
    )
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);

  const [{ data: creditRow }, { data: addressRow }] = await Promise.all([
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
  ]);

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
    companyName: user.company_name,
    trn: user.trn,
    contactDisplayName: user.contact_display_name,
    location: user.location,
    poBox: user.po_box,
    customerNotes: user.customer_notes,
    openingBalance: Number(user.opening_balance ?? 0),
    openingBalanceDate: user.opening_balance_date,
    creditLimit: creditRow?.credit_limit != null ? Number(creditRow.credit_limit) : null,
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
        ? { opening_balance_date: input.openingBalanceDate }
        : {}),
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  if (input.address !== undefined) {
    const { data: existing } = await supabase
      .from("addresses")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (input.address?.trim()) {
      if (existing?.id) {
        await supabase
          .from("addresses")
          .update({ line1: input.address.trim(), label: "Primary" })
          .eq("id", existing.id);
      } else {
        await supabase.from("addresses").insert({
          user_id: userId,
          label: "Primary",
          line1: input.address.trim(),
          city: input.location?.trim() || "—",
          state: "—",
          pincode: "—",
          phone: input.phone?.trim() || input.landline?.trim() || "—",
          is_default: true,
        });
      }
    }
  }

  if (input.creditLimit !== undefined) {
    if (input.creditLimit == null || input.creditLimit <= 0) {
      await supabase.from("customer_credit_limits").delete().eq("user_id", userId);
    } else {
      await upsertCustomerCreditLimit(supabase, userId, input.creditLimit);
    }
  }

  await logAuditEvent({
    action: "update",
    entityType: "customer",
    entityId: userId,
    description: "Customer profile updated",
  });
}

export async function getCustomerErpSummary(userId: string): Promise<CustomerErpSummary> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("opening_balance")
    .eq("id", userId)
    .single();
  if (userErr) throw new Error(userErr.message);

  const [{ data: invoices }, { data: creditNotes }, { data: creditRow }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_amount, balance_due, amount_paid")
      .eq("user_id", userId)
      .neq("status", "cancelled"),
    supabase
      .from("erp_credit_notes")
      .select("total_amount")
      .eq("user_id", userId)
      .in("status", ["issued", "applied"]),
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

  const openingBalance = Number(user.opening_balance ?? 0);
  const balanceDue = openingBalance + receivables;
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
    paymentReceived,
    balanceDue,
    receivables: balanceDue,
    creditLimit: creditRow?.credit_limit != null ? Number(creditRow.credit_limit) : null,
    unallocatedPayments,
  };
}

export async function getCustomerInvoices(userId: string): Promise<CustomerInvoiceRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, created_at, due_date, total_amount, amount_paid, balance_due, status, stores(name)",
    )
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const store = row.stores as { name: string } | null;
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      createdAt: row.created_at ?? "",
      dueDate: row.due_date,
      totalAmount: Number(row.total_amount ?? 0),
      amountPaid: Number(row.amount_paid ?? 0),
      balanceDue: Number(row.balance_due ?? 0),
      status: row.status,
      storeName: store?.name ?? null,
    };
  });
}

export async function getCustomerStatement(userId: string): Promise<CustomerStatementLine[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: user } = await supabase
    .from("users")
    .select("opening_balance, opening_balance_date")
    .eq("id", userId)
    .single();

  const lines: CustomerStatementLine[] = [];
  let running = Number(user?.opening_balance ?? 0);

  if (user?.opening_balance_date) {
    lines.push({
      date: user.opening_balance_date,
      storeName: null,
      transactionType: "opening_balance",
      details: "Opening Balance",
      amount: running,
      payments: 0,
      balance: running,
    });
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total_amount, created_at, store_id, stores(name)")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  const { data: payments } = await supabase
    .from("erp_customer_payments")
    .select("payment_number, total_amount, payment_date, store_id, stores(name)")
    .eq("user_id", userId)
    .order("payment_date", { ascending: true });

  const { data: creditNotes } = await supabase
    .from("erp_credit_notes")
    .select("credit_note_number, total_amount, credit_note_date, store_id, stores(name)")
    .eq("user_id", userId)
    .in("status", ["issued", "applied"])
    .order("credit_note_date", { ascending: true });

  type StatementEvent = {
    date: string;
    storeName: string | null;
    transactionType: string;
    details: string;
    debit: number;
    credit: number;
  };

  const events: StatementEvent[] = [];

  for (const inv of invoices ?? []) {
    const store = inv.stores as { name: string } | null;
    events.push({
      date: inv.created_at?.slice(0, 10) ?? "",
      storeName: store?.name ?? null,
      transactionType: "invoice",
      details: inv.invoice_number,
      debit: Number(inv.total_amount ?? 0),
      credit: 0,
    });
  }

  for (const p of payments ?? []) {
    const store = p.stores as { name: string } | null;
    events.push({
      date: p.payment_date,
      storeName: store?.name ?? null,
      transactionType: "payment",
      details: p.payment_number,
      debit: 0,
      credit: Number(p.total_amount ?? 0),
    });
  }

  for (const cn of creditNotes ?? []) {
    const store = cn.stores as { name: string } | null;
    events.push({
      date: cn.credit_note_date,
      storeName: store?.name ?? null,
      transactionType: "credit_note",
      details: cn.credit_note_number,
      debit: 0,
      credit: Number(cn.total_amount ?? 0),
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.details.localeCompare(b.details));

  for (const event of events) {
    running += event.debit - event.credit;
    lines.push({
      date: event.date,
      storeName: event.storeName,
      transactionType: event.transactionType,
      details: event.details,
      amount: event.debit,
      payments: event.credit,
      balance: running,
    });
  }

  return lines;
}
