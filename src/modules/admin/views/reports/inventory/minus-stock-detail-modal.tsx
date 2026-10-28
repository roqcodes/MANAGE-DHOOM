"use client";

import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, PackageMinus } from "lucide-react";

import type { MinusStockDetailPayload } from "@/common/erp/inventory-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatListDateLabel, formatTimeLocal } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Modal } from "@/modules/admin/components/modal";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableDateTime,
  AdminTableHeader,
  AdminTableRow,
} from "@/modules/admin/ui";
import { formatReportProductCode } from "../business-overview/report-format";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { minusStockDetailQueryOptions } from "./minus-stock-detail-query";

export type MinusStockTableRow = {
  product_id?: string;
  store_id?: string;
  product_code?: string;
  product_barcode?: string;
  product_name?: string;
  category_name?: string;
  brand_name?: string;
  store_name?: string;
  stock?: number;
};

type Props = {
  row: MinusStockTableRow | null;
  storeId: string;
  onClose: () => void;
};

const headerCell =
  "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function previewDetailFromRow(row: MinusStockTableRow, storeId: string): MinusStockDetailPayload {
  const stock = Number(row.stock ?? 0);
  return {
    product_id: String(row.product_id ?? ""),
    store_id: storeId,
    product_code: formatReportProductCode(row.product_code, row),
    product_barcode: row.product_barcode?.trim() || null,
    product_name: String(row.product_name ?? ""),
    category_name: row.category_name ?? null,
    brand_name: row.brand_name ?? null,
    store_name: String(row.store_name ?? ""),
    current_stock: stock,
    opening_stock_before_negative: 0,
    first_negative_at: null,
    latest_invoice_id: null,
    invoices: [],
  };
}

