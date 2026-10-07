import { z } from "zod";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";

const purchaseLineSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  productName: z.string().optional(),
  barcode: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  quantity: z.number().positive(),
  purchasePrice: z.number(),
  taxRatePercent: z.number(),
  unitId: z.string().uuid().nullable().optional(),
});

const landedCostSchema = z.object({
  landedCostItemId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  quantity: z.number(),
  rate: z.number(),
  taxRatePercent: z.number(),
});

export const purchaseOrderCreatePayloadSchema = z.object({
  vendorId: z.string().uuid(),
  poDate: z.string().min(1),
  expectedDeliveryDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(purchaseLineSchema).min(1),
  discount: z.number().optional(),
  landedCosts: z.array(landedCostSchema).optional(),
});

export const purchaseOrderUpdatePayloadSchema = purchaseOrderCreatePayloadSchema.extend({
  poId: z.string().uuid(),
});

export const purchaseOrderDeliverLineSchema = z.object({
  poLineId: z.string().uuid(),
  deliveredQty: z.number(),
});

export const purchaseOrderDeliverFinalizePayloadSchema = z.object({
  poId: z.string().uuid(),
  receiveDate: z.string().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(purchaseOrderDeliverLineSchema).min(1),
});

export const purchaseBillCreatePayloadSchema = z.object({
  vendorId: z.string().uuid(),
  purchaseDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  expectedDeliveryDate: z.string().nullable().optional(),
  poId: z.string().uuid().nullable().optional(),
  vendorBillNumber: z.string().nullable().optional(),
  grnReference: z.string().nullable().optional(),
  batchReference: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(purchaseLineSchema).min(1),
  landedCosts: z.array(landedCostSchema).optional(),
  discount: z.number().optional(),
  finalize: z.boolean().optional(),
  physicalReceiptOnBill: z.boolean().optional(),
});

export const purchaseBillUpdatePayloadSchema = purchaseBillCreatePayloadSchema.extend({
  billId: z.string().uuid(),
});

export const purchaseBillFinalizePayloadSchema = z.object({
  billId: z.string().uuid(),
});

export const purchaseBillCancelPayloadSchema = z.object({
  billId: z.string().uuid(),
});

const idempotentEnvelope = {
  operationId: z.string().uuid(),
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
};

export const idempotentPurchaseOrderCreateBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create),
  payload: purchaseOrderCreatePayloadSchema,
});

export const idempotentPurchaseOrderUpdateBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update),
  payload: purchaseOrderUpdatePayloadSchema,
});

export const idempotentPurchaseOrderDeliverFinalizeBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize),
  payload: purchaseOrderDeliverFinalizePayloadSchema,
});

export const idempotentPurchaseBillCreateBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseBill.create),
  payload: purchaseBillCreatePayloadSchema,
});

export const idempotentPurchaseBillUpdateBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseBill.update),
  payload: purchaseBillUpdatePayloadSchema,
});

export const idempotentPurchaseBillFinalizeBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize),
  payload: purchaseBillFinalizePayloadSchema,
});

export const idempotentPurchaseBillCancelBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.purchaseBill.cancel),
  payload: purchaseBillCancelPayloadSchema,
});
