import { openOutboxDatabase, runTransaction } from "@/lib/sync/outbox-db";
import { OUTBOX_STORE_META } from "@/lib/sync/outbox-types";
import {
  SYNC_LEASE_TTL_MS,
  SYNC_LOCK_NAME,
} from "@/lib/sync/sync-types";

export type SyncLockOwner = {
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
};

type SyncLeaseRow = {
  key: "syncLease";
  value: SyncLockOwner;
};

function metaGet(
  store: IDBObjectStore,
  key: string,
): Promise<SyncLeaseRow | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as SyncLeaseRow | undefined);
    req.onerror = () => reject(req.error);
  });
}

function metaPut(store: IDBObjectStore, row: SyncLeaseRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(row);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function metaDelete(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function tryAcquireIdbLease(
  ownerId: string,
  dbName?: string,
): Promise<boolean> {
  const db = await openOutboxDatabase({ dbName });
  const now = Date.now();

  try {
    return await runTransaction(db, OUTBOX_STORE_META, "readwrite", async (tx) => {
      const store = tx.objectStore(OUTBOX_STORE_META);
      const existing = await metaGet(store, "syncLease");
      if (
        existing?.value &&
        existing.value.expiresAt > now &&
        existing.value.ownerId !== ownerId
      ) {
        return false;
      }
      await metaPut(store, {
        key: "syncLease",
        value: {
          ownerId,
          acquiredAt: now,
          expiresAt: now + SYNC_LEASE_TTL_MS,
        },
      });
      return true;
    });
  } finally {
    db.close();
  }
}

async function releaseIdbLease(ownerId: string, dbName?: string): Promise<void> {
  const db = await openOutboxDatabase({ dbName });
  try {
    await runTransaction(db, OUTBOX_STORE_META, "readwrite", async (tx) => {
      const store = tx.objectStore(OUTBOX_STORE_META);
      const existing = await metaGet(store, "syncLease");
      if (existing?.value?.ownerId === ownerId) {
        await metaDelete(store, "syncLease");
      }
    });
  } finally {
    db.close();
  }
}

export type WithSyncLockOptions = {
  dbName?: string;
  ownerId?: string;
};

export async function withSyncLock<T>(
  fn: () => Promise<T>,
  options: WithSyncLockOptions = {},
): Promise<T | null> {
  const ownerId = options.ownerId ?? crypto.randomUUID();

  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(
      SYNC_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          return null;
        }
        return fn();
      },
    );
  }

  const acquired = await tryAcquireIdbLease(ownerId, options.dbName);
  if (!acquired) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseIdbLease(ownerId, options.dbName);
  }
}
