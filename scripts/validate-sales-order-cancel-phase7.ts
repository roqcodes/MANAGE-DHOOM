import "fake-indexeddb/auto";

import { execSync } from "node:child_process";

import { ERP_CLIENT_OPERATION_TYPES } from "../src/lib/erp/client-operations/operation-types";
import { registerErpSyncHandlers } from "../src/lib/sync/handlers/register-erp-sync-handlers";
import { OperationHandlerRegistry } from "../src/lib/sync/operation-handler";
import { createOutboxStore } from "../src/lib/sync/outbox-store";
import { OUTBOX_OPERATION_STATES } from "../src/lib/sync/outbox-types";
import { createSyncEngine } from "../src/lib/sync/sync-engine";
import { salesOrderResourceScope } from "../src/modules/orders/types/sales-order-update-payload";

const TEST_DB = `buyhub-outbox-phase7-${Date.now()}`;

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
  assert(registry.has(ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel), "cancel handler registered");

  const orderId = "00000000-0000-4000-8000-0000000000aa";
  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });
  const op = await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel,
    schemaVersion: 1,
    payload: { orderId },
    userId: "staff-1",
    storeId: "store-1",
    terminalId: "term-7",
    resourceScope: salesOrderResourceScope(orderId),
  });

  assert(op.resourceScope === salesOrderResourceScope(orderId), "resourceScope on cancel");

  const engine = createSyncEngine({
    store,
    handlers: registry,
    dbName: TEST_DB,
    getCurrentUserId: () => "staff-1",
    httpOptions: {
      fetchImpl: async (url, init) => {
        assert(String(url).endsWith(`/cancel`), "cancel handler URL");
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        assert(body.payload?.orderId === orderId, "frozen orderId on wire");
        return new Response(
          JSON.stringify({
            idempotentReplay: false,
            result: { orderId, salesOrderNumber: "SO-X", status: "cancelled" },
          }),
          { status: 200 },
        );
      },
    },
  });

  engine.start();
  await engine.syncNow();
  engine.stop();

  const after = await store.get(op.operationId);
  assert(after?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "cancel sync commits");

  await store.close();
  await deleteTestDatabase(TEST_DB);

  execSync("npm run erp:sales-order-update:validate", { stdio: "inherit", cwd: process.cwd() });

  console.log("Phase 7 sales_order.cancel TypeScript validation passed.");
  console.log(
    "Database: apply migration 20261003170000_erp_sales_order_cancel_idempotent.sql then run scripts/run-erp-sales-order-cancel-tests.sql (not executed here).",
  );
}

run().catch((error) => {
  console.error("Phase 7 validation failed:");
  console.error(error);
  process.exit(1);
});
