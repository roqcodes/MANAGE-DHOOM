"use client";

import type { AdminUser, DBUser } from "@/common/admin/types";
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
    retail: "bg-muted text-muted-foreground",
  };

  const label = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Retail";

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
