"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { ReportColumn, ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListFooter,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  SortableTableHead,
  useSortableData,
} from "@/modules/admin/ui";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import { useBusinessReportFilters } from "../business-overview/use-business-report-filters";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";

type ExpenseDetail = Record<string, unknown> & {
  id?: string;
  expense_number?: string;
  expense_date?: string;
  store_name?: string;
  account_id?: string;
  account_code?: string;
  account_name?: string;
  account_type_name?: string;
  paid_through_account_id?: string;
  paid_through_name?: string;
  vendor_id?: string | null;
  vendor_name?: string;
  customer_id?: string | null;
  customer_name?: string;
  recorded_by?: string;
  reference?: string | null;
  notes?: string | null;
  tax_mode?: string;
  tax_percent?: number;
  tax_amount?: number;
  untaxed_amount?: number;
  total_amount?: number;
  billing_status?: string;
  has_receipt?: boolean;
};

type ExpenseGroup = {
  id: string;
  label: string;
  subtitle?: string;
  typeName: string;
  count: number;
  untaxed: number;
  tax: number;
  total: number;
  rows: ExpenseDetail[];
};

const GROUP_COLUMNS: ReportColumn[] = [
  { key: "label", label: "Name" },
  { key: "count", label: "Count", align: "right", format: "number" },
  { key: "untaxed", label: "Untaxed", align: "right", format: "currency" },
  { key: "tax", label: "Tax", align: "right", format: "currency" },
  { key: "total", label: "Total", align: "right", format: "currency" },
  { key: "share_pct", label: "Share", align: "right", format: "percent" },
];

const CATEGORY_COLUMNS: ReportColumn[] = [
  { key: "label", label: "Category" },
  { key: "count", label: "Count", align: "right", format: "number" },
  { key: "untaxed", label: "Untaxed", align: "right", format: "currency" },
  { key: "tax", label: "Tax", align: "right", format: "currency" },
  { key: "total", label: "Total", align: "right", format: "currency" },
  { key: "share_pct", label: "Share", align: "right", format: "percent" },
];

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sharePct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

