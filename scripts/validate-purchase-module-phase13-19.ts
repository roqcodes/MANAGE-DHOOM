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
import type { PurchaseOrderCreatePayload } from "../src/modules/erp/types/purchase-payload";

const TEST_DB = `buyhub-outbox-purchase-${Date.now()}`;

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

const samplePoPayload: PurchaseOrderCreatePayload = {
  vendorId: "00000000-0000-4000-8000-000000000001",
  poDate: "2026-10-04",
  lines: [
    {
      productId: "00000000-0000-4000-8000-000000000002",
      quantity: 1,
      purchasePrice: 10,
      taxRatePercent: 0,
    },
  ],
};

const PURCHASE_TYPES = [
  ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create,
  ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update,
  ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize,
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.create,
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.update,
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize,
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.cancel,
] as const;

async function run(): Promise<void> {
  const registry = new OperationHandlerRegistry();
  registerErpSyncHandlers(registry);

  for (const type of PURCHASE_TYPES) {
    assert(registry.has(type), `handler registered: ${type}`);
  }

  const handler = registry.get(ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create);
  assert(Boolean(handler), "purchase_order.create handler exists");

  const committed = handlerResultFromIdempotentHttp({
    kind: "response",
    status: 201,
    ok: true,
    bodyText: JSON.stringify({
      idempotentReplay: false,
      result: { poId: "po1", poNumber: "PO-00001" },
    }),
  });
  assert(committed.outcome === "committed", "unwrap idempotent HTTP result");

  const payloadHash = await hashPayload(samplePoPayload);
  assert(payloadHash.length === 64, "payload hash length");

  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });

  const op = await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create,
    schemaVersion: 1,
    payload: samplePoPayload,
    userId: "staff-user-purchase",
    storeId: "store-purchase",
    terminalId: "term-p13",
  });
  assert(op.state === OUTBOX_OPERATION_STATES.LOCAL_PENDING, "enqueued locally");

  const engine = createSyncEngine({
    store,
    handlers: registry,
    dbName: TEST_DB,
    getCurrentUserId: () => "staff-user-purchase",
    httpOptions: {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            idempotentReplay: false,
            result: { poId: "server-po", poNumber: "PO-ABC" },
          }),
          { status: 201 },
        ),
    },
  });

  engine.start();
  await engine.syncNow();
  engine.stop();

  const after = await store.get(op.operationId);
  assert(after?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "sync commits operation");

  await store.close();
  await deleteTestDatabase(TEST_DB);

  execSync("npm run erp:sales-order:validate", { stdio: "inherit", cwd: process.cwd() });

  console.log("Purchase module P13–P19 TypeScript validation passed.");
  console.log(
    "Database: apply migration 20261004300000, then run scripts/run-erp-purchase-*.sql in Supabase (not executed here).",
  );
}

run().catch((error) => {
  console.error("Purchase module validation failed:");
  console.error(error);
  process.exit(1);
});
