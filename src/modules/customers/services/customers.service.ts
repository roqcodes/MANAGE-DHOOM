import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { PAGE_SIZE, type AdminUser, type Order, type Paginated } from "@/common/admin/types";
import { CUSTOMER_ROLE_OR_FILTER } from "@/modules/customers/lib/customer-query";
import { searchCustomersTypeahead } from "@/modules/customers/lib/customer-typeahead-query";
import {
  applyUserIdInFilter,
  parseAddressFilterFromQuery,
  resolveUserIdsForAddressFilter,
} from "@/modules/customers/services/customer-address-filter.service";

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
  avatar_url?: string | null;
}

export interface CustomerDetailsResponse {
  summary: CustomerSummary;
  orders: Order[];
}

export async function getCustomerDetails(userId: string): Promise<CustomerDetailsResponse> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const [{ data: user, error: userErr }, { data: ordersData, error: ordersErr }] =
    await Promise.all([
      supabase
        .from("users")
        .select(
          "id, name, email, phone, avatar_url, role, is_verified, created_at, customer_number, company_name, contact_display_name, location, trn, po_box, customer_notes, opening_balance, opening_balance_date",
        )
        .eq("id", userId)
        .single(),
      supabase
        .from("orders")
        .select("id, created_at, status, total_amount")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  if (userErr) throw new Error(userErr.message);
  if (ordersErr) throw new Error(ordersErr.message);

  return {
    summary: user as CustomerSummary,
    orders: (ordersData ?? []) as unknown as Order[],
  };
}

export async function searchCustomers(query: string, limit = 20): Promise<
  Pick<AdminUser, "id" | "name" | "email" | "phone" | "customer_number">[]
> {
  const supabase = await createSupabaseServerClient();
  return searchCustomersTypeahead(supabase, query, limit);
}

export async function getAllCustomers(
  page = 0,
  address?: { cityId?: string; streetId?: string; mallId?: string },
): Promise<Paginated<AdminUser> & { stats: CustomerStats }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const addressUserIds = await resolveUserIdsForAddressFilter(
    supabase,
    parseAddressFilterFromQuery(address ?? {}),
  );

  let usersRequest = supabase
    .from("users")
    .select(
      "id,name,email,phone,avatar_url,role,is_verified,created_at,customer_number,company_name,location,opening_balance",
      { count: "exact" },
    )
    .or(CUSTOMER_ROLE_OR_FILTER)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  usersRequest = applyUserIdInFilter(usersRequest, "id", addressUserIds);

  const [usersResult, activeCountResult] = await Promise.all([
    usersRequest,
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .or(CUSTOMER_ROLE_OR_FILTER)
      .eq("is_verified", true),
  ]);

  const users = (usersResult.data ?? []) as AdminUser[];
  const total = usersResult.count ?? 0;
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
      .select("user_id, ar_sum:balance_due.sum()")
      .in("user_id", userIds)
      .neq("status", "cancelled")
      .gt("balance_due", 0),
    supabase
      .from("customer_credit_limits")
      .select("user_id, credit_limit")
      .in("user_id", userIds),
  ]);

  const receivablesMap = (
    (invoiceRows ?? []) as unknown as Array<{ user_id: string | null; ar_sum: number | null }>
  ).reduce<Record<string, number>>((acc, inv) => {
    if (!inv.user_id) return acc;
    acc[inv.user_id] = Number(inv.ar_sum ?? 0);
    return acc;
  }, {});

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

