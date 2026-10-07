import "fake-indexeddb/auto";

import { execSync } from "node:child_process";

if (!globalThis.navigator) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
}
import { createOutboxStore } from "../src/lib/sync/outbox-store";
import {
  OperationHandlerRegistry,
  type OperationHandler,
} from "../src/lib/sync/operation-handler";
import { createSyncEngine } from "../src/lib/sync/sync-engine";
import { OUTBOX_OPERATION_STATES } from "../src/lib/sync/outbox-types";
import { FAILURE_CLASSES, STALE_SYNCING_MS } from "../src/lib/sync/sync-types";
import { withSyncLock } from "../src/lib/sync/sync-lock";

const TEST_DB = `buyhub-outbox-phase3-${Date.now()}`;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    operationType: "test.success",
    schemaVersion: 1,
    payload: { value: 1 },
    userId: "user-1",
    storeId: "store-1",
    terminalId: "terminal-1",
    ...overrides,
  };
}

async function deleteTestDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function buildTestHandlers(
  hooks: {
    onConcurrent?: (n: number) => void;
    delayMs?: number;
  } = {},
): OperationHandlerRegistry {
  const registry = new OperationHandlerRegistry();
  let concurrent = 0;
  let maxConcurrent = 0;

  const track = async <T>(fn: () => Promise<T>): Promise<T> => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    hooks.onConcurrent?.(maxConcurrent);
    try {
      if (hooks.delayMs) {
        await new Promise((r) => setTimeout(r, hooks.delayMs));
      }
      return await fn();
    } finally {
      concurrent -= 1;
    }
  };

  registry.register({
    type: "test.success",
    execute: async () =>
      track(async () => ({ outcome: "committed", serverResult: { ok: true } })),
  });

  registry.register({
    type: "test.retry",
    execute: async () =>
      track(async () => ({
        outcome: "retry",
        failureClass: FAILURE_CLASSES.NETWORK,
        message: "network down",
      })),
  });

  registry.register({
    type: "test.validation",
    execute: async () => ({
      outcome: "terminal",
      failureClass: FAILURE_CLASSES.VALIDATION,
      message: "bad input",
    }),
  });

  registry.register({
    type: "test.auth401",
    execute: async () => ({
      outcome: "terminal",
      failureClass: FAILURE_CLASSES.AUTHENTICATION,
      message: "unauthorized",
    }),
  });

  registry.register({
    type: "test.auth403",
    execute: async () => ({
      outcome: "terminal",
      failureClass: FAILURE_CLASSES.AUTHORIZATION,
      message: "forbidden",
    }),
  });

  registry.register({
    type: "test.uncertain",
    execute: async () => ({
      outcome: "retry",
      failureClass: FAILURE_CLASSES.TIMEOUT,
      message: "timeout",
      uncertain: true,
    }),
  });

  registry.register({
    type: "test.slow",
    execute: async () =>
      track(async () => {
        await new Promise((r) => setTimeout(r, 80));
        return { outcome: "committed", serverResult: {} };
      }),
  });

  (registry as OperationHandlerRegistry & { maxConcurrent: () => number }).maxConcurrent =
    () => maxConcurrent;

  return registry;
}

