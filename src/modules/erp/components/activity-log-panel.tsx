"use client";

import { useEffect, useState } from "react";

import type { AuditLogEntry } from "@/common/erp/types";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  formatAuditLogUser,
  formatAuditLogUserDetail,
} from "@/modules/erp/lib/audit-log-display";

export function ActivityLogPanel({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGet<{ data: AuditLogEntry[] }>(
      `erp/audit-logs?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    )
      .then((res) => setLogs(res.data ?? []))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  return <AuditLogEntryList logs={logs} loading={loading} />;
}

export function AuditLogEntryList({
  logs,
  loading = false,
}: {
  logs: AuditLogEntry[];
  loading?: boolean;
}) {
  if (loading) return <AdminPanelSkeleton rows={4} />;
  if (logs.length === 0) {
    return <p className="text-sm text-slate-500">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
            <span className="text-xs text-slate-500">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            By {formatAuditLogUserDetail(log)}
            {log.user_role ? ` · ${log.user_role}` : ""}
          </p>
          {log.description ? <p className="mt-1 text-slate-600">{log.description}</p> : null}
        </div>
      ))}
    </div>
  );
}

export { formatAuditLogUser, formatAuditLogUserDetail };
