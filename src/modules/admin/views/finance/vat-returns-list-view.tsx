"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import type { VatReturnListRow } from "@/common/erp/finance-types";
import { adminDelete, adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Badge } from "@/components/ui/badge";
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
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { VatReturnFormView } from "@/modules/admin/views/finance/vat-return-form-view";
import { VatReturnTaxPopover } from "@/modules/admin/views/finance/vat-return-tax-popover";
import { VatPaymentFormView } from "@/modules/admin/views/finance/vat-payment-form-view";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function formatPeriod(start: string, end: string) {
  return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
}

function statusBadge(status: string) {
  if (status === "filed") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
        Filed
      </Badge>
    );
  }
  return (
    <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline">
      Unfiled
    </Badge>
  );
}

export function VatReturnsListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, formMode, modalProps, openNew } = useErpFormModal("/admin/erp/vat-returns");
  const vatReturnIdForPayment = searchParams.get("vatReturnId");
  const showReturnForm =
    isOpen && (formMode === "edit" || (formMode === "new" && !vatReturnIdForPayment));
  const showPaymentForm = isOpen && formMode === "new" && Boolean(vatReturnIdForPayment);
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<VatReturnListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "period_start",
    "desc",
  );

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    if (storeId) q.set("storeId", storeId);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: VatReturnListRow[]; total: number }>(`erp/vat-returns?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, debouncedSearch, reloadToken]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  const filedCount = rows.filter((r) => r.status === "filed").length;
  const outstanding = rows.reduce((sum, r) => sum + r.balance_due, 0);

  async function handleRefresh(id: string) {
    setActingId(id);
    try {
      const updated = await adminPatch<VatReturnListRow>(`erp/vat-returns/${id}`, {
        action: "refresh",
      });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't recalculate VAT return");
    } finally {
      setActingId(null);
    }
  }

  async function handleFile(id: string) {
    if (!confirm("File this VAT return?")) return;
    setActingId(id);
    try {
      await adminPatch(`erp/vat-returns/${id}`, { action: "file" });
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: "filed", filed_date: new Date().toISOString().slice(0, 10) }
            : r,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't file VAT return");
    } finally {
      setActingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this unfiled VAT return? This cannot be undone.")) return;
    setActingId(id);
    try {
      await adminDelete(`erp/vat-returns/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete VAT return");
    } finally {
      setActingId(null);
    }
  }

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="VAT returns"
        breadcrumb={[{ label: "VAT returns", href: "/admin/erp/vat-returns" }]}
        description="Output tax (sales) minus input tax (purchases). Payable is zero when purchases exceed sales."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add VAT return
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Returns" value={String(total)} />
        <MetricCard label="Filed (page)" value={String(filedCount)} />
        <MetricCard label="Balance due (page)" value={formatCurrencyAmount(outstanding)} />
      </div>

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search return number…"
        emptyMessage="No VAT returns found."
        isEmpty={sorted.length === 0}
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => {
          setSearch("");
        }}
        footer={<AdminListFooter total={total} label="returns" page={page} pageSize={30} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="return_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Tax return"
              sortKey="period_label"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Tax payable"
              sortKey="total_tax_payable"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Balance due"
              sortKey="balance_due"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Status"
              sortKey="status"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <TableHead className="min-w-[168px] text-right">Actions</TableHead>
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row) => {
              const canPay = row.status === "filed" && Math.abs(row.balance_due) > 0.0001;
              return (
                <AdminTableRow key={row.id}>
                  <AdminTableCell className="font-medium">
                    <AdminTableLink
                      href={`/admin/erp/vat-returns/${row.id}`}
                      title={row.return_number}
                    >
                      {formatErpDocRef("VR", row.id)}
                    </AdminTableLink>
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminTableLink href={`/admin/erp/vat-returns/${row.id}`}>
                      {row.period_label}
                    </AdminTableLink>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPeriod(row.period_start, row.period_end)}
                      {row.store_name ? ` · ${row.store_name}` : ""}
                    </p>
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <VatReturnTaxPopover row={row} />
                  </AdminTableCell>
                  <AdminTableCell
                    align="right"
                    className={cn("tabular-nums", row.balance_due !== 0 && "font-medium")}
                  >
                    {formatCurrencyAmount(row.balance_due)}
                  </AdminTableCell>
                  <AdminTableCell>{statusBadge(row.status)}</AdminTableCell>
                  <AdminTableCell align="right">
                    <div className="flex items-center justify-end gap-1">
                      {row.status === "unfiled" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === row.id}
                            onClick={() => void handleFile(row.id)}
                          >
                            File tax
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            disabled={actingId === row.id}
                            onClick={() => void handleRefresh(row.id)}
                            aria-label="Recalculate VAT return"
                            title="Recalculate"
                          >
                            {actingId === row.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={actingId === row.id}
                            onClick={() => void handleDelete(row.id)}
                            aria-label="Delete VAT return"
                            title="Delete"
                          >
                            <Trash2 />
                          </Button>
                        </>
                      ) : null}
                      {canPay ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openNew({ vatReturnId: row.id })}
                        >
                          Add payment
                        </Button>
                      ) : null}
                    </div>
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/vat-returns"
        listParams={listParams}
        pageSize={30}
      />

      {showReturnForm ? (
        <VatReturnFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}

      {showPaymentForm ? (
        <VatPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
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
