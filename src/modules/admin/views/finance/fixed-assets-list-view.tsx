"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Building2,
  Plus,
} from "lucide-react";

import type { FixedAssetListRow } from "@/common/erp/finance-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { Pagination } from "@/modules/admin/components/pagination";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { fixedAssetsListQueryKey } from "@/modules/admin/lib/admin-query-keys";
import { deleteFixedAssetAction } from "@/modules/erp/actions/fixed-assets.actions";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableFooter, TableCell, TableHead, TableRow } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminListFooter,
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
import { FixedAssetFormView } from "@/modules/admin/views/finance/fixed-asset-form-view";

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function formatWarranty(expiry: string | null) {
  if (!expiry) return "Not applicable";
  return formatDisplayDate(expiry);
}

export function FixedAssetsListView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showError } = useAdminAlert();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/fixed-assets");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: fixedAssetsListQueryKey(page, storeId, debouncedSearch, activeStoreId),
    queryFn: () => {
      const q = new URLSearchParams({ page: String(page) });
      if (storeId) q.set("storeId", storeId);
      if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());
      return adminGet<{ data: FixedAssetListRow[]; total: number }>(
        `erp/fixed-assets?${q.toString()}`,
      );
    },
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "purchase_date",
    "desc",
  );

  const totalAmount = useMemo(
    () => sorted.reduce((sum, row) => sum + row.purchase_amount, 0),
    [sorted],
  );

  async function handleDelete(row: FixedAssetListRow) {
    if (!confirm(`Delete asset "${row.name}" (${row.asset_number})?`)) return;
    setDeletingId(row.id);
    try {
      await deleteFixedAssetAction(row.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "fixed-assets"] });
    } catch (err) {
      showError(err, "Couldn't delete fixed asset");
    } finally {
      setDeletingId(null);
    }
  }

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <AdminPageLayout>
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">Failed to load fixed assets.</p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </AdminPageLayout>
    );
  }

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Fixed assets"
        breadcrumb={[{ label: "Fixed assets", href: "/admin/erp/fixed-assets" }]}
        description="Track store equipment, furniture, and capital purchases by location."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="size-4" />
            Add fixed asset
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search asset name, number, brand…"
        isEmpty={sorted.length === 0}
        emptyMessage="No fixed assets found."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => {
          setSearch("");
        }}
        footer={<AdminListFooter total={total} label="assets" page={page} pageSize={PAGE_SIZE} />}
      >
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Building2 className="size-10 text-muted-foreground/40" aria-hidden />
            <p className="text-sm text-muted-foreground">No fixed assets found.</p>
            <Button variant="outline" size="sm" onClick={() => openNew()}>
              <Plus className="size-4" />
              Add your first asset
            </Button>
          </div>
        ) : (
          <AdminDataTable>
            <AdminTableHeader>
              <SortableTableHead
                label="Asset ID"
                sortKey="asset_number"
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
                className="min-w-[180px]"
              />
              <SortableTableHead
                label="Store"
                sortKey="store_name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Brand"
                sortKey="brand"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Purchase date"
                sortKey="purchase_date"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Warranty"
                sortKey="warranty_expiry"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Purchase amount"
                sortKey="purchase_amount"
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
                  <AdminTableCell className="font-mono text-[12px] text-muted-foreground">
                    <span title={row.asset_number}>{formatErpDocRef("FA", row.id)}</span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminTableLink href={`/admin/erp/fixed-assets/${row.id}`}>
                      {row.name}
                    </AdminTableLink>
                  </AdminTableCell>
                  <AdminTableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                    {row.store_name ?? "—"}
                  </AdminTableCell>
                  <AdminTableCell className="text-sm text-muted-foreground">
                    {row.brand ?? "—"}
                  </AdminTableCell>
                  <AdminTableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatDisplayDate(row.purchase_date)}
                  </AdminTableCell>
                  <AdminTableCell className="text-sm text-muted-foreground">
                    {row.warranty_expiry ? (
                      <Badge variant="outline" className="font-normal">
                        {formatWarranty(row.warranty_expiry)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </AdminTableCell>
                  <AdminTableCell align="right" className="text-sm font-semibold tabular-nums">
                    {formatCurrencyAmount(row.purchase_amount)}
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <ErpListRowActions
                      viewHref={`/admin/erp/fixed-assets/${row.id}`}
                      editHref={`/admin/erp/fixed-assets?form=edit&id=${row.id}`}
                      menuItems={[
                        {
                          label: "Delete",
                          destructive: true,
                          separatorBefore: true,
                          disabled: deletingId === row.id,
                          onClick: () => void handleDelete(row),
                        },
                      ]}
                    />
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6} className="text-right font-medium">
                  Total (this page)
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrencyAmount(totalAmount)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </AdminDataTable>
        )}
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/erp/fixed-assets"
        listParams={listParams}
      />

      {isOpen ? (
        <FixedAssetFormView
          variant="modal"
          mode={mode}
          assetId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["admin", "fixed-assets"] })}
        />
      ) : null}
    </AdminPageLayout>
  );
}
