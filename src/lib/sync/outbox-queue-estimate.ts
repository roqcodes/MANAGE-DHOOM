import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
} from "@/lib/sync/outbox-types";
import { SYNC_DEFAULT_CONCURRENCY } from "@/lib/sync/sync-types";

/** Typical server round-trip per op (dev can be higher; estimate is indicative). */
const AVG_OP_SYNC_MS = 2_500;

const AUTO_PROGRESS_STATES: ReadonlySet<OutboxOperationRecord["state"]> = new Set([
  OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  OUTBOX_OPERATION_STATES.SYNCING,
  OUTBOX_OPERATION_STATES.RETRY_WAIT,
  OUTBOX_OPERATION_STATES.UNCERTAIN,
]);

export function isOutboxOpVisibleInActivity(op: OutboxOperationRecord): boolean {
  return op.state !== OUTBOX_OPERATION_STATES.SERVER_COMMITTED;
}

export function isOutboxOpBlocked(op: OutboxOperationRecord): boolean {
  return (
    op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
    op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
    op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT ||
    op.state === OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION ||
    op.state === OUTBOX_OPERATION_STATES.PAUSED_AUTH
  );
}

export function estimateOutboxQueueCompletionMs(
  operations: OutboxOperationRecord[],
  now = Date.now(),
): number {
  const active = operations.filter((op) => AUTO_PROGRESS_STATES.has(op.state));
  if (active.length === 0) return 0;

  let horizon = 0;

  for (const op of active) {
    if (op.state === OUTBOX_OPERATION_STATES.SYNCING) {
      const started = op.syncingStartedAt ?? now;
      horizon = Math.max(horizon, Math.max(0, AVG_OP_SYNC_MS - (now - started)));
    }
  }

  const pending = active.filter(
    (op) => op.state === OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  );
  if (pending.length > 0) {
    const batches = Math.ceil(pending.length / SYNC_DEFAULT_CONCURRENCY);
    horizon += batches * AVG_OP_SYNC_MS;
  }

  for (const op of active) {
    if (op.state === OUTBOX_OPERATION_STATES.RETRY_WAIT && op.nextAttemptAt) {
      horizon = Math.max(
        horizon,
        Math.max(0, op.nextAttemptAt - now) + AVG_OP_SYNC_MS,
      );
    }
    if (op.state === OUTBOX_OPERATION_STATES.UNCERTAIN) {
      horizon = Math.max(horizon, AVG_OP_SYNC_MS);
    }
  }

  return horizon;
}

export function formatEstimatedDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m`;
}
