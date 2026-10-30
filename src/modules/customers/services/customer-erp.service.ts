import "server-only";

import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
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
import {
  assertCustomerAddressHierarchy,
  normalizeCustomerAddressSelection,
  resolveCustomerAddressProfile,
} from "@/modules/customers/services/customer-address-lookup.service";

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
  addressCityId?: string | null;
  addressMallId?: string | null;
  addressStreetId?: string | null;
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

async function upsertPrimaryCustomerAddress(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  input: CustomerProfileInput,
): Promise<void> {
  const structuredProvided =
    input.addressCityId !== undefined ||
    input.addressMallId !== undefined ||
    input.addressStreetId !== undefined;
  const legacyLine = input.address?.trim();

  if (!structuredProvided && !legacyLine) return;

  const cityId = structuredProvided ? (input.addressCityId ?? null) : null;
  const mallId = structuredProvided ? (input.addressMallId ?? null) : null;
  const streetId = structuredProvided ? (input.addressStreetId ?? null) : null;

  if (cityId || streetId || mallId) {
    await assertCustomerAddressHierarchy(supabase, { cityId, streetId, mallId });
  }

  const names = cityId || mallId || streetId
    ? await resolveAddressLookupNames({
        cityId,
        mallId,
        streetId,
      })
    : { city: input.location?.trim() || null, mall: null, street: null };

  const line1 =
    composeCustomerAddressLine({
      mall: names.mall,
      street: names.street,
      city: names.city,
      legacyLine1: legacyLine,
    }) ?? "—";

  const phone = input.phone?.trim() || input.landline?.trim() || "—";

  const { data: existing } = await supabase
    .from("addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  const row = {
    city_id: cityId,
    mall_id: mallId,
    street_id: streetId,
    city: names.city?.trim() || input.location?.trim() || "—",
    line1,
    label: "Primary",
    phone,
    state: "—",
    pincode: "—",
  } as never;

  if (existing?.id) {
    const { error } = await supabase.from("addresses").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("addresses").insert({
      user_id: userId,
      is_default: true,
      ...row,
    });
    if (error) throw new Error(error.message);
  }
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

  let locationValue = input.location?.trim() || null;
  if (input.addressCityId) {
    const { city } = await resolveAddressLookupNames({ cityId: input.addressCityId });
    if (city?.trim()) locationValue = city.trim();
  }

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
    location: locationValue,
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

  try {
    await upsertPrimaryCustomerAddress(supabase, id, input);
  } catch (addressError) {
    throw new Error(
      addressError instanceof Error
        ? `Customer was created, but the address could not be saved. Open the customer record to add the address. (${addressError.message})`
        : "Customer was created, but the address could not be saved.",
    );
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

function isMissingCustomerProfileRpc(errorMessage: string): boolean {
  return /get_customer_erp_profile|does not exist|Could not find the function/i.test(
    errorMessage,
  );
}

function mapCustomerErpProfileFromRpc(raw: unknown): CustomerErpProfile {
  const row = raw as Record<string, unknown>;
  if (!row?.id) {
    throw new Error("Customer not found.");
  }
  return {
    id: String(row.id),
    customerNumber: (row.customer_number as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null)?.trim() || null,
    companyName: (row.company_name as string | null) ?? null,
    trn: (row.trn as string | null) ?? null,
    contactDisplayName: (row.contact_display_name as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    poBox: (row.po_box as string | null) ?? null,
    customerNotes: (row.customer_notes as string | null) ?? null,
    openingBalance: Number(row.opening_balance ?? 0),
    openingBalanceDate: (row.opening_balance_date as string | null) ?? null,
    creditLimit: row.credit_limit != null ? Number(row.credit_limit) : null,
    outstandingBalance: Number(row.outstanding_balance ?? 0),
    address: (row.address as string | null) ?? null,
    addressCityId: (row.address_city_id as string | null) ?? null,
    addressCityName: (row.address_city_name as string | null) ?? null,
    addressMallId: (row.address_mall_id as string | null) ?? null,
    addressMallName: (row.address_mall_name as string | null) ?? null,
    addressStreetId: (row.address_street_id as string | null) ?? null,
    addressStreetName: (row.address_street_name as string | null) ?? null,
    isVerified: row.is_verified !== false,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

async function loadCustomerProfileViaRpc(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CustomerErpProfile | "missing_rpc"> {
  const { data, error } = await supabase.rpc("get_customer_erp_profile", {
    p_user_id: userId,
  });
  if (error) {
    if (isMissingCustomerProfileRpc(error.message)) {
      return "missing_rpc";
    }
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Customer not found.");
  }
  return mapCustomerErpProfileFromRpc(data);
}

async function loadCustomerProfileLegacy(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CustomerErpProfile> {
  const [userResult, creditResult, addressResult, exposure] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, email, phone, avatar_url, customer_number, company_name, trn, contact_display_name, location, po_box, customer_notes, opening_balance, opening_balance_date, is_verified, created_at",
      )
      .eq("id", userId)
      .single(),
    supabase
      .from("customer_credit_limits")
      .select("credit_limit")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("addresses")
      .select("line1, line2, city, state, pincode, city_id, mall_id, street_id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle(),
    supabase.rpc("get_customer_ar_exposure", {
      p_user_id: userId,
      p_exclude_invoice_id: null,
    }),
  ]);

  if (userResult.error) throw new Error(userResult.error.message);
  if (exposure.error) throw new Error(exposure.error.message);

  const user = userResult.data;
  const creditRow = creditResult.data;
  const addressRowTyped = addressResult.data as {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    city_id?: string | null;
    mall_id?: string | null;
    street_id?: string | null;
  } | null;

  const { normalized, lookupNames, composedAddress } = await resolveCustomerAddressProfile(
    supabase,
    {
      cityId: addressRowTyped?.city_id,
      streetId: addressRowTyped?.street_id,
      mallId: addressRowTyped?.mall_id,
    },
    addressRowTyped ?? undefined,
  );

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
    address: composedAddress || null,
    addressCityId: normalized.cityId,
    addressCityName: lookupNames.city ?? addressRowTyped?.city ?? user.location,
    addressMallId: normalized.mallId,
    addressMallName: lookupNames.mall,
    addressStreetId: normalized.streetId,
    addressStreetName: lookupNames.street,
    isVerified: user.is_verified !== false,
    createdAt: user.created_at,
  };
}

export async function getCustomerProfile(
  userId: string,
  options?: { skipAuth?: boolean; supabase?: SupabaseClient<Database> },
): Promise<CustomerErpProfile> {
  if (!options?.skipAuth) {
    await requireAdminOrManagerProfile();
  }
  const supabase = options?.supabase ?? (await createSupabaseServerClient());

  const fromRpc = await loadCustomerProfileViaRpc(supabase, userId);
  if (fromRpc !== "missing_rpc") {
    return fromRpc;
  }

  return loadCustomerProfileLegacy(supabase, userId);
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

  let locationPatch: string | null | undefined;
  if (input.addressCityId !== undefined) {
    if (input.addressCityId) {
      const { city } = await resolveAddressLookupNames({ cityId: input.addressCityId });
      locationPatch = city?.trim() || null;
    } else {
      locationPatch = null;
    }
  } else if (input.location !== undefined) {
    locationPatch = input.location?.trim() || null;
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
      ...(locationPatch !== undefined ? { location: locationPatch } : {}),
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

  if (
    input.address !== undefined ||
    input.addressCityId !== undefined ||
    input.addressMallId !== undefined ||
    input.addressStreetId !== undefined
  ) {
    await upsertPrimaryCustomerAddress(supabase, userId, input);
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
