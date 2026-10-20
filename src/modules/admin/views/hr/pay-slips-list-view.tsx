"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Sparkles, Wallet } from "lucide-react";

import type { ErpEmployeeOption, ErpPaySlipListRow } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminPageHeader,
  AdminPrimaryAction,
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
import {
  SalaryPaymentFormView,
  type SalaryPaymentPrefill,
} from "@/modules/admin/views/hr/salary-payment-form-view";

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

function defaultPayrollPeriod(): { month: string; year: string } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    month: String(prev.getMonth() + 1),
    year: String(prev.getFullYear()),
  };
}

function buildYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let y = currentYear + 1; y >= currentYear - 10; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

function parsePeriodMonth(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1 || n > 12) return fallback;
  return String(n);
}

function parsePeriodYear(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 2000 || n > 2100) return fallback;
  return String(n);
}

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

export function PaySlipsListView() {
  const searchParams = useSearchParams();
  const { storeId } = useActiveStoreScope();
  const defaultPeriod = useMemo(() => defaultPayrollPeriod(), []);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  const [rows, setRows] = useState<ErpPaySlipListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [employees, setEmployees] = useState<ErpEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, startGenerate] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentPrefill, setPaymentPrefill] = useState<SalaryPaymentPrefill | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [periodMonth, setPeriodMonth] = useState(() =>
    parsePeriodMonth(searchParams.get("periodMonth"), defaultPeriod.month),
  );
  const [periodYear, setPeriodYear] = useState(() =>
    parsePeriodYear(searchParams.get("periodYear"), defaultPeriod.year),
  );
  const [employeeId, setEmployeeId] = useState(searchParams.get("employeeId") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "from_date", "desc");

  const periodLabel =
    MONTH_OPTIONS.find((m) => m.value === periodMonth)?.label ?? periodMonth;

  const isDefaultPeriod =
    periodMonth === defaultPeriod.month && periodYear === defaultPeriod.year;

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
    q.set("periodMonth", periodMonth);
    q.set("periodYear", periodYear);
    if (storeId) q.set("storeId", storeId);
    if (employeeId) q.set("employeeId", employeeId);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ErpPaySlipListRow[]; total: number }>(`erp/pay-slips?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, periodMonth, periodYear, employeeId, debouncedSearch]);

  const listParams: Record<string, string> = {
    periodMonth,
    periodYear,
  };
  if (storeId) listParams.storeId = storeId;
  if (employeeId) listParams.employeeId = employeeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  function handlePay(row: ErpPaySlipListRow) {
    setPaymentPrefill({
      employeeId: row.employee_id,
      amount: row.net_salary,
      paymentDate: row.to_date,
      payslipNumber: row.payslip_number,
      periodLabel: row.period_label,
    });
    setPayModalOpen(true);
  }

  function closePayModal() {
    setPayModalOpen(false);
    setPaymentPrefill(null);
  }

  function handleGenerate() {
    if (!storeId) {
      setGenerateError("Select a store first.");
      return;
    }
    setGenerateError(null);
    const month = parseInt(periodMonth, 10);
    const year = parseInt(periodYear, 10);
    startGenerate(async () => {
      try {
        const res = await adminPost<{ createdCount: number }>("erp/pay-slips", {
          storeId,
          periodMonth: month,
          periodYear: year,
        });
        if (res.createdCount === 0) {
          setGenerateError("No new pay slips generated — they may already exist for this period.");
          return;
        }
        setLoading(true);
        const q = new URLSearchParams();
        q.set("page", "0");
        q.set("periodMonth", periodMonth);
        q.set("periodYear", periodYear);
        if (storeId) q.set("storeId", storeId);
        if (employeeId) q.set("employeeId", employeeId);
        if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());
        const listRes = await adminGet<{ data: ErpPaySlipListRow[]; total: number }>(
          `erp/pay-slips?${q.toString()}`,
        );
        setRows(listRes.data);
        setTotal(listRes.total);
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setLoading(false);
      }
    });
  }

  const initialLoading = loading && rows.length === 0;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Pay slips"
        breadcrumb={[{ label: "Pay slips", href: "/admin/erp/pay-slips" }]}
        description="Pick a payroll month and year, review slips for that period, then generate missing slips for the same period."
        actions={
          <AdminPrimaryAction disabled={generating} onClick={handleGenerate}>
            <Sparkles data-icon="inline-start" />
            {generating ? "Generating…" : `Generate for ${periodLabel} ${periodYear}`}
          </AdminPrimaryAction>
        }
      />

      {generateError ? <p className="mb-4 text-sm text-destructive">{generateError}</p> : null}

      <AdminListCard
        isLoading={initialLoading}
        inlineDateRange={false}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee…"
        isEmpty={!initialLoading && sorted.length === 0}
        emptyMessage="No pay slips for this month."
        isFiltering={Boolean(debouncedSearch.trim()) || Boolean(employeeId) || !isDefaultPeriod}
        onClearFilters={() => {
          setSearch("");
          setEmployeeId("");
          setPeriodMonth(defaultPeriod.month);
          setPeriodYear(defaultPeriod.year);
        }}
        footer={<span>{total} pay slips</span>}
        filters={[
          {
            id: "month",
            label: "Month",
            value: periodMonth,
            onChange: setPeriodMonth,
            options: [...MONTH_OPTIONS],
          },
          {
            id: "year",
            label: "Year",
            value: periodYear,
            onChange: setPeriodYear,
            options: yearOptions,
          },
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
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={9} />
          ) : (
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
                  <AdminTableCell align="right">
                    <Button
                      type="button"
                      size="default"
                      className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      onClick={() => handlePay(row)}
                    >
                      <Wallet data-icon="inline-start" />
                      Pay
                    </Button>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/pay-slips"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />

      {payModalOpen ? (
        <SalaryPaymentFormView
          variant="modal"
          open={payModalOpen}
          onOpenChange={(open) => {
            if (!open) closePayModal();
          }}
          prefill={paymentPrefill}
          onSuccess={() => closePayModal()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
