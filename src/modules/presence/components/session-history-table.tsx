"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  FilterX,
  History,
  Search,
  User,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserRoleBadge } from "@/modules/users/components/users-ui";
import {
  DurationRangeFilter,
  isDurationFilterActive,
  matchesDurationBounds,
  resolveDurationBounds,
} from "@/modules/presence/components/duration-range-filter";
import {
  calculatePresenceDurationMinutes,
  describeUserAgent,
  formatPresenceDateGroupHeader,
  formatPresenceDuration,
  formatPresenceTime,
  formatPresenceTimestamp,
  getPresenceDateKey,
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
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("");

  // Most recent session per user for active detection
  const latestSessionIdByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, s.id);
      }
    }
    return map;
  }, [sessions]);

  // Unique users for dropdown filter
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string | null }>();
    for (const s of sessions) {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, {
          id: s.user_id,
          name: s.user_name || s.user_email || "Team member",
          email: s.user_email,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  // Unique roles for dropdown filter
  const uniqueRoles = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.user_role) set.add(s.user_role);
    }
    return Array.from(set).sort();
  }, [sessions]);

  // Robust active check
  const isSessionActive = (session: PresenceSessionRow): boolean => {
    if (session.ended_reason === "sign_out") return false;
    if (session.ended_reason === "last_tab_closed") return false;
    if (!session.logout_at) return true;

    const isUserOnline = onlineUserIds ? onlineUserIds.has(session.user_id) : false;
    const isLatest = latestSessionIdByUser.get(session.user_id) === session.id;
    if (isUserOnline && isLatest) return true;

    return false;
  };

  const durationBounds = useMemo(
    () => resolveDurationBounds(minDuration, maxDuration),
    [minDuration, maxDuration],
  );

  const durationActive = isDurationFilterActive(minDuration, maxDuration);

  const hasAnyFilter =
    searchTerm.trim().length > 0 ||
    statusFilter !== "all" ||
    selectedUserId !== "all" ||
    selectedRole !== "all" ||
    durationActive;

  const handleClearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSelectedUserId("all");
    setSelectedRole("all");
    setMinDuration("");
    setMaxDuration("");
  };

  // Filtered rows
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const active = isSessionActive(session);

      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "ended" && active) return false;

      if (selectedUserId !== "all" && session.user_id !== selectedUserId) {
        return false;
      }

      if (selectedRole !== "all" && (session.user_role ?? "") !== selectedRole) {
        return false;
      }

      // Duration range check
      if (durationActive) {
        const effectiveEnd = active ? null : (session.logout_at ?? session.last_seen_at);
        const durationMins = calculatePresenceDurationMinutes(
          session.login_at,
          effectiveEnd,
          nowMs,
        );
        if (!matchesDurationBounds(durationMins, durationBounds)) {
          return false;
        }
      }

      // Search text filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = session.user_name?.toLowerCase().includes(query);
        const emailMatch = session.user_email?.toLowerCase().includes(query);
        const roleMatch = session.user_role?.toLowerCase().includes(query);
        const deviceMatch = session.user_agent?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !roleMatch && !deviceMatch) {
          return false;
        }
      }

      return true;
    });
  }, [
    sessions,
    statusFilter,
    selectedUserId,
    selectedRole,
    durationActive,
    durationBounds,
    searchTerm,
    onlineUserIds,
    latestSessionIdByUser,
    nowMs,
  ]);

  // Group filtered entries by date
  const groupedSessions = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        dateHeader: string;
        items: PresenceSessionRow[];
        activeCount: number;
      }
    >();

    for (const session of filteredSessions) {
      const dateKey = getPresenceDateKey(session.login_at);
      let group = map.get(dateKey);
      if (!group) {
        group = {
          dateKey,
          dateHeader: formatPresenceDateGroupHeader(dateKey),
          items: [],
          activeCount: 0,
        };
        map.set(dateKey, group);
      }
      group.items.push(session);
      if (isSessionActive(session)) {
        group.activeCount += 1;
      }
    }

    // Sort descending by dateKey (newest dates first)
    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredSessions, onlineUserIds, latestSessionIdByUser]);

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
      {/* Filters Toolbar */}
      <div className="border-b border-border/80 bg-muted/20 p-4 space-y-3">
        {/* Top filter row: Search, Status tabs, User and Role selectors */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Search box */}
          <div className="flex flex-col gap-1 min-w-[200px] flex-1">
            <Label htmlFor="history-search" className="text-xs font-medium text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="history-search"
                type="search"
                placeholder="Search user, email, device..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
          </div>

          {/* User selector */}
          {uniqueUsers.length > 1 ? (
            <div className="flex flex-col gap-1 min-w-[150px]">
              <Label htmlFor="history-user-select" className="text-xs font-medium text-muted-foreground">
                Team member
              </Label>
              <select
                id="history-user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All team members ({uniqueUsers.length})</option>
                {uniqueUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Role selector */}
          {uniqueRoles.length > 1 ? (
            <div className="flex flex-col gap-1 min-w-[130px]">
              <Label htmlFor="history-role-select" className="text-xs font-medium text-muted-foreground">
                Role
              </Label>
              <select
                id="history-role-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring capitalize"
              >
                <option value="all">All roles</option>
                {uniqueRoles.map((role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Status filter tabs */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <div className="flex items-center gap-1 h-8">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors h-8",
                  statusFilter === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background text-muted-foreground border border-border hover:bg-muted hover:text-foreground",
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors h-8",
                  statusFilter === "active"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background text-muted-foreground border border-border hover:bg-muted hover:text-foreground",
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ended")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors h-8",
                  statusFilter === "ended"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background text-muted-foreground border border-border hover:bg-muted hover:text-foreground",
                )}
              >
                Ended
              </button>
            </div>
          </div>
        </div>

        {/* Bottom filter row: Duration Range Selector (like Stock Report) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-border/50">
          <DurationRangeFilter
            min={minDuration}
            max={maxDuration}
            onMinChange={setMinDuration}
            onMaxChange={setMaxDuration}
            onClear={() => {
              setMinDuration("");
              setMaxDuration("");
            }}
          />

          {/* Active filter summary & Clear all */}
          {hasAnyFilter ? (
            <div className="flex items-center gap-2 self-end">
              <span className="text-xs text-muted-foreground">
                Showing <strong className="text-foreground">{filteredSessions.length}</strong> of{" "}
                {sessions.length} sessions
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAllFilters}
                className="h-8 gap-1.5 text-xs"
              >
                <FilterX className="size-3.5" />
                Clear all filters
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Grouped Table View */}
      {groupedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <Clock className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No sessions match your filters</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Try adjusting your search query, status, team member, or duration range.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAllFilters}
            className="mt-2 h-8 text-xs"
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {groupedSessions.map((group) => (
            <div key={group.dateKey} className="flex flex-col">
              {/* Date Group Header */}
              <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-xs font-semibold text-foreground tracking-tight">
                    {group.dateHeader}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {group.activeCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {group.activeCount} active
                    </span>
                  ) : null}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? "session" : "sessions"}
                  </span>
                </div>
              </div>

              {/* Table for this date */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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
                    {group.items.map((session) => {
                      const active = isSessionActive(session);
                      const effectiveLogoutAt = active
                        ? null
                        : (session.logout_at ?? session.last_seen_at);
                      const effectiveEndedReason = active
                        ? null
                        : (session.ended_reason ?? "stale");

                      return (
                        <tr
                          key={session.id}
                          className="border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground text-xs sm:text-sm">
                                {session.user_name || session.user_email || "Team member"}
                              </p>
                              {session.user_email ? (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {session.user_email}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <UserRoleBadge role={session.user_role} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                            <span className="font-medium text-foreground">
                              {formatPresenceTime(session.login_at)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                            {active ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="font-medium text-foreground">
                                {formatPresenceTime(effectiveLogoutAt)}
                              </span>
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
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : effectiveEndedReason === "sign_out"
                                    ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                    : effectiveEndedReason === "stale" ||
                                        effectiveEndedReason === "timeout"
                                      ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
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
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
