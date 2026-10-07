import "fake-indexeddb/auto";

import { createOutboxStore } from "../src/lib/sync/outbox-store";
import { openOutboxDatabase } from "../src/lib/sync/outbox-db";
import {
  OUTBOX_OPERATION_STATES,
  OUTBOX_DB_VERSION,
} from "../src/lib/sync/outbox-types";
import { OutboxEnqueueError, OutboxValidationError } from "../src/lib/sync/outbox-errors";
import { hashPayload } from "../src/lib/sync/payload-hash";
import { canonicalizePayload } from "../src/lib/sync/payload-canonicalize";

const TEST_DB = `buyhub-outbox-test-${Date.now()}`;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sampleEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    operationType: "test.echo",
    schemaVersion: 1,
    payload: { b: 2, a: 1, nested: { z: 1, y: 2 } },
    userId: "user-1",
    storeId: "store-1",
    terminalId: "terminal-1",
    resourceScope: "scope:demo",
    dependsOn: [],
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

async function run(): Promise<void> {
  const opId = crypto.randomUUID();
  const depId = crypto.randomUUID();

  const hashA = await hashPayload({ z: 1, a: 2 });
  const hashB = await hashPayload({ a: 2, z: 1 });
  assert(hashA === hashB, "payloadHash must be deterministic across key order");
  assert(
    canonicalizePayload({ b: 1, a: 2 }) === '{"a":2,"b":1}',
    "canonicalizePayload sorts object keys",
  );

  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });

  const record = await store.enqueue({
    ...sampleEnvelope({
      operationId: opId,
      dependsOn: [depId],
    }),
  });

  assert(record.operationId === opId, "operationId preserved");
  assert(record.state === OUTBOX_OPERATION_STATES.LOCAL_PENDING, "default state");
  assert(record.resourceScope === "scope:demo", "resourceScope stored");
  assert(record.dependsOn.length === 1 && record.dependsOn[0] === depId, "dependsOn stored");
  assert(record.payloadHash.length === 64, "payloadHash is sha256 hex");

  const payload = record.payload as { a: number };
  assert(payload.a === 1, "payload content stored");
  assert(Object.isFrozen(payload), "payload is frozen");

  let validationFailed = false;
  try {
    await store.enqueue({
      operationType: "x",
      schemaVersion: 1,
      payload: {},
      userId: "",
      storeId: "s",
      terminalId: "t",
    });
  } catch (error) {
    validationFailed = error instanceof OutboxValidationError;
  }
  assert(validationFailed, "required envelope fields enforced");

  let duplicateFailed = false;
  try {
    await store.enqueue({
      ...sampleEnvelope({ operationId: opId }),
    });
  } catch (error) {
    duplicateFailed = error instanceof OutboxEnqueueError;
  }
  assert(duplicateFailed, "duplicate enqueue must not report success");

  await store.close();

  const store2 = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const reloaded = await store2.get(opId);
  assert(reloaded !== null, "operation survives connection reopen");
  assert(reloaded!.payloadHash === record.payloadHash, "payloadHash unchanged after reopen");
  assert(
    JSON.stringify(reloaded!.payload) === JSON.stringify(record.payload),
    "payload unchanged after reopen",
  );

  const tabA = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const tabB = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const [r1, r2] = await Promise.all([
    tabA.enqueue(sampleEnvelope({ operationType: "tab.a" })),
    tabB.enqueue(sampleEnvelope({ operationType: "tab.b" })),
  ]);
  assert(r1.sequence !== r2.sequence, "concurrent enqueues get distinct sequences");
  const all = await store2.list();
  assert(all.length >= 3, "multiple operations coexist");

  const pendingCount = await store2.countByState(
    OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  );
  assert(pendingCount >= 3, "countByState works");

  const db = await openOutboxDatabase({ dbName: TEST_DB });
  assert(db.version === OUTBOX_DB_VERSION, "schema version matches");
  db.close();

  await store2.close();
  await tabA.close();
  await tabB.close();
  await deleteTestDatabase(TEST_DB);

  console.log("Outbox Phase 2 validation passed (13 checks).");
}

run().catch((error) => {
  console.error("Outbox Phase 2 validation failed:");
  console.error(error);
  process.exit(1);
});
