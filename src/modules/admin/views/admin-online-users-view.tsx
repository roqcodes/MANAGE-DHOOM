"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LogIn,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { OnlineUsersTable } from "@/modules/presence/components/online-users-table";
import { SessionHistoryTable } from "@/modules/presence/components/session-history-table";
import {
  PRESENCE_HISTORY_REFRESH_DEBOUNCE_MS,
  PRESENCE_STALE_THRESHOLD_MS,
} from "@/modules/presence/lib/presence-constants";
import { useTeamPresence } from "@/modules/presence/providers/team-presence-provider";
import type {
  PresenceConnectionStatus,
  PresenceHistoryResponse,
} from "@/modules/presence/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<
  PresenceConnectionStatus,
  { label: string; className: string; dotClassName: string }
> = {
  live: {
    label: "Live",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dotClassName: "bg-emerald-500",
  },
  connecting: {
    label: "Connecting",
    className: "bg-amber-50 text-amber-900 ring-amber-200",
    dotClassName: "bg-amber-500 animate-pulse",
  },
  reconnecting: {
    label: "Reconnecting",
    className: "bg-amber-50 text-amber-900 ring-amber-200",
    dotClassName: "bg-amber-500 animate-pulse",
  },
  offline: {
    label: "Offline",
    className: "bg-slate-50 text-slate-700 ring-slate-200",
    dotClassName: "bg-slate-400",
  },
  unavailable: {
    label: "Live status unavailable",
    className: "bg-slate-50 text-slate-700 ring-slate-200",
    dotClassName: "bg-slate-400",
  },
};

function PresenceStatusBadge({ status }: { status: PresenceConnectionStatus }) {
  const config = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        config.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", config.dotClassName)} />
      {config.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: typeof Radio;
  tone?: "neutral" | "emerald";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "emerald"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums tracking-tight">
            {value.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminOnlineUsersView() {
  const { members, status } = useTeamPresence();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: adminQueryKeys.presenceSessions(),
    queryFn: () => adminGet<PresenceHistoryResponse>("presence/sessions"),
    refetchOnWindowFocus: false,
  });

  const sessions = useMemo(() => data?.sessions ?? [], [data]);

  const onlineUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  // Only refresh history when the *set* of online users changes (join/leave),
  // not on every path update.
  const onlineIdsKey = useMemo(
    () => members.map((member) => member.userId).sort().join("|"),
    [members],
  );
  const skipFirstPresenceChange = useRef(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (skipFirstPresenceChange.current) {
      skipFirstPresenceChange.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void refetch();
    }, PRESENCE_HISTORY_REFRESH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [onlineIdsKey, refetch]);

  const tabsOpen = useMemo(
    () => members.reduce((total, member) => total + member.tabs, 0),
    [members],
  );

  const loginsToday = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return sessions.filter(
      (session) => Date.parse(session.login_at) >= startOfDay.getTime(),
    ).length;
  }, [sessions]);

  const activeSessions = useMemo(() => {
    return sessions.filter((session) => {
      const isOnline = onlineUserIds.has(session.user_id);
      const isRecent =
        nowMs - Date.parse(session.last_seen_at) < PRESENCE_STALE_THRESHOLD_MS * 1.5;
      return !session.logout_at && isOnline && isRecent;
    }).length;
  }, [sessions, onlineUserIds, nowMs]);

  const onlineLabel = `${members.length} ${members.length === 1 ? "user" : "users"}`;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Online users"
        description="Who is signed in right now, with a 30-day login and logout history."
        breadcrumb={[
          { label: "Team", href: "/admin/users" },
          { label: "Online users" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <PresenceStatusBadge status={status} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Online now"
          value={members.length}
          icon={Radio}
          tone="emerald"
        />
        <SummaryCard label="Open tabs" value={tabsOpen} icon={MonitorSmartphone} />
        <SummaryCard label="Logins today" value={loginsToday} icon={LogIn} />
        <SummaryCard label="Active sessions" value={activeSessions} icon={Users} />
      </div>

      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Online now</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Live from Supabase Realtime — no polling and no database reads.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {onlineLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <OnlineUsersTable members={members} nowMs={nowMs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Login history</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Last 30 days, newest first. Times update when a session ends.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {sessions.length.toLocaleString()} sessions
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isPending && !data ? (
            <div className="p-4">
              <AdminTableBodySkeleton rows={6} />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-start gap-2 p-4" role="alert">
              <p className="text-sm font-medium text-destructive">
                Could not load login history.
              </p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                <RefreshCw data-icon="inline-start" className="size-3.5" />
                Try again
              </Button>
            </div>
          ) : (
            <SessionHistoryTable
              sessions={sessions}
              nowMs={nowMs}
              onlineUserIds={onlineUserIds}
            />
          )}
        </CardContent>
      </Card>
    </AdminPageLayout>
  );
}
