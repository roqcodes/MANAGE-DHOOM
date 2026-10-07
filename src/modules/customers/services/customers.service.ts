import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { PAGE_SIZE, type AdminUser, type Order, type Paginated } from "@/common/admin/types";
import { CUSTOMER_ROLE_OR_FILTER } from "@/modules/customers/lib/customer-query";
import { searchCustomersTypeahead } from "@/modules/customers/lib/customer-typeahead-query";

export interface CustomerStats {
  total: number;
  retail: number;
  staff: number;
  active: number;
}

export interface CustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_verified: boolean;
  created_at: string;
  customer_number?: string | null;
  company_name?: string | null;
  contact_display_name?: string | null;
  location?: string | null;
  trn?: string | null;
  po_box?: string | null;
  customer_notes?: string | null;
  opening_balance?: number | null;
  opening_balance_date?: string | null;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  type: "credit" | "debit";
  reference: string | null;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  is_default: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface CustomerDetailsResponse {
  summary: CustomerSummary;
  wallet: {
    balance: number;
    transactions: WalletTransaction[];
    transactionsCount: number;
  };
  orders: Order[];
  addresses: CustomerAddress[];
}

export async function getCustomerDetails(
  userId: string,
  txPage = 0
): Promise<CustomerDetailsResponse> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  // 1. Get user summary
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select(
      "id, name, email, phone, role, is_verified, created_at, customer_number, company_name, contact_display_name, location, trn, po_box, customer_notes, opening_balance, opening_balance_date",
    )
    .eq("id", userId)
    .single();

  if (userErr) throw new Error(userErr.message);

  // 2. Get wallet balance
  // Since we added admin RLS policies, we can query wallet directly
  const { data: walletData } = await supabase
    .from("wallet")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const balance = walletData?.balance ?? 0;

  // 3. Get transactions
  const from = txPage * PAGE_SIZE;
  const { data: txData, count: txCount } = await supabase
    .from("transactions")
    .select("id, amount, type, reference, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // 4. Get recent orders + addresses
  const [{ data: ordersData }, { data: addressesData }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, created_at, status, total_amount")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("addresses")
      .select(
        "id,label,line1,line2,city,state,pincode,phone,is_default,latitude,longitude",
      )
      .eq("user_id", userId)
      .order("is_default", { ascending: false }),
  ]);

  return {
    summary: user as CustomerSummary,
    wallet: {
      balance: Number(balance),
      transactions: (txData ?? []) as WalletTransaction[],
      transactionsCount: txCount ?? 0,
    },
    orders: (ordersData ?? []) as unknown as Order[],
    addresses: (addressesData ?? []) as unknown as CustomerAddress[],
  };
}

export async function searchCustomers(query: string, limit = 20): Promise<
  Pick<AdminUser, "id" | "name" | "email" | "phone" | "customer_number">[]
> {
  const supabase = await createSupabaseServerClient();
  return searchCustomersTypeahead(supabase, query, limit);
}

export async function getAllCustomers(page = 0): Promise<Paginated<AdminUser> & { stats: CustomerStats }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const [usersResult, countResult, activeCountResult] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id,name,email,phone,role,is_verified,created_at,customer_number,company_name,location,opening_balance",
      )
      .or(CUSTOMER_ROLE_OR_FILTER)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .or(CUSTOMER_ROLE_OR_FILTER),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .or(CUSTOMER_ROLE_OR_FILTER)
      .eq("is_verified", true),
  ]);

  const users = (usersResult.data ?? []) as AdminUser[];
  const total = countResult.count ?? 0;
  const active = activeCountResult.count ?? 0;
  const stats: CustomerStats = { total, retail: total, staff: 0, active };

  if (users.length === 0) {
    return { data: [], total, stats };
  }

  const userIds = users.map((u) => u.id);

  const orderCountRpc = await invokeRpc(supabase, "get_user_order_counts", {
    p_user_ids: userIds,
  });
  const orderCountMap: Record<string, number> = {};
  if (orderCountRpc.error) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("user_id")
      .in("user_id", userIds);
    for (const o of orderRows ?? []) {
      if (o.user_id) orderCountMap[o.user_id] = (orderCountMap[o.user_id] ?? 0) + 1;
    }
  } else {
    for (const row of (orderCountRpc.data ?? []) as { user_id: string; order_count: number }[]) {
      orderCountMap[row.user_id] = Number(row.order_count ?? 0);
    }
  }

  const [{ data: invoiceRows }, { data: creditLimitRows }] = await Promise.all([
    supabase
      .from("invoices")
      .select("user_id, balance_due")
      .in("user_id", userIds)
      .neq("status", "cancelled"),
    supabase
      .from("customer_credit_limits")
      .select("user_id, credit_limit")
      .in("user_id", userIds),
  ]);

  const receivablesMap = (invoiceRows ?? []).reduce<Record<string, number>>(
    (acc, inv) => {
      if (!inv.user_id) return acc;
      acc[inv.user_id] = (acc[inv.user_id] ?? 0) + Number(inv.balance_due ?? 0);
      return acc;
    },
    {},
  );

  const creditLimitMap = (creditLimitRows ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.user_id] = Number(row.credit_limit ?? 0);
      return acc;
    },
    {},
  );

  return {
    data: users.map((u) => ({
      ...u,
      order_count: orderCountMap[u.id] ?? 0,
      receivables:
        Number(u.opening_balance ?? 0) + (receivablesMap[u.id] ?? 0),
      credit_limit: creditLimitMap[u.id] ?? null,
    })),
    total,
    stats,
  };
}