function groupExpenses(
  rows: ExpenseDetail[],
  idKey: keyof ExpenseDetail,
  labelKey: keyof ExpenseDetail,
  typeKey?: keyof ExpenseDetail,
): ExpenseGroup[] {
  const map = new Map<string, ExpenseGroup>();
  for (const row of rows) {
    const id = String(row[idKey] ?? "") || "none";
    const existing = map.get(id);
    if (existing) {
      existing.count += 1;
      existing.untaxed += num(row.untaxed_amount);
      existing.tax += num(row.tax_amount);
      existing.total += num(row.total_amount);
      existing.rows.push(row);
      continue;
    }
    map.set(id, {
      id,
      label: String(row[labelKey] ?? "—"),
      subtitle: row.account_code ? String(row.account_code) : undefined,
      typeName: typeKey ? String(row[typeKey] ?? "Other") : "Other",
      count: 1,
      untaxed: num(row.untaxed_amount),
      tax: num(row.tax_amount),
      total: num(row.total_amount),
      rows: [row],
    });
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function billingBadgeVariant(status: string) {
  if (status === "Invoiced") return "default" as const;
  if (status === "Billable") return "outline" as const;
  return "secondary" as const;
}

function groupToRecord(group: ExpenseGroup, grandTotal: number): Record<string, unknown> {
  return {
    label: group.label,
    count: group.count,
    untaxed: group.untaxed,
    tax: group.tax,
    total: group.total,
    share_pct: sharePct(group.total, grandTotal),
  };
}

export function ExpenseReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
  });

  const details = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as ExpenseDetail[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(
    () => details.filter((row) => matchesReportSearch(row, filters.debouncedSearch)),
    [details, filters.debouncedSearch],
  );

  const totals = useMemo(() => {
    const expenseCount = filtered.length;
    const untaxed = filtered.reduce((s, r) => s + num(r.untaxed_amount), 0);
    const tax = filtered.reduce((s, r) => s + num(r.tax_amount), 0);
    const total = filtered.reduce((s, r) => s + num(r.total_amount), 0);
    const billable = filtered
      .filter((r) => r.billing_status === "Billable" || r.billing_status === "Invoiced")
      .reduce((s, r) => s + num(r.total_amount), 0);
    const nonBillable = filtered
      .filter((r) => r.billing_status !== "Billable" && r.billing_status !== "Invoiced")
      .reduce((s, r) => s + num(r.total_amount), 0);
    return {
      expenseCount,
      untaxed,
      tax,
      total,
      billable,
      nonBillable,
      avg: expenseCount > 0 ? total / expenseCount : 0,
    };
  }, [filtered]);

  const categories = useMemo(
    () => groupExpenses(filtered, "account_id", "account_name", "account_type_name"),
    [filtered],
  );
  const vendors = useMemo(
    () => groupExpenses(filtered, "vendor_id", "vendor_name"),
    [filtered],
  );
  const paidThrough = useMemo(
    () => groupExpenses(filtered, "paid_through_account_id", "paid_through_name"),
    [filtered],
  );
  const customers = useMemo(
    () => groupExpenses(filtered, "customer_id", "customer_name"),
    [filtered],
  );
  const statuses = useMemo(
    () => groupExpenses(filtered, "billing_status", "billing_status"),
    [filtered],
  );

  const typeSections = useMemo(() => {
    const map = new Map<string, { name: string; groups: ExpenseGroup[]; total: number; count: number }>();
    for (const group of categories) {
      const name = group.typeName || "Expense";
      const existing = map.get(name);
      if (existing) {
        existing.groups.push(group);
        existing.total += group.total;
        existing.count += group.count;
        continue;
      }
      map.set(name, { name, groups: [group], total: group.total, count: group.count });
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [categories]);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "expense_date",
    "desc",
    (row, key) => row[key],
  );

  const isEmpty = !loading && !error && filtered.length === 0;

  const kpiItems = useMemo(
    () =>
      filtered.length === 0
        ? []
        : [
            { label: "Total expenses", value: formatCurrencyAmount(totals.total) },
            { label: "Transactions", value: totals.expenseCount.toLocaleString() },
            { label: "Untaxed", value: formatCurrencyAmount(totals.untaxed) },
            { label: "Tax", value: formatCurrencyAmount(totals.tax) },
            { label: "Billable", value: formatCurrencyAmount(totals.billable) },
            { label: "Non-billable", value: formatCurrencyAmount(totals.nonBillable) },
          ],
    [filtered.length, totals],
  );

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: [
      ...report.columns,
      { key: "account_code", label: "Account code" },
      { key: "account_type_name", label: "Account type" },
      { key: "store_name", label: "Store" },
      { key: "reference", label: "Reference" },
      { key: "recorded_by", label: "Recorded by" },
      { key: "notes", label: "Notes" },
      { key: "has_receipt", label: "Receipt" },
    ],
    getRows: () =>
      sorted.map((row) => ({
        ...row,
        has_receipt: row.has_receipt ? "Yes" : "No",
      })),
    getSubtitle: () => reportFiltersSubtitle(filters, "range"),
  });

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      error={error}
      emptyMessage="No expenses in this period. Record expenses under Purchases to populate this report."
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      searchPlaceholder="Search expense #, category, vendor, customer, or reference…"
      metrics={!loading && kpiItems.length > 0 ? <ReportKpiStrip items={kpiItems} /> : null}
    >
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={10} columns={report.columns.length} />
        </AdminDataTable>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <span>
              Average expense{" "}
              <strong className="tabular-nums text-foreground">
                {formatCurrencyAmount(totals.avg)}
              </strong>
              <span className="mx-2 text-border">·</span>
              Categories{" "}
              <strong className="tabular-nums text-foreground">{categories.length.toLocaleString()}</strong>
              <span className="mx-2 text-border">·</span>
              Vendors{" "}
              <strong className="tabular-nums text-foreground">{vendors.length.toLocaleString()}</strong>
            </span>
            <span>Amounts are recorded expense totals, including tax.</span>
          </div>
          <Tabs defaultValue="category" className="gap-0">
            <div className="border-b px-4 py-2">
              <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="category">By category</TabsTrigger>
                <TabsTrigger value="vendor">By vendor</TabsTrigger>
                <TabsTrigger value="paid">Paid through</TabsTrigger>
                <TabsTrigger value="customer">By customer</TabsTrigger>
                <TabsTrigger value="status">Billing status</TabsTrigger>
                <TabsTrigger value="register">Expense register</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="category">
              <HierarchicalCategoryTable
                sections={typeSections}
                grandTotal={totals.total}
                expanded={expanded}
                onToggle={toggle}
              />
              <FooterCount total={categories.length} label="categories" />
            </TabsContent>

            <TabsContent value="vendor">
              <SummaryGroupTable
                groups={vendors}
                columns={GROUP_COLUMNS}
                grandTotal={totals.total}
                emptyLabel="No vendor-linked expenses."
              />
              <FooterCount total={vendors.length} label="vendors" />
            </TabsContent>

            <TabsContent value="paid">
              <SummaryGroupTable
                groups={paidThrough}
                columns={[{ key: "label", label: "Account" }, ...GROUP_COLUMNS.slice(1)]}
                grandTotal={totals.total}
                emptyLabel="No paid-through accounts."
              />
              <FooterCount total={paidThrough.length} label="accounts" />
            </TabsContent>

            <TabsContent value="customer">
              <SummaryGroupTable
                groups={customers}
                columns={[{ key: "label", label: "Customer" }, ...GROUP_COLUMNS.slice(1)]}
                grandTotal={totals.total}
                emptyLabel="No customer-linked expenses."
              />
              <FooterCount total={customers.length} label="customers" />
            </TabsContent>

            <TabsContent value="status">
              <SummaryGroupTable
                groups={statuses}
                columns={[{ key: "label", label: "Status" }, ...GROUP_COLUMNS.slice(1)]}
                grandTotal={totals.total}
                emptyLabel="No expenses."
              />
            </TabsContent>

            <TabsContent value="register">
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
                      className={col.align === "right" ? "text-right" : undefined}
                    />
                  ))}
                </AdminTableHeader>
                <AdminTableBody>
                  {sorted.map((row) => (
                    <AdminTableRow key={String(row.id ?? row.expense_number)}>
                      {report.columns.map((col) => (
                        <AdminTableCell
                          key={col.key}
                          className={cn(
                            col.align === "right" && "text-right tabular-nums",
                            col.key === "expense_number" && "font-medium",
                          )}
                        >
                          {col.key === "expense_number" && row.id ? (
                            <AdminTableLink href={`/admin/erp/expenses/${row.id}`}>
                              {String(row.expense_number ?? "—")}
                            </AdminTableLink>
                          ) : col.key === "billing_status" ? (
                            <Badge variant={billingBadgeVariant(String(row.billing_status ?? ""))}>
                              {String(row.billing_status ?? "—")}
                            </Badge>
                          ) : (
                            formatReportCell(row[col.key], col.format)
                          )}
                        </AdminTableCell>
                      ))}
                    </AdminTableRow>
                  ))}
                  <ReportTableTotalsRow columns={report.columns} rows={sorted} />
                </AdminTableBody>
              </AdminDataTable>
              <FooterCount total={sorted.length} label="expenses" />
            </TabsContent>
          </Tabs>
        </>
      )}
    </BusinessReportLayout>
  );
}

