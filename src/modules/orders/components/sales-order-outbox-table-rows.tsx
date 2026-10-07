"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { requeueOutboxOperations } from "@/lib/sync/outbox-requeue";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
} from "@/lib/sync/outbox-types";
import type { SalesOrderCancelPayload } from "@/modules/orders/types/sales-order-cancel-payload";
import type { SalesOrderCreatePayload } from "@/modules/orders/types/sales-order-create-payload";
import type { SalesOrderUpdatePayload } from "@/modules/orders/types/sales-order-update-payload";
import { formatInr, ORDERS_ACCENT } from "@/modules/orders/components/orders-ui";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { cn } from "@/lib/utils";

function operationTitle(operationType: string): string {
  switch (operationType) {
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.create:
      return "New sales order";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.update:
      return "Sales order update";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel:
      return "Sales order cancellation";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice:
      return "Convert to invoice";
    default:
      return "Sales order change";
  }
}

function syncStatusLabel(op: OutboxOperationRecord): string {
  switch (op.state) {
    case OUTBOX_OPERATION_STATES.SYNCING:
      return "Syncing";
    case OUTBOX_OPERATION_STATES.LOCAL_PENDING:
      return "Pending sync";
    case OUTBOX_OPERATION_STATES.RETRY_WAIT:
      return "Retry scheduled";
    case OUTBOX_OPERATION_STATES.UNCERTAIN:
      return "Uncertain — retry";
    case OUTBOX_OPERATION_STATES.STOCK_CONFLICT:
      return "Stock conflict";
    case OUTBOX_OPERATION_STATES.NEEDS_ATTENTION:
      return "Needs attention";
    case OUTBOX_OPERATION_STATES.DEAD_LETTER:
      return "Failed";
    case OUTBOX_OPERATION_STATES.PAUSED_AUTH:
      return "Paused (sign in)";
    case OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION:
      return "Not authorized";
    default:
      return op.state;
  }
}

function canManualRetry(op: OutboxOperationRecord): boolean {
  return (
    op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
    op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
    op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT ||
    op.state === OUTBOX_OPERATION_STATES.UNCERTAIN
  );
}

function isFailedLike(op: OutboxOperationRecord): boolean {
  return (
    op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
    op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
    op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT
  );
}

function resolveOrderId(op: OutboxOperationRecord): string | null {
  if (op.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.create) {
    return null;
  }
  const payload = op.payload as SalesOrderUpdatePayload | SalesOrderCancelPayload;
  return payload?.orderId ?? null;
}

function resolveDisplayFields(op: OutboxOperationRecord) {
  const payload = op.payload as SalesOrderCreatePayload | SalesOrderUpdatePayload;
  const itemCount = Array.isArray(payload?.items) ? payload.items.length : 0;
  const total = Number(payload?.totalAmount ?? 0);
  const reference =
    typeof payload?.referenceNumber === "string" && payload.referenceNumber.length > 0
      ? payload.referenceNumber
      : "—";
  const shipment = payload?.shipmentDate ?? "—";
  return { itemCount, total, reference, shipment };
}

export function SalesOrderOutboxTableRows({
  operations,
  detailBasePath,
}: {
  operations: OutboxOperationRecord[];
  detailBasePath: string;
}) {
  const [retryErrorById, setRetryErrorById] = useState<Record<string, string>>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (operations.length === 0) {
    return null;
  }

  return (
    <>
      {operations.map((op) => {
        const orderId = resolveOrderId(op);
        const { itemCount, total, reference, shipment } = resolveDisplayFields(op);
        const failed = isFailedLike(op);
        const status = syncStatusLabel(op);
        const shortId = op.operationId.slice(0, 8).toUpperCase();
        const retryError = retryErrorById[op.operationId];

        return (
          <TableRow
            key={op.operationId}
            className={cn(
              "relative overflow-hidden border-b border-amber-200/50 bg-amber-50/25 hover:bg-amber-50/45",
              "[&>td]:relative [&>td]:z-[1]",
              failed
                ? "before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:z-0 before:w-36 before:bg-gradient-to-l before:from-orange-400/40 before:via-orange-300/15 before:to-transparent sm:before:w-44"
                : "before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:z-0 before:w-36 before:bg-gradient-to-l before:from-amber-400/30 before:via-amber-200/15 before:to-transparent sm:before:w-44",
              ORDERS_ACCENT.selectedRow,
            )}
          >
            <TableCell className="w-10" />
            <TableCell>
              {orderId ? (
                <Link
                  href={`${detailBasePath}/${orderId}`}
                  className="font-mono text-[13px] font-medium text-foreground hover:text-primary hover:underline"
                >
                  {formatErpDocRef("SO", orderId)}
                </Link>
              ) : (
                <span className="font-mono text-[13px] font-medium text-amber-950">
                  Queued · {shortId}
                </span>
              )}
            </TableCell>
            <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
              {reference}
            </TableCell>
            <TableCell>
              <span className="text-[13px] font-medium text-amber-950">
                {operationTitle(op.operationType)}
              </span>
            </TableCell>
            <TableCell className="text-[13px] text-muted-foreground">
              {format(op.createdAt, "MMM d, yyyy")}
            </TableCell>
            <TableCell className="hidden text-[13px] text-muted-foreground xl:table-cell">
              {shipment}
            </TableCell>
            <TableCell className="hidden md:table-cell">—</TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">—</span>
            </TableCell>
            <TableCell>
              <div className="flex flex-col items-start gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    failed
                      ? "bg-orange-100 text-orange-950 ring-1 ring-orange-300/60"
                      : op.state === OUTBOX_OPERATION_STATES.SYNCING
                        ? "bg-sky-100 text-sky-950"
                        : "bg-amber-100/90 text-amber-950 ring-1 ring-amber-300/50",
                  )}
                >
                  {op.state === OUTBOX_OPERATION_STATES.SYNCING ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : failed ? (
                    <AlertCircle className="size-3" aria-hidden />
                  ) : null}
                  {status}
                </span>
                {op.lastError?.message ? (
                  <p
                    className="max-w-[min(280px,40vw)] text-[11px] leading-snug text-orange-900"
                    title={op.lastError.message}
                  >
                    {op.lastError.message}
                  </p>
                ) : null}
                {retryError ? (
                  <p className="text-[10px] text-rose-700">{retryError}</p>
                ) : null}
                {canManualRetry(op) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="border-orange-300/80 bg-white/90"
                    disabled={retryingId === op.operationId}
                    onClick={() => {
                      setRetryErrorById((prev) => {
                        const next = { ...prev };
                        delete next[op.operationId];
                        return next;
                      });
                      setRetryingId(op.operationId);
                      startTransition(async () => {
                        try {
                          await requeueOutboxOperations([op.operationId]);
                        } catch (err) {
                          setRetryErrorById((prev) => ({
                            ...prev,
                            [op.operationId]:
                              err instanceof Error ? err.message : "Retry failed",
                          }));
                        } finally {
                          setRetryingId(null);
                        }
                      });
                    }}
                  >
                    <RefreshCw data-icon="inline-start" className="size-3" />
                    {retryingId === op.operationId ? "Retrying…" : "Retry sync"}
                  </Button>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-sm tabular-nums text-muted-foreground">
              {itemCount > 0 ? itemCount : "—"}
            </TableCell>
            <TableCell className="text-right text-sm font-semibold tabular-nums text-amber-950">
              {total > 0 ? formatInr(total) : "—"}
            </TableCell>
            <TableCell />
          </TableRow>
        );
      })}
    </>
  );
}
