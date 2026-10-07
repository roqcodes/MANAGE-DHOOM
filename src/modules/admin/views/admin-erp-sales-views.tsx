"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";

import type {
  ErpCreditNoteListRow,
  ErpEstimateListRow,
  ErpPaymentListRow,
} from "@/common/erp/sales-types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
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
import { SortableTableHead, useErpFormModal, useSortableData, ErpCustomerTableGlance, ErpDocumentTableGlance, ErpStoreTableGlance } from "@/modules/admin/ui";
import { EstimateFormView } from "@/modules/admin/views/sales/estimate-form-view";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

export function AdminErpEstimatesView() {
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

  if (isPending && !data) return <SalesLoadingState />;

  return (
    <SalesPageLayout>
      <SalesPageHeader
        title="Estimates"
        description="Quotes and proposals for customers."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Create estimate
          </Button>
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
                <TableCell className="text-muted-foreground">{row.estimate_date}</TableCell>
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
                        <DropdownMenuItem nativeButton={false} render={<Link href={`/admin/erp/estimates/${row.id}/print`} target="_blank" />}>
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

export function AdminErpPaymentsView() {
  const { data, isPending } = useAdminGetQuery<{ data: ErpPaymentListRow[] }>({
    path: adminListPath("erp/payments", { page: 0 }),
  });
  const [search, setSearch] = useState("");
  const rows = data?.data ?? [];

  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.payment_number.toLowerCase().includes(search.toLowerCase()) ||
          formatErpDocRef("PR", r.id).toLowerCase().includes(search.toLowerCase()) ||
          (r.customer_name?.toLowerCase().includes(search.toLowerCase()) ?? false),
      )
    : rows;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "payment_date",
    "desc",
  );

  if (isPending && !data) return <SalesLoadingState />;

  return (
    <SalesPageLayout>
      <SalesPageHeader
        title="Payment received"
        description="Customer payments and allocations."
        actions={
          <Button size="sm" disabled>
            <Plus data-icon="inline-start" />
            Record payment
          </Button>
        }
      />

      <SalesListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search payment or customer…"
        isEmpty={filtered.length === 0}
        emptyMessage="No payments found."
        isFiltering={Boolean(search.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{sorted.length} payments</span>}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Number"
                sortKey="payment_number"
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
                label="Mode"
                sortKey="payment_mode"
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
                label="Date"
                sortKey="payment_date"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Bulk"
                sortKey="is_bulk"
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
                    triggerLabel={formatErpDocRef("PR", row.id)}
                    shellLabel="Payment"
                    title={row.payment_number?.trim() || formatErpDocRef("PR", row.id)}
                    subtitle={row.customer_name ?? undefined}
                    viewHref={`/admin/erp/payments/${row.id}`}
                    viewLabel="View payment →"
                    stats={[{ label: "Amount", value: formatCurrencyAmount(row.total_amount) }]}
                  />
                </TableCell>
                <TableCell>
                  <ErpCustomerTableGlance userId={row.user_id} name={row.customer_name} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </TableCell>
                <TableCell className="capitalize">{row.payment_mode}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.payment_date}</TableCell>
                <TableCell>{row.is_bulk ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button size="icon-sm" variant="ghost" aria-label="Payment actions" />}
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem disabled>View payment</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SalesListCard>
    </SalesPageLayout>
  );
}

/** @deprecated Use CreditNotesListView */
export function AdminErpCreditNotesView() {
  const { data, isPending } = useAdminGetQuery<{ data: ErpCreditNoteListRow[] }>({
    path: adminListPath("erp/credit-notes", { page: 0 }),
  });
  const rows = data?.data ?? [];

  if (isPending && !data) return <SalesLoadingState />;

  return (
    <SalesPageLayout>
      <SalesPageHeader title="Credit notes" />
      <p className="text-sm text-muted-foreground">
        Use <Link href="/admin/erp/credit-notes" className="text-primary hover:underline">/admin/erp/credit-notes</Link> for the full list.
      </p>
      <p className="text-sm">{rows.length} credit notes loaded.</p>
    </SalesPageLayout>
  );
}
