"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type { VendorErpListRow } from "@/common/erp/purchasing-types";
import { VENDOR_TYPE_OPTIONS } from "@/common/erp/purchasing-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import { Pagination } from "@/modules/admin/components/pagination";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminListFooter,
  AdminPrimaryAction,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpVendorTableGlance,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { VendorErpFormView } from "@/modules/admin/views/vendors/vendor-erp-form-view";

const VENDOR_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All vendor types" },
  ...VENDOR_TYPE_OPTIONS.map((t) => ({ value: t, label: t })),
];

export function VendorsErpListView() {
  const searchParams = useSearchParams();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/vendors");
  const { runAction, isPending: deletePending } = useAdminAction();
  const { confirm } = useAdminAlert();
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<VendorErpListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [vendorType, setVendorType] = useState(searchParams.get("vendorType") ?? "all");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "name", "asc");

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("view", "erp");
    q.set("page", String(page));
    if (vendorType !== "all") q.set("vendorType", vendorType);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: VendorErpListRow[]; total: number }>(`vendors?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, vendorType, reloadToken]);

  const listParams: Record<string, string> = {};
  if (vendorType !== "all") listParams.vendorType = vendorType;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();
  const initialLoading = loading && rows.length === 0;

  async function handleDelete(row: VendorErpListRow) {
    const label = row.name?.trim() || "this vendor";
    const ok = await confirm({
      title: "Delete vendor?",
      message: `Delete "${label}"? Only vendors with no bills, payments, or other operational records can be removed. Catalog SKUs on this vendor are also removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    runAction(
      async () => {
        await adminDelete(`vendors/${row.id}`);
        setReloadToken((t) => t + 1);
      },
      { errorTitle: "Couldn't delete vendor" },
    );
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Vendors"
        breadcrumb={[{ label: "Vendors", href: "/admin/vendors" }]}
        description="Suppliers used for purchase bills and expenses."
        actions={
          <AdminPrimaryAction onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add vendor
          </AdminPrimaryAction>
        }
      />

      <AdminListCard isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, TRN, email…"
        isEmpty={!initialLoading && (sorted.length === 0)}
        emptyMessage="No vendors found."
        isFiltering={Boolean(debouncedSearch.trim()) || vendorType !== "all"}
        onClearFilters={() => {
          setSearch("");
          setVendorType("all");
        }}
        filters={[
          {
            id: "vendorType",
            label: "Vendor type",
            value: vendorType,
            options: VENDOR_TYPE_FILTER_OPTIONS,
            onChange: setVendorType,
          },
        ]}
        footer={<AdminListFooter total={total} label="vendors" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="ID"
              sortKey="id"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Name"
              sortKey="name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Address"
              sortKey="address"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="TRN"
              sortKey="trn"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Phone"
              sortKey="phone"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Email"
              sortKey="email"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Type"
              sortKey="vendor_type"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell className="font-mono text-xs text-muted-foreground">
                  {r.id.slice(0, 8)}
                </AdminTableCell>
                <AdminTableCell>
                  <ErpVendorTableGlance vendorId={r.id} name={r.name} />
                </AdminTableCell>
                <AdminTableCell className="hidden max-w-[200px] truncate md:table-cell">
                  {r.address ?? "—"}
                </AdminTableCell>
                <AdminTableCell>{r.trn ?? "—"}</AdminTableCell>
                <AdminTableCell className="hidden lg:table-cell">{r.phone ?? "—"}</AdminTableCell>
                <AdminTableCell className="hidden lg:table-cell">{r.email ?? "—"}</AdminTableCell>
                <AdminTableCell>{r.vendor_type ?? "—"}</AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/vendors/${r.id}/erp`}
                    editHref={`/admin/vendors?form=edit&id=${r.id}`}
                    menuItems={[
                      {
                        label: "Delete",
                        destructive: true,
                        separatorBefore: true,
                        disabled: deletePending,
                        onClick: () => handleDelete(r),
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/vendors"
        listParams={listParams}
      />

      {isOpen ? (
        <VendorErpFormView
          variant="modal"
          mode={mode}
          vendorId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}
