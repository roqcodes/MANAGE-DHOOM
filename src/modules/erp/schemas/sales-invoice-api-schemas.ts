import { z } from "zod";

import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";

const invoiceLineSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  productName: z.string().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  taxRatePercent: z.number(),
  purchasePrice: z.number().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
});

export const salesInvoiceCreatePayloadSchema = z.object({
  userId: z.string().uuid(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  lines: z.array(invoiceLineSchema).min(1),
  discount: z.number().optional(),
  taxInclusive: z.boolean().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  salesPersonId: z.string().uuid().optional(),
  estimateId: z.string().uuid().optional(),
  finalize: z.boolean().optional(),
});

export const salesInvoiceUpdatePayloadSchema = salesInvoiceCreatePayloadSchema
  .omit({ userId: true, estimateId: true, finalize: true, salesPersonId: true })
  .extend({
    invoiceId: z.string().uuid(),
  });

export const salesInvoiceIssuePayloadSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const salesInvoiceCancelPayloadSchema = z.object({
  invoiceId: z.string().uuid(),
});

const idempotentEnvelope = {
  operationId: z.string().uuid(),
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
};

export const idempotentSalesInvoiceCreateBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesInvoice.create),
  payload: salesInvoiceCreatePayloadSchema,
});

export const idempotentSalesInvoiceUpdateBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesInvoice.update),
  payload: salesInvoiceUpdatePayloadSchema,
});

export const idempotentSalesInvoiceIssueBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesInvoice.issue),
  payload: salesInvoiceIssuePayloadSchema,
});

export const idempotentSalesInvoiceCancelBodySchema = z.object({
  ...idempotentEnvelope,
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.salesInvoice.cancel),
  payload: salesInvoiceCancelPayloadSchema,
});