function formatQty(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatMovementWhen(iso: string) {
  const date = formatListDateLabel(iso);
  const time = formatTimeLocal(iso);
  return time ? `${date} · ${time}` : date;
}

export function MinusStockDetailModal({ row, storeId, onClose }: Props) {
  const productId = row?.product_id ? String(row.product_id) : "";
  const open = Boolean(row && productId);

  const { data, isPending, isFetching, isError, error } = useQuery({
    ...minusStockDetailQueryOptions(storeId, productId),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const title = row?.product_name ? String(row.product_name) : "Minus stock detail";
  const codeLabel = formatReportProductCode(row?.product_code, row);
  const subtitleParts = [codeLabel, row?.store_name].filter(Boolean).join(" · ");
  const preview = row ? previewDetailFromRow(row, storeId) : null;
  const detail =
    data?.product_id === productId ? data : preview;
  const invoicesLoading = Boolean(
    open && (isPending || isFetching) && data?.product_id !== productId,
  );

  return (
    <Modal
      title={title}
      subtitle={subtitleParts || undefined}
      onClose={onClose}
      size="landscape"
      bareBody
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ErrorsFeedbackBridge error={isError ? error : null} />

        {isError && !detail ? (
          <div className="flex flex-1 items-center justify-center px-5 py-8">
            <p className="text-sm text-muted-foreground">Could not load shortage detail.</p>
          </div>
        ) : detail ? (
          <MinusStockDetailBody
            detail={detail}
            onClose={onClose}
            invoicesLoading={invoicesLoading}
          />
        ) : null}
      </div>
    </Modal>
  );
}

function MinusStockDetailBody({
  detail,
  onClose,
  invoicesLoading = false,
}: {
  detail: MinusStockDetailPayload;
  onClose: () => void;
  invoicesLoading?: boolean;
}) {
  const invoices = detail.invoices ?? [];
  const latestId = detail.latest_invoice_id;
  const shortageQty = Math.abs(Math.min(0, detail.current_stock));
  const summaryPending = invoicesLoading && !detail.first_negative_at && invoices.length === 0;

  return (
    <>
      <div className="shrink-0 border-b border-border/60 bg-muted/10 px-5 py-4 min-[1100px]:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
              <PackageMinus className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">Shortage summary</p>
              {summaryPending ? (
                <Skeleton className="h-4 w-full max-w-lg" />
              ) : detail.first_negative_at ? (
                <p className="text-sm text-muted-foreground">
                  Stock went negative on{" "}
                  <span className="font-medium text-foreground">
                    {formatMovementWhen(detail.first_negative_at)}
                  </span>
                  . Sale invoices below are movements from that point forward.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No movement history on file; balance may reflect opening stock or legacy
                  imports.
                </p>
              )}
              {detail.product_barcode ? (
                <p className="text-xs text-muted-foreground">
                  Barcode{" "}
                  <span className="font-mono text-foreground">{detail.product_barcode}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-normal">
              {detail.store_name}
            </Badge>
            {detail.category_name ? (
              <Badge variant="secondary" className="font-normal">
                {detail.category_name}
              </Badge>
            ) : null}
            {detail.brand_name ? (
              <Badge variant="secondary" className="font-normal">
                {detail.brand_name}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label="Opening (before negative sales)"
            value={summaryPending ? "…" : formatQty(detail.opening_stock_before_negative)}
            loading={summaryPending}
          />
          <MetricCard
            label="Current on-hand"
            value={formatQty(detail.current_stock)}
            tone={detail.current_stock < 0 ? "danger" : "default"}
          />
          <MetricCard label="Shortage qty" value={formatQty(shortageQty)} tone="danger" />
          <MetricCard
            label="Sale invoices"
            value={summaryPending ? "…" : String(invoices.length)}
            tone={invoices.length === 0 && !summaryPending ? "muted" : "default"}
            loading={summaryPending}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-5 py-3 min-[1100px]:px-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Invoices that reduced stock
          </h3>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admin/erp/item-transactions?storeId=${encodeURIComponent(detail.store_id)}`} />}>
            Item transactions
            <ArrowUpRight data-icon="inline-end" className="size-3.5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 min-[1100px]:px-6">
          {invoicesLoading ? (
            <InvoiceTableSkeleton />
          ) : invoices.length === 0 ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-6 text-center">
              <p className="max-w-md text-sm text-muted-foreground">
                No invoice-linked sales found for this SKU. Adjustments, transfers, or POS paths
                may appear under item transactions instead.
              </p>
            </div>
          ) : (
            <AdminDataTable className="rounded-xl border border-border/50">
              <AdminTableHeader>
                <AdminTableCell className={headerCell}>Invoice</AdminTableCell>
                <AdminTableCell className={cn(headerCell, "min-w-[8rem]")}>Salesman</AdminTableCell>
                <AdminTableCell className={cn(headerCell, "min-w-[10rem]")}>Date</AdminTableCell>
                <AdminTableCell align="right" className={headerCell}>
                  Qty sold
                </AdminTableCell>
                <AdminTableCell align="right" className={headerCell}>
                  Line amount
                </AdminTableCell>
                <AdminTableCell align="right" className={headerCell}>
                  Balance after
                </AdminTableCell>
              </AdminTableHeader>
              <AdminTableBody>
                {invoices.map((inv) => {
                  const isLatest = Boolean(latestId && inv.invoice_id === latestId);
                  return (
                    <AdminTableRow key={`${inv.invoice_id}-${inv.movement_at}`}>
                      <AdminTableCell className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/erp/invoices/${inv.invoice_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {inv.invoice_number}
                          </Link>
                          {isLatest ? (
                            <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                              Latest
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal capitalize">
                            {inv.invoice_status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-3 text-sm text-foreground">
                        {inv.salesman_name?.trim() ? inv.salesman_name : "Unassigned"}
                      </AdminTableCell>
                      <AdminTableCell className="px-4 py-3">
                        <AdminTableDateTime at={inv.movement_at} />
                      </AdminTableCell>
                      <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                        {formatQty(Math.abs(inv.quantity))}
                      </AdminTableCell>
                      <AdminTableCell align="right" className="px-4 py-3 tabular-nums">
                        {formatCurrencyAmount(inv.line_amount)}
                      </AdminTableCell>
                      <AdminTableCell
                        align="right"
                        className={cn(
                          "px-4 py-3 tabular-nums font-semibold",
                          inv.balance_after < 0 && "text-destructive",
                        )}
                      >
                        {formatQty(inv.balance_after)}
                      </AdminTableCell>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-5 py-3 min-[1100px]:px-6">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "muted";
  loading?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background px-3.5 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p
          className={cn(
            "mt-1.5 truncate text-xl font-semibold tabular-nums tracking-tight",
            tone === "danger" && "text-destructive",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function InvoiceTableSkeleton() {
  return (
    <div className="space-y-2 rounded-xl border border-border/50 p-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
