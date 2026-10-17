import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { salesInvoiceResourceScope } from "@/modules/erp/types/sales-invoice-payload";

export async function enqueueSalesInvoiceIssue(params: {
  invoiceId: string;
  storeId: string;
}): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const staffUserId = await resolveOutboxUserId(supabase);
  if (!staffUserId) {
    throw new Error("You must be signed in to issue this invoice.");
  }

  const store = createOutboxStore();
  try {
    await store.enqueue({
      operationType: ERP_CLIENT_OPERATION_TYPES.salesInvoice.issue,
      schemaVersion: 1,
      payload: { invoiceId: params.invoiceId },
      userId: staffUserId,
      storeId: params.storeId,
      terminalId: getOrCreateErpTerminalId(),
      resourceScope: salesInvoiceResourceScope(params.invoiceId),
    });
  } catch (enqueueErr) {
    if (enqueueErr instanceof OutboxEnqueueError) {
      throw new Error(enqueueErr.message);
    }
    throw enqueueErr instanceof Error ? enqueueErr : new Error("Could not queue issue.");
  } finally {
    await store.close();
  }

  dispatchOutboxChanged();
  broadcastSyncWake();
}
