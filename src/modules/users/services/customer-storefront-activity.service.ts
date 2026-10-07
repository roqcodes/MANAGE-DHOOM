import "server-only";

import { UserRole } from "@/common/auth/types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

const STAFF_ROLES = new Set<string>([
  UserRole.Admin,
  UserRole.Manager,
  UserRole.Vendor,
  UserRole.Delivery,
]);

export type CustomerStorefrontActivity = {
  orders: number;
  addresses: number;
  cartItems: number;
  shoppingListItems: number;
  walletBalance: number;
  transactions: number;
  returns: number;
};

export function isStaffRole(role: string | null | undefined): boolean {
  return Boolean(role && STAFF_ROLES.has(role));
}

export function isStoreCustomerRole(role: string | null | undefined): boolean {
  return !role || role === "customer";
}

export async function getCustomerStorefrontActivity(
  userId: string,
): Promise<CustomerStorefrontActivity> {
  const supabase = await createSupabaseServerClient();

  const [
    ordersRes,
    addressesRes,
    cartsRes,
    listsRes,
    walletRes,
    transactionsRes,
    returnsRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase.from("carts").select("id").eq("user_id", userId),
    supabase.from("shopping_lists").select("id").eq("user_id", userId),
    supabase.from("wallet").select("balance").eq("user_id", userId).maybeSingle(),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("returns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const cartIds = (cartsRes.data ?? []).map((row) => row.id);
  let cartItems = 0;
  if (cartIds.length > 0) {
    const { count } = await supabase
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .in("cart_id", cartIds);
    cartItems = count ?? 0;
  }

  const listIds = (listsRes.data ?? []).map((row) => row.id);
  let shoppingListItems = 0;
  if (listIds.length > 0) {
    const { count, error } = await supabase
      .from("shopping_list_items")
      .select("id", { count: "exact", head: true })
      .in("list_id", listIds);
    if (!error) shoppingListItems = count ?? 0;
  }

  return {
    orders: ordersRes.count ?? 0,
    addresses: addressesRes.count ?? 0,
    cartItems,
    shoppingListItems,
    walletBalance: Number(walletRes.data?.balance ?? 0),
    transactions: transactionsRes.count ?? 0,
    returns: returnsRes.count ?? 0,
  };
}

export function hasCustomerStorefrontActivity(
  activity: CustomerStorefrontActivity,
): boolean {
  return (
    activity.orders > 0 ||
    activity.addresses > 0 ||
    activity.cartItems > 0 ||
    activity.shoppingListItems > 0 ||
    activity.transactions > 0 ||
    activity.returns > 0 ||
    activity.walletBalance > 0
  );
}

export function formatStorefrontActivitySummary(
  activity: CustomerStorefrontActivity,
): string[] {
  const lines: string[] = [];
  if (activity.orders > 0) {
    lines.push(`${activity.orders} order${activity.orders === 1 ? "" : "s"}`);
  }
  if (activity.addresses > 0) {
    lines.push(
      `${activity.addresses} saved address${activity.addresses === 1 ? "" : "es"}`,
    );
  }
  if (activity.cartItems > 0) {
    lines.push(
      `${activity.cartItems} cart item${activity.cartItems === 1 ? "" : "s"}`,
    );
  }
  if (activity.shoppingListItems > 0) {
    lines.push(
      `${activity.shoppingListItems} saved list item${activity.shoppingListItems === 1 ? "" : "s"}`,
    );
  }
  if (activity.walletBalance > 0) {
    lines.push(`wallet balance ₹${activity.walletBalance.toLocaleString("en-IN")}`);
  }
  if (activity.transactions > 0) {
    lines.push(
      `${activity.transactions} wallet transaction${activity.transactions === 1 ? "" : "s"}`,
    );
  }
  if (activity.returns > 0) {
    lines.push(`${activity.returns} return request${activity.returns === 1 ? "" : "s"}`);
  }
  return lines;
}

export async function assertCanPromoteUserToStaff(userId: string): Promise<void> {
  const activity = await getCustomerStorefrontActivity(userId);
  if (!hasCustomerStorefrontActivity(activity)) return;

  const summary = formatStorefrontActivitySummary(activity);
  throw new Error(
    `This account has storefront activity and cannot be promoted to staff. Create a separate staff login instead.\n\n${summary.map((line) => `• ${line}`).join("\n")}`,
  );
}
