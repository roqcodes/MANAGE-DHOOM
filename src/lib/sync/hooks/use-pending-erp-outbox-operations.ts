"use client";

import { useCallback, useEffect, useState } from "react";

import { OUTBOX_CHANGED_EVENT } from "@/lib/sync/outbox-browser-events";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
  type OutboxOperationState,
} from "@/lib/sync/outbox-types";

const ACTIVE_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  OUTBOX_OPERATION_STATES.SYNCING,
  OUTBOX_OPERATION_STATES.RETRY_WAIT,
  OUTBOX_OPERATION_STATES.UNCERTAIN,
]);

const ATTENTION_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.NEEDS_ATTENTION,
  OUTBOX_OPERATION_STATES.DEAD_LETTER,
  OUTBOX_OPERATION_STATES.STOCK_CONFLICT,
  OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION,
  OUTBOX_OPERATION_STATES.PAUSED_AUTH,
]);

export type PendingErpOutboxSummary = {
  active: OutboxOperationRecord[];
  needsAttention: OutboxOperationRecord[];
};

export function usePendingErpOutboxOperations(
  operationTypes: ReadonlySet<string>,
): PendingErpOutboxSummary {
  const [summary, setSummary] = useState<PendingErpOutboxSummary>({
    active: [],
    needsAttention: [],
  });

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return;
    }
    const store = createOutboxStore();
    try {
      const all = await store.list();
      const relevant = all.filter((op) => operationTypes.has(op.operationType));
      setSummary({
        active: relevant.filter((op) => ACTIVE_STATES.has(op.state)),
        needsAttention: relevant.filter((op) => ATTENTION_STATES.has(op.state)),
      });
    } finally {
      await store.close();
    }
  }, [operationTypes]);

  useEffect(() => {
    void refresh();
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
  }, [refresh]);

  return summary;
}
