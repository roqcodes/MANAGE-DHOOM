"use client";

import { useState, useTransition } from "react";
import { CloudOff, Loader2, AlertCircle } from "lucide-react";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { usePendingSalesOrderCreates } from "@/lib/sync/hooks/use-pending-sales-order-creates";
import { requeueOutboxOperations } from "@/lib/sync/outbox-requeue";
import { discardOutboxOperations } from "@/lib/sync/outbox-user-actions";
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, startAction] = useTransition();

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
            {actionError ? (
              <p className="text-xs text-rose-800">{actionError}</p>
            ) : null}
            <p className="text-xs text-amber-800/80">
              Retry after fixing the issue, or discard to clear this from your device (server data
              is unchanged).
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-300 bg-white/80"
            disabled={isActing}
            onClick={() => {
              setActionError(null);
              startAction(async () => {
                try {
                  await requeueOutboxOperations(
                    needsAttention.map((op) => op.operationId),
                  );
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Could not queue retry",
                  );
                }
              });
            }}
          >
            {isActing ? "Working…" : "Retry sync"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-300 bg-white/80 text-destructive hover:text-destructive"
            disabled={isActing}
            onClick={() => {
              setActionError(null);
              startAction(async () => {
                try {
                  await discardOutboxOperations(
                    needsAttention.map((op) => op.operationId),
                  );
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Could not discard",
                  );
                }
              });
            }}
          >
            Discard
          </Button>
        </div>
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
