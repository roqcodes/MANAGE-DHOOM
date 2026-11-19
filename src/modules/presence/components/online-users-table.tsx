"use client";

import { MonitorSmartphone, Radio } from "lucide-react";

import { UserRoleBadge } from "@/modules/users/components/users-ui";
import {
  formatPresenceDuration,
  formatPresenceTimestamp,
} from "@/modules/presence/lib/format-presence";
import type { OnlineTeamMember } from "@/modules/presence/types";

export function OnlineUsersTable({
  members,
  nowMs,
}: {
  members: OnlineTeamMember[];
  nowMs: number;
}) {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <Radio className="size-9 text-muted-foreground/40" aria-hidden />
        <p className="text-sm font-medium text-foreground">No one is online</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Team members appear here the moment they open the admin app and
          disappear as soon as their last tab closes.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">User</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Tabs</th>
            <th className="px-4 py-2 font-medium">Online since</th>
            <th className="px-4 py-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.userId}
              className="border-b border-border/60 last:border-0 hover:bg-muted/40"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {member.name}
                    </p>
                    {member.email ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <UserRoleBadge role={member.role} />
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MonitorSmartphone className="size-3.5" aria-hidden />
                  <span className="tabular-nums text-foreground">
                    {member.tabs}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {formatPresenceTimestamp(member.onlineAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground">
                {formatPresenceDuration(member.onlineAt, null, nowMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
