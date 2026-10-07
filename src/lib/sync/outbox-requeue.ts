import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { broadcastSyncWake } from "@/lib/sync/sync-network";

export async function requeueOutboxOperations(operationIds: string[]): Promise<void> {
  const store = createOutboxStore();
  try {
    for (const operationId of operationIds) {
      await store.requeueForSync(operationId);
    }
  } finally {
    await store.close();
  }
  dispatchOutboxChanged();
  broadcastSyncWake();
}
