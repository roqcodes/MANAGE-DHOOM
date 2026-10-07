import "fake-indexeddb/auto";

import { execSync } from "node:child_process";

import { ERP_CLIENT_OPERATION_TYPES } from "../src/lib/erp/client-operations/operation-types";
import { registerErpSyncHandlers } from "../src/lib/sync/handlers/register-erp-sync-handlers";
import { OperationHandlerRegistry } from "../src/lib/sync/operation-handler";
import { createOutboxStore } from "../src/lib/sync/outbox-store";
import { OUTBOX_OPERATION_STATES } from "../src/lib/sync/outbox-types";
import { createSyncEngine } from "../src/lib/sync/sync-engine";
import { hashPayload } from "../src/lib/sync/payload-hash";
import { salesOrderResourceScope } from "../src/modules/orders/types/sales-order-update-payload";

const TEST_DB = `buyhub-outbox-phase6-${Date.now()}`;

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

async function run(): Promise<void> {
  const registry = new OperationHandlerRegistry();
  registerErpSyncHandlers(registry);
  assert(registry.has(ERP_CLIENT_OPERATION_TYPES.salesOrder.update), "update handler registered");

  const orderId = "00000000-0000-4000-8000-000000000099";
  const updatePayload = {
    orderId,
    userId: "00000000-0000-4000-8000-000000000001",
    subtotal: 20,
    tax: 0,
    discount: 0,
    totalAmount: 20,
    taxInclusive: true,
    items: [
      {
        productId: "00000000-0000-4000-8000-000000000002",
        quantity: 2,
        unitPrice: 10,
        taxRatePercent: 0,
      },
    ],
  };

  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const scope = salesOrderResourceScope(orderId);

  const opA = await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.update,
    schemaVersion: 1,
    payload: updatePayload,
    userId: "staff-1",
    storeId: "store-1",
    terminalId: "term-6",
    resourceScope: scope,
  });

  const opB = await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.update,
    schemaVersion: 1,
    payload: { ...updatePayload, totalAmount: 25, subtotal: 25 },
    userId: "staff-1",
    storeId: "store-1",
    terminalId: "term-6",
    resourceScope: scope,
  });

  assert(opA.sequence < opB.sequence, "queued updates preserve enqueue order (A before B)");
  assert(opA.resourceScope === scope, "resourceScope set on update");

  const calls: string[] = [];
  const engine = createSyncEngine({
    store,
    handlers: registry,
    dbName: TEST_DB,
    getCurrentUserId: () => "staff-1",
    httpOptions: {
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        assert(body.payload?.orderId === orderId, "handler uses frozen orderId");
        assert(body.storeId === "store-1", "handler uses frozen storeId");
        return new Response(
          JSON.stringify({
            idempotentReplay: false,
            result: { orderId, salesOrderNumber: "SO-TEST" },
          }),
          { status: 200 },
        );
      },
    },
  });

  engine.start();
  await engine.syncNow();
  engine.stop();

  assert(calls.length === 2, "serialized updates both sync");
  assert(calls[0] === calls[1], "same order endpoint");
  assert(
    (await hashPayload(updatePayload)) === opA.payloadHash,
    "update payload hash stable",
  );

  const afterA = await store.get(opA.operationId);
  const afterB = await store.get(opB.operationId);
  assert(afterA?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "first update committed");
  assert(afterB?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "second update committed");

  await store.close();
  await deleteTestDatabase(TEST_DB);

  execSync("npm run erp:sales-order:validate", { stdio: "inherit", cwd: process.cwd() });

  console.log("Phase 6 sales_order.update TypeScript validation passed.");
  console.log(
    "Database: apply migration 20261003160000_erp_sales_order_update_idempotent.sql then run scripts/run-erp-sales-order-update-tests.sql (not executed here).",
  );
}

run().catch((error) => {
  console.error("Phase 6 validation failed:");
  console.error(error);
  process.exit(1);
});
