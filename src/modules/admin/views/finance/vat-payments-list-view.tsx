"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";

import type { VatPaymentListRow } from "@/common/erp/finance-types";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  AdminTableLink,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

export function VatPaymentsListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const [rows, setRows] = useState<VatPaymentListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "payment_date",
    "desc",
  );

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    if (storeId) q.set("storeId", storeId);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: VatPaymentListRow[]; total: number }>(`erp/vat-payments?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, debouncedSearch]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  const totalPaid = sorted.reduce((sum, r) => sum + r.amount, 0);

  async function handleDelete(id: string) {
    if (!confirm("Delete this VAT payment?")) return;
    setDeletingId(id);
    try {
      await adminDelete(`erp/vat-payments/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete VAT payment");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="VAT payments"
        breadcrumb={[{ label: "VAT payments", href: "/admin/erp/vat-payments" }]}
        description="Payments recorded against filed VAT returns."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Payments" value={String(total)} />
        <MetricCard label="Amount (page)" value={formatCurrencyAmount(totalPaid)} />
      </div>

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search payment number, reference…"
        emptyMessage="No VAT payments found."
        isEmpty={sorted.length === 0}
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => {
          setSearch("");
        }}
        footer={<AdminListFooter total={total} label="payments" page={page} pageSize={30} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="payment_number"
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
              label="Reference"
              sortKey="reference"
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
              label="Paid from account"
              sortKey="paid_from_account_name"
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
              label="Amount"
              sortKey="amount"
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
                <AdminTableCell className="font-medium">
                  <span title={row.payment_number}>{formatErpDocRef("VP", row.id)}</span>
                </AdminTableCell>
                <AdminTableCell>{formatDisplayDate(row.payment_date)}</AdminTableCell>
                <AdminTableCell className="text-muted-foreground">{row.reference || "—"}</AdminTableCell>
                <AdminTableCell>
                  {row.store_id && row.store_name ? (
                    <AdminTableLink href={`/admin/erp/stores/${row.store_id}/edit`}>
                      {row.store_name}
                    </AdminTableLink>
                  ) : (
                    (row.store_name ?? "—")
                  )}
                </AdminTableCell>
                <AdminTableCell>{row.paid_from_account_name ?? "—"}</AdminTableCell>
                <AdminTableCell className="max-w-[180px] truncate text-muted-foreground">
                  {row.notes || "—"}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-medium tabular-nums">
                  {formatCurrencyAmount(row.amount)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    menuItems={[
                      {
                        label: "Delete",
                        destructive: true,
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
        basePath="/admin/erp/vat-payments"
        listParams={listParams}
        pageSize={30}
      />
    </AdminPageLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="overflow-hidden border border-border py-0 ring-0">
      <CardContent className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
