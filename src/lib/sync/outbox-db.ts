import {
  OutboxMigrationError,
} from "@/lib/sync/outbox-errors";
import {
  OUTBOX_DB_NAME,
  OUTBOX_DB_VERSION,
  OUTBOX_STORE_META,
  OUTBOX_STORE_OPERATIONS,
} from "@/lib/sync/outbox-types";

export type OpenOutboxDatabaseOptions = {
  dbName?: string;
  version?: number;
};

function createStores(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const operations = db.createObjectStore(OUTBOX_STORE_OPERATIONS, {
      keyPath: "operationId",
    });
    operations.createIndex("byState", "state", { unique: false });
    operations.createIndex("bySequence", "sequence", { unique: true });
    operations.createIndex("byResourceScope", "resourceScope", {
      unique: false,
    });
    operations.createIndex("byCreatedAt", "createdAt", { unique: false });

    db.createObjectStore(OUTBOX_STORE_META, { keyPath: "key" });
  }

  // Future non-destructive migrations (v2+): add indexes/fields only — never deleteDatabase.
}

function connectionCacheKey(dbName: string, version: number): string {
  return `${dbName}@${version}`;
}

const sharedConnections = new Map<string, Promise<IDBDatabase>>();

/** Reuses one IDB connection per db name (avoids close/open races in the browser). */
export function acquireOutboxDatabase(
  options: OpenOutboxDatabaseOptions = {},
): Promise<IDBDatabase> {
  const dbName = options.dbName ?? OUTBOX_DB_NAME;
  const version = options.version ?? OUTBOX_DB_VERSION;
  const key = connectionCacheKey(dbName, version);
  let promise = sharedConnections.get(key);
  if (!promise) {
    promise = openOutboxDatabase({ dbName, version });
    sharedConnections.set(key, promise);
  }
  return promise;
}

export async function releaseOutboxDatabase(
  options: OpenOutboxDatabaseOptions = {},
): Promise<void> {
  const dbName = options.dbName ?? OUTBOX_DB_NAME;
  const version = options.version ?? OUTBOX_DB_VERSION;
  const key = connectionCacheKey(dbName, version);
  const promise = sharedConnections.get(key);
  if (!promise) {
    return;
  }
  sharedConnections.delete(key);
  try {
    const db = await promise;
    db.close();
  } catch {
    /* already closed */
  }
}

export function openOutboxDatabase(
  options: OpenOutboxDatabaseOptions = {},
): Promise<IDBDatabase> {
  const dbName = options.dbName ?? OUTBOX_DB_NAME;
  const version = options.version ?? OUTBOX_DB_VERSION;

  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new OutboxMigrationError("IndexedDB is not available in this environment"),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onerror = () => {
      reject(
        new OutboxMigrationError(
          request.error?.message ?? "Failed to open outbox database",
        ),
      );
    };

    request.onblocked = () => {
      reject(
        new OutboxMigrationError(
          "Outbox database upgrade blocked by another open connection",
        ),
      );
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      try {
        createStores(db, event.oldVersion);
      } catch (error) {
        reject(
          new OutboxMigrationError(
            error instanceof Error
              ? error.message
              : "Outbox schema migration failed",
          ),
        );
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function metaGet(
  store: IDBObjectStore,
  key: string,
): Promise<{ key: string; value: unknown } | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as { key: string; value: unknown } | undefined);
    req.onerror = () => reject(req.error ?? new Error("meta get failed"));
  });
}

function metaPut(store: IDBObjectStore, row: { key: string; value: unknown }): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(row);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("meta put failed"));
  });
}

export async function seedOutboxMetaIfNeeded(db: IDBDatabase): Promise<void> {
  await runTransaction(db, OUTBOX_STORE_META, "readwrite", async (tx) => {
    const store = tx.objectStore(OUTBOX_STORE_META);
    const schema = await metaGet(store, "schemaVersion");
    if (!schema) {
      await metaPut(store, { key: "schemaVersion", value: OUTBOX_DB_VERSION });
    }
    const seq = await metaGet(store, "nextSequence");
    if (!seq) {
      await metaPut(store, { key: "nextSequence", value: 1 });
    }
  });
}

export function runTransaction<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let settled = false;
    let result!: T;

    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    tx.onerror = () => {
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      }
    };

    tx.onabort = () => {
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      }
    };

    void fn(tx)
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        try {
          tx.abort();
        } catch {
          /* already done */
        }
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
  });
}
