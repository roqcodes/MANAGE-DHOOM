"use client";

import { useCallback, useEffect, useState } from "react";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { OUTBOX_CHANGED_EVENT } from "@/lib/sync/outbox-browser-events";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
  type OutboxOperationState,
} from "@/lib/sync/outbox-types";

const SALES_ORDER_SYNC_TYPES = new Set<string>([
  ERP_CLIENT_OPERATION_TYPES.salesOrder.create,
  ERP_CLIENT_OPERATION_TYPES.salesOrder.update,
  ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel,
  ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice,
]);

const ACTIVE_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  OUTBOX_OPERATION_STATES.SYNCING,
  OUTBOX_OPERATION_STATES.RETRY_WAIT,
  OUTBOX_OPERATION_STATES.UNCERTAIN,
]);

function isSalesOrderOutboxOp(op: OutboxOperationRecord): boolean {
  return SALES_ORDER_SYNC_TYPES.has(op.operationType);
}

function isActiveSalesOrderOp(op: OutboxOperationRecord): boolean {
  return isSalesOrderOutboxOp(op) && ACTIVE_STATES.has(op.state);
}

function needsAttentionSalesOrderOp(op: OutboxOperationRecord): boolean {
  return (
    isSalesOrderOutboxOp(op) &&
    (op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
      op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
      op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT ||
      op.state === OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION ||
      op.state === OUTBOX_OPERATION_STATES.PAUSED_AUTH)
  );
}

export type SalesOrderOutboxSummary = {
  pending: OutboxOperationRecord[];
  syncing: OutboxOperationRecord[];
  needsAttention: OutboxOperationRecord[];
};

export function usePendingSalesOrderCreates(): SalesOrderOutboxSummary {
  const [summary, setSummary] = useState<SalesOrderOutboxSummary>({
    pending: [],
    syncing: [],
    needsAttention: [],
  });

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return;
    }
    const store = createOutboxStore();
    try {
      const all = await store.list();
      setSummary({
        pending: all.filter(
          (op) => isActiveSalesOrderOp(op) && op.state !== OUTBOX_OPERATION_STATES.SYNCING,
        ),
        syncing: all.filter(
          (op) =>
            isSalesOrderOutboxOp(op) && op.state === OUTBOX_OPERATION_STATES.SYNCING,
        ),
        needsAttention: all.filter(needsAttentionSalesOrderOp),
      });
    } finally {
      await store.close();
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
  }, [refresh]);

  return summary;
}
