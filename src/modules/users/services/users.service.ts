import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
import type { AdminUser, DBUser, Paginated } from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";

type UserRole = Database["public"]["Enums"]["user_role"];

const STAFF_ROLES: UserRole[] = ["admin", "manager", "vendor", "delivery"];

/** Portal staff lists (verified users by role). */
export type PortalStaffSegment = "vendor" | "delivery" | "admin";

export async function getStoreUsers(
  page = 0,
): Promise<Paginated<AdminUser>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const [usersResult, countResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,email,phone,role,is_verified,created_at")
      .is("role", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("role", null),
  ]);

  const users = (usersResult.data ?? []) as AdminUser[];

  if (users.length === 0) {
    return { data: [], total: countResult.count ?? 0 };
  }

  const { data: orderRows } = await supabase
    .from("orders")
    .select("user_id")
    .in(
      "user_id",
      users.map((u) => u.id),
    );

  const orderCountMap = (orderRows ?? []).reduce<Record<string, number>>(
    (acc, o) => {
      if (o.user_id) acc[o.user_id] = (acc[o.user_id] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return {
    data: users.map((u) => ({ ...u, order_count: orderCountMap[u.id] ?? 0 })),
    total: countResult.count ?? 0,
  };
}

/** Verified portal staff: vendor, delivery, or admin (single role per segment). */
export async function getPortalStaffUsers(
  segment: PortalStaffSegment,
  page = 0,
): Promise<Paginated<DBUser>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;
  const roles: UserRole[] =
    segment === "delivery"
      ? ["delivery"]
      : segment === "vendor"
        ? ["vendor"]
        : ["admin"];

  const [dataResult, countResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,email,phone,role,is_verified,created_at")
      .in("role", roles)
      .eq("is_verified", true)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("role", roles)
      .eq("is_verified", true),
  ]);

  return {
    data: (dataResult.data ?? []) as DBUser[],
    total: countResult.count ?? 0,
  };
}

/** Pending access for any staff role (admin, vendor, delivery). */
export async function getPendingPortalRequests(): Promise<DBUser[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("id,name,email,phone,role,is_verified,created_at")
    .in("role", STAFF_ROLES)
    .eq("is_verified", false)
    .order("created_at", { ascending: false });

  return (data ?? []) as DBUser[];
}

export async function getPendingPortalRequestCount(): Promise<number> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .in("role", STAFF_ROLES)
    .eq("is_verified", false);
  return count ?? 0;
}

export interface TeamCatalogStats {
  vendor: number;
  delivery: number;
  admin: number;
  manager: number;
  pendingRequests: number;
}

/** Portal team metrics — storefront customers are excluded. */
export async function getTeamCatalogStats(): Promise<TeamCatalogStats> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const [vendorRes, deliveryRes, adminRes, managerRes, pendingRes] =
    await Promise.all([
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "vendor")
        .eq("is_verified", true),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "delivery")
        .eq("is_verified", true),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_verified", true),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "manager")
        .eq("is_verified", true),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .in("role", STAFF_ROLES)
        .eq("is_verified", false),
    ]);

  return {
    vendor: vendorRes.count ?? 0,
    delivery: deliveryRes.count ?? 0,
    admin: adminRes.count ?? 0,
    manager: managerRes.count ?? 0,
    pendingRequests: pendingRes.count ?? 0,
  };
}

/**
 * Verified delivery riders — call only after `requireAdminApiProfile` in Route Handlers.
 * Reuses an existing server Supabase client to avoid a second SSR client + duplicate RBAC.
 */
export async function fetchVerifiedDeliveryUsers(
  supabase: SupabaseClient<Database>,
): Promise<DBUser[]> {
  const { data } = await supabase
    .from("users")
    .select("id,name,email,phone,role,is_verified,created_at")
    .eq("role", "delivery")
    .eq("is_verified", true)
    .order("created_at", { ascending: false });

  return (data ?? []) as DBUser[];
}

export async function setStoreUserVerified(
  userId: string,
  isVerified: boolean,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("users")
    .update({ is_verified: isVerified })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}
