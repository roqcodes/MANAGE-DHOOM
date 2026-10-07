import {
  acquireOutboxDatabase,
  releaseOutboxDatabase,
  runTransaction,
  seedOutboxMetaIfNeeded,
  type OpenOutboxDatabaseOptions,
} from "@/lib/sync/outbox-db";
import {
  createOperationId,
  parseEnqueueInput,
} from "@/lib/sync/outbox-envelope";
import {
  OutboxEnqueueError,
  OutboxNotFoundError,
} from "@/lib/sync/outbox-errors";
import { requestOutboxPersistentStorage } from "@/lib/sync/outbox-persistence";
import {
  OUTBOX_OPERATION_STATES,
  OUTBOX_STORE_META,
  OUTBOX_STORE_OPERATIONS,
  type OutboxEnqueueInput,
  type OutboxListOptions,
  type OutboxOperationRecord,
  type OutboxOperationState,
  type OutboxRetryMetadataUpdate,
  type OutboxStateUpdate,
} from "@/lib/sync/outbox-types";
import { normalizeOutboxPayload } from "@/lib/sync/payload-canonicalize";
import { deepFreeze } from "@/lib/sync/payload-freeze";
import { hashPayload } from "@/lib/sync/payload-hash";

export type OutboxStoreOptions = OpenOutboxDatabaseOptions & {
  db?: IDBDatabase;
  requestPersistence?: boolean;
  /** When true, close() releases the shared IDB connection (tests / isolated DB names). */
  manageConnection?: boolean;
};

function getStore(tx: IDBTransaction, name: string): IDBObjectStore {
  return tx.objectStore(name);
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
}

function idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IndexedDB put failed"));
  });
}

function idbDelete(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IndexedDB delete failed"));
  });
}

function idbGetAll<T>(
  source: IDBObjectStore | IDBIndex,
  query?: IDBValidKey | IDBKeyRange,
  count?: number,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = source.getAll(query, count);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB getAll failed"));
  });
}

function idbCount(
  source: IDBObjectStore | IDBIndex,
  query?: IDBValidKey | IDBKeyRange,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = source.count(query);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB count failed"));
  });
}

export class OutboxStore {
  private readonly dbPromise: Promise<IDBDatabase>;
  private readonly requestPersistence: boolean;
  private readonly connectionOptions: OpenOutboxDatabaseOptions;
  private readonly manageConnection: boolean;

  constructor(options: OutboxStoreOptions = {}) {
    this.requestPersistence = options.requestPersistence ?? true;
    this.connectionOptions = {
      dbName: options.dbName,
      version: options.version,
    };
    this.manageConnection = options.manageConnection ?? false;
    if (options.db) {
      this.dbPromise = Promise.resolve(options.db);
    } else {
      this.dbPromise = acquireOutboxDatabase(this.connectionOptions);
    }
  }

  private async db(): Promise<IDBDatabase> {
    const database = await this.dbPromise;
    await seedOutboxMetaIfNeeded(database);
    if (this.requestPersistence) {
      void requestOutboxPersistentStorage();
    }
    return database;
  }

  async enqueue(input: OutboxEnqueueInput): Promise<OutboxOperationRecord> {
    const envelope = parseEnqueueInput(input);
    const operationId = envelope.operationId ?? createOperationId();
    const frozenPayload = deepFreeze(
      normalizeOutboxPayload(envelope.payload) as object,
    );
    const payloadHash = await hashPayload(frozenPayload);
    const createdAt = Date.now();

    const database = await this.db();

    try {
      return await runTransaction(
        database,
        [OUTBOX_STORE_OPERATIONS, OUTBOX_STORE_META],
        "readwrite",
        async (tx) => {
          const opStore = getStore(tx, OUTBOX_STORE_OPERATIONS);
          const metaStore = getStore(tx, OUTBOX_STORE_META);

          const existing = await idbGet<OutboxOperationRecord>(
            opStore,
            operationId,
          );
          if (existing) {
            throw new OutboxEnqueueError(
              `Operation already queued: ${operationId}`,
            );
          }

          const metaRow = await idbGet<{ key: string; value: number }>(
            metaStore,
            "nextSequence",
          );
          const sequence = metaRow?.value ?? 1;
          await idbPut(metaStore, { key: "nextSequence", value: sequence + 1 });

          const record: OutboxOperationRecord = {
            operationId,
            operationType: envelope.operationType,
            schemaVersion: envelope.schemaVersion,
            payload: frozenPayload,
            payloadHash,
            userId: envelope.userId,
            storeId: envelope.storeId,
            terminalId: envelope.terminalId,
            createdAt,
            sequence,
            resourceScope: envelope.resourceScope,
            dependsOn: envelope.dependsOn ?? [],
            state: OUTBOX_OPERATION_STATES.LOCAL_PENDING,
            attempts: 0,
          };

          await idbPut(opStore, record);
          return record;
        },
      );
    } catch (error) {
      if (error instanceof OutboxEnqueueError) {
        throw error;
      }
      throw new OutboxEnqueueError("Failed to enqueue outbox operation", {
        cause: error,
      });
    }
  }

