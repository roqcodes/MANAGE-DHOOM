/**
 * Generic durable outbox types (Phase 2). No ERP/POS business semantics.
 */

export const OUTBOX_DB_NAME = "buyhub-outbox";

/** Bump only with non-destructive `onupgradeneeded` migrations. */
export const OUTBOX_DB_VERSION = 1;

export const OUTBOX_STORE_OPERATIONS = "operations";
export const OUTBOX_STORE_META = "meta";

export const OUTBOX_OPERATION_STATES = {
  LOCAL_PENDING: "LOCAL_PENDING",
  SYNCING: "SYNCING",
  SERVER_COMMITTED: "SERVER_COMMITTED",
  RETRY_WAIT: "RETRY_WAIT",
  UNCERTAIN: "UNCERTAIN",
  PAUSED_AUTH: "PAUSED_AUTH",
  BLOCKED_AUTHORIZATION: "BLOCKED_AUTHORIZATION",
  STOCK_CONFLICT: "STOCK_CONFLICT",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
  DEAD_LETTER: "DEAD_LETTER",
} as const;

export type OutboxOperationState =
  (typeof OUTBOX_OPERATION_STATES)[keyof typeof OUTBOX_OPERATION_STATES];

export type OutboxStructuredError = {
  message: string;
  code?: string;
  at: number;
};

/** Frozen context + immutable payload after enqueue. */
export type OutboxOperationRecord = {
  operationId: string;
  operationType: string;
  schemaVersion: number;
  payload: unknown;
  payloadHash: string;
  userId: string;
  storeId: string;
  terminalId: string;
  createdAt: number;
  sequence: number;
  resourceScope?: string;
  dependsOn: string[];
  state: OutboxOperationState;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: OutboxStructuredError;
  failureClass?: string;
  serverResult?: unknown;
  uncertainSince?: number;
  /** Set when entering SYNCING; used for crash recovery. */
  syncingStartedAt?: number;
};

export type OutboxEnqueueInput = {
  operationId?: string;
  operationType: string;
  schemaVersion: number;
  payload: unknown;
  userId: string;
  storeId: string;
  terminalId: string;
  resourceScope?: string;
  dependsOn?: string[];
};

export type OutboxListOptions = {
  state?: OutboxOperationState;
  limit?: number;
};

export type OutboxStateUpdate = {
  state: OutboxOperationState;
  serverResult?: unknown;
  uncertainSince?: number;
  lastError?: OutboxStructuredError;
  failureClass?: string;
  syncingStartedAt?: number;
};

export type OutboxRetryMetadataUpdate = {
  attempts: number;
  nextAttemptAt?: number;
  lastError?: OutboxStructuredError;
  failureClass?: string;
  state?: OutboxOperationState;
};

export type OutboxMetaKey =
  | "schemaVersion"
  | "nextSequence"
  | "syncLease"
  | "syncStats";

export type OutboxMetaRecord = {
  key: OutboxMetaKey | string;
  value: unknown;
};
