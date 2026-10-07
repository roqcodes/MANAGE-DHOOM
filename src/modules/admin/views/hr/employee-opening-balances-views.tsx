"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { ErpEmployeeOpeningBalanceListRow, ErpEmployeeOption } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminDataTable,
  AdminFormActions,
  AdminFormField,
  AdminFormSection,
  AdminFormShell,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

export function EmployeeOpeningBalancesListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/employee-opening-balances");
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<ErpEmployeeOpeningBalanceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "entry_date", "desc");

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    if (storeId) q.set("storeId", storeId);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ErpEmployeeOpeningBalanceListRow[]; total: number }>(
      `erp/employee-opening-balances?${q.toString()}`,
    )
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, debouncedSearch, activeStoreId, reloadToken]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Employee opening balances"
        breadcrumb={[{ label: "Opening balances", href: "/admin/erp/employee-opening-balances" }]}
        description="Set initial salary payable balances when migrating from another system."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add opening balance
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search batch number…"
        isEmpty={sorted.length === 0}
        emptyMessage="No opening balance batches found."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{total} batches</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Date"
              sortKey="entry_date"
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
              label="Note"
              sortKey="notes"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Total amount"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  {formatDisplayDate(row.entry_date)}
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px] truncate text-sm">
                  {row.store_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell className="max-w-[240px] truncate">
                  {row.notes ?? "—"}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/employee-opening-balances"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />

      {isOpen ? (
        <EmployeeOpeningBalanceFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}

type LineState = {
  employeeId: string;
  employeeName: string;
  joiningDate: string;
  openingBalance: string;
};

export type EmployeeOpeningBalanceFormViewProps = ErpFormViewBaseProps;

export function EmployeeOpeningBalanceFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: EmployeeOpeningBalanceFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";
  const [lines, setLines] = useState<LineState[]>([]);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!effectiveStoreId) {
      setLines([]);
      return;
    }
    adminGet<{ data: ErpEmployeeOption[] }>(
      `erp/employees?view=options&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then(async (res) => {
      const emps = res.data ?? [];
      const details = await Promise.all(
        emps.map((emp) => adminGet<{ joining_date: string }>(`erp/employees/${emp.id}`)),
      );
      setLines(
        emps.map((emp, i) => ({
          employeeId: emp.id,
          employeeName: emp.full_name,
          joiningDate: details[i]?.joining_date ?? "",
          openingBalance: "",
        })),
      );
    });
  }, [effectiveStoreId]);

  const total = lines.reduce((sum, line) => sum + (parseFloat(line.openingBalance) || 0), 0);

  function updateLine(index: number, value: string) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, openingBalance: value } : line)),
    );
  }

  function handleCancel() {
    if (isModal) onOpenChange?.(false);
    else router.push("/admin/erp/employee-opening-balances");
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/employee-opening-balances");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");

    const payloadLines = lines
      .map((line) => ({
        employee_id: line.employeeId,
        opening_balance: parseFloat(line.openingBalance) || 0,
        joining_date: line.joiningDate || undefined,
      }))
      .filter((l) => l.opening_balance > 0);

    if (payloadLines.length === 0) {
      return setError("Enter at least one positive opening balance.");
    }

    startTransition(async () => {
      try {
        await adminPost("erp/employee-opening-balances", {
          storeId: effectiveStoreId,
          entryDate,
          notes: notes.trim() || undefined,
          lines: payloadLines,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save opening balances.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add opening balances";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Initialize salary payable balances per employee."
      backHref="/admin/erp/employee-opening-balances"
      breadcrumb={[
        { label: "Opening balances", href: "/admin/erp/employee-opening-balances" },
        { label: "Add batch" },
      ]}
      size="xl"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AdminFormSection title="Batch details">
          <div className="grid gap-4 sm:grid-cols-2">
            <ActiveStoreFormField
              mode="create"
              stores={stores}
              activeStoreId={activeStoreId}
              storeId={storeId}
              onStoreIdChange={setStoreId}
            />
            <AdminFormField label="Date" htmlFor="entryDate">
              <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Note" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </AdminFormField>
          </div>
        </AdminFormSection>

        <AdminFormSection title="Employee balances">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Joining date</TableHead>
                  <TableHead>Opening balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Select a store to load employees.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line, index) => (
                    <TableRow key={line.employeeId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{line.employeeName}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDisplayDate(line.joiningDate)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.openingBalance}
                          onChange={(e) => updateLine(index, e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {lines.length > 0 ? (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">Total</TableCell>
                    <TableCell className="font-bold tabular-nums">{formatCurrencyAmount(total)}</TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        </AdminFormSection>

        {!isModal ? (
          <AdminFormActions
            formId={formId}
            onCancel={handleCancel}
            submitLabel="Save"
            pending={isPending}
          />
        ) : null}
      </form>
    </AdminFormShell>
  );
}
