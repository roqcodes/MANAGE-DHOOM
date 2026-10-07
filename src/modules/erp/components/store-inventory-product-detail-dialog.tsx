"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { StoreInventoryProductDetail } from "@/common/erp/store-inventory-types";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminTableGlanceStat } from "@/modules/admin/ui/admin-table-glance";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
} from "@/modules/admin/ui";

function StockBadge({ value }: { value: number }) {
  const variant =
    value < 0 ? "destructive" : value <= 0 ? "destructive" : value < 10 ? "outline" : "secondary";
  return (
    <Badge variant={variant} className="tabular-nums">
      {value}
      {value < 0 ? " (short)" : null}
    </Badge>
  );
}

function StatGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <AdminTableGlanceStat key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}

export function StoreInventoryProductDetailDialog({
  productId,
  storeId,
  open,
  onOpenChange,
}: {
  productId: string | null;
  storeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<StoreInventoryProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !productId || !storeId) {
      return;
    }
    setLoading(true);
    setError(null);
    setDetail(null);
    const q = new URLSearchParams({ storeId });
    adminGet<{ data: StoreInventoryProductDetail }>(
      `erp/store-inventory/${productId}?${q.toString()}`,
    )
      .then((res) => setDetail(res.data))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load product detail"),
      )
      .finally(() => setLoading(false));
  }, [open, productId, storeId]);

  const fmt = (n: number | null) =>
    n != null ? formatCurrencyAmount(n) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,48rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-left text-base">
            {detail?.productName ?? "Store inventory"}
          </DialogTitle>
          {detail ? (
            <p className="text-left text-xs text-muted-foreground">
              {detail.storeName}
              {detail.barcode ? ` · ${detail.barcode}` : ""}
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <AdminPanelSkeleton rows={8} />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">On hand</span>
                <StockBadge value={detail.onHandStock} />
                <span className="text-xs text-muted-foreground">Central (variants)</span>
                <StockBadge value={detail.centralStock} />
              </div>

              <StatGrid
                items={[
                  { label: "Store WAC", value: fmt(detail.storeWac) },
                  { label: "Store sales", value: fmt(detail.storeSalesPrice) },
                  { label: "Catalog purchase", value: fmt(detail.catalogPurchasePrice) },
                  { label: "Catalog sales", value: fmt(detail.catalogSalesPrice) },
                ]}
              />

              <Tabs defaultValue="purchases">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="purchases">Purchases</TabsTrigger>
                  <TabsTrigger value="sales">Sales</TabsTrigger>
                  <TabsTrigger value="movements">Movements</TabsTrigger>
                </TabsList>

                <TabsContent value="purchases" className="mt-3 space-y-3">
                  <StatGrid
                    items={[
                      { label: "Min cost", value: fmt(detail.purchase.minUnitCost) },
                      { label: "Max cost", value: fmt(detail.purchase.maxUnitCost) },
                      {
                        label: "Avg (weighted)",
                        value: fmt(detail.purchase.avgUnitCost),
                      },
                      {
                        label: "Qty purchased",
                        value: String(detail.purchase.totalQtyPurchased),
                      },
                    ]}
                  />
                  <AdminDataTable>
                    <AdminTableHeader>
                      <AdminTableCell className="font-medium">Bill</AdminTableCell>
                      <AdminTableCell>Date</AdminTableCell>
                      <AdminTableCell>Vendor</AdminTableCell>
                      <AdminTableCell align="right">Qty</AdminTableCell>
                      <AdminTableCell align="right">Unit cost</AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.purchase.recent.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="text-muted-foreground">
                            No purchase lines for this store.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.purchase.recent.map((row) => (
                          <AdminTableRow key={`${row.billId}-${row.billDate}`}>
                            <AdminTableCell>
                              <Link
                                href={`/admin/erp/purchase-bills/${row.billId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.billNumber}
                              </Link>
                            </AdminTableCell>
                            <AdminTableCell>{row.billDate}</AdminTableCell>
                            <AdminTableCell>{row.vendorName ?? "—"}</AdminTableCell>
                            <AdminTableCell align="right" className="tabular-nums">
                              {row.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="tabular-nums">
                              {fmt(row.loadedUnitCost ?? row.unitPrice)}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>

                <TabsContent value="sales" className="mt-3 space-y-3">
                  <StatGrid
                    items={[
                      { label: "Min price", value: fmt(detail.sales.minUnitPrice) },
                      { label: "Max price", value: fmt(detail.sales.maxUnitPrice) },
                      {
                        label: "Avg (weighted)",
                        value: fmt(detail.sales.avgUnitPrice),
                      },
                      {
                        label: "Qty sold",
                        value: String(detail.sales.totalQtySold),
                      },
                    ]}
                  />
                  <AdminDataTable>
                    <AdminTableHeader>
                      <AdminTableCell className="font-medium">Invoice</AdminTableCell>
                      <AdminTableCell>Date</AdminTableCell>
                      <AdminTableCell>Customer</AdminTableCell>
                      <AdminTableCell align="right">Qty</AdminTableCell>
                      <AdminTableCell align="right">Unit</AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.sales.recent.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="text-muted-foreground">
                            No sales lines for this store.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.sales.recent.map((row) => (
                          <AdminTableRow key={`${row.invoiceId}-${row.invoiceDate}`}>
                            <AdminTableCell>
                              <Link
                                href={`/admin/erp/invoices/${row.invoiceId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.invoiceNumber}
                              </Link>
                            </AdminTableCell>
                            <AdminTableCell>{row.invoiceDate}</AdminTableCell>
                            <AdminTableCell>{row.customerName ?? "—"}</AdminTableCell>
                            <AdminTableCell align="right" className="tabular-nums">
                              {row.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="tabular-nums">
                              {fmt(row.unitPrice)}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>

                <TabsContent value="movements" className="mt-3">
                  <AdminDataTable>
                    <AdminTableHeader>
                      <AdminTableCell>When</AdminTableCell>
                      <AdminTableCell>Type</AdminTableCell>
                      <AdminTableCell align="right">Qty</AdminTableCell>
                      <AdminTableCell align="right">Price</AdminTableCell>
                      <AdminTableCell>Reason</AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.movements.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="text-muted-foreground">
                            No stock movements recorded.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.movements.map((m) => (
                          <AdminTableRow key={m.id}>
                            <AdminTableCell className="text-xs">
                              {m.createdAt.slice(0, 16).replace("T", " ")}
                            </AdminTableCell>
                            <AdminTableCell className="text-xs">{m.type}</AdminTableCell>
                            <AdminTableCell align="right" className="tabular-nums">
                              {m.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="tabular-nums">
                              {fmt(m.transactionPrice)}
                            </AdminTableCell>
                            <AdminTableCell className="max-w-[8rem] truncate text-xs">
                              {m.reason ?? m.referenceType ?? "—"}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
