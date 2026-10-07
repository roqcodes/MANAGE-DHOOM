"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { OUTBOX_CHANGED_EVENT } from "@/lib/sync/outbox-browser-events";
import {
  estimateOutboxQueueCompletionMs,
  isOutboxOpBlocked,
  isOutboxOpVisibleInActivity,
} from "@/lib/sync/outbox-queue-estimate";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
} from "@/lib/sync/outbox-types";

export type OutboxQueueActivity = {
  operations: OutboxOperationRecord[];
  queuedCount: number;
  syncingCount: number;
  blockedCount: number;
  estimatedCompletionMs: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

function sortOperations(ops: OutboxOperationRecord[]): OutboxOperationRecord[] {
  return [...ops].sort((a, b) => a.sequence - b.sequence || a.createdAt - b.createdAt);
}

export function useOutboxQueueActivity(): OutboxQueueActivity {
  const [operations, setOperations] = useState<OutboxOperationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      setOperations([]);
      setLoading(false);
      return;
    }
    const store = createOutboxStore();
    try {
      const all = await store.list();
      setOperations(sortOperations(all.filter(isOutboxOpVisibleInActivity)));
    } finally {
      await store.close();
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (operations.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [operations.length]);

  const summary = useMemo(() => {
    const syncingCount = operations.filter(
      (op) => op.state === OUTBOX_OPERATION_STATES.SYNCING,
    ).length;
    const blockedCount = operations.filter(isOutboxOpBlocked).length;
    const queuedCount = operations.filter(
      (op) =>
        op.state === OUTBOX_OPERATION_STATES.LOCAL_PENDING ||
        op.state === OUTBOX_OPERATION_STATES.RETRY_WAIT ||
        op.state === OUTBOX_OPERATION_STATES.UNCERTAIN,
    ).length;

    const estimatedCompletionMs = estimateOutboxQueueCompletionMs(operations, now);

    return { syncingCount, blockedCount, queuedCount, estimatedCompletionMs };
  }, [operations, now]);

  return {
    operations,
    ...summary,
    loading,
    refresh,
  };
}
