"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { ErpEmployeeListRow } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { EmployeeFormView } from "@/modules/admin/views/hr/employee-form-view";

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

export function EmployeesListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/employees");
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<ErpEmployeeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "full_name",
    "asc",
    (row, key) => {
      if (key === "employee_id") return row.employee_code ?? row.employee_number;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    if (storeId) q.set("storeId", storeId);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ErpEmployeeListRow[]; total: number }>(`erp/employees?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, debouncedSearch, reloadToken]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  async function handleDelete(id: string) {
    if (!confirm("Delete this employee?")) return;
    setDeletingId(id);
    try {
      await adminDelete(`erp/employees/${id}`);
      setReloadToken((t) => t + 1);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Employees"
        breadcrumb={[{ label: "Employees", href: "/admin/erp/employees" }]}
        description="Manage employee records, salary structure, and employment status by store."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add employee
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, mobile, or ID…"
        isEmpty={sorted.length === 0}
        emptyMessage="No employees found."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{total} employees</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Full name"
              sortKey="full_name"
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
              label="ID#"
              sortKey="employee_id"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="ID expiry"
              sortKey="id_expiry_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Mobile"
              sortKey="mobile"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Joining date"
              sortKey="joining_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Active"
              sortKey="is_active"
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
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell>
                  <AdminTableLink href={`/admin/erp/employees/${row.id}`}>
                    {row.full_name}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px] truncate text-sm">
                  {row.store_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell>{row.employee_code ?? row.employee_number}</AdminTableCell>
                <AdminTableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                  {formatDisplayDate(row.id_expiry_date)}
                </AdminTableCell>
                <AdminTableCell>{row.mobile}</AdminTableCell>
                <AdminTableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                  {formatDisplayDate(row.joining_date)}
                </AdminTableCell>
                <AdminTableCell>
                  {row.is_active ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      No
                    </Badge>
                  )}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.net_salary)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/employees/${row.id}`}
                    editHref={`/admin/erp/employees?form=edit&id=${row.id}`}
                    menuItems={[
                      {
                        label: "Delete",
                        destructive: true,
                        separatorBefore: true,
                        disabled: deletingId === row.id,
                        onClick: () => void handleDelete(row.id),
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/employees"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />

      {isOpen ? (
        <EmployeeFormView
          variant="modal"
          mode={mode}
          employeeId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}
