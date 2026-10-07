import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
  type OutboxOperationState,
} from "@/lib/sync/outbox-types";

export type DependencyStatus = "ready" | "wait" | "blocked";

const BLOCKING_DEPENDENCY_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.NEEDS_ATTENTION,
  OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION,
  OUTBOX_OPERATION_STATES.PAUSED_AUTH,
  OUTBOX_OPERATION_STATES.DEAD_LETTER,
  OUTBOX_OPERATION_STATES.STOCK_CONFLICT,
]);

const WAITING_DEPENDENCY_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  OUTBOX_OPERATION_STATES.SYNCING,
  OUTBOX_OPERATION_STATES.RETRY_WAIT,
  OUTBOX_OPERATION_STATES.UNCERTAIN,
]);

export function getDependencyStatus(
  operation: OutboxOperationRecord,
  byId: Map<string, OutboxOperationRecord>,
): DependencyStatus {
  if (!operation.dependsOn.length) {
    return "ready";
  }

  for (const depId of operation.dependsOn) {
    const dep = byId.get(depId);
    if (!dep) {
      return "wait";
    }
    if (BLOCKING_DEPENDENCY_STATES.has(dep.state)) {
      return "blocked";
    }
    if (dep.state !== OUTBOX_OPERATION_STATES.SERVER_COMMITTED) {
      if (WAITING_DEPENDENCY_STATES.has(dep.state)) {
        return "wait";
      }
      return "blocked";
    }
  }

  return "ready";
}
