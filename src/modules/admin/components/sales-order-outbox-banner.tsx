"use client";

import { useState, useTransition } from "react";
import { CloudOff, Loader2, AlertCircle } from "lucide-react";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { usePendingSalesOrderCreates } from "@/lib/sync/hooks/use-pending-sales-order-creates";
import { requeueOutboxOperations } from "@/lib/sync/outbox-requeue";
import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";
import { Button } from "@/components/ui/button";

function operationLabel(operationType: string): string {
  switch (operationType) {
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.create:
      return "Create sales order";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.update:
      return "Update sales order";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel:
      return "Cancel sales order";
    default:
      return operationType;
  }
}

function attentionSummary(ops: OutboxOperationRecord[]): string {
  const first = ops[0];
  if (!first) {
    return "Sync failed.";
  }
  const label = operationLabel(first.operationType);
  const detail = first.lastError?.message;
  if (ops.length === 1 && detail) {
    return `${label}: ${detail}`;
  }
  if (ops.length === 1) {
    return `${label} could not sync.`;
  }
  return `${ops.length} sales order changes could not sync.`;
}

export function SalesOrderOutboxBanner() {
  const { pending, syncing, needsAttention } = usePendingSalesOrderCreates();
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isRetrying, startRetry] = useTransition();

  if (needsAttention.length > 0) {
    return (
      <div
        className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-start sm:justify-between"
        role="status"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Sales order sync needs attention</p>
            <p className="text-amber-900/90">{attentionSummary(needsAttention)}</p>
            {needsAttention.some((op) =>
              op.lastError?.message?.includes("ERP_CLIENT_UNSUPPORTED_OPERATION_TYPE"),
            ) ? (
              <p className="text-xs text-amber-800/80">
                Apply Supabase migrations for ERP sales orders (through Phase 5+), then retry.
              </p>
            ) : null}
            {retryError ? (
              <p className="text-xs text-rose-800">{retryError}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-amber-300 bg-white/80"
          disabled={isRetrying}
          onClick={() => {
            setRetryError(null);
            startRetry(async () => {
              try {
                await requeueOutboxOperations(
                  needsAttention.map((op) => op.operationId),
                );
              } catch (err) {
                setRetryError(
                  err instanceof Error ? err.message : "Could not queue retry",
                );
              }
            });
          }}
        >
          {isRetrying ? "Retrying…" : "Retry sync"}
        </Button>
      </div>
    );
  }

  const syncingCount = syncing.length;
  const pendingCount = pending.length;
  if (syncingCount === 0 && pendingCount === 0) {
    return null;
  }

  if (syncingCount > 0) {
    return (
      <div
        className="mb-4 flex items-center gap-2 rounded-xl border border-sky-200/70 bg-sky-50/40 px-4 py-3 text-sm text-sky-950"
        role="status"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span>
          Syncing {syncingCount} sales order{syncingCount === 1 ? "" : "s"}…
        </span>
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-xl border border-muted bg-muted/30 px-4 py-3 text-sm"
      role="status"
    >
      <CloudOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        {pendingCount} sales order change{pendingCount === 1 ? "" : "s"} saved locally — pending
        sync
      </span>
    </div>
  );
}
