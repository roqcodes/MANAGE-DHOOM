"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { UserRoleBadge } from "@/modules/users/components/users-ui";
import {
  describeUserAgent,
  formatPresenceDuration,
  formatPresenceTimestamp,
  presenceEndReasonLabel,
} from "@/modules/presence/lib/format-presence";
import { PRESENCE_STALE_THRESHOLD_MS } from "@/modules/presence/lib/presence-constants";
import type { PresenceSessionRow } from "@/modules/presence/types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "ended";

export function SessionHistoryTable({
  sessions,
  nowMs,
  onlineUserIds,
}: {
  sessions: PresenceSessionRow[];
  nowMs: number;
  onlineUserIds?: Set<string>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Determine if active: must have no logout_at, plus recent activity or currently in live presence
      const isActuallyActive =
        !session.logout_at &&
        (onlineUserIds ? onlineUserIds.has(session.user_id) : true) &&
        nowMs - Date.parse(session.last_seen_at) < PRESENCE_STALE_THRESHOLD_MS * 1.5;

      if (statusFilter === "active" && !isActuallyActive) return false;
      if (statusFilter === "ended" && isActuallyActive) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = session.user_name?.toLowerCase().includes(query);
        const emailMatch = session.user_email?.toLowerCase().includes(query);
        const roleMatch = session.user_role?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !roleMatch) return false;
      }

      return true;
    });
  }, [sessions, statusFilter, searchTerm, onlineUserIds, nowMs]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <History className="size-9 text-muted-foreground/40" aria-hidden />
        <p className="text-sm font-medium text-foreground">No sessions yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Login and logout times will appear here as team members sign in and use the portal.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Table filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5 bg-muted/20">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by user or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              statusFilter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            All ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              statusFilter === "active"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ended")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              statusFilter === "ended"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Ended
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Login time</th>
              <th className="px-4 py-2.5 font-medium">Logout time</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Status / Ended</th>
              <th className="px-4 py-2.5 font-medium">Device & Browser</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No matching sessions found.
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => {
                // Determine whether this session is currently active
                const isOnline = onlineUserIds ? onlineUserIds.has(session.user_id) : true;
                const isWithinFreshWindow =
                  nowMs - Date.parse(session.last_seen_at) < PRESENCE_STALE_THRESHOLD_MS * 1.5;
                const active = !session.logout_at && isOnline && isWithinFreshWindow;

                // If not active and logout_at is null (reconciled fallback), use last_seen_at
                const effectiveLogoutAt = session.logout_at ?? (active ? null : session.last_seen_at);
                const effectiveEndedReason =
                  session.ended_reason ?? (active ? null : "stale");

                return (
                  <tr
                    key={session.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {session.user_name || session.user_email || "Team member"}
                        </p>
                        {session.user_email ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {session.user_email}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UserRoleBadge role={session.user_role} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                      {formatPresenceTimestamp(session.login_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                      {active ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        formatPresenceTimestamp(effectiveLogoutAt)
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground text-xs font-medium">
                      {formatPresenceDuration(
                        session.login_at,
                        effectiveLogoutAt,
                        nowMs,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          active
                            ? "bg-emerald-100 text-emerald-800"
                            : effectiveEndedReason === "sign_out"
                              ? "bg-slate-100 text-slate-800"
                              : effectiveEndedReason === "stale" || effectiveEndedReason === "timeout"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {presenceEndReasonLabel(effectiveEndedReason)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {describeUserAgent(session.user_agent)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
