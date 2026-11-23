"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";

import type { ErpEstimateListRow } from "@/common/erp/sales-types";
import { buildCatalogExportSource, catalogFilterSubtitle } from "@/lib/export/catalog-export";
import { getEstimatesExportTabular } from "@/lib/export/erp-sales-list-export";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { directPrintErpEstimate } from "@/lib/direct-document-print";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SalesListCard,
  SalesLoadingState,
  SalesPageHeader,
  SalesPageLayout,
} from "@/modules/erp/components/sales-module-ui";
import {
  AdminListPageActions,
  AdminPrimaryAction,
  SortableTableHead,
  AdminTableDateTime,
  useErpFormModal,
  useSortableData,
  ErpCustomerTableGlance,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
} from "@/modules/admin/ui";
import { EstimateFormView } from "@/modules/admin/views/sales/estimate-form-view";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

export function AdminErpEstimatesView() {
  const { showError } = useAppFeedback();
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/estimates");
  const [search, setSearch] = useState("");
  const listPath = adminListPath("erp/estimates", {
    page: 0,
    storeId: activeStoreId,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{ data: ErpEstimateListRow[] }>({
    path: listPath,
    enabled: !erpContextLoading && Boolean(activeStoreId),
  });
  const rows = data?.data ?? [];

  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.estimate_number.toLowerCase().includes(search.toLowerCase()) ||
          formatErpDocRef("EST", r.id).toLowerCase().includes(search.toLowerCase()) ||
          (r.customer_name?.toLowerCase().includes(search.toLowerCase()) ?? false),
      )
    : rows;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "estimate_date",
    "desc",
  );

  const exportSource = useMemo(
    () =>
      buildCatalogExportSource({
        baseFilename: "estimates-export",
        title: "Estimates",
        getSubtitle: () =>
          catalogFilterSubtitle({
            search,
          }),
        getTabular: () => {
          const tabular = getEstimatesExportTabular(sorted);
          return tabular.rows.length > 0 ? tabular : null;
        },
      }),
    [sorted, search],
  );

  if (isPending && !data) return <SalesLoadingState />;

  return (
    <SalesPageLayout>
      <SalesPageHeader
        title="Estimates"
        description="Quotes and proposals for customers."
        actions={
          <AdminListPageActions exportSource={exportSource} exportDisabled={sorted.length === 0}>
            <AdminPrimaryAction onClick={() => openNew()}>
              <Plus data-icon="inline-start" />
              Create estimate
            </AdminPrimaryAction>
          </AdminListPageActions>
        }
      />

      <SalesListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search estimate or customer…"
        isEmpty={filtered.length === 0}
        emptyMessage="No estimates found."
        isFiltering={Boolean(search.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{sorted.length} estimates</span>}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Number"
                sortKey="estimate_number"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Customer"
                sortKey="customer_name"
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
                className="hidden md:table-cell"
              />
              <SortableTableHead
                label="Status"
                sortKey="status"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Total"
                sortKey="total_amount"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align="right"
              />
              <SortableTableHead
                label="Date"
                sortKey="estimate_date"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("EST", row.id)}
                    shellLabel="Estimate"
                    title={row.estimate_number?.trim() || formatErpDocRef("EST", row.id)}
                    subtitle={row.customer_name ?? undefined}
                    viewHref={`/admin/erp/estimates/${row.id}`}
                    viewLabel="View estimate →"
                    stats={[{ label: "Total", value: formatCurrencyAmount(row.total_amount) }]}
                  />
                </TableCell>
                <TableCell>
                  <ErpCustomerTableGlance userId={row.user_id} name={row.customer_name} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <AdminTableDateTime documentDate={row.estimate_date} activity={row} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button size="icon-sm" variant="ghost" aria-label="Estimate actions" />}
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem nativeButton={false} render={<Link href={`/admin/erp/estimates/${row.id}`} />}>
                          View estimate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={<Link href={`/admin/erp/estimates?form=edit&id=${row.id}`} />}
                        >
                          Edit estimate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void directPrintErpEstimate(row.id).catch((err) => {
                              showError(err, "Couldn't print");
                            });
                          }}
                        >
                          Print
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SalesListCard>

      {isOpen ? (
        <EstimateFormView
          variant="modal"
          mode={mode}
          estimateId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </SalesPageLayout>
  );
}
