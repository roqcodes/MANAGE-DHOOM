import "fake-indexeddb/auto";

import { execSync } from "node:child_process";

import { ERP_CLIENT_OPERATION_TYPES } from "../src/lib/erp/client-operations/operation-types";
import { registerErpSyncHandlers } from "../src/lib/sync/handlers/register-erp-sync-handlers";
import { OperationHandlerRegistry } from "../src/lib/sync/operation-handler";
import { createOutboxStore } from "../src/lib/sync/outbox-store";
import { OUTBOX_OPERATION_STATES } from "../src/lib/sync/outbox-types";
import { createSyncEngine } from "../src/lib/sync/sync-engine";
import { salesOrderResourceScope } from "../src/modules/orders/types/sales-order-update-payload";

const TEST_DB = `buyhub-outbox-phase8-${Date.now()}`;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
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
  assert(
    registry.has(ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice),
    "convert handler registered",
  );

  const orderId = "00000000-0000-4000-8000-0000000000bb";
  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });

  const op = await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice,
    schemaVersion: 1,
    payload: { orderId },
    userId: "staff-1",
    storeId: "00000000-0000-4000-8000-000000000099",
    terminalId: "term-8",
    resourceScope: salesOrderResourceScope(orderId),
  });

  assert(op.resourceScope === salesOrderResourceScope(orderId), "resourceScope set");

  const engine = createSyncEngine({
    store,
    handlers: registry,
    dbName: TEST_DB,
    getCurrentUserId: () => "staff-1",
    httpOptions: {
      fetchImpl: async (url) => {
        assert(String(url).includes("/convert-to-invoice"), "convert URL");
        return new Response(
          JSON.stringify({
            idempotentReplay: false,
            result: {
              orderId,
              invoiceId: "00000000-0000-4000-8000-0000000000cc",
              invoiceNumber: "INV-1",
            },
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
  assert(after?.state === OUTBOX_OPERATION_STATES.SERVER_COMMITTED, "convert commits");

  await store.close();
  await deleteTestDatabase(TEST_DB);
  execSync("npm run typecheck", { stdio: "inherit" });
  console.log("Phase 8 sales order convert validation: PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
