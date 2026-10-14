"use client";

import { useEffect, useMemo, useState } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatListDateLabel, formatTimeLocal } from "@/lib/format-date";

function formatActivityWhen(value: string) {
  const date = formatListDateLabel(value);
  const time = formatTimeLocal(value);
  return time ? `${date} ${time}` : date;
}
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListFooter,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useSortableData,
} from "@/modules/admin/ui";
import { Label } from "@/components/ui/label";
import {
  AUDIT_ACTION_FILTER_OPTIONS,
  AUDIT_ENTITY_FILTER_OPTIONS,
  formatAuditActionLabel,
  formatAuditEntityLabel,
} from "@/modules/erp/lib/audit-log-display";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { BusinessReportLayout } from "./business-overview/business-report-layout";
import { exportReportCsv, formatReportCell } from "./business-overview/report-format";
import { useBusinessReportFilters } from "./business-overview/use-business-report-filters";
import { useErpReportFetch } from "./business-overview/use-erp-report-fetch";
import { DeletedInvoicesReport } from "./activity/deleted-invoices-report";

type StaffOption = { id: string; name: string };

function ActivityLogReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [userId, setUserId] = useState("all");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);

  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
    search: filters.debouncedSearch,
    entityType,
    action,
    userId,
  });

  useEffect(() => {
    adminGet<{
      content?: { kind?: string; data?: Array<{ id: string; name: string | null }> };
    }>("users?page=0")
      .then((res) => {
        const users = res.content?.data ?? [];
        setStaffOptions(
          users
            .filter((u) => u.name?.trim())
            .map((u) => ({ id: u.id, name: u.name!.trim() }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => setStaffOptions([]));
  }, []);

  const rows = useMemo(
    () => extractReportRows(rawData) as Record<string, unknown>[],
    [rawData],
  );

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "created_at",
    "desc",
    (row, key) => row[key],
  );

  const isEmpty = !loading && sorted.length === 0;

  function exportCsv() {
    exportReportCsv(report.slug, report.columns, sorted);
  }

  const filterToolbar = (
    <>
      {report.filters.entityType ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Entity</Label>
          <select
            className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="all">All entities</option>
            {AUDIT_ENTITY_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {report.filters.activityAction ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Activity</Label>
          <select
            className="h-9 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="all">All activities</option>
            {AUDIT_ACTION_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {report.filters.activityUser ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">User</Label>
          <select
            className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="all">All users</option>
            {staffOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      onExport={exportCsv}
      showDateRange
      searchPlaceholder="Search description, user, store, or reference…"
      toolbarExtra={filterToolbar}
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={10} columns={report.columns.length} />
        </AdminDataTable>
      ) : (
        <AdminDataTable>
          <AdminTableHeader>
            {report.columns.map((col) => (
              <SortableTableHead
                key={col.key}
                label={col.label}
                sortKey={col.key}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align={col.align === "right" ? "right" : "left"}
              />
            ))}
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row, i) => (
              <AdminTableRow key={String(row.id ?? i)}>
                {report.columns.map((col) => (
                  <AdminTableCell
                    key={col.key}
                    className={col.align === "right" ? "text-right tabular-nums" : undefined}
                  >
                    {col.key === "created_at" && typeof row.created_at === "string"
                      ? formatActivityWhen(row.created_at)
                      : col.key === "entity_label"
                        ? formatAuditEntityLabel(String(row.entity_type ?? ""))
                        : col.key === "activity_label"
                          ? formatAuditActionLabel(String(row.action ?? ""))
                          : formatReportCell(row[col.key], col.format)}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {!loading && sorted.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={sorted.length} label="events" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}

export function ActivityReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "deleted-invoices") {
    return <DeletedInvoicesReport report={report} />;
  }
  return <ActivityLogReport report={report} />;
}