function FooterCount({ total, label }: { total: number; label: string }) {
  if (total <= 0) return null;
  return (
    <div className="border-t px-3 py-2">
      <AdminListFooter total={total} label={label} page={0} pageSize={total} />
    </div>
  );
}

function SummaryGroupTable({
  groups,
  columns,
  grandTotal,
  emptyLabel,
}: {
  groups: ExpenseGroup[];
  columns: ReportColumn[];
  grandTotal: number;
  emptyLabel: string;
}) {
  const rows = groups.map((g) => groupToRecord(g, grandTotal));
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <AdminDataTable>
      <AdminTableHeader>
        {columns.map((col) => (
          <AdminTableCell
            key={col.key}
            className={cn("text-xs font-medium", col.align === "right" && "text-right")}
          >
            {col.label}
          </AdminTableCell>
        ))}
      </AdminTableHeader>
      <AdminTableBody>
        {rows.map((row, i) => (
          <AdminTableRow key={`${String(row.label)}-${i}`}>
            {columns.map((col) => (
              <AdminTableCell
                key={col.key}
                className={cn(col.align === "right" && "text-right tabular-nums")}
              >
                {formatReportCell(row[col.key], col.format)}
              </AdminTableCell>
            ))}
          </AdminTableRow>
        ))}
        <ReportTableTotalsRow columns={columns} rows={rows} />
      </AdminTableBody>
    </AdminDataTable>
  );
}

