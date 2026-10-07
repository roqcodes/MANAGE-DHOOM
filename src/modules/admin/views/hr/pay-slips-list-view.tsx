"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Sparkles } from "lucide-react";

import type { ErpEmployeeOption, ErpPaySlipListRow } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useDebouncedValue,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";

const PERIOD_OPTIONS = [
  { value: "previous_month", label: "Previous month" },
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "all", label: "All periods" },
];

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

export function PaySlipsListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const [rows, setRows] = useState<ErpPaySlipListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [employees, setEmployees] = useState<ErpEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, startGenerate] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [period, setPeriod] = useState(searchParams.get("period") ?? "this_quarter");
  const [employeeId, setEmployeeId] = useState(searchParams.get("employeeId") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "from_date", "desc");

  useEffect(() => {
    const q = storeId ? `?view=options&storeId=${encodeURIComponent(storeId)}` : "?view=options";
    adminGet<{ data: ErpEmployeeOption[] }>(`erp/employees${q}`).then((res) =>
      setEmployees(res.data ?? []),
    );
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    if (storeId) q.set("storeId", storeId);
    if (period !== "all") q.set("period", period);
    if (employeeId) q.set("employeeId", employeeId);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ErpPaySlipListRow[]; total: number }>(`erp/pay-slips?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, period, employeeId, debouncedSearch]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (period !== "all") listParams.period = period;
  if (employeeId) listParams.employeeId = employeeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  function handleGenerate() {
    if (!storeId) {
      setGenerateError("Select a store first.");
      return;
    }
    setGenerateError(null);
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    startGenerate(async () => {
      try {
        const res = await adminPost<{ createdCount: number }>("erp/pay-slips", {
          storeId,
          periodMonth: prev.getMonth() + 1,
          periodYear: prev.getFullYear(),
        });
        if (res.createdCount === 0) {
          setGenerateError("No new pay slips generated — they may already exist for this period.");
        }
        setPeriod("previous_month");
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Pay slips"
        breadcrumb={[{ label: "Pay slips", href: "/admin/erp/pay-slips" }]}
        description="Generate and review monthly salary pay slips by store and period."
        actions={
          <Button size="sm" disabled={generating} onClick={handleGenerate}>
            <Sparkles data-icon="inline-start" />
            {generating ? "Generating…" : "Generate pay slips"}
          </Button>
        }
      />

      {generateError ? <p className="mb-4 text-sm text-destructive">{generateError}</p> : null}

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee…"
        isEmpty={sorted.length === 0}
        emptyMessage="No pay slips found."
        isFiltering={Boolean(debouncedSearch.trim()) || period !== "this_quarter" || Boolean(employeeId)}
        onClearFilters={() => {
          setSearch("");
          setPeriod("this_quarter");
          setEmployeeId("");
        }}
        footer={<span>{total} pay slips</span>}
        filters={[
          { id: "period", label: "Period", value: period, onChange: setPeriod, options: PERIOD_OPTIONS },
          {
            id: "employee",
            label: "Employee",
            value: employeeId,
            onChange: setEmployeeId,
            options: [
              { value: "", label: "All Employees" },
              ...employees.map((e) => ({ value: e.id, label: e.full_name })),
            ],
          },
        ]}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Employee"
              sortKey="employee_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Salary"
              sortKey="basic_salary"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Store"
              sortKey="store_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Period"
              sortKey="period_label"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="From"
              sortKey="from_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="To"
              sortKey="to_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Days"
              sortKey="days_count"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Net salary"
              sortKey="net_salary"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="font-medium">{row.employee_name}</AdminTableCell>
                <AdminTableCell className="tabular-nums">
                  {formatCurrencyAmount(row.basic_salary + row.allowance)}
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px] truncate text-sm">
                  {row.store_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell>
                  <Badge variant="secondary">{row.period_label}</Badge>
                </AdminTableCell>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  {formatDisplayDate(row.from_date)}
                </AdminTableCell>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  {formatDisplayDate(row.to_date)}
                </AdminTableCell>
                <AdminTableCell className="tabular-nums">{row.days_count}</AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.net_salary)}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/pay-slips"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />
    </AdminPageLayout>
  );
}
