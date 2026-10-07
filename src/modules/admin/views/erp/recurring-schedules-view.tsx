"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Pause, Pencil, Play, Trash2, Zap } from "lucide-react";

import type { RecurringScheduleRow } from "@/common/erp/types";
import { adminDelete, adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { downloadCsvFile, rowsToCsv } from "@/lib/csv/csv-utils";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useSortableData,
} from "@/modules/admin/ui";
import { Card, CardContent } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import {
  computeRecurringScheduleStats,
  RecurringSchedulesMetricsBar,
} from "@/modules/erp/components/recurring-schedules-metrics-bar";
import { RecurringScheduleFormDialog } from "@/modules/erp/components/recurring-schedule-form-dialog";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

type RecurringSchedulePageVariant = "invoice" | "purchase_bill";

const PAGE_CONFIG: Record<
  RecurringSchedulePageVariant,
  {
    title: string;
    description: string;
    basePath: string;
    contactColumnLabel: string;
    emptyMessage: string;
    createButtonLabel: string;
    csvFilename: string;
    migrationCode: string;
  }
> = {
  invoice: {
    title: "Recurring invoices",
    description:
      "Automate repeating customer invoices — money to be received on schedule. Run manually or on the next run date.",
    basePath: "/admin/erp/recurring-invoices",
    contactColumnLabel: "Customer",
    emptyMessage: "No recurring invoices yet. Create one to bill customers automatically.",
    createButtonLabel: "New recurring invoice",
    csvFilename: "recurring-invoices.csv",
    migrationCode: "20260830200000_erp_productivity_features.sql",
  },
  purchase_bill: {
    title: "Recurring bills",
    description:
      "Automate repeating vendor purchase bills — money to be paid on schedule. Run manually or on the next run date.",
    basePath: "/admin/erp/recurring-bills",
    contactColumnLabel: "Vendor",
    emptyMessage: "No recurring bills yet. Create one to automate vendor payments.",
    createButtonLabel: "New recurring bill",
    csvFilename: "recurring-bills.csv",
    migrationCode: "20260830200000_erp_productivity_features.sql",
  },
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
];

