"use client";

import type { AdminUser } from "@/common/admin/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

function customerInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const CUSTOMER_AVATAR_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-11 text-sm",
};

export function CustomerAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const url = avatarUrl?.trim();
  return (
    <Avatar className={cn(CUSTOMER_AVATAR_SIZE[size], className)}>
      {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
        {customerInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export type CustomerStatusFilter = "all" | "active" | "blocked";

export const CUSTOMER_STATUS_FILTERS: {
  id: CustomerStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "blocked", label: "Blocked" },
];

export function formatCustomerId(user: AdminUser) {
  if (user.customer_number?.trim()) return user.customer_number;
  const shortId = user.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? "0000";
  return `CUS-${shortId}`;
}

export function formatCreditLimit(limit: number | null | undefined) {
  if (limit == null || limit <= 0) return "No credit limit";
  return formatCurrencyAmount(limit);
}

export function isCustomerBlocked(user: AdminUser) {
  return user.is_verified === false;
}

export function matchesCustomerStatusFilter(
  user: AdminUser,
  filter: CustomerStatusFilter,
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

export function CustomerStatusBadge({ user }: { user: AdminUser }) {
  const blocked = isCustomerBlocked(user);

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
