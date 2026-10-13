"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, KeyRound } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { EMPTY_TEAM_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { UsersListPanel } from "@/modules/users/components/users-list-panel";
import { UsersMetricsBar } from "@/modules/users/components/users-metrics-bar";
import { exportPortalUsersCsv } from "@/modules/users/components/users-data-table";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type { TeamCatalogStats } from "@/modules/users/services/users.service";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import { ROLES_HREF } from "@/modules/rbac/lib/permission-catalog";
import { cn } from "@/lib/utils";

type UsersApiContent = { kind: "team"; data: DBUser[]; total: number };

export function AdminUsersView() {
  const profile = useAdminSession();
  const canManageRoles = Boolean(profile?.rbac?.canManageRoles);
  const searchParams = useSearchParams();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.users("users", page),
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("tab", "users");
      if (page > 0) q.set("page", String(page));
      return adminGet<{
        primary: "users";
        page: number;
        stats: TeamCatalogStats;
        content: UsersApiContent;
      }>(`users?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const initialLoading = isPending && !data;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load users.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  const stats = data?.stats ?? EMPTY_TEAM_CATALOG_STATS;
  const content = data?.content ?? { kind: "team" as const, data: [], total: 0 };

  function handleExport() {
    if (content.kind === "team") {
      exportPortalUsersCsv(content.data, "team");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canManageRoles ? (
          <Link
            href={ROLES_HREF}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <KeyRound className="size-4" />
            Roles & page permissions
          </Link>
        ) : null}
      </div>

      <UsersMetricsBar stats={stats} onExport={handleExport} valuesLoading={initialLoading} />
      <UsersListPanel content={content} page={page} initialLoading={initialLoading} />
    </div>
  );
}