  async get(operationId: string): Promise<OutboxOperationRecord | null> {
    const database = await this.db();
    return runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readonly",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        const row = await idbGet<OutboxOperationRecord>(store, operationId);
        return row ?? null;
      },
    );
  }

  async list(options: OutboxListOptions = {}): Promise<OutboxOperationRecord[]> {
    const database = await this.db();
    return runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readonly",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        if (options.state) {
          const index = store.index("byState");
          const rows = await idbGetAll<OutboxOperationRecord>(
            index,
            options.state,
            options.limit,
          );
          return rows.sort((a, b) => a.sequence - b.sequence);
        }
        const rows = await idbGetAll<OutboxOperationRecord>(store);
        rows.sort((a, b) => a.sequence - b.sequence);
        if (options.limit !== undefined) {
          return rows.slice(0, options.limit);
        }
        return rows;
      },
    );
  }

  async updateState(
    operationId: string,
    update: OutboxStateUpdate,
  ): Promise<OutboxOperationRecord> {
    const database = await this.db();
    return runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readwrite",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        const current = await idbGet<OutboxOperationRecord>(store, operationId);
        if (!current) {
          throw new OutboxNotFoundError(operationId);
        }

        const next: OutboxOperationRecord = {
          ...current,
          state: update.state,
          serverResult: update.serverResult ?? current.serverResult,
          uncertainSince: update.uncertainSince ?? current.uncertainSince,
          lastError: update.lastError ?? current.lastError,
          failureClass: update.failureClass ?? current.failureClass,
        };

        if (update.syncingStartedAt !== undefined) {
          next.syncingStartedAt = update.syncingStartedAt;
        } else if (update.state !== OUTBOX_OPERATION_STATES.SYNCING) {
          delete next.syncingStartedAt;
        } else {
          next.syncingStartedAt = current.syncingStartedAt;
        }

        await idbPut(store, next);
        return next;
      },
    );
  }

  async updateRetryMetadata(
    operationId: string,
    update: OutboxRetryMetadataUpdate,
  ): Promise<OutboxOperationRecord> {
    const database = await this.db();
    return runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readwrite",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        const current = await idbGet<OutboxOperationRecord>(store, operationId);
        if (!current) {
          throw new OutboxNotFoundError(operationId);
        }

        const next: OutboxOperationRecord = {
          ...current,
          attempts: update.attempts,
          nextAttemptAt: update.nextAttemptAt ?? current.nextAttemptAt,
          lastError: update.lastError ?? current.lastError,
          failureClass: update.failureClass ?? current.failureClass,
          state: update.state ?? current.state,
        };

        await idbPut(store, next);
        return next;
      },
    );
  }

  /** Non-business cleanup only (e.g. tests, committed tombstones in later phases). */
  async delete(operationId: string): Promise<void> {
    const database = await this.db();
    await runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readwrite",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        const current = await idbGet<OutboxOperationRecord>(store, operationId);
        if (!current) {
          throw new OutboxNotFoundError(operationId);
        }
        await idbDelete(store, operationId);
      },
    );
  }

  /** Puts a failed operation back in the sync queue after the user fixes the underlying issue. */
  async requeueForSync(operationId: string): Promise<OutboxOperationRecord> {
    const database = await this.db();
    return runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readwrite",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        const current = await idbGet<OutboxOperationRecord>(store, operationId);
        if (!current) {
          throw new OutboxNotFoundError(operationId);
        }

        const requeueable: ReadonlySet<OutboxOperationState> = new Set([
          OUTBOX_OPERATION_STATES.NEEDS_ATTENTION,
          OUTBOX_OPERATION_STATES.STOCK_CONFLICT,
          OUTBOX_OPERATION_STATES.DEAD_LETTER,
          OUTBOX_OPERATION_STATES.UNCERTAIN,
          OUTBOX_OPERATION_STATES.RETRY_WAIT,
        ]);

        if (!requeueable.has(current.state)) {
          throw new OutboxEnqueueError(
            `Operation ${operationId} is not in a requeueable state (${current.state})`,
          );
        }

        const normalizedPayload = normalizeOutboxPayload(current.payload) as object;
        const payloadHash = await hashPayload(normalizedPayload);

        const next: OutboxOperationRecord = {
          ...current,
          payload: deepFreeze(normalizedPayload),
          payloadHash,
          state: OUTBOX_OPERATION_STATES.LOCAL_PENDING,
          lastError: undefined,
          failureClass: undefined,
          nextAttemptAt: undefined,
          uncertainSince: undefined,
          syncingStartedAt: undefined,
        };

        await idbPut(store, next);
        return next;
      },
    );
  }

  async countByState(state: OutboxOperationState): Promise<number> {
    const database = await this.db();
    return runTransaction(
      database,
      OUTBOX_STORE_OPERATIONS,
      "readonly",
      async (tx) => {
        const store = getStore(tx, OUTBOX_STORE_OPERATIONS);
        const index = store.index("byState");
        return idbCount(index, state);
      },
    );
  }

  async close(): Promise<void> {
    if (!this.manageConnection) {
      return;
    }
    await releaseOutboxDatabase(this.connectionOptions);
  }
}

export function createOutboxStore(options?: OutboxStoreOptions): OutboxStore {
  return new OutboxStore(options);
}
