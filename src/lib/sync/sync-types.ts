import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";

export const SYNC_LOCK_NAME = "buyhub-outbox-sync";

export const SYNC_DEFAULT_CONCURRENCY = 3;

export const SYNC_RETRY_BASE_MS = 1_000;
export const SYNC_RETRY_MAX_MS = 60_000;
export const SYNC_MAX_ATTEMPTS = 8;
export const STALE_SYNCING_MS = 120_000;
export const SYNC_LEASE_TTL_MS = 60_000;
export const SYNC_HTTP_DEFAULT_TIMEOUT_MS = 30_000;

export const FAILURE_CLASSES = {
  NETWORK: "NETWORK",
  TIMEOUT: "TIMEOUT",
  AUTHENTICATION: "AUTHENTICATION",
  AUTHORIZATION: "AUTHORIZATION",
  VALIDATION: "VALIDATION",
  CONFLICT: "CONFLICT",
  STOCK_CONFLICT: "STOCK_CONFLICT",
  SERVER: "SERVER",
  UNKNOWN: "UNKNOWN",
  MISSING_HANDLER: "MISSING_HANDLER",
  DEPENDENCY_BLOCKED: "DEPENDENCY_BLOCKED",
  USER_MISMATCH: "USER_MISMATCH",
} as const;

export type FailureClass =
  (typeof FAILURE_CLASSES)[keyof typeof FAILURE_CLASSES];

export type SyncEventMap = {
  "operation-queued": { operation: OutboxOperationRecord };
  "sync-started": { at: number };
  "operation-started": { operation: OutboxOperationRecord };
  "operation-committed": { operation: OutboxOperationRecord };
  "retry-scheduled": {
    operation: OutboxOperationRecord;
    nextAttemptAt: number;
  };
  "operation-uncertain": { operation: OutboxOperationRecord };
  "operation-blocked": { operation: OutboxOperationRecord; reason: string };
  "operation-failed": { operation: OutboxOperationRecord };
  "sync-cycle-completed": {
    processed: number;
    at: number;
  };
};

export type SyncEventName = keyof SyncEventMap;

export type SyncListener<E extends SyncEventName> = (
  payload: SyncEventMap[E],
) => void;

export type SyncCycleResult = {
  processed: number;
  skippedLock: boolean;
};
