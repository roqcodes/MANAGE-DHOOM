"use client";

import { useState } from "react";

import type { ItemTransactionRow } from "@/common/erp/inventory-types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  ErpStoreTableGlance,
  AdminTableRow,
  SortableTableHead,
  useDebouncedValue,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";

const TRANSACTION_TYPES = [
  "all",
  "receipt",
  "sale",
  "adjustment",
  "transfer",
  "transfer_out",
  "transfer_in",
  "purchase",
  "return",
  "damaged",
  "vendor_credit",
];

export function ItemTransactionsListView() {
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const [type, setType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const listPath = adminListPath("erp/item-transactions", {
    storeId,
    type: type !== "all" ? type : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending } = useAdminGetQuery<{ data: ItemTransactionRow[]; total: number }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "created_at",
    "desc",
  );

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Item transactions"
        breadcrumb={[{ label: "Item transactions", href: "/admin/erp/item-transactions" }]}
        description="Read-only ledger of stock movements across stores."
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search item, barcode, invoice…"
        isEmpty={sorted.length === 0}
        emptyMessage="No item transactions found."
        isFiltering={type !== "all" || Boolean(dateFrom) || Boolean(dateTo) || Boolean(debouncedSearch.trim())}
        onClearFilters={() => {
          setSearch("");
          setType("all");
          setDateFrom("");
          setDateTo("");
        }}
        dateRange={{
          from: dateFrom,
          to: dateTo,
          onFromChange: setDateFrom,
          onToChange: setDateTo,
        }}
        filters={[
          {
            id: "type",
            label: "Type",
            value: type,
            options: TRANSACTION_TYPES.map((t) => ({
              value: t,
              label: t === "all" ? "All types" : t,
            })),
            onChange: setType,
          },
        ]}
        footer={<span>{total} transactions</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Date"
              sortKey="created_at"
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
              label="Type"
              sortKey="type"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Item"
              sortKey="product_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Invoice/Ref"
              sortKey="invoice_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Qty"
              sortKey="quantity"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Price"
              sortKey="transaction_price"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Balance"
              sortKey="balance_after"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.store_id} name={r.store_name} />
                </AdminTableCell>
                <AdminTableCell>{r.type}</AdminTableCell>
                <AdminTableCell>
                  {r.product_name}
                  {r.variant_name ? ` — ${r.variant_name}` : ""}
                </AdminTableCell>
                <AdminTableCell>{r.invoice_number ?? r.reference_type ?? "—"}</AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {r.quantity}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {r.transaction_price != null ? formatCurrencyAmount(r.transaction_price) : "—"}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {r.balance_after != null ? r.balance_after : "—"}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>
    </AdminPageLayout>
  );
}
