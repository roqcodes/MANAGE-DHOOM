import {
  createExecutionContext,
  defaultClassifyHandlerError,
  OperationHandlerRegistry,
  type HandlerResult,
  type OperationHandler,
} from "@/lib/sync/operation-handler";
import type { OutboxStore } from "@/lib/sync/outbox-store";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
  type OutboxOperationState,
} from "@/lib/sync/outbox-types";
import { getDependencyStatus } from "@/lib/sync/sync-dependencies";
import {
  isUncertainFailureClass,
  shouldRetryFailureClass,
  stateForFailureClass,
} from "@/lib/sync/sync-error-classify";
import { withSyncLock } from "@/lib/sync/sync-lock";
import { attachNetworkSyncListeners, isBrowserOnlineHint } from "@/lib/sync/sync-network";
import {
  computeNextRetryAt,
  hasRetriesRemaining,
} from "@/lib/sync/sync-retry";
import type { ExecuteHttpOptions } from "@/lib/sync/sync-http";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import {
  FAILURE_CLASSES,
  SYNC_DEFAULT_CONCURRENCY,
  STALE_SYNCING_MS,
  type FailureClass,
  type SyncCycleResult,
  type SyncEventMap,
  type SyncEventName,
  type SyncListener,
} from "@/lib/sync/sync-types";

const ELIGIBLE_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  OUTBOX_OPERATION_STATES.RETRY_WAIT,
]);

export type SyncEngineOptions = {
  store: OutboxStore;
  handlers?: OperationHandlerRegistry;
  concurrency?: number;
  dbName?: string;
  getCurrentUserId?: () => string | null | Promise<string | null>;
  httpOptions?: ExecuteHttpOptions;
};

export class SyncEngine {
  private readonly store: OutboxStore;
  private readonly handlers: OperationHandlerRegistry;
  private readonly concurrency: number;
  private readonly dbName?: string;
  private readonly getCurrentUserId?: () => string | null | Promise<string | null>;
  private readonly httpOptions?: ExecuteHttpOptions;
  private readonly listeners = new Map<SyncEventName, Set<SyncListener<SyncEventName>>>();

  private drainPromise: Promise<SyncCycleResult> | null = null;
  private detachNetwork: (() => void) | null = null;
  private started = false;

  constructor(options: SyncEngineOptions) {
    this.store = options.store;
    this.handlers = options.handlers ?? new OperationHandlerRegistry();
    this.concurrency = options.concurrency ?? SYNC_DEFAULT_CONCURRENCY;
    this.dbName = options.dbName;
    this.getCurrentUserId = options.getCurrentUserId;
    this.httpOptions = options.httpOptions;
  }

  registerHandler(handler: OperationHandler): void {
    this.handlers.register(handler);
  }

