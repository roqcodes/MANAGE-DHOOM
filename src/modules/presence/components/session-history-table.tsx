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

  // Track the most recent session for each user
  const latestSessionIdByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, s.id);
      }
    }
    return map;
  }, [sessions]);

  // Helper to determine if a session row is active
  const isSessionActive = (session: PresenceSessionRow): boolean => {
    // Explicit manual sign-out is always ended
    if (session.ended_reason === "sign_out") return false;

    // Explicit clean tab close is ended unless user is currently live on their latest session
    if (session.ended_reason === "last_tab_closed") return false;

    // If database explicitly has no logout time, it's active
    if (!session.logout_at) return true;

    // If the user is currently online in the portal and this is their latest session,
    // they are live right now (e.g. reconnected tab or resumed from sleep)
    const isUserOnline = onlineUserIds ? onlineUserIds.has(session.user_id) : false;
    const isLatest = latestSessionIdByUser.get(session.user_id) === session.id;
    if (isUserOnline && isLatest) {
      return true;
    }

    return false;
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const active = isSessionActive(session);

      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "ended" && active) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = session.user_name?.toLowerCase().includes(query);
        const emailMatch = session.user_email?.toLowerCase().includes(query);
        const roleMatch = session.user_role?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !roleMatch) return false;
      }

      return true;
    });
  }, [sessions, statusFilter, searchTerm, onlineUserIds, latestSessionIdByUser]);

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
                const active = isSessionActive(session);

                // Effective logout and ended reason
                const effectiveLogoutAt = active ? null : (session.logout_at ?? session.last_seen_at);
                const effectiveEndedReason = active ? null : (session.ended_reason ?? "stale");

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
                        {active ? "Active" : presenceEndReasonLabel(effectiveEndedReason)}
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
