import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { handlerResultFromIdempotentHttp } from "@/lib/erp/client-operations/unwrap-idempotent-http";
import type { SalesInvoiceCancelPayload } from "@/modules/erp/types/sales-invoice-payload";
import type { SalesInvoiceCreatePayload } from "@/modules/erp/types/sales-invoice-payload";
import type { SalesInvoiceIssuePayload } from "@/modules/erp/types/sales-invoice-payload";
import type { SalesInvoiceUpdatePayload } from "@/modules/erp/types/sales-invoice-payload";
import type { SalesOrderCancelPayload } from "@/modules/orders/types/sales-order-cancel-payload";
import type { SalesOrderConvertPayload } from "@/modules/orders/types/sales-order-convert-payload";
import type { SalesOrderUpdatePayload } from "@/modules/orders/types/sales-order-update-payload";
import type {
  PurchaseBillCancelPayload,
  PurchaseBillCreatePayload,
  PurchaseBillFinalizePayload,
  PurchaseBillUpdatePayload,
  PurchaseOrderCreatePayload,
  PurchaseOrderDeliverFinalizePayload,
  PurchaseOrderUpdatePayload,
} from "@/modules/erp/types/purchase-payload";
import type { OperationHandlerRegistry } from "@/lib/sync/operation-handler";

const SALES_ORDER_CREATE_URL = "/api/admin/erp/sales-orders";
const PURCHASE_ORDER_CREATE_URL = "/api/admin/erp/purchase-orders";

export function registerErpSyncHandlers(registry: OperationHandlerRegistry): void {
  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesOrder.create,
    execute: async (ctx) => {
      const http = await ctx.executeHttp({
        method: "POST",
        url: SALES_ORDER_CREATE_URL,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload: ctx.operation.payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesOrder.update,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as SalesOrderUpdatePayload;
      const http = await ctx.executeHttp({
        method: "PATCH",
        url: `/api/admin/erp/sales-orders/${payload.orderId}`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as SalesOrderCancelPayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/sales-orders/${payload.orderId}/cancel`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as SalesOrderConvertPayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/sales-orders/${payload.orderId}/convert-to-invoice`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesInvoice.create,
    execute: async (ctx) => {
      const http = await ctx.executeHttp({
        method: "POST",
        url: "/api/admin/erp/invoices",
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload: ctx.operation.payload as SalesInvoiceCreatePayload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesInvoice.update,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as SalesInvoiceUpdatePayload;
      const http = await ctx.executeHttp({
        method: "PATCH",
        url: `/api/admin/erp/invoices/${payload.invoiceId}`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesInvoice.issue,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as SalesInvoiceIssuePayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/invoices/${payload.invoiceId}/issue`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.salesInvoice.cancel,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as SalesInvoiceCancelPayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/invoices/${payload.invoiceId}/cancel`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create,
    execute: async (ctx) => {
      const http = await ctx.executeHttp({
        method: "POST",
        url: PURCHASE_ORDER_CREATE_URL,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload: ctx.operation.payload as PurchaseOrderCreatePayload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as PurchaseOrderUpdatePayload;
      const http = await ctx.executeHttp({
        method: "PUT",
        url: `/api/admin/erp/purchase-orders/${payload.poId}`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as PurchaseOrderDeliverFinalizePayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/purchase-orders/${payload.poId}/deliver-finalize`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseBill.create,
    execute: async (ctx) => {
      const http = await ctx.executeHttp({
        method: "POST",
        url: "/api/admin/erp/purchase-bills",
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload: ctx.operation.payload as PurchaseBillCreatePayload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseBill.update,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as PurchaseBillUpdatePayload;
      const http = await ctx.executeHttp({
        method: "PUT",
        url: `/api/admin/erp/purchase-bills/${payload.billId}`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as PurchaseBillFinalizePayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/purchase-bills/${payload.billId}`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });

  registry.register({
    type: ERP_CLIENT_OPERATION_TYPES.purchaseBill.cancel,
    execute: async (ctx) => {
      const payload = ctx.operation.payload as PurchaseBillCancelPayload;
      const http = await ctx.executeHttp({
        method: "POST",
        url: `/api/admin/erp/purchase-bills/${payload.billId}/cancel`,
        body: {
          operationId: ctx.operation.operationId,
          operationType: ctx.operation.operationType,
          payloadHash: ctx.operation.payloadHash,
          storeId: ctx.operation.storeId,
          terminalId: ctx.operation.terminalId,
          payload,
        },
      });
      return handlerResultFromIdempotentHttp(http);
    },
  });
}