  on<E extends SyncEventName>(event: E, listener: SyncListener<E>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as SyncListener<SyncEventName>);
    this.listeners.set(event, set);
    return () => set.delete(listener as SyncListener<SyncEventName>);
  }

  private emit<E extends SyncEventName>(event: E, payload: SyncEventMap[E]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(payload as SyncEventMap[SyncEventName]);
      }
    }
    dispatchOutboxChanged();
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.detachNetwork = attachNetworkSyncListeners({
      onWake: () => {
        void this.syncNow();
      },
    });
    void this.syncNow();
  }

  stop(): void {
    this.detachNetwork?.();
    this.detachNetwork = null;
    this.started = false;
  }

  /** Waits for an in-flight sync cycle so IndexedDB is idle before teardown. */
  async waitForIdle(): Promise<void> {
    if (this.drainPromise) {
      await this.drainPromise.catch(() => undefined);
    }
  }

  async syncNow(): Promise<SyncCycleResult> {
    if (this.drainPromise) {
      return this.drainPromise;
    }

    this.drainPromise = this.runLockedCycle().finally(() => {
      this.drainPromise = null;
    });

    return this.drainPromise;
  }

  private async runLockedCycle(): Promise<SyncCycleResult> {
    if (!isBrowserOnlineHint()) {
      return { processed: 0, skippedLock: false };
    }

    const result = await withSyncLock(
      async () => this.runSyncCycle(),
      { dbName: this.dbName },
    );

    if (result === null) {
      return { processed: 0, skippedLock: true };
    }

    return result;
  }

  private async runSyncCycle(): Promise<SyncCycleResult> {
    const startedAt = Date.now();
    this.emit("sync-started", { at: startedAt });

    await this.recoverStaleSyncing(startedAt);

    let processed = 0;
    const inFlight = new Map<string, Promise<void>>();
    const inFlightIds = new Set<string>();
    const activeScopes = new Set<string>();

    while (true) {
      if (inFlight.size >= this.concurrency) {
        await Promise.race(inFlight.values());
        continue;
      }

      const operations = await this.store.list();
      const byId = new Map(operations.map((op) => [op.operationId, op]));
      const candidate = this.pickNextOperation(
        operations,
        byId,
        activeScopes,
        inFlightIds,
        startedAt,
      );

      if (!candidate) {
        if (inFlight.size === 0) {
          break;
        }
        await Promise.race(inFlight.values());
        continue;
      }

      const scope = candidate.resourceScope;
      if (scope) {
        activeScopes.add(scope);
      }

      inFlightIds.add(candidate.operationId);
      const work = this.executeOperation(candidate, startedAt)
        .then(() => {
          processed += 1;
        })
        .finally(() => {
          inFlight.delete(candidate.operationId);
          inFlightIds.delete(candidate.operationId);
          if (scope) {
            activeScopes.delete(scope);
          }
        });

      inFlight.set(candidate.operationId, work);
    }

    if (inFlight.size > 0) {
      await Promise.all(inFlight.values());
    }

    this.emit("sync-cycle-completed", { processed, at: Date.now() });
    return { processed, skippedLock: false };
  }

  private pickNextOperation(
    operations: OutboxOperationRecord[],
    byId: Map<string, OutboxOperationRecord>,
    activeScopes: Set<string>,
    inFlightIds: Set<string>,
    now: number,
  ): OutboxOperationRecord | null {
    for (const op of operations) {
      if (inFlightIds.has(op.operationId)) {
        continue;
      }
      if (!ELIGIBLE_STATES.has(op.state)) {
        continue;
      }
      if (op.state === OUTBOX_OPERATION_STATES.RETRY_WAIT) {
        if (op.nextAttemptAt !== undefined && op.nextAttemptAt > now) {
          continue;
        }
      }
      if (op.resourceScope && activeScopes.has(op.resourceScope)) {
        continue;
      }

      const depStatus = getDependencyStatus(op, byId);
      if (depStatus === "wait") {
        continue;
      }
      if (depStatus === "blocked") {
        void this.markDependencyBlocked(op);
        continue;
      }

      return op;
    }
    return null;
  }

  private async markDependencyBlocked(
    operation: OutboxOperationRecord,
  ): Promise<void> {
    if (operation.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION) {
      return;
    }
    const updated = await this.store.updateState(operation.operationId, {
      state: OUTBOX_OPERATION_STATES.NEEDS_ATTENTION,
      failureClass: FAILURE_CLASSES.DEPENDENCY_BLOCKED,
      lastError: {
        message: "Blocked by failed or unresolved dependency",
        at: Date.now(),
      },
    });
    this.emit("operation-blocked", {
      operation: updated,
      reason: FAILURE_CLASSES.DEPENDENCY_BLOCKED,
    });
  }

  private async recoverStaleSyncing(now: number): Promise<void> {
    const syncing = await this.store.list({
      state: OUTBOX_OPERATION_STATES.SYNCING,
    });
    for (const op of syncing) {
      const started = op.syncingStartedAt ?? op.createdAt;
      if (now - started >= STALE_SYNCING_MS) {
        await this.store.updateRetryMetadata(op.operationId, {
          attempts: op.attempts,
          state: OUTBOX_OPERATION_STATES.LOCAL_PENDING,
          lastError: {
            message: "Recovered stale SYNCING after interrupted sync",
            at: now,
          },
        });
      }
    }
  }

  private async executeOperation(
    operation: OutboxOperationRecord,
    now: number,
  ): Promise<void> {
    const currentUserId = await this.resolveCurrentUserId();
    if (
      currentUserId !== null &&
      currentUserId !== undefined &&
      currentUserId !== operation.userId
    ) {
      const updated = await this.store.updateState(operation.operationId, {
        state: OUTBOX_OPERATION_STATES.PAUSED_AUTH,
        failureClass: FAILURE_CLASSES.USER_MISMATCH,
        lastError: {
          message: "Queued operation user does not match current session",
          at: now,
        },
      });
      this.emit("operation-blocked", {
        operation: updated,
        reason: FAILURE_CLASSES.USER_MISMATCH,
      });
      return;
    }

    const handler = this.handlers.get(operation.operationType);
    if (!handler) {
      const updated = await this.store.updateState(operation.operationId, {
        state: OUTBOX_OPERATION_STATES.NEEDS_ATTENTION,
        failureClass: FAILURE_CLASSES.MISSING_HANDLER,
        lastError: {
          message: `No handler registered for ${operation.operationType}`,
          at: now,
        },
      });
      this.emit("operation-failed", { operation: updated });
      return;
    }

    const syncing = await this.store.updateState(operation.operationId, {
      state: OUTBOX_OPERATION_STATES.SYNCING,
      syncingStartedAt: now,
    });
    this.emit("operation-started", { operation: syncing });

    const originalHash = operation.payloadHash;
    const originalPayload = JSON.stringify(operation.payload);

    let result: HandlerResult;
    try {
      const ctx = createExecutionContext(syncing, this.httpOptions);
      result = await handler.execute(ctx);
    } catch (error) {
      const failureClass =
        handler.classifyError?.(error) ?? defaultClassifyHandlerError(error);
      result = {
        outcome: "retry",
        failureClass,
        message: error instanceof Error ? error.message : "Handler error",
      };
    }

    const after = await this.store.get(operation.operationId);
    if (!after) {
      return;
    }
    if (after.payloadHash !== originalHash) {
      throw new Error("Payload hash mutated during sync — aborting");
    }
    if (JSON.stringify(after.payload) !== originalPayload) {
      throw new Error("Payload mutated during sync — aborting");
    }

    await this.applyHandlerResult(after, result, now);
  }

  private async applyHandlerResult(
    operation: OutboxOperationRecord,
    result: HandlerResult,
    now: number,
  ): Promise<void> {
    if (result.outcome === "committed") {
      const updated = await this.store.updateState(operation.operationId, {
        state: OUTBOX_OPERATION_STATES.SERVER_COMMITTED,
        serverResult: result.serverResult,
        syncingStartedAt: undefined,
      });
      this.emit("operation-committed", { operation: updated });
      return;
    }

    if (result.outcome === "terminal") {
      const state = stateForFailureClass(result.failureClass);
      const updated = await this.store.updateState(operation.operationId, {
        state,
        failureClass: result.failureClass,
        lastError: { message: result.message, at: now },
        syncingStartedAt: undefined,
      });
      this.emit("operation-failed", { operation: updated });
      if (state === OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION) {
        this.emit("operation-blocked", {
          operation: updated,
          reason: result.failureClass,
        });
      }
      return;
    }

    const failureClass = result.failureClass;
    if (result.uncertain || isUncertainFailureClass(failureClass)) {
      const updated = await this.store.updateState(operation.operationId, {
        state: OUTBOX_OPERATION_STATES.UNCERTAIN,
        failureClass,
        uncertainSince: now,
        lastError: { message: result.message, at: now },
        syncingStartedAt: undefined,
      });
      this.emit("operation-uncertain", { operation: updated });
      return;
    }

    const nextAttempts = operation.attempts + 1;
    if (!hasRetriesRemaining(nextAttempts) || !shouldRetryFailureClass(failureClass)) {
      const state = shouldRetryFailureClass(failureClass)
        ? OUTBOX_OPERATION_STATES.DEAD_LETTER
        : stateForFailureClass(failureClass);
      const updated = await this.store.updateState(operation.operationId, {
        state,
        failureClass,
        lastError: { message: result.message, at: now },
        syncingStartedAt: undefined,
      });
      this.emit("operation-failed", { operation: updated });
      return;
    }

    const nextAttemptAt = computeNextRetryAt(nextAttempts, now);
    const updated = await this.store.updateRetryMetadata(operation.operationId, {
      attempts: nextAttempts,
      nextAttemptAt,
      state: OUTBOX_OPERATION_STATES.RETRY_WAIT,
      failureClass,
      lastError: { message: result.message, at: now },
    });
    this.emit("retry-scheduled", { operation: updated, nextAttemptAt });
  }

  private async resolveCurrentUserId(): Promise<string | null | undefined> {
    if (!this.getCurrentUserId) {
      return undefined;
    }
    return this.getCurrentUserId();
  }
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  return new SyncEngine(options);
}
