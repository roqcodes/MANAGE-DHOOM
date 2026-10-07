import { z } from "zod";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";

export const salesOrderLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().optional(),
  taxRatePercent: z.number().optional(),
});

export const salesOrderPayloadSchema = z.object({
  userId: z.string().uuid(),
  referenceNumber: z.string().optional(),
  shipmentDate: z.string().optional(),
  deliveryMethod: z.string().optional(),
  salesPersonId: z.string().uuid().optional(),
  estimateId: z.string().uuid().optional(),
  subtotal: z.number(),
  tax: z.number(),
  discount: z.number(),
  totalAmount: z.number(),
  taxInclusive: z.boolean().optional(),
  items: z.array(salesOrderLineSchema).min(1),
});

export const salesOrderUpdatePayloadSchema = salesOrderPayloadSchema.extend({
  orderId: z.string().uuid(),
});

export const idempotentSalesOrderCreateBodySchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesOrder.create),
  payload: salesOrderPayloadSchema,
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
});

export const idempotentSalesOrderUpdateBodySchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesOrder.update),
  payload: salesOrderUpdatePayloadSchema,
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
});

export const salesOrderCancelPayloadSchema = z.object({
  orderId: z.string().uuid(),
});

export const idempotentSalesOrderCancelBodySchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel),
  payload: salesOrderCancelPayloadSchema,
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
});

export const salesOrderConvertPayloadSchema = z.object({
  orderId: z.string().uuid(),
});

export const idempotentSalesOrderConvertBodySchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice),
  payload: salesOrderConvertPayloadSchema,
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
});
