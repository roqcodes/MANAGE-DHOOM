"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { maybeRefreshWorkspaceTabData } from "@/modules/admin/lib/admin-workspace-tab-refresh";
import { resolveAdminWorkspaceRoot } from "@/modules/admin/lib/admin-workspace-tabs";
import { AdminWorkspaceTabLoading } from "@/modules/admin/components/admin-workspace-tab-loading";
import { useAdminWorkspaceTabs } from "@/modules/admin/providers/admin-workspace-tabs-provider";
import { useQueryClient } from "@tanstack/react-query";

export function AdminWorkspaceContentKeeper({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const queryClient = useQueryClient();
  const { activeRootHref, visitedRoots, isWorkspaceTabLoading } = useAdminWorkspaceTabs();
  const routeRoot = resolveAdminWorkspaceRoot(pathname);
  const displayRoot = activeRootHref ?? routeRoot;
  const lastFocusedAtByRoot = useRef<Map<string, number>>(new Map());

  const routeSynced = displayRoot === routeRoot;
  const showLoading =
    isWorkspaceTabLoading ||
    (visitedRoots.has(displayRoot) && !routeSynced) ||
    (visitedRoots.has(displayRoot) && !visitedRoots.has(routeRoot));

  useEffect(() => {
    if (!routeSynced || !displayRoot || !visitedRoots.has(routeRoot)) return;
    const t = window.setTimeout(() => {
      maybeRefreshWorkspaceTabData(
        queryClient,
        pathname,
        displayRoot,
        lastFocusedAtByRoot.current,
      );
    }, 48);
    return () => window.clearTimeout(t);
  }, [routeSynced, displayRoot, pathname, queryClient, visitedRoots]);

  if (showLoading) {
    return <AdminWorkspaceTabLoading />;
  }

  if (!visitedRoots.has(routeRoot)) {
    return <AdminWorkspaceTabLoading label="Select a tab to load this workspace" />;
  }

  return <>{children}</>;
}