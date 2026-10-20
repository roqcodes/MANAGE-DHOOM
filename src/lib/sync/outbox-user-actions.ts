import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { isOutboxOpBlocked } from "@/lib/sync/outbox-queue-estimate";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { OUTBOX_OPERATION_STATES, type OutboxOperationRecord } from "@/lib/sync/outbox-types";

/** User can retry after fixing data, migrations, stock, etc. */
export function isOutboxOpUserRetryable(op: OutboxOperationRecord): boolean {
  return (
    op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
    op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
    op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT ||
    op.state === OUTBOX_OPERATION_STATES.UNCERTAIN ||
    op.state === OUTBOX_OPERATION_STATES.RETRY_WAIT
  );
}

/** User can remove a failed local change (will not sync to server). */
export function isOutboxOpUserDiscardable(op: OutboxOperationRecord): boolean {
  return isOutboxOpBlocked(op);
}

function collectDiscardClosure(
  rootIds: string[],
  all: OutboxOperationRecord[],
): Set<string> {
  const byId = new Map(all.map((op) => [op.operationId, op]));
  const toDiscard = new Set<string>();

  function visit(id: string) {
    if (toDiscard.has(id)) return;
    const op = byId.get(id);
    if (!op) return;
    if (!isOutboxOpUserDiscardable(op)) {
      throw new Error(
        "Only failed sync items can be discarded. Wait for in-progress sync to finish.",
      );
    }
    for (const other of all) {
      if (other.dependsOn.includes(id)) {
        visit(other.operationId);
      }
    }
    toDiscard.add(id);
  }

  for (const id of rootIds) {
    visit(id);
  }
  return toDiscard;
}

/**
 * Removes failed outbox operations locally. Also drops queued ops that depend on them.
 * Does not change server data.
 */
export async function discardOutboxOperations(operationIds: string[]): Promise<void> {
  if (operationIds.length === 0) return;

  const store = createOutboxStore();
  try {
    const all = await store.listPurgingCommitted();
    const toDiscard = collectDiscardClosure(operationIds, all);
    for (const id of toDiscard) {
      await store.delete(id);
    }
  } finally {
    await store.close();
  }
  dispatchOutboxChanged();
}
