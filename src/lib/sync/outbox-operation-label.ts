import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationState,
} from "@/lib/sync/outbox-types";

export function formatOutboxOperationLabel(operationType: string): string {
  switch (operationType) {
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.create:
      return "Create sales order";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.update:
      return "Update sales order";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel:
      return "Cancel sales order";
    case ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice:
      return "Convert sales order to invoice";
    case ERP_CLIENT_OPERATION_TYPES.salesInvoice.create:
      return "Create sales invoice";
    case ERP_CLIENT_OPERATION_TYPES.salesInvoice.update:
      return "Update sales invoice";
    case ERP_CLIENT_OPERATION_TYPES.salesInvoice.issue:
      return "Issue sales invoice";
    case ERP_CLIENT_OPERATION_TYPES.salesInvoice.cancel:
      return "Cancel sales invoice";
    case ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create:
      return "Create purchase order";
    case ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update:
      return "Update purchase order";
    case ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize:
      return "Finalize purchase delivery";
    case ERP_CLIENT_OPERATION_TYPES.purchaseBill.create:
      return "Create purchase bill";
    case ERP_CLIENT_OPERATION_TYPES.purchaseBill.update:
      return "Update purchase bill";
    case ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize:
      return "Finalize purchase bill";
    case ERP_CLIENT_OPERATION_TYPES.purchaseBill.cancel:
      return "Cancel purchase bill";
    case ERP_CLIENT_OPERATION_TYPES.product.create:
      return "Create product";
    case ERP_CLIENT_OPERATION_TYPES.product.update:
      return "Update product";
    case ERP_CLIENT_OPERATION_TYPES.product.variantCreate:
      return "Create variant";
    case ERP_CLIENT_OPERATION_TYPES.product.variantUpdate:
      return "Update variant";
    default:
      return operationType.replace(/[._]/g, " ");
  }
}

export function formatOutboxOperationState(state: OutboxOperationState): string {
  switch (state) {
    case OUTBOX_OPERATION_STATES.SYNCING:
      return "Syncing to database";
    case OUTBOX_OPERATION_STATES.LOCAL_PENDING:
      return "Queued";
    case OUTBOX_OPERATION_STATES.RETRY_WAIT:
      return "Retry scheduled";
    case OUTBOX_OPERATION_STATES.UNCERTAIN:
      return "Uncertain — retrying";
    case OUTBOX_OPERATION_STATES.STOCK_CONFLICT:
      return "Stock conflict";
    case OUTBOX_OPERATION_STATES.NEEDS_ATTENTION:
      return "Needs attention";
    case OUTBOX_OPERATION_STATES.DEAD_LETTER:
      return "Failed";
    case OUTBOX_OPERATION_STATES.PAUSED_AUTH:
      return "Paused — sign in";
    case OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION:
      return "Not authorized";
    case OUTBOX_OPERATION_STATES.SERVER_COMMITTED:
      return "Synced";
    default:
      return state;
  }
}