function HierarchicalCategoryTable({
  sections,
  grandTotal,
  expanded,
  onToggle,
}: {
  sections: { name: string; groups: ExpenseGroup[]; total: number; count: number }[];
  grandTotal: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  if (sections.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">No expense categories in this period.</p>;
  }

  const colCount = CATEGORY_COLUMNS.length + 1;
  const flatRows = sections.flatMap((s) => s.groups.map((g) => groupToRecord(g, grandTotal)));

  return (
    <AdminDataTable>
      <AdminTableHeader>
        <AdminTableCell className="w-8 p-2" />
        {CATEGORY_COLUMNS.map((col) => (
          <AdminTableCell
            key={col.key}
            className={cn("text-xs font-medium", col.align === "right" && "text-right")}
          >
            {col.label}
          </AdminTableCell>
        ))}
      </AdminTableHeader>
      <AdminTableBody>
        {sections.map((section) => (
          <Fragment key={section.name}>
            <AdminTableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={colCount} className="px-4 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {section.name}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {section.count.toLocaleString()} · {formatCurrencyAmount(section.total)}
                  </span>
                </div>
              </TableCell>
            </AdminTableRow>
            {section.groups.map((group) => {
              const open = expanded[group.id];
              const record = groupToRecord(group, grandTotal);
              return (
                <Fragment key={group.id}>
                  <AdminTableRow>
                    <AdminTableCell className="w-8 p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onToggle(group.id)}
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${group.label}`}
                      >
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </Button>
                    </AdminTableCell>
                    {CATEGORY_COLUMNS.map((col) => (
                      <AdminTableCell
                        key={col.key}
                        className={cn(col.align === "right" && "text-right tabular-nums")}
                      >
                        {col.key === "label" ? (
                          <span className="font-medium">
                            {group.label}
                            {group.subtitle ? (
                              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                {group.subtitle}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          formatReportCell(record[col.key], col.format)
                        )}
                      </AdminTableCell>
                    ))}
                  </AdminTableRow>
                  {open ? (
                    <AdminTableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={colCount} className="p-3 pl-12">
                        <NestedExpenseLines rows={group.rows} />
                      </TableCell>
                    </AdminTableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
        <ReportTableTotalsRow
          columns={CATEGORY_COLUMNS}
          rows={flatRows}
          label="Grand total"
          leadingSpacerCells={1}
        />
      </AdminTableBody>
    </AdminDataTable>
  );
}

function NestedExpenseLines({ rows }: { rows: ExpenseDetail[] }) {
  const nestedColumns: ReportColumn[] = [
    { key: "expense_date", label: "Date", format: "date" },
    { key: "expense_number", label: "Expense #" },
    { key: "vendor_name", label: "Vendor" },
    { key: "paid_through_name", label: "Paid through" },
    { key: "reference", label: "Reference" },
    { key: "billing_status", label: "Status" },
    { key: "untaxed_amount", label: "Untaxed", align: "right", format: "currency" },
    { key: "tax_amount", label: "Tax", align: "right", format: "currency" },
    { key: "total_amount", label: "Total", align: "right", format: "currency" },
  ];

  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {nestedColumns.map((col) => (
              <th
                key={col.key}
                className={cn("px-3 py-2 font-medium", col.align === "right" ? "text-right" : "text-left")}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id ?? row.expense_number)} className="border-b border-border/50 last:border-0">
              {nestedColumns.map((col) => (
                <td
                  key={col.key}
                  className={cn("px-3 py-1.5", col.align === "right" && "text-right tabular-nums")}
                >
                  {col.key === "expense_number" && row.id ? (
                    <AdminTableLink href={`/admin/erp/expenses/${row.id}`}>
                      {String(row.expense_number ?? "—")}
                    </AdminTableLink>
                  ) : col.key === "billing_status" ? (
                    <Badge variant={billingBadgeVariant(String(row.billing_status ?? ""))}>
                      {String(row.billing_status ?? "—")}
                    </Badge>
                  ) : (
                    formatReportCell(row[col.key], col.format)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
