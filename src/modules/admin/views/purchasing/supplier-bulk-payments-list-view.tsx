"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type { BulkSupplierPaymentBatchRow } from "@/common/erp/purchasing-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminListFooter,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { SupplierBulkPaymentFormView } from "@/modules/admin/views/purchasing/supplier-bulk-payment-views";

const PERIOD_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "this_month", label: "This month" },
];

export function SupplierBulkPaymentsListView() {
  const searchParams = useSearchParams();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/supplier-bulk-payments");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [period, setPeriod] = useState(searchParams.get("period") ?? "all");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/supplier-payments", {
    view: "bulk",
    page,
    period: period !== "all" ? period : undefined,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: BulkSupplierPaymentBatchRow[];
    total: number;
  }>({
    path: listPath,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "payment_date",
    "desc",
  );

  const listParams: Record<string, string> = {};
  if (period !== "all") listParams.period = period;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Supplier payments bulk"
        breadcrumb={[{ label: "Payment made bulk", href: "/admin/erp/supplier-bulk-payments" }]}
        description="Batch supplier payments applied across multiple bills in one transaction."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add new
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search store, reference…"
        isEmpty={sorted.length === 0}
        emptyMessage="No bulk supplier payments found."
        isFiltering={Boolean(debouncedSearch.trim()) || period !== "all"}
        onClearFilters={() => {
          setSearch("");
          setPeriod("all");
        }}
        filters={[
          {
            id: "period",
            label: "Period",
            value: period,
            options: PERIOD_OPTIONS,
            onChange: setPeriod,
          },
        ]}
        footer={<AdminListFooter total={total} label="batches" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Ref"
              sortKey="batch_id"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Payment date"
              sortKey="payment_date"
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
              label="Amount"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Suppliers"
              sortKey="supplier_count"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="center"
            />
            <SortableTableHead
              label="Created by"
              sortKey="created_by_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.batch_id}>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("SPM", r.batch_id)}
                    shellLabel="Supplier bulk payment"
                    title={formatErpDocRef("SPM", r.batch_id)}
                    subtitle={`${r.supplier_count} suppliers`}
                    viewHref={`/admin/erp/supplier-bulk-payments/${encodeURIComponent(r.batch_id)}`}
                    viewLabel="View batch →"
                    stats={[
                      { label: "Total", value: formatCurrencyAmount(r.total_amount) },
                      { label: "Mode", value: r.payment_mode },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell>{r.payment_date}</AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.store_id} name={r.store_name} />
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(r.total_amount)}
                </AdminTableCell>
                <AdminTableCell align="center">{r.supplier_count}</AdminTableCell>
                <AdminTableCell>{r.created_by_name ?? "—"}</AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/supplier-bulk-payments/${encodeURIComponent(r.batch_id)}`}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/erp/supplier-bulk-payments"
        listParams={listParams}
      />

      {isOpen ? (
        <SupplierBulkPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
