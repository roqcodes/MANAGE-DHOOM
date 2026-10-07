"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { UsersListPanel } from "@/modules/users/components/users-list-panel";
import { UsersMetricsBar } from "@/modules/users/components/users-metrics-bar";
import {
  exportPendingUsersCsv,
  exportPortalUsersCsv,
} from "@/modules/users/components/users-data-table";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type { TeamCatalogStats } from "@/modules/users/services/users.service";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const USER_SEGMENTS = [
  { id: "vendor", label: "Vendor" },
  { id: "delivery", label: "Delivery" },
  { id: "admin", label: "Admin" },
] as const;

type UserSegment = (typeof USER_SEGMENTS)[number]["id"];

type UsersApiContent =
  | { kind: "requests"; pending: DBUser[] }
  | { kind: "vendor"; data: DBUser[]; total: number }
  | { kind: "delivery"; data: DBUser[]; total: number }
  | { kind: "admin"; data: DBUser[]; total: number };

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function SegmentLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex min-w-[88px] flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function AdminUsersView() {
  const searchParams = useSearchParams();
  const primary = searchParams.get("tab") === "requests" ? "requests" : "users";
  const rawSegment = searchParams.get("segment");
  const segment: UserSegment =
    rawSegment === "vendor" ||
    rawSegment === "delivery" ||
    rawSegment === "admin"
      ? (rawSegment as UserSegment)
      : "vendor";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.users(primary, segment, page),
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("tab", primary);
      q.set("segment", segment);
      if (page > 0) q.set("page", String(page));
      return adminGet<{
        pendingCount: number;
        primary: "users" | "requests";
        segment: UserSegment;
        page: number;
        stats: TeamCatalogStats;
        content: UsersApiContent;
      }>(`users?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  if (isPending && !data) return <AdminPageSkeleton />;
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
  if (!data) return <AdminPageSkeleton />;

  const { pendingCount, stats, content } = data;

  function segmentHref(seg: UserSegment) {
    const q = new URLSearchParams({ tab: "users", segment: seg });
    return `/admin/users?${q.toString()}`;
  }

  function handleExport() {
    if (content.kind === "requests") {
      exportPendingUsersCsv(content.pending);
      return;
    }
    exportPortalUsersCsv(content.data, content.kind);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4">
      <UsersMetricsBar stats={stats} onExport={handleExport} />

      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <TabLink href={`/admin/users?tab=users&segment=${segment}`} active={primary === "users"}>
          Users
        </TabLink>
        <TabLink href="/admin/users?tab=requests" active={primary === "requests"}>
          Requests
          {pendingCount > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {pendingCount}
            </Badge>
          ) : null}
        </TabLink>
      </div>

      {primary === "users" ? (
        <div className="flex min-w-0 flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
          {USER_SEGMENTS.map((s) => (
            <SegmentLink
              key={s.id}
              href={segmentHref(s.id)}
              active={segment === s.id}
            >
              {s.label}
            </SegmentLink>
          ))}
        </div>
      ) : null}

      <UsersListPanel
        content={content}
        segment={primary === "requests" ? "requests" : segment}
        page={page}
      />
    </div>
  );
}
