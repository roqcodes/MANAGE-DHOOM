import "fake-indexeddb/auto";

import { execSync } from "node:child_process";

import { ERP_CLIENT_OPERATION_TYPES } from "../src/lib/erp/client-operations/operation-types";
import { handlerResultFromIdempotentHttp } from "../src/lib/erp/client-operations/unwrap-idempotent-http";
import { registerErpSyncHandlers } from "../src/lib/sync/handlers/register-erp-sync-handlers";
import { OperationHandlerRegistry } from "../src/lib/sync/operation-handler";
import { createOutboxStore } from "../src/lib/sync/outbox-store";
import { OUTBOX_OPERATION_STATES } from "../src/lib/sync/outbox-types";
import { createSyncEngine } from "../src/lib/sync/sync-engine";
import { hashPayload } from "../src/lib/sync/payload-hash";
import type { SalesOrderCreatePayload } from "../src/modules/orders/types/sales-order-create-payload";

const TEST_DB = `buyhub-outbox-phase5-${Date.now()}`;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function deleteTestDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

const samplePayload: SalesOrderCreatePayload = {
  userId: "00000000-0000-4000-8000-000000000001",
  subtotal: 10,
  tax: 0,
  discount: 0,
  totalAmount: 10,
  taxInclusive: true,
  items: [
    {
      productId: "00000000-0000-4000-8000-000000000002",
      quantity: 1,
      unitPrice: 10,
      taxRatePercent: 0,
    },
  ],
};

async function run(): Promise<void> {
  const registry = new OperationHandlerRegistry();
  registerErpSyncHandlers(registry);
  assert(
    registry.has(ERP_CLIENT_OPERATION_TYPES.salesOrder.create),
    "sales_order.create handler registered",
  );

  const handler = registry.get(ERP_CLIENT_OPERATION_TYPES.salesOrder.create);
  assert(Boolean(handler), "handler exists");

  const committed = handlerResultFromIdempotentHttp({
    kind: "response",
    status: 201,
    ok: true,
    bodyText: JSON.stringify({
      idempotentReplay: false,
      result: { orderId: "o1", salesOrderNumber: "SO-00001" },
    }),
  });
  assert(committed.outcome === "committed", "unwrap idempotent HTTP result");
  assert(
    (committed as { serverResult?: { orderId?: string } }).serverResult?.orderId === "o1",
    "server result contains orderId",
  );

  const payloadHash = await hashPayload(samplePayload);
  assert(payloadHash.length === 64, "payload hash length");

  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const op = await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.create,
    schemaVersion: 1,
    payload: samplePayload,
    userId: "staff-user-1",
    storeId: "store-1",
    terminalId: "term-p5",
  });
  assert(op.state === OUTBOX_OPERATION_STATES.LOCAL_PENDING, "enqueued locally");

  let capturedBody: unknown;
  const engine = createSyncEngine({
    store,
    handlers: registry,
    dbName: TEST_DB,
    getCurrentUserId: () => "staff-user-1",
    httpOptions: {
      fetchImpl: async (_url, init) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(
          JSON.stringify({
            idempotentReplay: false,
            result: { orderId: "server-order", salesOrderNumber: "SO-ABC" },
          }),
          { status: 201 },
        );
      },
    },
  });

  engine.start();
  await engine.syncNow();
  engine.stop();

  const after = await store.get(op.operationId);
  assert(after?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "sync commits operation");
  assert(
    (after?.serverResult as { orderId?: string })?.orderId === "server-order",
    "stores server result",
  );

  const body = capturedBody as {
    operationId?: string;
    operationType?: string;
    storeId?: string;
    payload?: unknown;
  };
  assert(body.operationId === op.operationId, "HTTP uses frozen operationId");
  assert(body.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.create, "operation type");
  assert(body.storeId === "store-1", "frozen storeId");
  assert(
    (await hashPayload(body.payload)) === op.payloadHash,
    "frozen payload hash on wire",
  );

  await store.close();
  await deleteTestDatabase(TEST_DB);

  execSync("npm run outbox:validate", { stdio: "inherit", cwd: process.cwd() });
  execSync("npm run outbox:validate:sync", { stdio: "inherit", cwd: process.cwd() });
  execSync("npm run erp:idempotency:validate", { stdio: "inherit", cwd: process.cwd() });

  console.log("Phase 5 sales_order.create TypeScript validation passed.");
  console.log(
    "Database: apply migrations 20261003120000 and 20261003140000, then run scripts/run-erp-client-operations-tests.sql and scripts/run-erp-sales-order-create-tests.sql in Supabase (not executed here).",
  );
}

run().catch((error) => {
  console.error("Phase 5 validation failed:");
  console.error(error);
  process.exit(1);
});
