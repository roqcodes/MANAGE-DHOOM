"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type {
  OpeningStockWorksheetPayload,
  OpeningStockWorksheetPendingRow,
  OpeningStockWorksheetRecordedRow,
} from "@/common/erp/inventory-types";
import { adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  useDebouncedValue,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { coalesceNumber } from "@/lib/numeric-input";
import { OpeningStockVouchersPanel } from "@/modules/admin/views/inventory/opening-stock-vouchers-panel";

type PendingDraft = Record<string, { quantity: number; unitCost: number }>;
type RecordedDraft = Record<string, { quantity: number; unitCost: number }>;

type WorksheetTab = "pending" | "recorded" | "vouchers";

function initPendingDraft(rows: OpeningStockWorksheetPendingRow[]): PendingDraft {
  const d: PendingDraft = {};
  for (const r of rows) {
    d[r.product_id] = {
      quantity: 0,
      unitCost: Number(r.default_unit_cost) > 0 ? Number(r.default_unit_cost) : 0,
    };
  }
  return d;
}

function initRecordedDraft(rows: OpeningStockWorksheetRecordedRow[]): RecordedDraft {
  const d: RecordedDraft = {};
  for (const r of rows) {
    d[r.line_id] = { quantity: Number(r.quantity), unitCost: Number(r.unit_cost) };
  }
  return d;
}

function parseTab(value: string | null): WorksheetTab {
  if (value === "recorded" || value === "vouchers") return value;
  return "pending";
}

export function OpeningStockWorksheetView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const tab = parseTab(searchParams.get("tab"));
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [pendingDraft, setPendingDraft] = useState<PendingDraft>({});
  const [recordedDraft, setRecordedDraft] = useState<RecordedDraft>({});
  const [error, setError] = useState<string | string[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const listPath = adminListPath("erp/opening-stock/worksheet", {
    storeId,
    search: debouncedSearch.trim() || undefined,
  });

  const { data, isPending, refetch } = useAdminGetQuery<OpeningStockWorksheetPayload>({
    path: listPath,
    enabled: !erpContextLoading && Boolean(storeId),
  });

  const syncDrafts = useCallback((payload: OpeningStockWorksheetPayload) => {
    setPendingDraft(initPendingDraft(payload.pending ?? []));
    setRecordedDraft(initRecordedDraft(payload.recorded ?? []));
  }, []);

  useEffect(() => {
    if (data) syncDrafts(data);
  }, [data, syncDrafts]);

  const pendingRows = data?.pending ?? [];
  const recordedRows = data?.recorded ?? [];
  const initialLoading = isPending && !data;

  function setTab(next: WorksheetTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "pending") params.delete("tab");
    else params.set("tab", next);
    router.replace(`/admin/erp/opening-stock?${params.toString()}`);
  }

  function savePendingRow(row: OpeningStockWorksheetPendingRow) {
    if (!storeId) return;
    const d = pendingDraft[row.product_id];
    if (!d || d.quantity <= 0 || d.unitCost <= 0) {
      setError("Enter quantity and unit cost before saving.");
      return;
    }
    setError(null);
    setSavingKey(row.product_id);
    startTransition(async () => {
      try {
        await adminPost("erp/opening-stock/worksheet", {
          storeId,
          productId: row.product_id,
          quantity: d.quantity,
          unitCost: d.unitCost,
        });
        await refetch();
        setTab("recorded");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSavingKey(null);
      }
    });
  }

  function saveRecordedRow(row: OpeningStockWorksheetRecordedRow) {
    if (!storeId || row.locked) return;
    const d = recordedDraft[row.line_id];
    if (!d || d.quantity <= 0 || d.unitCost <= 0) {
      setError("Enter quantity and unit cost before saving.");
      return;
    }
    if (d.quantity === Number(row.quantity) && d.unitCost === Number(row.unit_cost)) {
      setError("No changes to save.");
      return;
    }
    setError(null);
    setSavingKey(row.line_id);
    startTransition(async () => {
      try {
        await adminPost("erp/opening-stock/worksheet", {
          storeId,
          productId: row.product_id,
          quantity: d.quantity,
          unitCost: d.unitCost,
          openingId: row.opening_id,
          lineId: row.line_id,
        });
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSavingKey(null);
      }
    });
  }

  function rowDirty(
    row: OpeningStockWorksheetRecordedRow,
    d: { quantity: number; unitCost: number },
  ) {
    return d.quantity !== Number(row.quantity) || d.unitCost !== Number(row.unit_cost);
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Opening stock"
        breadcrumb={[{ label: "Opening stock", href: "/admin/erp/opening-stock" }]}
        description="One row per item. Save sets store qty and WAC. Voucher date is the day you save. Locked after other inventory activity."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as WorksheetTab)}>
        <TabsList variant="line">
          <TabsTrigger value="pending">
            To enter
            {pendingRows.length > 0 ? (
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {pendingRows.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="recorded">
            Recorded
            {recordedRows.length > 0 ? (
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {recordedRows.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <AdminListCard
            isLoading={initialLoading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search product name or barcode…"
            isEmpty={!initialLoading && pendingRows.length === 0}
            emptyMessage="No items left to enter."
            isFiltering={Boolean(debouncedSearch.trim())}
            onClearFilters={() => setSearch("")}
          >
            <AdminDataTable>
              <AdminTableHeader>
                <TableHead>Product</TableHead>
                <TableHead className="w-28 text-right">Qty</TableHead>
                <TableHead className="w-32 text-right">Unit cost</TableHead>
                <TableHead className="w-32 text-right">Value</TableHead>
                <TableHead className="w-24 text-right" />
              </AdminTableHeader>
              {initialLoading ? (
                <AdminDataTableRowsSkeleton rows={12} columns={5} />
              ) : (
                <AdminTableBody>
                  {pendingRows.map((r) => {
                    const d = pendingDraft[r.product_id] ?? { quantity: 0, unitCost: 0 };
                    const value = coalesceNumber(d.quantity) * coalesceNumber(d.unitCost);
                    const canSave = d.quantity > 0 && d.unitCost > 0;
                    const isSaving = savingKey === r.product_id;
                    return (
                      <AdminTableRow key={r.product_id}>
                        <AdminTableCell>
                          <div className="font-medium">{r.product_name}</div>
                          {r.barcode ? (
                            <div className="text-xs text-muted-foreground">{r.barcode}</div>
                          ) : null}
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          <NumericInput
                            min={0}
                            step="any"
                            value={d.quantity}
                            onValueChange={(quantity) =>
                              setPendingDraft({
                                ...pendingDraft,
                                [r.product_id]: { ...d, quantity },
                              })
                            }
                            className="ml-auto w-24 text-right"
                          />
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          <NumericInput
                            min={0}
                            step="0.01"
                            value={d.unitCost}
                            onValueChange={(unitCost) =>
                              setPendingDraft({
                                ...pendingDraft,
                                [r.product_id]: { ...d, unitCost },
                              })
                            }
                            className="ml-auto w-28 text-right"
                          />
                        </AdminTableCell>
                        <AdminTableCell className="text-right tabular-nums text-muted-foreground">
                          {value > 0 ? formatCurrencyAmount(value) : "—"}
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canSave || isSaving}
                            onClick={() => savePendingRow(r)}
                          >
                            {isSaving ? "…" : "Save"}
                          </Button>
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              )}
            </AdminDataTable>
          </AdminListCard>
        </TabsContent>

        <TabsContent value="recorded" className="mt-4">
          <AdminListCard
            isLoading={initialLoading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search product or voucher…"
            isEmpty={!initialLoading && recordedRows.length === 0}
            emptyMessage="Nothing recorded yet."
            isFiltering={Boolean(debouncedSearch.trim())}
            onClearFilters={() => setSearch("")}
          >
            <AdminDataTable>
              <AdminTableHeader>
                <TableHead>Product</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead className="w-28 text-right">Qty</TableHead>
                <TableHead className="w-32 text-right">Unit cost</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24 text-right" />
              </AdminTableHeader>
              {initialLoading ? (
                <AdminDataTableRowsSkeleton rows={8} columns={6} />
              ) : (
                <AdminTableBody>
                  {recordedRows.map((r) => {
                    const d = recordedDraft[r.line_id] ?? {
                      quantity: Number(r.quantity),
                      unitCost: Number(r.unit_cost),
                    };
                    const locked = r.locked;
                    const isSaving = savingKey === r.line_id;
                    const dirty = !locked && rowDirty(r, d);
                    return (
                      <AdminTableRow key={r.line_id}>
                        <AdminTableCell>
                          <div className="font-medium">{r.product_name}</div>
                          {r.barcode ? (
                            <div className="text-xs text-muted-foreground">{r.barcode}</div>
                          ) : null}
                        </AdminTableCell>
                        <AdminTableCell className="text-sm text-muted-foreground">
                          <Link
                            href={`/admin/erp/opening-stock/${r.opening_id}`}
                            className="text-primary hover:underline"
                          >
                            {r.opening_number}
                          </Link>
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          {locked ? (
                            <span className="tabular-nums">{r.quantity}</span>
                          ) : (
                            <NumericInput
                              min={0}
                              step="any"
                              value={d.quantity}
                              onValueChange={(quantity) =>
                                setRecordedDraft({
                                  ...recordedDraft,
                                  [r.line_id]: { ...d, quantity },
                                })
                              }
                              className="ml-auto w-24 text-right"
                            />
                          )}
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          {locked ? (
                            <span className="tabular-nums">{formatCurrencyAmount(r.unit_cost)}</span>
                          ) : (
                            <NumericInput
                              min={0}
                              step="0.01"
                              value={d.unitCost}
                              onValueChange={(unitCost) =>
                                setRecordedDraft({
                                  ...recordedDraft,
                                  [r.line_id]: { ...d, unitCost },
                                })
                              }
                              className="ml-auto w-28 text-right"
                            />
                          )}
                        </AdminTableCell>
                        <AdminTableCell>
                          {locked ? (
                            <Badge variant="outline">Locked</Badge>
                          ) : (
                            <Badge variant="secondary">Editable</Badge>
                          )}
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          {!locked ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={!dirty || isSaving}
                              onClick={() => saveRecordedRow(r)}
                            >
                              {isSaving ? "…" : "Save"}
                            </Button>
                          ) : null}
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              )}
            </AdminDataTable>
          </AdminListCard>
        </TabsContent>

        <TabsContent value="vouchers" className="mt-4">
          <OpeningStockVouchersPanel />
        </TabsContent>
      </Tabs>

      <ErrorsFeedbackBridge errors={error} />
    </AdminPageLayout>
  );
}