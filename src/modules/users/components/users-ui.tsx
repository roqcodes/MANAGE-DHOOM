"use client";

import type { AdminUser, DBUser } from "@/common/admin/types";
import { erpStaffRoleLabel } from "@/modules/users/lib/portal-staff-roles";
import { cn } from "@/lib/utils";

export type UserStatusFilter = "all" | "active" | "blocked";

export const USER_STATUS_FILTERS: {
  id: UserStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "blocked", label: "Blocked" },
];

export function formatUserId(user: Pick<DBUser, "id">) {
  const shortId = user.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? "0000";
  return `USR-${shortId}`;
}

export function isUserBlocked(user: Pick<DBUser, "is_verified">) {
  return user.is_verified === false;
}

export function matchesUserStatusFilter(
  user: Pick<DBUser, "is_verified">,
  filter: UserStatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return user.is_verified !== false;
    case "blocked":
      return user.is_verified === false;
    default:
      return true;
  }
}

export function UserStatusBadge({ user }: { user: Pick<DBUser, "is_verified"> }) {
  const blocked = isUserBlocked(user);

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        blocked
          ? "bg-rose-100 text-rose-800"
          : "bg-emerald-100 text-emerald-800",
      )}
    >
      {blocked ? "Blocked" : "Active"}
    </span>
  );
}

export function UserRoleBadge({ role }: { role: string | null }) {
  const key = role?.toLowerCase() ?? "retail";
  const styles: Record<string, string> = {
    vendor: "bg-blue-100 text-blue-800",
    delivery: "bg-orange-100 text-orange-800",
    admin: "bg-purple-100 text-purple-800",
    super_admin: "bg-violet-100 text-violet-900",
    manager: "bg-indigo-100 text-indigo-800",
    sales_manager: "bg-sky-100 text-sky-800",
    salesman: "bg-cyan-100 text-cyan-800",
    accountant: "bg-amber-100 text-amber-900",
    store_keeper: "bg-emerald-100 text-emerald-800",
    staff: "bg-amber-50 text-amber-900",
    retail: "bg-muted text-muted-foreground",
  };

  const label = erpStaffRoleLabel(role);

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[key] ?? styles.retail,
      )}
    >
      {label}
    </span>
  );
}

export function matchesErpSalesmanSearch(
  salesman: {
    name: string;
    email?: string | null;
    phone?: string | null;
    id: string;
    pin?: string | null;
  },
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = salesman.name.toLowerCase();
  const email = (salesman.email ?? "").toLowerCase();
  const phone = (salesman.phone ?? "").toLowerCase();
  const pin = (salesman.pin ?? "").toLowerCase();
  const idShort = salesman.id.slice(0, 8).toLowerCase();
  return (
    name.includes(q) ||
    email.includes(q) ||
    phone.includes(q) ||
    pin.includes(q) ||
    idShort.includes(q) ||
    "erp salesman".includes(q) ||
    (q.length >= 4 && "salesman".includes(q))
  );
}

export function formatSalesmanId(salesman: { id: string }) {
  const shortId = salesman.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? "0000";
  return `SLM-${shortId}`;
}

export function ErpSalesmanRoleBadge() {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
      )}
    >
      ERP Salesman
    </span>
  );
}

export function matchesUserSearch(user: DBUser | AdminUser, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const name = (user.name ?? "").toLowerCase();
  const email = (user.email ?? "").toLowerCase();
  const phone = (user.phone ?? "").toLowerCase();
  const idShort = user.id.slice(0, 8).toLowerCase();
  return (
    name.includes(q) ||
    email.includes(q) ||
    phone.includes(q) ||
    idShort.includes(q)
  );
}