const FREQUENCY_OPTIONS = [
  { value: "all", label: "All frequencies" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function formatScheduleDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

function scheduleAmount(row: RecurringScheduleRow): number {
  const lines =
    (row.payload?.lines as Array<{ unitPrice?: number; quantity?: number }>) ?? [];
  return lines.reduce(
    (sum, line) => sum + Number(line.unitPrice ?? 0) * Number(line.quantity ?? 1),
    0,
  );
}

function scheduleLineLabel(row: RecurringScheduleRow): string {
  const lines = (row.payload?.lines as Array<{ productName?: string }>) ?? [];
  return lines[0]?.productName ?? "—";
}

function contactLabel(row: RecurringScheduleRow, variant: RecurringSchedulePageVariant): string {
  return variant === "invoice"
    ? (row.customer_name ?? "—")
    : (row.vendor_name ?? "—");
}

function exportSchedulesCsv(
  rows: RecurringScheduleRow[],
  variant: RecurringSchedulePageVariant,
  filename: string,
) {
  const contactKey = variant === "invoice" ? "customer" : "vendor";
  const headers = [
    "name",
    contactKey,
    "frequency",
    "next_run_date",
    "last_run_date",
    "is_active",
    "line_item",
    "amount",
  ];
  const data = rows.map((row) => ({
    name: row.name,
    [contactKey]: contactLabel(row, variant),
    frequency: row.frequency,
    next_run_date: row.next_run_date,
    last_run_date: row.last_run_date ?? "",
    is_active: row.is_active ? "true" : "false",
    line_item: scheduleLineLabel(row),
    amount: scheduleAmount(row),
  }));
  downloadCsvFile(filename, rowsToCsv(headers, data));
}

export function RecurringSchedulesView({
  variant,
}: {
  variant: RecurringSchedulePageVariant;
}) {
  const config = PAGE_CONFIG[variant];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeStoreId } = useErpStores();
  const [rows, setRows] = useState<RecurringScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<RecurringScheduleRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    if (searchParams.get("form") === "new") {
      setCreateOpen(true);
    }
  }, [searchParams]);

  function closeCreateDialog() {
    setCreateOpen(false);
    if (searchParams.get("form")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("form");
      params.delete("type");
      const qs = params.toString();
      router.replace(qs ? `${config.basePath}?${qs}` : config.basePath);
    }
  }

  function reload() {
    setLoadError(null);
    setMigrationRequired(false);
    return adminGet<{ data: RecurringScheduleRow[] }>(
      activeStoreId
        ? `erp/recurring-schedules?storeId=${encodeURIComponent(activeStoreId)}`
        : "erp/recurring-schedules",
    )
      .then((res) => setRows(res.data))
      .catch((err: Error) => {
        const msg = err.message || "Failed to load schedules";
        setLoadError(msg);
        setMigrationRequired(
          msg.includes("schema cache") ||
            msg.includes("does not exist") ||
            msg.includes("503"),
        );
        setRows([]);
      });
  }

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [activeStoreId]);

  const scopedRows = useMemo(
    () => rows.filter((row) => row.schedule_type === variant),
    [rows, variant],
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return scopedRows.filter((row) => {
      if (statusFilter === "active" && !row.is_active) return false;
      if (statusFilter === "paused" && row.is_active) return false;
      if (frequencyFilter !== "all" && row.frequency !== frequencyFilter) return false;
      if (!q) return true;
      const haystack = [
        row.name,
        row.frequency,
        scheduleLineLabel(row),
        contactLabel(row, variant),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [scopedRows, debouncedSearch, statusFilter, frequencyFilter, variant]);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "next_run_date",
    "asc",
  );

  const stats = useMemo(() => computeRecurringScheduleStats(scopedRows), [scopedRows]);

  const isFiltering =
    Boolean(debouncedSearch.trim()) ||
    statusFilter !== "all" ||
    frequencyFilter !== "all";

  function runSchedule(row: RecurringScheduleRow) {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await adminPost<{ createdId: string }>(
          `erp/recurring-schedules/${row.id}/run`,
          {},
        );
        await reload();
        const href =
          row.schedule_type === "invoice"
            ? `/admin/erp/invoices/${res.createdId}`
            : `/admin/erp/purchase-bills/${res.createdId}`;
        window.location.href = href;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Run failed");
      }
    });
  }

  function togglePause(row: RecurringScheduleRow) {
    setActionError(null);
    startTransition(async () => {
      try {
        await adminPatch("erp/recurring-schedules", {
          id: row.id,
          isActive: !row.is_active,
        });
        await reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  function deleteSchedule(row: RecurringScheduleRow) {
    if (!confirm(`Delete schedule "${row.name}"?`)) return;
    setActionError(null);
    startTransition(async () => {
      try {
        await adminDelete(`erp/recurring-schedules?id=${row.id}`);
        await reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  if (loading && scopedRows.length === 0 && !migrationRequired) {
    return <AdminPageSkeleton />;
  }

  return (
    <AdminPageLayout>
      <div className="flex flex-col gap-4">
        <RecurringSchedulesMetricsBar
          variant={variant}
          title={config.title}
          description={config.description}
          createButtonLabel={config.createButtonLabel}
          stats={stats}
          onExport={() => exportSchedulesCsv(sorted, variant, config.csvFilename)}
          onCreate={() => setCreateOpen(true)}
        />

        {migrationRequired ? (
          <Card className="border-amber-200 bg-amber-50/60 ring-0">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div className="text-sm text-amber-950">
                <p className="font-semibold">Database migration required</p>
                <p className="mt-1">
                  Run{" "}
                  <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                    {config.migrationCode}
                  </code>{" "}
                  in Supabase SQL Editor, then refresh this page.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loadError && !migrationRequired ? (
          <Card className="border-rose-200 bg-rose-50/50 ring-0">
            <CardContent className="py-4 text-sm text-rose-800">{loadError}</CardContent>
          </Card>
        ) : null}

        {actionError ? (
          <Card className="border-rose-200 bg-rose-50/50 ring-0">
            <CardContent className="py-4 text-sm text-rose-800">{actionError}</CardContent>
          </Card>
        ) : null}

        <AdminListCard
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={`Search ${variant === "invoice" ? "invoices" : "bills"}, customers, line items…`}
          isEmpty={sorted.length === 0}
          emptyMessage={
            migrationRequired
              ? "Apply the migration to start using recurring schedules."
              : config.emptyMessage
          }
          isFiltering={isFiltering}
          onClearFilters={() => {
            setSearch("");
            setStatusFilter("all");
            setFrequencyFilter("all");
          }}
          filters={[
            {
              id: "status",
              label: "Status",
              value: statusFilter,
              options: STATUS_OPTIONS,
              onChange: setStatusFilter,
            },
            {
              id: "frequency",
              label: "Frequency",
              value: frequencyFilter,
              options: FREQUENCY_OPTIONS,
              onChange: setFrequencyFilter,
            },
          ]}
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span>
                {sorted.length} schedule{sorted.length === 1 ? "" : "s"}
                {isFiltering && scopedRows.length !== sorted.length
                  ? ` of ${scopedRows.length}`
                  : ""}
              </span>
              <span className="font-semibold tabular-nums">
                Active value:{" "}
                {formatCurrencyAmount(
                  sorted
                    .filter((r) => r.is_active)
                    .reduce((sum, row) => sum + scheduleAmount(row), 0),
                )}
              </span>
            </div>
          }
        >
          <AdminDataTable>
            <AdminTableHeader>
              <SortableTableHead
                label="Schedule"
                sortKey="name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label={config.contactColumnLabel}
                sortKey="name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="hidden sm:table-cell"
              />
              <SortableTableHead
                label="Line item"
                sortKey="name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="hidden md:table-cell"
              />
              <SortableTableHead
                label="Frequency"
                sortKey="frequency"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Next run"
                sortKey="next_run_date"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Last run"
                sortKey="last_run_date"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="hidden lg:table-cell"
              />
              <SortableTableHead
                label="Amount"
                sortKey="name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="text-right"
              />
              <SortableTableHead
                label="Status"
                sortKey="is_active"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="hidden sm:table-cell"
              />
              <TableHead className="w-[140px] md:w-[156px]" />
            </AdminTableHeader>
            <AdminTableBody>
              {sorted.map((row) => (
                <AdminTableRow key={row.id}>
                  <AdminTableCell>
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{row.name}</p>
                      <p className="text-xs text-muted-foreground capitalize sm:hidden">
                        {contactLabel(row, variant)} · {row.frequency}
                      </p>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell className="hidden max-w-[180px] truncate sm:table-cell">
                    <span className="text-sm">{contactLabel(row, variant)}</span>
                  </AdminTableCell>
                  <AdminTableCell className="hidden max-w-[200px] truncate md:table-cell">
                    {scheduleLineLabel(row)}
                  </AdminTableCell>
                  <AdminTableCell className="capitalize text-sm">{row.frequency}</AdminTableCell>
                  <AdminTableCell className="text-sm tabular-nums">
                    {formatScheduleDate(row.next_run_date)}
                  </AdminTableCell>
                  <AdminTableCell className="hidden text-sm tabular-nums text-muted-foreground lg:table-cell">
                    {formatScheduleDate(row.last_run_date)}
                  </AdminTableCell>
                  <AdminTableCell className="text-right tabular-nums font-medium">
                    {formatCurrencyAmount(scheduleAmount(row))}
                  </AdminTableCell>
                  <AdminTableCell className="hidden sm:table-cell">
                    <StatusBadge status={row.is_active ? "active" : "paused"} />
                  </AdminTableCell>
                  <AdminTableCell className="p-1">
                    <ErpListRowActions
                      responsiveIcons
                      iconActions={[
                        {
                          label: "Edit schedule",
                          icon: Pencil,
                          onClick: () => setEditingSchedule(row),
                          disabled: pending,
                        },
                        {
                          label: "Run now",
                          icon: Zap,
                          onClick: () => runSchedule(row),
                          disabled: pending || !row.is_active,
                        },
                        {
                          label: row.is_active ? "Pause schedule" : "Resume schedule",
                          icon: row.is_active ? Pause : Play,
                          onClick: () => togglePause(row),
                          disabled: pending,
                        },
                        {
                          label: "Delete schedule",
                          icon: Trash2,
                          onClick: () => deleteSchedule(row),
                          disabled: pending,
                          destructive: true,
                        },
                      ]}
                    />
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminListCard>
      </div>

      <RecurringScheduleFormDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) setCreateOpen(true);
          else closeCreateDialog();
        }}
        defaultScheduleType={variant}
        lockScheduleType
        onSuccess={() => {
          closeCreateDialog();
          void reload();
        }}
      />
      <RecurringScheduleFormDialog
        open={Boolean(editingSchedule)}
        onOpenChange={(open) => {
          if (!open) setEditingSchedule(null);
        }}
        schedule={editingSchedule}
        defaultScheduleType={variant}
        lockScheduleType
        onSuccess={() => {
          setEditingSchedule(null);
          void reload();
        }}
      />
    </AdminPageLayout>
  );
}
