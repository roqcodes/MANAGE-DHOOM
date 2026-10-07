import type { QueryClient } from "@tanstack/react-query";

import type { AdminNavBadge } from "@/common/admin/types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

/** Sidebar pills are informational; avoid hammering the API or DB. */
export const ADMIN_NAV_BADGES_STALE_MS = 5 * 60_000;

export const adminNavBadgesQueryOptions = {
  staleTime: ADMIN_NAV_BADGES_STALE_MS,
  gcTime: 15 * 60_000,
  /** Refresh while admin is open, but not every minute. */
  refetchInterval: ADMIN_NAV_BADGES_STALE_MS,
  refetchIntervalInBackground: false,
};

export async function fetchAdminNavBadges() {
  return adminGet<{ badges: Record<string, AdminNavBadge> }>("nav-badges");
}

export function invalidateAdminNavBadges(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: adminQueryKeys.navBadges() });
}
