import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
  type OutboxOperationState,
} from "@/lib/sync/outbox-types";
import { purchaseOrderResourceScope } from "@/modules/erp/types/purchase-payload";

const ACTIVE_OUTBOX_STATES: ReadonlySet<OutboxOperationState> = new Set([
  OUTBOX_OPERATION_STATES.LOCAL_PENDING,
  OUTBOX_OPERATION_STATES.SYNCING,
  OUTBOX_OPERATION_STATES.RETRY_WAIT,
  OUTBOX_OPERATION_STATES.UNCERTAIN,
]);

function isActiveOutboxOperation(op: OutboxOperationRecord): boolean {
  return ACTIVE_OUTBOX_STATES.has(op.state);
}

function payloadPoId(op: OutboxOperationRecord): string | undefined {
  const payload = op.payload as { poId?: string } | undefined;
  return typeof payload?.poId === "string" && payload.poId.length > 0
    ? payload.poId
    : undefined;
}

/** Pending client ops for a PO (draft bill sync, delivery submit, PO edits). */
export function pendingPurchaseOrderOutboxActivity(
  operations: OutboxOperationRecord[],
  poId: string,
): {
  draftBillPending: boolean;
  deliveryPending: boolean;
  poUpdatePending: boolean;
} {
  const scope = purchaseOrderResourceScope(poId);
  let draftBillPending = false;
  let deliveryPending = false;
  let poUpdatePending = false;

  for (const op of operations) {
    if (!isActiveOutboxOperation(op)) continue;

    const linkedPoId = payloadPoId(op);
    const matchesPo =
      linkedPoId === poId || op.resourceScope === scope;

    if (!matchesPo) continue;

    if (op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.create) {
      draftBillPending = true;
    } else if (
      op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize
    ) {
      deliveryPending = true;
    } else if (op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update) {
      poUpdatePending = true;
    }
  }

  return { draftBillPending, deliveryPending, poUpdatePending };
}
