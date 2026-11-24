import type { QueryClient, Query } from "@tanstack/react-query";

import { prefetchAdminRoute } from "@/modules/admin/lib/admin-prefetch-nav";

/** Refetch workspace data only if tab was idle at least this long (ms). */
export const WORKSPACE_TAB_IDLE_REFRESH_MS = 3 * 60_000;

function adminGetQueries(queries: Query[]) {
  return queries.filter((q) => {
    const key = q.queryKey;
    return (
      Array.isArray(key) &&
      key.length >= 3 &&
      key[0] === "admin" &&
      key[1] === "get" &&
      typeof key[2] === "string"
    );
  });
}

function routeTail(pathname: string): string {
  return pathname.replace(/^\/admin\/?/, "").replace(/\/+$/, "");
}

function scoreAdminGetQuery(pathAndQuery: string, route: string): number {
  const pathOnly = pathAndQuery.split("?")[0] ?? pathAndQuery;
  if (pathOnly === route) return 10_000;
  const routeParts = route.split("/").filter(Boolean);
  const pathParts = pathOnly.split("/").filter(Boolean);
  let shared = 0;
  for (let i = 0; i < Math.min(routeParts.length, pathParts.length); i++) {
    if (routeParts[i] !== pathParts[i]) break;
    shared += 1;
  }
  if (shared === 0) return -1;
  if (pathOnly.startsWith(`${route}/`) || route.startsWith(`${pathOnly}/`)) {
    return 1_000 + shared;
  }
  return shared;
}

function pickPrimaryStaleQuery(queries: Query[], pathname: string): Query | null {
  const route = routeTail(pathname);
  const staleGets = adminGetQueries(queries).filter((q) => q.isStale());
  if (staleGets.length === 0) return null;

  let best: Query | null = null;
  let bestScore = -1;
  for (const q of staleGets) {
    const pathAndQuery = q.queryKey[2] as string;
    const score = route
      ? scoreAdminGetQuery(pathAndQuery, route)
      : pathAndQuery.startsWith("dashboard")
        ? 1
        : -1;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return bestScore >= 0 ? best : null;
}

/**
 * At most one stale primary admin GET refetch after the workspace tab was idle.
 */
export function maybeRefreshWorkspaceTabData(
  queryClient: QueryClient,
  pathname: string,
  workspaceRoot: string,
  lastFocusedAtByRoot: Map<string, number>,
): void {
  const now = Date.now();
  const last = lastFocusedAtByRoot.get(workspaceRoot);
  if (last === undefined) {
    lastFocusedAtByRoot.set(workspaceRoot, now);
    return;
  }
  const idleMs = now - last;
  lastFocusedAtByRoot.set(workspaceRoot, now);
  if (idleMs < WORKSPACE_TAB_IDLE_REFRESH_MS) return;

  const active = queryClient.getQueryCache().findAll({ type: "active" });
  const primary = pickPrimaryStaleQuery(active, pathname);
  if (!primary) return;

  void queryClient.refetchQueries({
    queryKey: primary.queryKey,
    stale: true,
  });
}

/** Prefetch one inactive workspace tab (e.g. tab bar hover). Skips active tab. */
export function prefetchInactiveWorkspaceTab(
  queryClient: QueryClient,
  href: string,
  activeRootHref: string | null,
  tabRootHref: string,
  currentPathname: string,
) {
  if (tabRootHref === activeRootHref) return;
  void prefetchAdminRoute(queryClient, href, { currentPath: currentPathname });
}