async function run(): Promise<void> {
  const handlers = buildTestHandlers();
  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const engine = createSyncEngine({
    store,
    handlers,
    dbName: TEST_DB,
    concurrency: 3,
    getCurrentUserId: () => "user-1",
  });

  const successId = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: successId, operationType: "test.success" }),
  });
  await engine.syncNow();
  const committed = await store.get(successId);
  assert(committed?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "success → SERVER_COMMITTED");

  const retryId = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: retryId, operationType: "test.retry" }),
  });
  await engine.syncNow();
  const retrying = await store.get(retryId);
  assert(retrying?.state === OUTBOX_OPERATION_STATES.RETRY_WAIT, "retryable → RETRY_WAIT");
  assert((retrying?.attempts ?? 0) >= 1, "attempts incremented");
  assert((retrying?.nextAttemptAt ?? 0) > Date.now() - 5_000, "nextAttemptAt scheduled");

  const validationId = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: validationId, operationType: "test.validation" }),
  });
  await engine.syncNow();
  const validation = await store.get(validationId);
  assert(validation?.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION, "validation → NEEDS_ATTENTION");

  const id401 = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: id401, operationType: "test.auth401" }),
  });
  await engine.syncNow();
  assert(
    (await store.get(id401))?.state === OUTBOX_OPERATION_STATES.PAUSED_AUTH,
    "401 → PAUSED_AUTH",
  );

  const id403 = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: id403, operationType: "test.auth403" }),
  });
  await engine.syncNow();
  assert(
    (await store.get(id403))?.state === OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION,
    "403 → BLOCKED_AUTHORIZATION",
  );

  const uncertainId = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: uncertainId, operationType: "test.uncertain" }),
  });
  await engine.syncNow();
  assert(
    (await store.get(uncertainId))?.state === OUTBOX_OPERATION_STATES.UNCERTAIN,
    "uncertain timeout → UNCERTAIN",
  );

  const depId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: depId, operationType: "test.success" }),
  });
  await store.enqueue({
    ...baseEnvelope({
      operationId: childId,
      operationType: "test.success",
      dependsOn: [depId],
    }),
  });
  await engine.syncNow();
  assert(
    (await store.get(childId))?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED,
    "dependency unlocks child",
  );

  const failedDep = crypto.randomUUID();
  const blockedChild = crypto.randomUUID();
  await store.enqueue({
    ...baseEnvelope({ operationId: failedDep, operationType: "test.validation" }),
  });
  await store.enqueue({
    ...baseEnvelope({
      operationId: blockedChild,
      operationType: "test.success",
      dependsOn: [failedDep],
    }),
  });
  await engine.syncNow();
  assert(
    (await store.get(blockedChild))?.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION,
    "failed dependency blocks child",
  );

  const scopeStore = createOutboxStore({
    dbName: `${TEST_DB}-scope`,
    requestPersistence: false,
    manageConnection: true,
  });
  const scopeHandlers = buildTestHandlers({ delayMs: 60 });
  const scopeEngine = createSyncEngine({
    store: scopeStore,
    handlers: scopeHandlers,
    dbName: `${TEST_DB}-scope`,
    concurrency: 3,
  });
  const scopeA = crypto.randomUUID();
  const scopeB = crypto.randomUUID();
  await scopeStore.enqueue({
    ...baseEnvelope({
      operationId: scopeA,
      operationType: "test.slow",
      resourceScope: "invoice:1",
    }),
  });
  await scopeStore.enqueue({
    ...baseEnvelope({
      operationId: scopeB,
      operationType: "test.success",
      resourceScope: "invoice:1",
    }),
  });
  const started: string[] = [];
  scopeEngine.on("operation-started", ({ operation }) => {
    started.push(operation.operationId);
  });
  await scopeEngine.syncNow();
  assert(
    started.indexOf(scopeA) < started.indexOf(scopeB),
    "same resourceScope serializes",
  );

  const parallelHandlers = buildTestHandlers({ delayMs: 40 });
  const parallelStore = createOutboxStore({
    dbName: `${TEST_DB}-parallel`,
    requestPersistence: false,
    manageConnection: true,
  });
  const parallelEngine = createSyncEngine({
    store: parallelStore,
    handlers: parallelHandlers,
    dbName: `${TEST_DB}-parallel`,
    concurrency: 3,
  });
  let observedMax = 0;
  const parallelRegistry = parallelHandlers as OperationHandlerRegistry & {
    maxConcurrent: () => number;
  };
  for (let i = 0; i < 4; i += 1) {
    await parallelStore.enqueue({
      ...baseEnvelope({
        operationType: "test.slow",
        resourceScope: `scope:${i}`,
        payload: { i },
      }),
    });
  }
  parallelEngine.on("operation-started", () => {
    observedMax = Math.max(observedMax, parallelRegistry.maxConcurrent());
  });
  await parallelEngine.syncNow();
  assert(observedMax >= 2, "different scopes run concurrently");

  const limitStore = createOutboxStore({
    dbName: `${TEST_DB}-limit`,
    requestPersistence: false,
    manageConnection: true,
  });
  const limitHandlers = buildTestHandlers({ delayMs: 50 });
  const limitEngine = createSyncEngine({
    store: limitStore,
    handlers: limitHandlers,
    dbName: `${TEST_DB}-limit`,
    concurrency: 2,
  });
  for (let i = 0; i < 4; i += 1) {
    await limitStore.enqueue({
      ...baseEnvelope({
        operationType: "test.slow",
        resourceScope: `only:${i}`,
      }),
    });
  }
  let limitMax = 0;
  limitEngine.on("operation-started", () => {
    limitMax = Math.max(
      limitMax,
      (limitHandlers as OperationHandlerRegistry & { maxConcurrent: () => number }).maxConcurrent(),
    );
  });
  await limitEngine.syncNow();
  assert(limitMax <= 2, "concurrency limit respected");

  const dupStore = createOutboxStore({
    dbName: `${TEST_DB}-dup`,
    requestPersistence: false,
    manageConnection: true,
  });
  const dupEngine = createSyncEngine({
    store: dupStore,
    handlers: buildTestHandlers(),
    dbName: `${TEST_DB}-dup`,
  });
  const dupId = crypto.randomUUID();
  await dupStore.enqueue({
    ...baseEnvelope({ operationId: dupId }),
  });
  const [r1, r2] = await Promise.all([dupEngine.syncNow(), dupEngine.syncNow()]);
  assert(r1.processed + r2.processed >= 1, "duplicate syncNow drains");
  assert(
    (await dupStore.get(dupId))?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED,
    "single commit after duplicate syncNow",
  );

  const locksBackup = (globalThis.navigator as Navigator & { locks?: LockManager }).locks;
  try {
    Object.defineProperty(globalThis.navigator, "locks", {
      value: undefined,
      configurable: true,
    });
    let releaseHold = () => {};
    const holdGate = new Promise<void>((resolve) => {
      releaseHold = () => resolve();
    });
    const holdPromise = withSyncLock(async () => {
      await holdGate;
      return "a";
    }, { dbName: `${TEST_DB}-lock`, ownerId: "owner-a" });
    await new Promise((r) => setTimeout(r, 25));
    const lockB = await withSyncLock(async () => "b", {
      dbName: `${TEST_DB}-lock`,
      ownerId: "owner-b",
    });
    assert(lockB === null, "second lease blocked while first holds");
    releaseHold();
    const lockA = await holdPromise;
    assert(lockA === "a", "lease lock acquired");
  } finally {
    Object.defineProperty(globalThis.navigator, "locks", {
      value: locksBackup,
      configurable: true,
    });
  }

  const staleStore = createOutboxStore({
    dbName: `${TEST_DB}-stale`,
    requestPersistence: false,
    manageConnection: true,
  });
  const staleEngine = createSyncEngine({
    store: staleStore,
    handlers: buildTestHandlers(),
    dbName: `${TEST_DB}-stale`,
  });
  const staleId = crypto.randomUUID();
  const stalePayload = { x: 1 };
  await staleStore.enqueue({
    ...baseEnvelope({ operationId: staleId, payload: stalePayload }),
  });
  const before = await staleStore.get(staleId);
  const hashBefore = before!.payloadHash;
  const idBefore = before!.operationId;
  await staleStore.updateState(staleId, {
    state: OUTBOX_OPERATION_STATES.SYNCING,
    syncingStartedAt: Date.now() - STALE_SYNCING_MS - 1_000,
  });
  await staleEngine.syncNow();
  const afterStale = await staleStore.get(staleId);
  assert(
    afterStale?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED,
    "stale SYNCING recovered and completed",
  );
  assert(afterStale?.operationId === idBefore, "operationId unchanged through retry");
  assert(afterStale?.payloadHash === hashBefore, "payloadHash unchanged");

  await store.close();
  await scopeStore.close();
  await parallelStore.close();
  await limitStore.close();
  await dupStore.close();
  await staleStore.close();

  execSync("npm run outbox:validate", { stdio: "inherit", cwd: process.cwd() });

  await deleteTestDatabase(TEST_DB);
  await deleteTestDatabase(`${TEST_DB}-scope`);
  await deleteTestDatabase(`${TEST_DB}-parallel`);
  await deleteTestDatabase(`${TEST_DB}-limit`);
  await deleteTestDatabase(`${TEST_DB}-dup`);
  await deleteTestDatabase(`${TEST_DB}-lock`);
  await deleteTestDatabase(`${TEST_DB}-stale`);

  console.log("Outbox Phase 3 validation passed.");
}

run().catch((error) => {
  console.error("Outbox Phase 3 validation failed:");
  console.error(error);
  process.exit(1);
});
