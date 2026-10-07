import "fake-indexeddb/auto";

import { execSync } from "node:child_process";

import { ERP_CLIENT_OPERATION_TYPES } from "../src/lib/erp/client-operations/operation-types";
import { registerErpSyncHandlers } from "../src/lib/sync/handlers/register-erp-sync-handlers";
import { OperationHandlerRegistry } from "../src/lib/sync/operation-handler";
import { createOutboxStore } from "../src/lib/sync/outbox-store";
import { salesInvoiceResourceScope } from "../src/modules/erp/types/sales-invoice-payload";

const TEST_DB = `buyhub-outbox-phase9-12-${Date.now()}`;

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

  for (const type of [
    ERP_CLIENT_OPERATION_TYPES.salesInvoice.create,
    ERP_CLIENT_OPERATION_TYPES.salesInvoice.update,
    ERP_CLIENT_OPERATION_TYPES.salesInvoice.issue,
    ERP_CLIENT_OPERATION_TYPES.salesInvoice.cancel,
  ]) {
    assert(registry.has(type), `${type} handler registered`);
  }

  const invoiceId = "00000000-0000-4000-8000-0000000000dd";
  const store = createOutboxStore({
    dbName: TEST_DB,
    requestPersistence: false,
    manageConnection: true,
  });

  await store.enqueue({
    operationType: ERP_CLIENT_OPERATION_TYPES.salesInvoice.cancel,
    schemaVersion: 1,
    payload: { invoiceId },
    userId: "staff-1",
    storeId: "00000000-0000-4000-8000-000000000099",
    terminalId: "term-inv",
    resourceScope: salesInvoiceResourceScope(invoiceId),
  });

  await store.close();
  await deleteTestDatabase(TEST_DB);
  execSync("npm run typecheck", { stdio: "inherit" });
  console.log("Phase 9–12 sales invoice handler validation: PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
