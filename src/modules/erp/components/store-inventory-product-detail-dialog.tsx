"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { StoreInventoryProductDetail } from "@/common/erp/store-inventory-types";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminListPath } from "@/modules/admin/lib/use-admin-get-query";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function DialogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 truncate text-base font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function StatGrid({
  title,
  items,
}: {
  title?: string;
  items: { label: string; value: string }[];
}) {
  return (
    <section className="space-y-2.5">
      {title ? (
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <DialogMetric key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
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
  const detailPath =
    productId && storeId
      ? adminListPath(`erp/store-inventory/${productId}`, { storeId })
      : "";

  const {
    data: detail,
    isPending: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: adminQueryKeys.erpGet(detailPath),
    queryFn: async () => {
      const res = await adminGet<{ data: StoreInventoryProductDetail }>(detailPath);
      return res.data;
    },
    enabled: open && Boolean(productId && storeId),
    staleTime: 2 * 60 * 1000,
  });

  const error = isError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load product detail"
    : null;

  const fmt = (n: number | null) =>
    n != null ? formatCurrencyAmount(n) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,52rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border/60 px-6 py-5 pr-12">
          <DialogTitle className="text-left text-lg font-semibold tracking-tight">
            {detail?.productName ?? "Store inventory"}
          </DialogTitle>
          {detail ? (
            <p className="text-left text-sm text-muted-foreground">
              {detail.storeName}
              {detail.barcode ? ` · ${detail.barcode}` : ""}
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && !detail ? (
            <AdminPanelSkeleton rows={8} />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : detail ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-border/50 bg-muted/15 px-4 py-3.5 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-muted-foreground">On hand</span>
                  <StockBadge value={detail.onHandStock} />
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-muted-foreground">
                    Central (variants)
                  </span>
                  <StockBadge value={detail.centralStock} />
                </div>
              </div>

              <StatGrid
                title="Pricing overview"
                items={[
                  { label: "Store WAC", value: fmt(detail.storeWac) },
                  { label: "Store sales", value: fmt(detail.storeSalesPrice) },
                  { label: "Catalog purchase", value: fmt(detail.catalogPurchasePrice) },
                  { label: "Catalog sales", value: fmt(detail.catalogSalesPrice) },
                ]}
              />

              <Tabs defaultValue="purchases" className="space-y-1">
                <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto p-1">
                  <TabsTrigger value="purchases" className="shrink-0 px-4">
                    Purchases
                  </TabsTrigger>
                  <TabsTrigger value="sales" className="shrink-0 px-4">
                    Sales
                  </TabsTrigger>
                  <TabsTrigger value="sales-returns" className="shrink-0 px-4">
                    Sales returns
                  </TabsTrigger>
                  <TabsTrigger value="vendor-returns" className="shrink-0 px-4">
                    Vendor returns
                  </TabsTrigger>
                  <TabsTrigger value="movements" className="shrink-0 px-4">
                    Movements
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="purchases" className="mt-4 space-y-4">
                  <StatGrid
                    title="Purchase summary"
                    items={[
                      { label: "Min (loaded)", value: fmt(detail.purchase.minUnitCost) },
                      { label: "Max (loaded)", value: fmt(detail.purchase.maxUnitCost) },
                      {
                        label: "Avg (loaded)",
                        value: fmt(detail.purchase.avgUnitCost),
                      },
                      {
                        label: "Qty purchased",
                        value: String(detail.purchase.totalQtyPurchased),
                      },
                    ]}
                  />
                  <AdminDataTable className="rounded-lg border border-border/50">
                    <AdminTableHeader>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Bill
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Vendor
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Qty
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Rate
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Landed
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Loaded unit
                      </AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.purchase.recent.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="px-4 py-6 text-muted-foreground">
                            No purchase lines for this store.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.purchase.recent.map((row) => (
                          <AdminTableRow key={row.lineId}>
                            <AdminTableCell className="px-4 py-3">
                              <Link
                                href={`/admin/erp/purchase-bills/${row.billId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.billNumber}
                              </Link>
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3 text-muted-foreground">
                              {row.billDate}
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3">
                              {row.vendorName ?? "—"}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {row.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {fmt(row.unitPrice)}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {row.landedCostAllocated != null && row.landedCostAllocated > 0
                                ? fmt(row.landedCostAllocated)
                                : "—"}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums font-medium">
                              {fmt(row.loadedUnitCost ?? row.unitPrice)}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>

                <TabsContent value="sales" className="mt-4 space-y-4">
                  <StatGrid
                    title="Sales summary"
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
                  <AdminDataTable className="rounded-lg border border-border/50">
                    <AdminTableHeader>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Invoice
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Customer
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Qty
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Unit
                      </AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.sales.recent.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="px-4 py-6 text-muted-foreground">
                            No sales lines for this store.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.sales.recent.map((row) => (
                          <AdminTableRow key={row.lineId}>
                            <AdminTableCell className="px-4 py-3">
                              <Link
                                href={`/admin/erp/invoices/${row.invoiceId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.invoiceNumber}
                              </Link>
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3 text-muted-foreground">
                              {row.invoiceDate}
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3">
                              {row.customerName ?? "—"}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {row.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {fmt(row.unitPrice)}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>

                <TabsContent value="sales-returns" className="mt-4 space-y-4">
                  <StatGrid
                    title="Sales return summary"
                    items={[
                      { label: "Min price", value: fmt(detail.salesReturns.minUnitPrice) },
                      { label: "Max price", value: fmt(detail.salesReturns.maxUnitPrice) },
                      {
                        label: "Avg (weighted)",
                        value: fmt(detail.salesReturns.avgUnitPrice),
                      },
                      {
                        label: "Qty returned",
                        value: String(detail.salesReturns.totalQtyReturned),
                      },
                    ]}
                  />
                  <AdminDataTable className="rounded-lg border border-border/50">
                    <AdminTableHeader>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Credit note
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Customer
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Qty
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Unit
                      </AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.salesReturns.recent.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="px-4 py-6 text-muted-foreground">
                            No sales return lines for this store.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.salesReturns.recent.map((row) => (
                          <AdminTableRow key={row.lineId}>
                            <AdminTableCell className="px-4 py-3">
                              <Link
                                href={`/admin/erp/credit-notes/${row.creditNoteId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.creditNoteNumber}
                              </Link>
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3 text-muted-foreground">
                              {row.creditNoteDate}
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3">
                              {row.customerName ?? "—"}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {row.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {fmt(row.unitPrice)}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>

                <TabsContent value="vendor-returns" className="mt-4 space-y-4">
                  <StatGrid
                    title="Vendor return summary"
                    items={[
                      { label: "Min price", value: fmt(detail.vendorReturns.minUnitPrice) },
                      { label: "Max price", value: fmt(detail.vendorReturns.maxUnitPrice) },
                      {
                        label: "Avg (weighted)",
                        value: fmt(detail.vendorReturns.avgUnitPrice),
                      },
                      {
                        label: "Qty returned",
                        value: String(detail.vendorReturns.totalQtyReturned),
                      },
                    ]}
                  />
                  <AdminDataTable className="rounded-lg border border-border/50">
                    <AdminTableHeader>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Vendor credit
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Vendor
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Qty
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Unit
                      </AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.vendorReturns.recent.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="px-4 py-6 text-muted-foreground">
                            No vendor return lines for this store.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.vendorReturns.recent.map((row) => (
                          <AdminTableRow key={row.lineId}>
                            <AdminTableCell className="px-4 py-3">
                              <Link
                                href={`/admin/erp/vendor-credits/${row.vendorCreditId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.creditNumber}
                              </Link>
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3 text-muted-foreground">
                              {row.creditDate}
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3">
                              {row.vendorName ?? "—"}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {row.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {fmt(row.unitPrice)}
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminDataTable>
                </TabsContent>

                <TabsContent value="movements" className="mt-4">
                  <AdminDataTable className="rounded-lg border border-border/50">
                    <AdminTableHeader>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        When
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Type
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Qty
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Price
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Reason
                      </AdminTableCell>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {detail.movements.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell className="px-4 py-6 text-muted-foreground">
                            No stock movements recorded.
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        detail.movements.map((m) => (
                          <AdminTableRow key={m.id}>
                            <AdminTableCell className="px-4 py-3 text-muted-foreground">
                              {m.createdAt.slice(0, 16).replace("T", " ")}
                            </AdminTableCell>
                            <AdminTableCell className="px-4 py-3">{m.type}</AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {m.quantity}
                            </AdminTableCell>
                            <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                              {fmt(m.transactionPrice)}
                            </AdminTableCell>
                            <AdminTableCell className="max-w-[14rem] truncate px-4 py-3">
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
